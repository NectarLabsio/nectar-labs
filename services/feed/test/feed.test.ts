import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ROUTES, createApi, route } from '../src/api.ts';
import { FeedDb, type ExitCapacity, type LogBatch } from '../src/db.ts';
import { NECTAR_EVENTS, parseEventLog } from '../src/events.ts';
import { Indexer } from '../src/indexer.ts';
import { createLogger } from '../src/log.ts';
import { TxStatusSource, ViewPollingSource, type TxOutcomeFetcher, type ViewReader, type ViewResult } from '../src/sources.ts';

const here = dirname(fileURLToPath(import.meta.url));
const quiet = createLogger('feed', () => {});
const ev = (event: string, data: Record<string, unknown>): string => `EVENT_JSON:${JSON.stringify({ standard: 'nectar', version: '1.0.0', event, data: [data] })}`;

const CAP: ExitCapacity = {
  q_usd_e6: '50000000000', r_usd_e6: '0', d_usd_e6: '0', haircut_bps: 2500, session_open: false,
  oracle_price_usd_e6: '182340000', oracle_age_s: 30, oracle_fresh: true, b_c_usd_per_unit_e6: null, limit_bps_effective: 7000,
};

class FakeViews implements ViewReader {
  block = 1000;
  positions: Array<Record<string, unknown>> = [{ position_id: '0', status: 'Open', collateral: 'NVDAx', borrower: 'alice.testnet' }];
  fail = false;
  async view(method: string, args: Record<string, unknown>): Promise<ViewResult> {
    if (this.fail) throw new Error('rpc down');
    this.block++;
    const from = Number(args.from_index ?? 0);
    switch (method) {
      case 'list_collaterals':
        return { value: from === 0 ? [{ symbol: 'NVDAx' }] : [], blockHeight: this.block };
      case 'get_exit_capacity':
        return { value: CAP, blockHeight: this.block };
      case 'list_quotes':
        return { value: from === 0 ? [{ quote_id: '0', remaining_usd_e6: '50000000000', max_discount_bps: 250, status: 'Live', buyer: 'bob.testnet' }] : [], blockHeight: this.block };
      case 'list_positions':
        return { value: this.positions.slice(from, from + 50), blockHeight: this.block };
      default:
        throw new Error(`unexpected ${method}`);
    }
  }
}

describe('NEP-297 parsing', () => {
  it('accepts nectar events and rejects everything else with a reason', () => {
    const ok = parseEventLog(ev('quote_funded', { quote_id: '0' }));
    assert.ok(ok.ok && ok.value.event === 'quote_funded');
    assert.deepEqual(
      [
        'plain log',
        'EVENT_JSON:{bad',
        'EVENT_JSON:' + JSON.stringify({ standard: 'nep141', version: '1.0.0', event: 'ft_transfer', data: [{}] }),
        'EVENT_JSON:' + JSON.stringify({ standard: 'nectar', version: '2.0.0', event: 'paused', data: [{}] }),
        ev('drain_all', {}),
        'EVENT_JSON:' + JSON.stringify({ standard: 'nectar', version: '1.0.0', event: 'paused', data: [] }),
      ].map((l) => {
        const r = parseEventLog(l);
        return r.ok ? 'ok' : r.reason;
      }),
      ['not_event', 'bad_json', 'foreign_standard', 'bad_version', 'unknown_event', 'bad_data'],
    );
    assert.equal(NECTAR_EVENTS.length, 15);
  });
});

