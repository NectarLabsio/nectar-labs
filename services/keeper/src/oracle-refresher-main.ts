// Owner-price refresher entrypoint (WO-63): `pnpm --filter keeper oracle-refresher`, or from the repo root
// `node --disable-warning=ExperimentalWarning services/keeper/src/oracle-refresher-main.ts`. Prod deps only (near-api-js).
// Exit 1 only on key/config errors; exit 0 after run_until or SIGINT/SIGTERM. Tick errors back off and never exit.

import { KeyFileError } from './keyfile.ts';
import { createLogger, errMsg } from './log.ts';
import { RefresherConfigError, createOracleRefresher } from './oracle-refresher.ts';

async function main(): Promise<void> {
  const log = createLogger('oracle-refresher');
  let r: ReturnType<typeof createOracleRefresher>;
  try {
    r = createOracleRefresher(process.env, log);
  } catch (e) {
    const kind = e instanceof KeyFileError ? 'key_error' : e instanceof RefresherConfigError ? 'config_error' : 'startup_error';
    log.error(kind, { event: kind, error: errMsg(e) });
    process.exitCode = 1;
    return;
  }
  const { cfg } = r;
  if ('stopped' in r) {
    log.info('stopped', { event: 'stopped', reason: 'run_until', run_until: new Date(cfg.runUntilMs).toISOString() });
    return;
  }
  const ac = new AbortController();
  const stop = (): void => {
    log.info('shutdown', { event: 'shutdown' });
    ac.abort();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  log.info('oracle_refresher_started', {
    event: 'started',
    owner: cfg.ownerAccountId,
    core: cfg.coreAccountId,
    symbol: cfg.symbol,
    tick_s: cfg.tickMs / 1_000,
    session_max_age_s: cfg.sessionMaxAgeS,
    closed_max_age_s: cfg.closedMaxAgeS,
    run_until: new Date(cfg.runUntilMs).toISOString(),
    rpc_endpoints: cfg.rpcUrls.length,
  });
  await r.refresher.run(ac.signal);
}

main().catch((e: unknown) => {
  createLogger('oracle-refresher').error('fatal', { event: 'fatal', error: errMsg(e) });
  process.exitCode = 1;
});
