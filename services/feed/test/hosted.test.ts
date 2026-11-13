// WO-34k hosted mode: single-port routing, CORS allowlist, /health, start block, RPC fallback order.
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { LEGACY_CORS, createApi, route, type ApiOptions } from '../src/api.ts';
import { CorsConfigError, parseCorsOrigins } from '../src/cors.ts';
import { FeedDb } from '../src/db.ts';
import { createLogger } from '../src/log.ts';
import { HostedConfigError, listenConfig, neardataApiKey, startBlock } from '../src/hosted.ts';
import { DEFAULT_RPC_FALLBACKS, Fallback, rpcUrls } from '../src/near.ts';
import { NeardataSource, type BlockFetcher } from '../src/neardata.ts';
import { createFeedServer } from '../src/server.ts';

const SITE = 'https://site.example';
const APP = 'https://app.example';
const allow = parseCorsOrigins(`${SITE}, ${APP}/`);
const opts = (o: Partial<ApiOptions> = {}): ApiOptions => ({
  cors: { origins: allow, legacyWildcard: true, methods: 'GET, HEAD, OPTIONS' },
  contracts: { core: 'nectar-core-v2.nectar.testnet' },
  version: { version: '0.1.0', commit: null },
  ...o,
});

async function up(srv: Server): Promise<string> {
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
}
const down = (srv: Server): Promise<void> => new Promise((r) => srv.close(() => r()));
const MCP_HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
const toolsList = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

describe('single-port Feed server (FEED_SINGLE_PORT=1)', () => {
  it('serves REST, /health and POST /mcp tools/list on one port', async () => {
    const db = new FeedDb(':memory:');
    const srv = createFeedServer(db, opts(), { db, views: null, coreId: null });
    const base = await up(srv);
    try {
      const feed = await fetch(`${base}/api/feed`);
      assert.equal(feed.status, 200);
      assert.deepEqual(((await feed.json()) as { assets: unknown[] }).assets, []);
      const health = await fetch(`${base}/health`);
      assert.equal(health.status, 503, 'no poll yet');
      const h = (await health.json()) as Record<string, unknown>;
      for (const k of ['last_indexed_block', 'chain_head', 'lag_blocks', 'contracts', 'version', 'start_block']) assert.ok(k in h, k);
      assert.equal((await fetch(`${base}/healthz`)).status, 503, '/healthz kept');
      const mcp = await fetch(`${base}/mcp`, { method: 'POST', headers: MCP_HEADERS, body: toolsList });
      assert.equal(mcp.status, 200);
      assert.match(await mcp.text(), /get_exit_capacity/);
      assert.equal((await fetch(`${base}/mcp`)).status, 405, 'GET /mcp is not REST');
      assert.equal((await fetch(`${base}/nope`)).status, 404);
    } finally {
      await down(srv);
    }
  });

  it('PORT wins in single-port mode; local defaults unchanged otherwise', () => {
    assert.deepEqual(listenConfig({}), { single: false, port: 8788, host: '127.0.0.1', mcpPort: 8789 });
    assert.deepEqual(listenConfig({ PORT: '9999' }), { single: false, port: 8788, host: '127.0.0.1', mcpPort: 8789 }, 'PORT ignored unless single');
    assert.deepEqual(listenConfig({ FEED_SINGLE_PORT: '1', PORT: '9999', FEED_PORT: '1', FEED_HOST: '0.0.0.0' }), { single: true, port: 9999, host: '0.0.0.0', mcpPort: null });
    assert.deepEqual(listenConfig({ FEED_SINGLE_PORT: '1' }).port, 8788);
    assert.throws(() => listenConfig({ FEED_SINGLE_PORT: '1', PORT: 'abc' }), HostedConfigError);
  });
});