describe('indexer store', () => {
  const batch: LogBatch = {
    receiptId: 'r1',
    txHash: 'tx1',
    blockHeight: 2000,
    logs: [
      ev('quote_funded', { quote_id: '0', buyer: 'bob.testnet', collateral: 'NVDAx', amount_usd_e6: '100000000', max_discount_bps: 250 }),
      ev('quote_topped_up', { quote_id: '0', amount_usd_e6: '50000000' }),
      'not an event',
      ev('position_opened', { position_id: '3', borrower: 'alice.testnet', collateral: 'NVDAx', units: '1', debt_usd_e6: '1', premium_usd_e6: '0' }),
      ev('preliq_triggered', { position_id: '3', keeper: 'keeper.testnet' }),
      ev('settled_near', { position_id: '3', quote_id: '0', disc_bps: 250, repay_usd_e6: '1', seize_units: '1', buyer: 'bob.testnet' }),
    ],
  };

  it('ingests logs idempotently (restart / replay safe)', () => {
    const db = new FeedDb(':memory:');
    assert.equal(db.ingestLogs(batch, 1), 5);
    assert.equal(db.ingestLogs(batch, 2), 0);
    assert.equal(db.eventCount(), 5);
    const q = db.quotes('NVDAx');
    assert.equal(q[0]?.amount_usd_e6, '150000000');
    const s = db.settlements(10, null);
    assert.equal(s.length, 1);
    assert.equal(s[0]?.source, 'event');
    assert.equal(db.meta('last_block'), '2000');
  });

  it('view polling writes snapshots, quotes and Open→Settling transitions', async () => {
    const db = new FeedDb(':memory:');
    const views = new FakeViews();
    const idx = new Indexer(db, [new ViewPollingSource(views, quiet)], quiet, 10_000, () => 42);
    assert.equal(await idx.pollOnce(), true);
    assert.equal(db.latestSnapshots()[0]?.symbol, 'NVDAx');
    assert.equal(db.quotes('NVDAx')[0]?.amount_usd_e6, '50000000000');
    const first = views.positions[0];
    if (first) first.status = 'Settling';
    await idx.pollOnce();
    await idx.pollOnce();
    const s = db.settlements(10, '0');
    assert.equal(s.length, 1);
    assert.equal(s[0]?.source, 'view');
    assert.equal(s[0]?.status, 'Settling');
    assert.equal(db.history('NVDAx', 10).length, 3);
  });

  it('backs off on RPC failure and records the error', async () => {
    const db = new FeedDb(':memory:');
    const views = new FakeViews();
    views.fail = true;
    const idx = new Indexer(db, [new ViewPollingSource(views, quiet)], quiet, 10_000);
    assert.equal(await idx.pollOnce(), false);
    assert.equal(await idx.pollOnce(), false);
    assert.equal(idx.nextDelayMs(), 40_000);
    assert.match(db.meta('last_error') ?? '', /rpc down/);
  });

  it('tx-status source feeds receipt logs once per tx', async () => {
    const db = new FeedDb(':memory:');
    let calls = 0;
    const fetcher: TxOutcomeFetcher = { fetch: async () => (calls++, [batch]) };
    const src = new TxStatusSource(fetcher, () => ['tx1'], quiet);
    await src.poll(db, 1);
    await src.poll(db, 2);
    assert.equal(calls, 1);
    assert.equal(db.eventCount(), 5);
  });
});

describe('REST API', () => {
  async function seeded(): Promise<FeedDb> {
    const db = new FeedDb(':memory:');
    const idx = new Indexer(db, [new ViewPollingSource(new FakeViews(), quiet)], quiet, 10_000, () => Date.now());
    await idx.pollOnce();
    db.ingestLogs({ receiptId: 'r9', txHash: 'tx9', blockHeight: 3000, logs: [ev('settled_near', { position_id: '0', quote_id: '0', disc_bps: 250, repay_usd_e6: '5', seize_units: '7', buyer: 'bob.testnet' })] }, Date.now());
    return db;
  }

  it('serves feed, asset, settlements, healthz over HTTP with 10 s cache and no account ids', async () => {
    const db = await seeded();
    const server = createApi(db, { pollMs: 10_000 });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const feed = await fetch(`${base}/api/feed`);
      assert.equal(feed.status, 200);
      assert.equal(feed.headers.get('cache-control'), 'public, max-age=10');
      const fb = (await feed.json()) as { assets: Array<{ symbol: string; limit_bps_effective: number }>; as_of_block: number };
      assert.equal(fb.assets[0]?.symbol, 'NVDAx');
      assert.equal(fb.assets[0]?.limit_bps_effective, 7000);
      assert.ok(fb.as_of_block >= 3000);

      const a = await fetch(`${base}/api/asset/NVDAx`);
      assert.equal(a.status, 200);
      const ab = (await a.json()) as { latest: { q_usd_e6: string }; history: unknown[]; quotes: unknown[] };
      assert.equal(ab.latest.q_usd_e6, '50000000000');
      assert.equal(ab.quotes.length, 1);

      const st = await fetch(`${base}/api/settlements?limit=5`);
      const sb = await st.text();
      assert.equal(st.status, 200);
      assert.ok(sb.includes('"repay_usd_e6":"5"'));
      for (const body of [JSON.stringify(fb), JSON.stringify(ab), sb]) {
        assert.ok(!body.includes('bob.testnet') && !body.includes('alice.testnet'), 'account id leaked');
      }

      assert.equal((await fetch(`${base}/api/asset/UNKNOWN`)).status, 404);
      assert.equal((await fetch(`${base}/api/asset/${encodeURIComponent('bad symbol!')}`)).status, 400);
      assert.equal((await fetch(`${base}/api/settlements?position_id=x`)).status, 400);
      assert.equal((await fetch(`${base}/api/feed`, { method: 'POST' })).status, 405);
      assert.equal((await fetch(`${base}/nope`)).status, 404);
      const hz = await fetch(`${base}/healthz`);
      assert.equal(hz.status, 200);
      const hb = (await hz.json()) as { ok: boolean; last_block_seen: number; events_indexed: number };
      assert.equal(hb.ok, true);
      assert.equal(hb.events_indexed, 1);
    } finally {
      server.close();
    }
  });

  it('healthz is 503 when the indexer has not polled recently', () => {
    const db = new FeedDb(':memory:');
    assert.equal(route(db, 'GET', '/healthz').status, 503);
  });

  it('openapi.yaml documents exactly the served routes', () => {
    const yaml = readFileSync(resolve(here, '../openapi.yaml'), 'utf8');
    const documented = [...yaml.matchAll(/^ {2}(\/[^:]*):\s*$/gm)].map((m) => m[1]).sort();
    assert.deepEqual(documented, [...ROUTES].sort());
  });
});
