// WO-71: real nectar-core-v2 (NEP-297 version "2.0.0") log lines from testnet ingest into the Feed DB.
// Fixture: test/fixtures/nectar-core-v2-events.json (archival RPC `tx`, receipts of nectar-core-v2.nectar.testnet, verbatim logs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { route } from '../src/api.ts';
import { FeedDb, type LogBatch } from '../src/db.ts';

const here = dirname(fileURLToPath(import.meta.url));

interface FixtureReceipt { receipt_id: string; block_hash: string; block_height: number; executor_id: string; status: string; logs: string[] }
interface FixtureTx { tx_hash: string; signer_id: string; receiver_id: string; final_status: string; receipts: FixtureReceipt[] }
const FIX = JSON.parse(readFileSync(resolve(here, 'fixtures/nectar-core-v2-events.json'), 'utf8')) as { txs: FixtureTx[] };

function batches(txHash: string): LogBatch[] {
  const t = FIX.txs.find((x) => x.tx_hash === txHash);
  assert.ok(t, `fixture tx ${txHash}`);
  return t.receipts.map((r) => {
    assert.equal(r.executor_id, 'nectar-core-v2.nectar.testnet');
    return { receiptId: r.receipt_id, txHash: t.tx_hash, blockHeight: r.block_height, logs: r.logs };
  });
}

function ingest(db: FeedDb, txHash: string, now = 1): number {
  return batches(txHash).reduce((n, b) => n + db.ingestLogs(b, now), 0);
}

type Row = Record<string, unknown>;
const events = (db: FeedDb, tx: string): Row[] =>
  (db.db.prepare('SELECT receipt_id, log_index, block_height, event, data FROM events WHERE tx_hash = ? ORDER BY id').all(tx) as Row[]).map((r) => ({ ...r, data: JSON.parse(String(r.data)) as unknown }));
const position = (db: FeedDb, id: string): Row | undefined =>
  db.db.prepare('SELECT position_id, collateral, status, updated_block FROM positions WHERE position_id = ?').get(id) as Row | undefined;

