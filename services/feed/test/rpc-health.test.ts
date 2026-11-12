// WO-35k: Feed view calls use the NEAR RPC fallback (a 429 on the first endpoint → the second serves), and /health in views
// mode reports an honest head, a consistent lag and `history: "unavailable"`; event lists answer empty with that marker.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Provider } from 'near-api-js';
import { historyMode, route } from '../src/api.ts';
import { FeedDb } from '../src/db.ts';
import { NearViewReader } from '../src/near.ts';
import { TESTNET_RPC_FALLBACKS, fallbackRpc } from '../src/near-rpc.ts';

const [U0, U1] = TESTNET_RPC_FALLBACKS;

/** HTTP 429 as near-api-js 7.4.0 throws it (ProviderError with numeric cause 429). */
const throttled = (): Error => new Error('Too Many Requests', { cause: 429 });

function seed(db: FeedDb, lastBlock: number, staleNeardataFinal: number | null): void {
  db.setMeta('last_block', String(lastBlock));
  db.setMeta('last_poll_at', '1000');
  if (staleNeardataFinal !== null) db.setMeta('neardata_final', String(staleNeardataFinal));
  db.upsertPosition({ position_id: '0', collateral: 'NVDAx', status: 'Open' }, lastBlock - 10, 900);
  db.upsertPosition({ position_id: '0', collateral: 'NVDAx', status: 'Settling' }, lastBlock, 1000);
}

describe('Feed RPC fallback + views-mode /health (WO-35k)', () => {
  it('a 429 on the first endpoint → the second serves the view', async () => {
    const calls: string[] = [];
    const near = fallbackRpc({
      urls: TESTNET_RPC_FALLBACKS,
      sleep: async () => undefined,
      makeProvider: (url) =>
        ({
          callFunctionRaw: async () => {
            calls.push(url);
            if (url === U0) throw throttled();
            return { result: Array.from(new TextEncoder().encode('{"v":2}')), block_height: 277369501 };
          },
        }) as unknown as Provider,
    });
    const r = await new NearViewReader(near.provider, 'nectar-core-v2.nectar.testnet').view('get_config', {});
    assert.deepEqual(r, { value: { v: 2 }, blockHeight: 277369501 });
    assert.deepEqual(calls, [U0, U1]);
    assert.equal(near.status().last_served, 'rpc.testnet.fastnear.com');
  });

  it('views mode: head = latest view block (stale neardata_final ignored), lag 0, history unavailable, rpc status', () => {
    const db = new FeedDb(':memory:');
    seed(db, 277369501, 277297242); // the audit's numbers: a leftover neardata_final below the view block
    const rpc = { endpoints: ['test.rpc.fastnear.com'], last_served: 'test.rpc.fastnear.com', failovers: 0, cooling: [] };
    const h = route(db, 'GET', '/health', { now: () => 2000, source: 'views+tx_status', history: 'unavailable', rpcStatus: () => rpc }).body as Record<string, unknown>;
    assert.equal(h.last_indexed_block, 277369501);
    assert.equal(h.chain_head, 277369501);
    assert.equal(h.chain_head_source, 'view_block');
    assert.equal(h.lag_blocks, 0);
    assert.equal(h.history, 'unavailable');
    assert.equal(h.source, 'views+tx_status');
    assert.equal(typeof h.events_indexed, 'number');
    assert.deepEqual(h.rpc, rpc);
    const z = route(db, 'GET', '/healthz', { now: () => 2000, source: 'views' }).body as Record<string, unknown>;
    assert.equal(z.history, 'unavailable');
  });

  it('views mode: /api/settlements is an empty list with the marker, never view-synthesized rows', () => {
    const db = new FeedDb(':memory:');
    seed(db, 500, null);
    assert.equal(db.settlements(10, null).length, 1, 'the DB holds a view-derived row');
    const s = route(db, 'GET', '/api/settlements', { source: 'views' }).body as { history: string; items: unknown[] };
    assert.equal(s.history, 'unavailable');
    assert.deepEqual(s.items, []);
    const idx = route(db, 'GET', '/api/settlements', { source: 'views+neardata' }).body as { history: string; items: unknown[] };
    assert.equal(idx.history, 'indexed');
    assert.equal(idx.items.length, 1);
  });

  it('indexed mode: head never below the last indexed block; lag consistent', () => {
    const db = new FeedDb(':memory:');
    seed(db, 1000, 990);
    let h = route(db, 'GET', '/health', { now: () => 2000, source: 'views+neardata' }).body as Record<string, unknown>;
    assert.equal(h.chain_head, 1000);
    assert.equal(h.chain_head_source, 'view_block');
    assert.equal(h.lag_blocks, 0);
    assert.equal(h.history, 'indexed');
    db.setMeta('neardata_final', '1040');
    h = route(db, 'GET', '/health', { now: () => 2000, source: 'views+neardata' }).body as Record<string, unknown>;
    assert.equal(h.chain_head, 1040);
    assert.equal(h.chain_head_source, 'neardata_final');
    assert.equal(h.lag_blocks, 40);
  });

  it('history marker defaults from source', () => {
    assert.equal(historyMode({}), 'indexed');
    assert.equal(historyMode({ source: 'views' }), 'unavailable');
    assert.equal(historyMode({ source: 'views+neardata' }), 'indexed');
    assert.equal(historyMode({ source: 'views+neardata', history: 'unavailable' }), 'unavailable');
  });
});
