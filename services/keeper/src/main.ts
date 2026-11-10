// Keeper entrypoint: `pnpm --filter keeper start`. Reads ids + KEEPER_KEY_PATH from the environment;
// refuses to start (exit 2) while ids are unset (env and config.yaml), the key file is missing / too open, or the key is
// a FullAccess key on chain (startup.ts; D-012 deletion stays the primary control).

import { NearCoreReader, NearKeeperWriter } from './chain.ts';
import { ConfigError, loadConfig } from './config.ts';
import { KeeperDb } from './db.ts';
import { Keeper } from './keeper.ts';
import { KeyFileError, loadKeeperKey } from './keyfile.ts';
import { createLogger, errMsg } from './log.ts';
import { startHealthServer } from './server.ts';
import { FullAccessKeyError, assertNotFullAccess } from './startup.ts';

async function main(): Promise<void> {
  const log = createLogger('keeper');
  let cfg;
  let key;
  try {
    cfg = loadConfig();
    key = loadKeeperKey(cfg.keyPath, cfg.keeperAccountId);
  } catch (e) {
    if (e instanceof ConfigError || e instanceof KeyFileError) {
      log.error('startup_refused', { error: e.message });
      process.exitCode = 2;
      return;
    }
    throw e;
  }
  const reader = new NearCoreReader(cfg.rpcUrl, cfg.coreAccountId, cfg.keeperAccountId, key.publicKey);
  try {
    const allowance = await assertNotFullAccess(reader, cfg.keeperAccountId);
    if (allowance.kind === 'unknown') log.warn('allowance_unknown_at_startup', { reason: allowance.reason });
  } catch (e) {
    if (e instanceof FullAccessKeyError) {
      log.error('startup_refused', { error: e.message });
      process.exitCode = 2;
      return;
    }
    throw e;
  }
  const writer = new NearKeeperWriter(cfg.rpcUrl, cfg.keeperAccountId, key.secretKey, cfg.coreAccountId, cfg.gasTgas);
  const db = new KeeperDb(cfg.dbPath);
  const keeper = new Keeper(reader, writer, db, log, { pollMs: cfg.pollMs, pageSize: cfg.pageSize });
  const server = startHealthServer(keeper.status, db, cfg.pollMs, cfg.healthPort, cfg.healthHost);
  const ac = new AbortController();
  const stop = (): void => {
    log.info('shutdown');
    ac.abort();
    server.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  log.info('keeper_started', { core: cfg.coreAccountId, keeper: cfg.keeperAccountId, poll_ms: cfg.pollMs, health_port: cfg.healthPort });
  await keeper.run(ac.signal);
  db.close();
}

main().catch((e: unknown) => {
  createLogger('keeper').error('fatal', { error: errMsg(e) });
  process.exitCode = 1;
});
