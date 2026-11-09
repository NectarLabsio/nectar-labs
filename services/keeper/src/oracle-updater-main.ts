// Oracle updater entrypoint: `pnpm --filter keeper oracle-updater`. A separate process from the keeper
// (D-013): its own account and key file. Disabled → logs `oracle_updater_disabled{reason}` and exits 0.

import { createLogger, errMsg } from './log.ts';
import { createOracleUpdater } from './oracle-updater.ts';

async function main(): Promise<void> {
  const log = createLogger('oracle-updater');
  const r = createOracleUpdater(process.env, log);
  if ('disabled' in r) {
    log.warn('oracle_updater_disabled', { reason: r.disabled });
    return;
  }
  const ac = new AbortController();
  const stop = (): void => {
    log.info('shutdown');
    ac.abort();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  log.info('oracle_updater_started');
  await r.updater.run(ac.signal);
}

main().catch((e: unknown) => {
  createLogger('oracle-updater').error('fatal', { error: errMsg(e) });
  process.exitCode = 1;
});
