// The keeper loop (PRD §10.1). Every `pollMs`: page through `list_positions`, keep `status == "Open"`,
// read `get_health`, and call `trigger_preliquidation(position_id)` when the contract says
// `triggerable && oracle_fresh`. The contract re-checks everything; the keeper only passes the id.
//
// Idempotency: a triggered position becomes `Settling` on chain and is skipped from then on; an
// in-memory in-flight set prevents double sends within a process; a crash leaves `sent` rows that are
// marked failed on restart, after which the chain state decides. Failures back off per position
// (persisted) and per tick (RPC outages), exponentially.

import { P0_KEEPER_METHOD, isHealthView, isPositionView, positionIdOf, type HealthView } from './abi.ts';
import { DEFAULT_BACKOFF, backoffDelayMs, type BackoffOptions } from './backoff.ts';
import type { Allowance, CoreReader, KeeperWriter } from './chain.ts';
import type { KeeperDb } from './db.ts';
import { isPreLiqBreached } from './health.ts';
import { errMsg, type Logger } from './log.ts';

export interface KeeperOptions {
  pollMs: number;
  pageSize: number;
  maxPages?: number;
  heartbeatMs?: number;
  backoff?: BackoffOptions;
  now?: () => number;
  rand?: () => number;
}

export interface KeeperStatus {
  lastBlockSeen: number | null;
  lastTickAt: number | null;
  lastTickOk: boolean;
  consecutiveErrors: number;
  lastError: string | null;
  openPositions: number;
  pendingSettlements: number;
  allowance: Allowance;
  triggersSent: number;
  startedAt: number;
}

export interface TickReport {
  scanned: number;
  open: number;
  settling: number;
  triggered: string[];
  failed: string[];
  skippedBackoff: string[];
}

export class Keeper {
  readonly status: KeeperStatus;
  private readonly inFlight = new Set<string>();
  private readonly reader: CoreReader;
  private readonly writer: KeeperWriter;
  private readonly db: KeeperDb;
  private readonly log: Logger;
  private readonly opts: Required<KeeperOptions>;

  constructor(reader: CoreReader, writer: KeeperWriter, db: KeeperDb, log: Logger, opts: KeeperOptions) {
    this.reader = reader;
    this.writer = writer;
    this.db = db;
    this.log = log;
    this.opts = {
      maxPages: 200,
      heartbeatMs: 60_000,
      backoff: DEFAULT_BACKOFF,
      now: Date.now,
      rand: Math.random,
      ...opts,
    };
    const now = this.opts.now();
    this.status = {
      lastBlockSeen: null,
      lastTickAt: null,
      lastTickOk: false,
      consecutiveErrors: 0,
      lastError: null,
      openPositions: 0,
      pendingSettlements: 0,
      allowance: { kind: 'unknown', reason: 'not checked yet' },
      triggersSent: 0,
      startedAt: now,
    };
    const recovered = db.recoverInterrupted(now);
    if (recovered > 0) log.warn('recovered_interrupted_runs', { count: recovered });
  }

  private seeBlock(h: number): void {
    if (this.status.lastBlockSeen === null || h > this.status.lastBlockSeen) this.status.lastBlockSeen = h;
  }

