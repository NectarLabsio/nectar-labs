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
import { KitSolanaPort, SolanaRelay, assertDevnetRpc, loadSolanaFeePayer } from './solana.ts';
import { FullAccessKeyError, assertNotFullAccess } from './startup.ts';
import { address } from '@solana/kit';

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
  // P2 Solana relay: only with a fee-payer keypair (path from KEEPER_SOLANA_KEYPAIR; the key is never logged).
  let relay: SolanaRelay | null = null;
  if (cfg.solanaKeypairPath === null) {
    log.info('solana_relay_disabled', { reason: 'KEEPER_SOLANA_KEYPAIR unset' });
  } else {
    try {
      assertDevnetRpc(cfg.solanaRpcUrl);
      const payer = await loadSolanaFeePayer(cfg.solanaKeypairPath);
      relay = new SolanaRelay(reader, writer, new KitSolanaPort(cfg.solanaRpcUrl), payer, db, log, {
        pageSize: cfg.pageSize,
        expectedProgram: cfg.vaultProgramId === null ? null : address(cfg.vaultProgramId),
        mintOverride: cfg.vaultMint === null ? null : address(cfg.vaultMint),
      });
      log.info('solana_relay_enabled', { fee_payer: payer.address });
    } catch (e) {
      log.error('startup_refused', { error: errMsg(e) });
      process.exitCode = 2;
      db.close();
      return;
    }
  }
  const server = startHealthServer(keeper.status, db, cfg.pollMs, cfg.healthPort, cfg.healthHost, Date.now, relay?.status ?? null);
  const ac = new AbortController();
  const stop = (): void => {
    log.info('shutdown');
    ac.abort();
    server.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  log.info('keeper_started', { core: cfg.coreAccountId, keeper: cfg.keeperAccountId, poll_ms: cfg.pollMs, health_port: cfg.healthPort });
  await Promise.all([keeper.run(ac.signal), relay === null ? Promise.resolve() : relay.run(ac.signal, cfg.pollMs)]);
  db.close();
}

main().catch((e: unknown) => {
  createLogger('keeper').error('fatal', { error: errMsg(e) });
  process.exitCode = 1;
});