describe('CORS allowlist (FEED_CORS_ORIGINS)', () => {
  it('allows exactly the listed origins on REST and /mcp, refuses others', async () => {
    const db = new FeedDb(':memory:');
    const srv = createFeedServer(db, opts(), { db, views: null, coreId: null });
    const base = await up(srv);
    try {
      for (const path of ['/api/feed', '/mcp']) {
        const ok = await fetch(`${base}${path}`, { method: 'OPTIONS', headers: { origin: APP, 'access-control-request-method': path === '/mcp' ? 'POST' : 'GET' } });
        assert.equal(ok.status, 204, path);
        assert.equal(ok.headers.get('access-control-allow-origin'), APP);
        assert.match(ok.headers.get('vary') ?? '', /Origin/);
        const bad = await fetch(`${base}${path}`, { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
        assert.equal(bad.status, 403, path);
        assert.equal(bad.headers.get('access-control-allow-origin'), null);
      }
      const get = await fetch(`${base}/api/feed`, { headers: { origin: SITE } });
      assert.equal(get.headers.get('access-control-allow-origin'), SITE);
      const other = await fetch(`${base}/api/feed`, { headers: { origin: 'https://evil.example' } });
      assert.equal(other.status, 200, 'non-browser reads still work');
      assert.equal(other.headers.get('access-control-allow-origin'), null);
      const mcp = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...MCP_HEADERS, origin: APP }, body: toolsList });
      assert.equal(mcp.headers.get('access-control-allow-origin'), APP);
    } finally {
      await down(srv);
    }
  });

  it('unset keeps today\'s `*` and no preflight handling', async () => {
    const db = new FeedDb(':memory:');
    const srv = createApi(db, { cors: LEGACY_CORS });
    const base = await up(srv);
    try {
      const r = await fetch(`${base}/api/feed`, { headers: { origin: 'https://any.example' } });
      assert.equal(r.headers.get('access-control-allow-origin'), '*');
      assert.equal((await fetch(`${base}/api/feed`, { method: 'OPTIONS' })).status, 405);
    } finally {
      await down(srv);
    }
    assert.equal(parseCorsOrigins(undefined), null);
    assert.equal(parseCorsOrigins('  '), null);
  });

  it('rejects malformed origins', () => {
    assert.throws(() => parseCorsOrigins('https://a.example/path'), CorsConfigError);
    assert.throws(() => parseCorsOrigins('a.example'), CorsConfigError);
    assert.throws(() => parseCorsOrigins('ftp://a.example'), CorsConfigError);
    assert.throws(() => parseCorsOrigins(','), CorsConfigError);
    assert.deepEqual([...(parseCorsOrigins('https://a.example:8443,https://a.example:8443') ?? [])], ['https://a.example:8443']);
  });
});

describe('/health', () => {
  it('reports lag against the Neardata head, contract ids and version', () => {
    const db = new FeedDb(':memory:');
    db.seeBlock(100);
    db.setMeta('neardata_final', '130');
    db.setMeta('last_poll_at', '1000');
    const r = route(db, 'GET', '/health', opts({ now: () => 2000, startBlock: 'head-50' }));
    assert.equal(r.status, 200);
    const b = r.body as Record<string, unknown>;
    assert.equal(b.last_indexed_block, 100);
    assert.equal(b.chain_head, 130);
    assert.equal(b.lag_blocks, 30);
    assert.equal(b.start_block, 'head-50');
    assert.deepEqual(b.contracts, { core: 'nectar-core-v2.nectar.testnet' });
    assert.equal(b.version, '0.1.0');
  });

  it('indexer_cursor / indexer_lag_blocks: Neardata cursor and final − cursor; null in views-only mode (WO-71)', () => {
    const db = new FeedDb(':memory:');
    db.seeBlock(990);
    db.setMeta('last_poll_at', '1000');
    const at = (o: Partial<ApiOptions>): Record<string, unknown> => route(db, 'GET', '/health', opts({ now: () => 2000, ...o })).body as Record<string, unknown>;
    let b = at({ source: 'views+neardata' });
    assert.equal(b.indexer_cursor, null, 'no cursor yet');
    assert.equal(b.indexer_lag_blocks, null);
    db.setMeta('neardata_height', '990');
    db.setMeta('neardata_final', '1003');
    b = at({ source: 'views+neardata' });
    assert.equal(b.indexer_cursor, 990);
    assert.equal(b.indexer_lag_blocks, 13);
    assert.equal(b.lag_blocks, 13, 'existing fields unchanged');
    b = at({ source: 'views', history: 'unavailable' });
    assert.equal(b.indexer_cursor, null, 'views-only mode');
    assert.equal(b.indexer_lag_blocks, null);
    const hz = route(db, 'GET', '/healthz', opts({ now: () => 2000 })).body as Record<string, unknown>;
    assert.equal('indexer_cursor' in hz, false, '/healthz unchanged');
  });
});

