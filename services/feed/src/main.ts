// Feed entrypoint: `pnpm --filter feed start`. Serves REST from SQLite; polls views when
// a nectar-core id is known: CORE_ACCOUNT_ID, else accounts.core in packages/config/config.yaml.
// Events: Neardata block tail (FEED_INDEXER=neardata, default) or, as fallback (FEED_INDEXER=views),
// KEEPER_DB_PATH + KEEPER_ACCOUNT_ID → NEP-297 logs of the keeper's own txs.
// Hosted mode (WO-34k, services/feed/README.md "Hosted mode"): FEED_SINGLE_PORT=1 serves REST + POST /mcp on
// PORT; FEED_CORS_ORIGINS allowlist; FEED_DB_PATH on a volume; FEED_START_BLOCK=head|head-N|<height>;
// NEAR_RPC_URLS fallback list. All unset = the local defaults (REST 127.0.0.1:8788, MCP :8789).

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApi, LEGACY_CORS, type ApiOptions } from './api.ts';
import { parseCorsOrigins } from './cors.ts';
import { FeedDb } from './db.ts';
import { feedVersion, listenConfig, startBlock, startBlockLabel } from './hosted.ts';
import { Indexer } from './indexer.ts';
import { createLogger, errMsg } from './log.ts';
import { seedOneClickFromFixtures } from './fixtures.ts';
import { createMcpHttpServer } from './mcp.ts';
import { OneClickClient, OneClickSampler, defaultSamplerConfig } from './oneclick.ts';
import { rpcUrls, txFetcherFor, viewReaderFor } from './near.ts';
import { endpointHost, fallbackRpc } from './near-rpc.ts';
import { HttpNeardataFetcher, NeardataSource } from './neardata.ts';
import { loadRepoIds } from './repo-config.ts';
import { createFeedServer } from './server.ts';
import { TxStatusSource, ViewPollingSource, type Source } from './sources.ts';

const env = process.env;
const unset = (v: string | undefined): boolean => v === undefined || v.trim() === '' || v.startsWith('TODO-');
const home = (p: string): string => (p.startsWith('~/') ? resolve(homedir(), p.slice(2)) : resolve(p));

