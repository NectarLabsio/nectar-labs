// Neardata block source (F-121, F-122): tails final blocks over HTTP and feeds nectar-core's NEP-297
// logs into the DB. Shape verified against a captured testnet block (test/fixtures/
// neardata-block-276971305.json, the G2 seed tx Hqv3k254…, liquidity_supplied):
//   GET /v0/last_block/final → 302 Location: /v0/block/<height>
//   GET /v0/block/<height>   → {block:{header:{height,hash,…}}, shards:[{shard_id, receipt_execution_outcomes:[
//     {receipt, tx_hash, execution_outcome:{block_hash, id, outcome:{executor_id, logs, status, …}, proof}}]}]}
//   `null` body = height skipped / out of range.
// Restart-safe: the cursor `neardata_height` lives in SQLite meta and is advanced after each block is
// ingested; event inserts are INSERT OR IGNORE on (receipt_id, log_index), so a crash between ingest
// and cursor write only repeats work.

import type { FeedDb, LogBatch } from './db.ts';
import type { Logger } from './log.ts';
import type { Source } from './sources.ts';

export const CURSOR_KEY = 'neardata_height';

export interface BlockFetcher {
  lastFinalHeight(): Promise<number>;
  /** null when the height has no block (skipped) or is out of range. */
  block(height: number): Promise<unknown>;
}

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function blockHeight(block: unknown): number | null {
  const h = rec(rec(rec(block)?.block)?.header)?.height;
  return typeof h === 'number' && Number.isSafeInteger(h) ? h : null;
}

function failed(status: unknown): boolean {
  const s = rec(status);
  return s !== null && 'Failure' in s;
}

/**
 * Receipts executed by `contractId` in this block, one LogBatch each. Failed receipts are skipped:
 * their state changes were reverted, so their events did not happen.
 */
export function extractContractLogs(block: unknown, contractId: string): LogBatch[] {
  const height = blockHeight(block);
  const shards = rec(block)?.shards;
  if (!Array.isArray(shards)) return [];
  const out: LogBatch[] = [];
  for (const sh of shards) {
    const outcomes = rec(sh)?.receipt_execution_outcomes;
    if (!Array.isArray(outcomes)) continue;
    for (const item of outcomes) {
      const it = rec(item);
      const eo = rec(it?.execution_outcome);
      const o = rec(eo?.outcome);
      if (!it || !eo || !o || o.executor_id !== contractId) continue;
      if (failed(o.status)) continue;
      const id = eo.id;
      const logs = o.logs;
      if (typeof id !== 'string' || !Array.isArray(logs)) continue;
      out.push({
        receiptId: id,
        txHash: typeof it.tx_hash === 'string' ? it.tx_hash : null,
        blockHeight: height,
        logs: logs.filter((l): l is string => typeof l === 'string'),
      });
    }
  }
  return out;
}

export interface NeardataOptions {
  contractId: string;
  /** Height to start from when the DB has no cursor; null = start at the current final block. */
  startHeight: number | null;
  /** With startHeight null: start this many blocks behind the final block (FEED_START_BLOCK=head-N). Default 0. */
  startBack?: number;
  maxBlocksPerPoll: number;
}

export class NeardataSource implements Source {
  readonly kind = 'neardata';
  private readonly fetcher: BlockFetcher;
  private readonly opts: NeardataOptions;
  private readonly log: Logger;

  constructor(fetcher: BlockFetcher, opts: NeardataOptions, log: Logger) {
    this.fetcher = fetcher;
    this.opts = opts;
    this.log = log;
  }

  async poll(db: FeedDb, now: number): Promise<void> {
    const final = await this.fetcher.lastFinalHeight();
    const saved = db.meta(CURSOR_KEY);
    let cursor: number;
    if (saved !== null && /^\d+$/.test(saved)) cursor = Number(saved);
    else {
      cursor = (this.opts.startHeight ?? Math.max(1, final - (this.opts.startBack ?? 0))) - 1;
      db.setMeta(CURSOR_KEY, String(cursor));
      this.log.info('neardata_cursor_init', { height: cursor + 1 });
    }
    const end = Math.min(final, cursor + this.opts.maxBlocksPerPoll);
    let events = 0;
    for (let h = cursor + 1; h <= end; h++) {
      const block = await this.fetcher.block(h);
      if (block !== null) {
        const got = blockHeight(block);
        if (got !== h) throw new Error(`neardata block ${h} answered height ${String(got)}`);
        for (const b of extractContractLogs(block, this.opts.contractId)) events += db.ingestLogs(b, now);
      }
      db.setMeta(CURSOR_KEY, String(h));
    }
    if (end >= cursor + 1) db.seeBlock(end);
    db.setMeta('neardata_final', String(final));
    if (events > 0) this.log.info('neardata_events', { from: cursor + 1, to: end, events });
  }
}

/** HTTP fetcher (fetch, F-122). Optional FastNear key as `Authorization: Bearer` (F-122); never logged. */
export class HttpNeardataFetcher implements BlockFetcher {
  private readonly base: string;
  private readonly headers: Record<string, string>;

  constructor(base = 'https://testnet.neardata.xyz', apiKey: string | null = null) {
    this.base = base.replace(/\/+$/, '');
    this.headers = apiKey === null ? {} : { Authorization: `Bearer ${apiKey}` };
  }

  async lastFinalHeight(): Promise<number> {
    const r = await fetch(`${this.base}/v0/last_block/final`, { headers: this.headers, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    if (r.status >= 300 && r.status < 400) {
      const m = /\/v0\/block\/(\d+)$/.exec(r.headers.get('location') ?? '');
      await r.body?.cancel();
      if (m?.[1] === undefined) throw new Error('neardata last_block redirect without /v0/block/<height>');
      return Number(m[1]);
    }
    if (r.status !== 200) throw new Error(`neardata last_block HTTP ${r.status}`);
    const h = blockHeight(await r.json());
    if (h === null) throw new Error('neardata last_block body has no header.height');
    return h;
  }

  async block(height: number): Promise<unknown> {
    const r = await fetch(`${this.base}/v0/block/${height}`, { headers: this.headers, signal: AbortSignal.timeout(30_000) });
    if (r.status !== 200) throw new Error(`neardata block ${height} HTTP ${r.status}`);
    return (await r.json()) as unknown;
  }
}
