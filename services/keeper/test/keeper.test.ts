import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import type { HealthView, KeeperMethod, PositionView } from '../src/abi.ts';
import { backoffDelayMs } from '../src/backoff.ts';
import { assertKeeperMethod, type Allowance, type CoreReader, type KeeperWriter, type TxResult, type ViewResult } from '../src/chain.ts';
import { KeeperDb } from '../src/db.ts';
import { Keeper } from '../src/keeper.ts';
import { createLogger } from '../src/log.ts';
import { healthBody } from '../src/server.ts';

const dir = mkdtempSync(join(tmpdir(), 'keeper-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

class FakeChain implements CoreReader, KeeperWriter {
  positions: PositionView[] = [];
  health = new Map<string, HealthView>();
  block = 100;
  calls: Array<{ method: KeeperMethod; id: string }> = [];
  failNext = 0;
  viewFails = false;
  settleOnTrigger = true;

  async view(method: string, args: Record<string, unknown>): Promise<ViewResult> {
    if (this.viewFails) throw new Error('rpc down');
    this.block++;
    if (method === 'list_positions') {
      const from = Number(args.from_index);
      const limit = Number(args.limit);
      return { value: this.positions.slice(from, from + limit), blockHeight: this.block };
    }
    if (method === 'get_health') return { value: this.health.get(String(args.position_id)) ?? null, blockHeight: this.block };
    throw new Error(`unexpected view ${method}`);
  }
  async keyAllowance(): Promise<Allowance> {
    return { kind: 'unlimited' };
  }
  async call(method: KeeperMethod, args: { position_id: string }): Promise<TxResult> {
    this.calls.push({ method, id: args.position_id });
    if (this.failNext > 0) {
      this.failNext--;
      return { txHash: 'txfail', ok: false, failure: '{"ActionError":"x"}', logs: [] };
    }
    if (this.settleOnTrigger) {
      const p = this.positions.find((q) => q.position_id === args.position_id);
      if (p) p.status = 'Settling';
    }
    return { txHash: `tx${this.calls.length}`, ok: true, failure: null, logs: [] };
  }
}

const h = (debt: string, value: string, pre: number, fresh: boolean, trig: boolean): HealthView => ({
  value_usd_e6: value,
  debt_usd_e6: debt,
  ltv_bps: 0,
  pre_liq_ltv_bps: pre,
  oracle_fresh: fresh,
  triggerable: trig,
});

function setup(dbName: string, clock: { t: number }) {
  const lines: string[] = [];
  const chain = new FakeChain();
  const db = new KeeperDb(join(dir, dbName));
  const k = new Keeper(chain, chain, db, createLogger('keeper', (l) => lines.push(l)), {
    pollMs: 10_000,
    pageSize: 2,
    now: () => clock.t,
    rand: () => 0,
    backoff: { baseMs: 1_000, maxMs: 60_000, jitter: 0.5 },
  });
  return { chain, db, k, lines };
}

describe('keeper loop', () => {
  it('triggers only Open + triggerable + fresh positions, paging through list_positions', async () => {
    const clock = { t: 1_000_000 };
    const { chain, k, db } = setup('a.sqlite', clock);
    chain.positions = [
      { position_id: '0', status: 'Open' },
      { position_id: '1', status: 'Open' },
      { position_id: '2', status: 'Settling' },
      { position_id: '3', status: 'Closed' },
      { position_id: '4', status: 'Open' },
    ];
    chain.health.set('0', h('130000000000', '165929400000', 7500, true, true));
    chain.health.set('1', h('120000000000', '182340000000', 7500, true, false));
    chain.health.set('4', h('130000000000', '165929400000', 7500, false, false)); // stale oracle
    const r = await k.tick();
    assert.deepEqual(r.triggered, ['0']);
    assert.deepEqual(chain.calls, [{ method: 'trigger_preliquidation', id: '0' }]);
    assert.equal(r.scanned, 5);
    assert.equal(k.status.pendingSettlements, 1);
    assert.equal(k.status.openPositions, 3);
    assert.ok((k.status.lastBlockSeen ?? 0) > 100);
    assert.equal(db.runs()[0]?.status, 'ok');
    // second tick: position 0 is now Settling on chain → skipped (idempotent)
    const r2 = await k.tick();
    assert.deepEqual(r2.triggered, []);
    assert.equal(chain.calls.length, 1);
    assert.equal(k.status.pendingSettlements, 2);
  });

  it('backs off per position after a failed call, persisted across restart', async () => {
    const clock = { t: 5_000_000 };
    const { chain, k, db } = setup('b.sqlite', clock);
    chain.positions = [{ position_id: '7', status: 'Open' }];
    chain.health.set('7', h('2', '1', 7500, true, true));
    chain.failNext = 1;
    const r = await k.tick();
    assert.deepEqual(r.failed, ['7']);
    assert.equal(db.retry('7')?.attempts, 1);
    clock.t += 500; // inside the 1s backoff window
    const r2 = await k.tick();
    assert.deepEqual(r2.skippedBackoff, ['7']);
    assert.equal(chain.calls.length, 1);
    db.close();

    // restart with the same file: retry state survives; after the window it fires once
    const db2 = new KeeperDb(join(dir, 'b.sqlite'));
    const k2 = new Keeper(chain, chain, db2, createLogger('keeper', () => {}), { pollMs: 10_000, pageSize: 50, now: () => clock.t, rand: () => 0 });
    assert.deepEqual((await k2.tick()).skippedBackoff, ['7']);
    clock.t += 2_000;
    assert.deepEqual((await k2.tick()).triggered, ['7']);
    assert.equal(db2.retry('7'), null);
    db2.close();
  });

  it('marks runs interrupted by a crash as failed on restart', () => {
    const db = new KeeperDb(join(dir, 'c.sqlite'));
    db.startRun('9', 1);
    db.close();
    const lines: string[] = [];
    const db2 = new KeeperDb(join(dir, 'c.sqlite'));
    new Keeper(new FakeChain(), new FakeChain(), db2, createLogger('keeper', (l) => lines.push(l)), { pollMs: 1000, pageSize: 10 });
    assert.equal(db2.runs()[0]?.status, 'failed');
    assert.ok(lines.some((l) => JSON.parse(l).msg === 'recovered_interrupted_runs'));
    db2.close();
  });

  it('logs health_mismatch when contract verdict disagrees with local maths, and still follows the contract', async () => {
    const clock = { t: 1 };
    const { chain, k, lines } = setup('d.sqlite', clock);
    chain.positions = [{ position_id: '0', status: 'Open' }];
    chain.health.set('0', h('1', '100', 7500, true, true)); // local: not breached
    await k.tick();
    assert.equal(chain.calls.length, 1);
    assert.ok(lines.some((l) => JSON.parse(l).msg === 'health_mismatch'));
  });

  it('RPC outage: tick fails, consecutive errors grow, delay backs off, healthz degrades', async () => {
    const clock = { t: 10_000_000 };
    const { chain, k } = setup('e.sqlite', clock);
    chain.viewFails = true;
    for (let i = 0; i < 3; i++) await k.tick();
    assert.equal(k.status.consecutiveErrors, 3);
    assert.equal(k.status.lastTickOk, false);
    assert.ok(k.nextDelayMs() >= 10_000);
    assert.equal(healthBody(k.status, 10_000, clock.t).ok, false);
    chain.viewFails = false;
    await k.tick();
    assert.equal(k.status.consecutiveErrors, 0);
    const body = healthBody(k.status, 10_000, clock.t);
    assert.equal(body.ok, true);
    assert.equal(body.allowance, 'unlimited');
    assert.equal(typeof body.last_block_seen, 'number');
    assert.equal(body.pending_settlements, 0);
  });

  it('logs JSON lines with no address fields', () => {
    const lines: string[] = [];
    const log = createLogger('keeper', (l) => lines.push(l));
    log.info('x', { ip: '1.2.3.4', remote_addr: 'a', position_id: '1' });
    const o = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    assert.equal(o.ip, undefined);
    assert.equal(o.remote_addr, undefined);
    assert.equal(o.position_id, '1');
  });
});

describe('backoff and method allowlist', () => {
  it('doubles up to the cap; jitter only shortens', () => {
    const o = { baseMs: 1000, maxMs: 8000, jitter: 0.5 };
    assert.deepEqual([0, 1, 2, 3, 4, 10].map((a) => backoffDelayMs(a, o, () => 0)), [1000, 2000, 4000, 8000, 8000, 8000]);
    assert.equal(backoffDelayMs(3, o, () => 1), 4000);
    assert.throws(() => backoffDelayMs(-1, o));
  });
  it('the writer refuses any method outside the function-call key scope', () => {
    assert.doesNotThrow(() => assertKeeperMethod('trigger_preliquidation'));
    assert.throws(() => assertKeeperMethod('ft_transfer'));
    assert.throws(() => assertKeeperMethod('update_owner_price'));
  });
});