function main(): void {
  const log = createLogger('feed');
  const rpcs = rpcUrls(env);
  // WO-35k: one fallback provider for every NEAR view / tx-status call (rotate on 429 / 5xx / timeout; host-only logs).
  const near = fallbackRpc({ urls: rpcs, log: (level, msg, f) => log[level](msg, f) });
  const pollMs = Number(env.FEED_POLL_MS ?? 10_000);
  const listen = listenConfig(env);
  const start = startBlock(env);
  const corsOrigins = parseCorsOrigins(env.FEED_CORS_ORIGINS);
  const db = new FeedDb(home(unset(env.FEED_DB_PATH) ? '~/.nectar/feed.sqlite' : (env.FEED_DB_PATH as string)));

  const ids = loadRepoIds(env);
  const sources: Source[] = [];
  if (ids.core !== null) {
    const core = ids.core;
    sources.push(new ViewPollingSource(viewReaderFor(near.provider, core), log));
    // FEED_INDEXER=neardata (default): events from Neardata blocks (F-122). FEED_INDEXER=views: fallback,
    // view polling only (+ keeper tx-status logs below).
    const mode = unset(env.FEED_INDEXER) ? 'neardata' : (env.FEED_INDEXER as string);
    if (mode !== 'neardata' && mode !== 'views') throw new Error('FEED_INDEXER must be neardata or views');
    if (mode === 'neardata') {
      const apiKey = unset(env.FEED_NEARDATA_API_KEY_PATH) ? null : readFileSync(home(env.FEED_NEARDATA_API_KEY_PATH as string), 'utf8').trim();
      const fetcher = new HttpNeardataFetcher(unset(env.FEED_NEARDATA_URL) ? undefined : env.FEED_NEARDATA_URL, apiKey);
      sources.push(
        new NeardataSource(
          fetcher,
          {
            contractId: core,
            startHeight: start.kind === 'height' ? start.height : null,
            startBack: start.kind === 'head' ? start.back : 0,
            maxBlocksPerPoll: Number(env.FEED_NEARDATA_MAX_BLOCKS ?? 100),
          },
          log,
        ),
      );
    } else if (!unset(env.KEEPER_DB_PATH) && ids.keeper !== null) {
      const kdb = new DatabaseSync(home(env.KEEPER_DB_PATH as string), { readOnly: true });
      const hashes = (): string[] =>
        (kdb.prepare("SELECT tx_hash FROM keeper_runs WHERE tx_hash IS NOT NULL ORDER BY id DESC LIMIT 200").all() as Array<{ tx_hash: string }>).map((r) => r.tx_hash);
      sources.push(new TxStatusSource(txFetcherFor(near.provider, ids.keeper, core), hashes, log));
    }
  } else {
    log.warn('polling_disabled', { reason: 'no CORE_ACCOUNT_ID and no accounts.core in config.yaml' });
  }

  const apiOpts: ApiOptions = {
    pollMs,
    source: sources.map((s) => s.kind).join('+') || 'none',
    history: sources.some((s) => s.kind === 'neardata') ? 'indexed' : 'unavailable',
    rpcStatus: near.status,
    contracts: { core: ids.core, usdc: ids.usdcMock, nvdax: ids.nvdaxToken },
    version: feedVersion(env),
    startBlock: startBlockLabel(start),
    cors: corsOrigins === null ? LEGACY_CORS : { origins: corsOrigins, legacyWildcard: true, methods: 'GET, HEAD, OPTIONS' },
  };
  // Feed MCP over Streamable HTTP (read-only): own port (FEED_MCP_PORT, `off` disables) or, with FEED_SINGLE_PORT=1,
  // `POST /mcp` on the REST port.
  const views = ids.core === null ? null : viewReaderFor(near.provider, ids.core);
  const mcpDeps = { db, views, coreId: ids.core };
  const server = listen.single ? createFeedServer(db, apiOpts, mcpDeps) : createApi(db, apiOpts);
  server.listen(listen.port, listen.host);
  const mcp = listen.single || listen.mcpPort === null ? null : createMcpHttpServer(mcpDeps, corsOrigins === null ? undefined : { origins: corsOrigins, legacyWildcard: false, methods: 'POST, OPTIONS' });
  if (mcp !== null) mcp.listen(listen.mcpPort as number, listen.host);
  const ac = new AbortController();

  // 1Click dry-quote sampler (Q-007: dry only). ONECLICK_ENABLED=0 disables it. FEED_FIXTURES=1 replays
  // the recorded dry quotes instead (no network; signatures still verified).
  const fixtures = env.FEED_FIXTURES === '1';
  const oneclick = env.ONECLICK_ENABLED !== '0' && !fixtures;
  if (fixtures) seedOneClickFromFixtures(db, log).catch((e: unknown) => log.error('oneclick_fixtures_failed', { error: errMsg(e) }));
  if (oneclick) {
    const bearer = unset(env.ONECLICK_JWT_PATH) ? null : readFileSync(home(env.ONECLICK_JWT_PATH as string), 'utf8').trim();
    new OneClickSampler(db, new OneClickClient(undefined, undefined, bearer), defaultSamplerConfig(env), log)
      .run(ac.signal)
      .catch((e: unknown) => log.error('oneclick_fatal', { error: errMsg(e) }));
  }

  const stop = (): void => {
    ac.abort();
    server.close();
    mcp?.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  log.info('feed_started', {
    port: listen.port,
    single_port: listen.single,
    core: ids.core,
    nvdax: ids.nvdaxToken,
    mcp_port: listen.single ? 'single' : listen.mcpPort === null ? 'off' : String(listen.mcpPort),
    rpc_endpoints: rpcs.map(endpointHost).join(','),
    start_block: startBlockLabel(start),
    cors: corsOrigins === null ? 'legacy' : `${corsOrigins.size} origin(s)`,
    oneclick,
    fixtures,
    sources: sources.map((s) => s.kind).join('+') || 'none',
    poll_ms: pollMs,
  });
  if (sources.length > 0) {
    new Indexer(db, sources, log, pollMs).run(ac.signal).catch((e: unknown) => log.error('fatal', { error: errMsg(e) }));
  }
}

main();