describe('FEED_START_BLOCK', () => {
  it('parses head, head-N and heights', () => {
    assert.deepEqual(startBlock({}), { kind: 'head', back: 0 });
    assert.deepEqual(startBlock({ FEED_START_BLOCK: 'head' }), { kind: 'head', back: 0 });
    assert.deepEqual(startBlock({ FEED_START_BLOCK: 'head-1200' }), { kind: 'head', back: 1200 });
    assert.deepEqual(startBlock({ FEED_START_BLOCK: '276971305' }), { kind: 'height', height: 276971305 });
    assert.deepEqual(startBlock({ FEED_NEARDATA_START_HEIGHT: '5' }), { kind: 'height', height: 5 }, 'legacy variable');
    assert.throws(() => startBlock({ FEED_START_BLOCK: 'tail' }), HostedConfigError);
  });

  it('an empty DB starts N blocks behind the final head; a saved cursor wins', async () => {
    const asked: number[] = [];
    const fetcher: BlockFetcher = { lastFinalHeight: async () => 1000, block: async (h) => (asked.push(h), null) };
    const log = createLogger('test', () => {});
    const db = new FeedDb(':memory:');
    await new NeardataSource(fetcher, { contractId: 'c', startHeight: null, startBack: 10, maxBlocksPerPoll: 100 }, log).poll(db, 1);
    assert.equal(asked[0], 990);
    assert.equal(asked.at(-1), 1000);
    asked.length = 0;
    await new NeardataSource(fetcher, { contractId: 'c', startHeight: null, startBack: 500, maxBlocksPerPoll: 100 }, log).poll(db, 2);
    assert.deepEqual(asked, [], 'cursor already at the head');
  });
});

describe('RPC fallback', () => {
  it('orders D-025 primary first; NEAR_RPC_URL alone stays single', () => {
    assert.equal(rpcUrls({})[0], 'https://test.rpc.fastnear.com');
    assert.deepEqual(rpcUrls({}), [...DEFAULT_RPC_FALLBACKS]);
    assert.ok(!rpcUrls({}).some((u) => u.includes('rpc.testnet.near.org')), 'deprecated host excluded (F-369)');
    assert.deepEqual(rpcUrls({ NEAR_RPC_URL: 'http://127.0.0.1:3030' }), ['http://127.0.0.1:3030']);
    assert.deepEqual(rpcUrls({ NEAR_RPC_URLS: 'https://a, https://b,https://a' }), ['https://a', 'https://b']);
  });

  it('moves to the next backend on error and sticks to the one that answered', async () => {
    const calls: string[] = [];
    const fb = new Fallback(['a', 'b', 'c']);
    const run = (fail: Set<string>) => fb.run(async (x) => (calls.push(x), fail.has(x) ? Promise.reject(new Error(x)) : x));
    assert.equal(await run(new Set(['a'])), 'b');
    assert.equal(fb.index, 1);
    assert.equal(await run(new Set()), 'b');
    await assert.rejects(run(new Set(['a', 'b', 'c'])), /a|b|c/);
    assert.deepEqual(calls, ['a', 'b', 'b', 'b', 'c', 'a']);
  });
});

describe('Neardata key source (FEED_NEARDATA_API_KEY)', () => {
  const files: Record<string, string> = { '/keys/neardata': 'file-key\n' };
  const read = (p: string): string => {
    const v = files[p];
    if (v === undefined) throw new Error('ENOENT');
    return v;
  };
  it('value from FEED_NEARDATA_API_KEY; the path wins when both are set; neither = keyless', () => {
    assert.equal(neardataApiKey({ FEED_NEARDATA_API_KEY: ' sealed-key ' }, read), 'sealed-key');
    assert.equal(neardataApiKey({ FEED_NEARDATA_API_KEY: 'sealed-key', FEED_NEARDATA_API_KEY_PATH: '/keys/neardata' }, read), 'file-key');
    assert.equal(neardataApiKey({ FEED_NEARDATA_API_KEY_PATH: '/keys/neardata' }, read), 'file-key');
    assert.equal(neardataApiKey({}, read), null);
    assert.equal(neardataApiKey({ FEED_NEARDATA_API_KEY: 'TODO-H1', FEED_NEARDATA_API_KEY_PATH: '' }, read), null);
    assert.throws(() => neardataApiKey({ FEED_NEARDATA_API_KEY_PATH: '/missing', FEED_NEARDATA_API_KEY: 'x' }, read), /ENOENT/);
  });
});
