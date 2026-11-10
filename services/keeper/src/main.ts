// Keeper entrypoint: `pnpm --filter keeper start`. Reads ids + KEEPER_KEY_PATH from the environment;
// refuses to start (exit 2) while ids are unset (env and config.yaml), the key file is missing / too open, or the key is
// a FullAccess key on chain (startup.ts; D-012 deletion stays the primary control).

import { BaseRelay, ChainRefusedError, ViemEvmPort, assertBaseSepoliaRpc, loadFoundryKeystore, rawKeyEnvVars } from './base.ts';
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
import { getAddress, isAddress } from 'viem';

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
  // P2b Base relay (WO-29b): only with BASE_RPC_URL; Foundry keystore signer, chain 84532 checked on the wire.
  let baseRelay: BaseRelay | null = null;
  if (cfg.base === null) {
    log.info('base_relay_disabled', { reason: 'BASE_RPC_URL unset' });
  } else {
    try {
      const raw = rawKeyEnvVars(process.env);
      if (raw.length > 0) throw new Error(`raw key environment variable(s) set (${raw.join(', ')}); the keeper signs from a Foundry keystore only`);
      assertBaseSepoliaRpc(cfg.base.rpcUrl);
      if (cfg.base.vaultAddress !== null && !isAddress(cfg.base.vaultAddress, { strict: false })) throw new Error('BASE_VAULT_ADDRESS is not a 0x address');
      const account = loadFoundryKeystore(cfg.base.keystoreDir, cfg.base.account, cfg.base.passwordFile);
      // TODO-H19: ERC-8021 suffix bytes are unverified (F-351), so none are injected even when BASE_BUILDER_CODE is set.
      if (cfg.base.builderCode !== null) log.warn('base_builder_code_not_appended', { reason: 'ERC-8021 suffix format unverified (F-351)' });
      baseRelay = new BaseRelay(reader, writer, new ViemEvmPort(cfg.base.rpcUrl, account), db, log, {
        pageSize: cfg.pageSize,
        expectedVault: cfg.base.vaultAddress === null ? null : getAddress(cfg.base.vaultAddress),
        keeperAttest: cfg.base.keeperAttest,
        builderSuffix: null,
        builderSuffixState: cfg.base.builderCode === null ? 'none' : 'unverified_not_appended',
      });
      try {
        await baseRelay.assertChain();
      } catch (e) {
        if (e instanceof ChainRefusedError) throw e;
        log.warn('base_chain_check_deferred', { error: errMsg(e).slice(0, 200) }); // RPC down: every tick re-checks before acting
      }
      log.info('base_relay_enabled', { signer: account.address, chain_id: baseRelay.status.chainId, attest_mode: cfg.base.keeperAttest });
    } catch (e) {
      log.error('startup_refused', { error: errMsg(e) });
      process.exitCode = 2;
      db.close();
      return;
    }
  }
  const server = startHealthServer(keeper.status, db, cfg.pollMs, cfg.healthPort, cfg.healthHost, Date.now, relay?.status ?? null, baseRelay?.status ?? null);
  const ac = new AbortController();
  const stop = (): void => {
    log.info('shutdown');
    ac.abort();
    server.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  log.info('keeper_started', { core: cfg.coreAccountId, keeper: cfg.keeperAccountId, poll_ms: cfg.pollMs, health_port: cfg.healthPort });
  await Promise.all([
    keeper.run(ac.signal),
    relay === null ? Promise.resolve() : relay.run(ac.signal, cfg.pollMs),
    baseRelay === null ? Promise.resolve() : baseRelay.run(ac.signal, cfg.pollMs),
  ]);
  db.close();
}

main().catch((e: unknown) => {
  createLogger('keeper').error('fatal', { error: errMsg(e) });
  process.exitCode = 1;
});
