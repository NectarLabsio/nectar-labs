// Feed entrypoint: `pnpm --filter feed start`. Serves REST from SQLite; polls views when
// CORE_ACCOUNT_ID is set (TODO-G2 until deploy → API serves whatever the DB holds, polling off).
// Optional: KEEPER_DB_PATH + KEEPER_ACCOUNT_ID → also index NEP-297 logs of the keeper's own txs.

import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from './api.ts';
import { FeedDb } from './db.ts';
import { Indexer } from './indexer.ts';
import { createLogger, errMsg } from './log.ts';
import { NearTxOutcomeFetcher, NearViewReader } from './near.ts';
import { TxStatusSource, ViewPollingSource, type Source } from './sources.ts';

const env = process.env;
const unset = (v: string | undefined): boolean => v === undefined || v.trim() === '' || v.startsWith('TODO-');
const home = (p: string): string => (p.startsWith('~/') ? resolve(homedir(), p.slice(2)) : resolve(p));

function main(): void {
  const log = createLogger('feed');
  const rpc = unset(env.NEAR_RPC_URL) ? 'https://rpc.testnet.near.org' : (env.NEAR_RPC_URL as string);
  const pollMs = Number(env.FEED_POLL_MS ?? 10_000);
  const port = Number(env.FEED_PORT ?? 8788);
  const host = unset(env.FEED_HOST) ? '127.0.0.1' : (env.FEED_HOST as string);
  const db = new FeedDb(home(unset(env.FEED_DB_PATH) ? '~/.nectar/feed.sqlite' : (env.FEED_DB_PATH as string)));

  const sources: Source[] = [];
  if (!unset(env.CORE_ACCOUNT_ID)) {
    const core = env.CORE_ACCOUNT_ID as string;
    sources.push(new ViewPollingSource(new NearViewReader(rpc, core), log));
    if (!unset(env.KEEPER_DB_PATH) && !unset(env.KEEPER_ACCOUNT_ID)) {
      const kdb = new DatabaseSync(home(env.KEEPER_DB_PATH as string), { readOnly: true });
      const hashes = (): string[] =>
        (kdb.prepare("SELECT tx_hash FROM keeper_runs WHERE tx_hash IS NOT NULL ORDER BY id DESC LIMIT 200").all() as Array<{ tx_hash: string }>).map((r) => r.tx_hash);
      sources.push(new TxStatusSource(new NearTxOutcomeFetcher(rpc, env.KEEPER_ACCOUNT_ID as string, core), hashes, log));
    }
  } else {
    log.warn('polling_disabled', { reason: 'CORE_ACCOUNT_ID unset (TODO-G2)' });
  }

  const server = createApi(db, { pollMs, source: sources.map((s) => s.kind).join('+') || 'none' });
  server.listen(port, host);
  const ac = new AbortController();
  const stop = (): void => {
    ac.abort();
    server.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  log.info('feed_started', { port, sources: sources.map((s) => s.kind).join('+') || 'none', poll_ms: pollMs });
  if (sources.length > 0) {
    new Indexer(db, sources, log, pollMs).run(ac.signal).catch((e: unknown) => log.error('fatal', { error: errMsg(e) }));
  }
}

main();