  async tick(): Promise<TickReport> {
    const report: TickReport = { scanned: 0, open: 0, settling: 0, triggered: [], failed: [], skippedBackoff: [] };
    const now = this.opts.now();
    try {
      const open: string[] = [];
      for (let page = 0; page < this.opts.maxPages; page++) {
        const from = page * this.opts.pageSize;
        const { value, blockHeight } = await this.reader.view('list_positions', { from_index: from, limit: this.opts.pageSize });
        this.seeBlock(blockHeight);
        if (!Array.isArray(value)) throw new Error('list_positions did not return an array');
        value.forEach((p: unknown, i: number) => {
          report.scanned++;
          if (!isPositionView(p)) {
            this.log.warn('abi_mismatch', { view: 'list_positions', index: from + i });
            return;
          }
          if (p.status === 'Open') open.push(positionIdOf(p, from + i));
          else if (p.status === 'Settling') report.settling++;
        });
        if (value.length < this.opts.pageSize) break;
      }
      report.open = open.length;
      for (const id of open) await this.consider(id, now, report);
      this.status.openPositions = report.open;
      this.status.pendingSettlements = report.settling;
      this.status.lastTickOk = true;
      this.status.consecutiveErrors = 0;
      this.status.lastError = null;
    } catch (e) {
      this.status.lastTickOk = false;
      this.status.consecutiveErrors++;
      this.status.lastError = errMsg(e);
      this.log.error('tick_failed', { error: errMsg(e), consecutive_errors: this.status.consecutiveErrors });
    }
    this.status.lastTickAt = now;
    this.status.allowance = await this.reader.keyAllowance();
    const lastHb = this.db.lastHeartbeatAt();
    if (lastHb === null || now - lastHb >= this.opts.heartbeatMs) {
      this.db.heartbeat(now, this.status.lastBlockSeen, this.status.openPositions, this.status.pendingSettlements);
    }
    return report;
  }

  private async consider(id: string, now: number, report: TickReport): Promise<void> {
    if (this.inFlight.has(id)) return;
    const retry = this.db.retry(id);
    if (retry !== null && retry.next_attempt_at > now) {
      report.skippedBackoff.push(id);
      return;
    }
    const { value, blockHeight } = await this.reader.view('get_health', { position_id: id });
    this.seeBlock(blockHeight);
    if (!isHealthView(value)) {
      this.log.warn('abi_mismatch', { view: 'get_health', position_id: id });
      return;
    }
    this.crossCheck(id, value);
    if (!(value.triggerable && value.oracle_fresh)) return;

    this.inFlight.add(id);
    const runId = this.db.startRun(id, now);
    try {
      const res = await this.writer.call(P0_KEEPER_METHOD, { position_id: id });
      if (res.ok) {
        this.db.finishRun(runId, 'ok', res.txHash, null, this.opts.now());
        this.db.clearRetry(id);
        this.status.triggersSent++;
        report.triggered.push(id);
        this.log.info('preliq_triggered', { position_id: id, tx_hash: res.txHash, ltv_bps: value.ltv_bps });
      } else {
        this.fail(id, runId, res.txHash, res.failure ?? 'unknown failure', report, retry?.attempts ?? 0);
      }
    } catch (e) {
      this.fail(id, runId, null, errMsg(e), report, retry?.attempts ?? 0);
    } finally {
      this.inFlight.delete(id);
    }
  }

  private fail(id: string, runId: number, txHash: string | null, error: string, report: TickReport, prevAttempts: number): void {
    const now = this.opts.now();
    const attempts = prevAttempts + 1;
    const delay = backoffDelayMs(attempts - 1, this.opts.backoff, this.opts.rand);
    this.db.finishRun(runId, 'failed', txHash, error.slice(0, 500), now);
    this.db.setRetry(id, attempts, now + delay);
    report.failed.push(id);
    this.log.warn('preliq_failed', { position_id: id, tx_hash: txHash, attempts, retry_in_ms: delay, error: error.slice(0, 200) });
  }

  /** Local maths vs the contract's verdict. Logged only; the contract's verdict is what we act on. */
  private crossCheck(id: string, h: HealthView): void {
    try {
      const breached = isPreLiqBreached(BigInt(h.debt_usd_e6), BigInt(h.value_usd_e6), BigInt(h.pre_liq_ltv_bps));
      if ((breached && h.oracle_fresh) !== h.triggerable) {
        this.log.warn('health_mismatch', { position_id: id, local_breached: breached, oracle_fresh: h.oracle_fresh, contract_triggerable: h.triggerable });
      }
    } catch (e) {
      this.log.warn('health_mismatch', { position_id: id, error: errMsg(e) });
    }
  }

  nextDelayMs(): number {
    if (this.status.consecutiveErrors === 0) return this.opts.pollMs;
    return Math.max(this.opts.pollMs, backoffDelayMs(this.status.consecutiveErrors - 1, this.opts.backoff, this.opts.rand));
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.tick();
      await sleep(this.nextDelayMs(), signal);
    }
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