describe('real nectar-core-v2 (2.0.0) log lines', () => {
  it('every fixture line is a final, successful nectar-core-v2 receipt with version 2.0.0', () => {
    assert.equal(FIX.txs.length, 6);
    for (const t of FIX.txs) {
      assert.equal(t.final_status, 'SuccessValue', t.tx_hash);
      for (const r of t.receipts) {
        assert.equal(r.status, 'SuccessValue');
        for (const l of r.logs.filter((x) => x.includes('"standard":"nectar"'))) assert.match(l, /^EVENT_JSON:\{"standard":"nectar","version":"2\.0\.0"/);
      }
    }
  });

  it('De6aVqqNvfyemXtpuGP6quaUNcZgN2xP6cCXHXEwvfZG (nectar.testnet oracle refresh): oracle_updated stored at block 277503817', () => {
    const db = new FeedDb(':memory:');
    assert.equal(ingest(db, 'De6aVqqNvfyemXtpuGP6quaUNcZgN2xP6cCXHXEwvfZG'), 1);
    assert.deepEqual(events(db, 'De6aVqqNvfyemXtpuGP6quaUNcZgN2xP6cCXHXEwvfZG'), [
      { receipt_id: 'HKym9cr1RX37xKdDyNLprsfTvamyCNBNrnmxTRSQe3vf', log_index: 0, block_height: 277503817, event: 'oracle_updated', data: { symbol: 'NVDAx', price_usd_e6: '135000000' } },
    ]);
    assert.equal(db.meta('last_block'), '277503817');
  });

  it('7XGiZJKggMWRDcfpqZU7kahvdXLBn4TcZc1PkwV2KVFf (buyer2 ft_transfer_call): quote_funded → quotes row; nep171 nft_mint ignored', () => {
    const db = new FeedDb(':memory:');
    assert.equal(ingest(db, '7XGiZJKggMWRDcfpqZU7kahvdXLBn4TcZc1PkwV2KVFf'), 1);
    assert.deepEqual(db.quotes('NVDAx').map((q) => ({ ...q })), [{ quote_id: '0', collateral: 'NVDAx', amount_usd_e6: '5000000000', max_discount_bps: 400, status: 'Live' }]);
    assert.ok(!JSON.stringify(db.quotes('NVDAx')).includes('buyer2'), 'no account id in quote rows');
  });

  it('EeZmHGNsmgqAEMUwjw3UV1Yy8H6mDhTbnZu5UCzsr44w (borrower1 borrow): position_opened → position 0 Open NVDAx', () => {
    const db = new FeedDb(':memory:');
    assert.equal(ingest(db, 'EeZmHGNsmgqAEMUwjw3UV1Yy8H6mDhTbnZu5UCzsr44w'), 1);
    assert.deepEqual({ ...position(db, '0') }, { position_id: '0', collateral: 'NVDAx', status: 'Open', updated_block: 277092410 });
  });

  it('8XXvnBVNHNcMx8tuhzrjcnFnxBZNEkPWx9FJAtDQdmh3 (keeper-v2 confirm_remote_deposit): remote position_opened → position 2 Open; remote_* ignored', () => {
    const db = new FeedDb(':memory:');
    assert.equal(ingest(db, '8XXvnBVNHNcMx8tuhzrjcnFnxBZNEkPWx9FJAtDQdmh3'), 1);
    assert.deepEqual({ ...position(db, '2') }, { position_id: '2', collateral: 'NVDAx', status: 'Open', updated_block: 277093006 });
    assert.deepEqual(events(db, '8XXvnBVNHNcMx8tuhzrjcnFnxBZNEkPWx9FJAtDQdmh3').map((e) => [e.event, e.log_index]), [['position_opened', 1]]);
  });

  it('54eukmJTtQ2PpvYvYxaGeU8Z4gZwg5dpamFFuqWZiMpA (borrower1 repay): repaid stored, position status left to views', () => {
    const db = new FeedDb(':memory:');
    ingest(db, '8XXvnBVNHNcMx8tuhzrjcnFnxBZNEkPWx9FJAtDQdmh3');
    assert.equal(ingest(db, '54eukmJTtQ2PpvYvYxaGeU8Z4gZwg5dpamFFuqWZiMpA'), 1);
    assert.deepEqual(events(db, '54eukmJTtQ2PpvYvYxaGeU8Z4gZwg5dpamFFuqWZiMpA').map((e) => [e.event, e.block_height, e.data]), [
      ['repaid', 277093079, { position_id: '2', amount_usd_e6: '370440000', remaining_debt_usd_e6: '0' }],
    ]);
    assert.equal(position(db, '2')?.status, 'Open', 'remote position stays Open at debt 0 (lib.rs:852)');
  });

  it('HrpQsuMWQcTZZmDgFbqxk8Mk5A1ZzjgiHzJ2f9HYdy4u (keeper-v2 trigger_preliquidation): preliq_triggered → position 3 Settling; quoter_requested ignored', () => {
    const db = new FeedDb(':memory:');
    assert.equal(ingest(db, 'HrpQsuMWQcTZZmDgFbqxk8Mk5A1ZzjgiHzJ2f9HYdy4u'), 1);
    assert.deepEqual({ ...position(db, '3') }, { position_id: '3', collateral: null, status: 'Settling', updated_block: 277093356 });
    assert.equal(db.settlements(10, '3').length, 0, 'a trigger is not a fill');
  });

  it('all fixtures together: 6 events, replay is a no-op, REST exposes them without account ids', () => {
    const db = new FeedDb(':memory:');
    const all = FIX.txs.map((t) => t.tx_hash);
    assert.equal(all.reduce((n, h) => n + ingest(db, h), 0), 6);
    assert.equal(all.reduce((n, h) => n + ingest(db, h, 2), 0), 0, 'idempotent on restart');
    assert.equal(db.eventCount(), 6);
    assert.equal(db.meta('last_block'), '277503817');
    db.setMeta('last_poll_at', '1000');
    const h = route(db, 'GET', '/healthz', { now: () => 2000, source: 'views+neardata' }).body as Record<string, unknown>;
    assert.equal(h.events_indexed, 6);
    assert.equal(h.last_block_seen, 277503817);
    const st = JSON.stringify(route(db, 'GET', '/api/settlements', { source: 'views+neardata' }).body);
    for (const acct of ['buyer2.nectar.testnet', 'borrower1.nectar.testnet', 'keeper-v2.nectar.testnet']) assert.ok(!st.includes(acct), `${acct} leaked`);
  });
});
