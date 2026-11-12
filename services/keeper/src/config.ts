// Environment → config. `.env` holds ids and key PATHS only (CLAUDE.md §1); key material is never read
// from the environment. Account ids default to packages/config/config.yaml (accounts.core, accounts.keeper);
// env overrides; `TODO-*` values are treated as unset. KEEPER_KEY_PATH has no default (no default key).

import { nearRpcUrls } from './near-rpc.ts';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { loadRepoIds, type RepoIds } from './repo-config.ts';

export interface KeeperConfig {
  /** NEAR RPC endpoints in fallback order (near-rpc.ts nearRpcUrls: NEAR_RPC_URL first, then FastNEAR x2, dRPC, Intear). */
  rpcUrls: string[];
  coreAccountId: string;
  keeperAccountId: string;
  keyPath: string;
  pollMs: number;
  pageSize: number;
  gasTgas: number;
  healthPort: number;
  healthHost: string;
  dbPath: string;
  /** P2 relay: Solana fee-payer keypair path (KEEPER_SOLANA_KEYPAIR); null = relay disabled. */
  solanaKeypairPath: string | null;
  solanaRpcUrl: string;
  /** SR-31: the only vault program the fee payer signs for; required when the relay is enabled. */
  vaultProgramId: string | null;
  /** SR-12: the vault is PDA("vault", mint); required when the relay is enabled. */
  vaultMint: string | null;
  /** P2b Base relay (WO-29b); null = BASE_RPC_URL unset = relay disabled. */
  base: BaseConfig | null;
}

export interface BaseConfig {
  rpcUrl: string;
  keystoreDir: string;
  account: string;
  passwordFile: string;
  /** SR-31: the only vault the relay signs for (BASE_VAULT_ADDRESS, else config.yaml base.vault). */
  vaultAddress: string;
  keeperAttest: boolean;
  /** SR-28: BASE_OUTLAYER_VAULT_READ=1 once the quoter answers vault_read for base-sepolia. */
  outlayerVaultRead: boolean;
  /** SR-29: log window used only when a position has no reservation time. */
  logLookbackBlocks: number;
  /** BASE_BUILDER_CODE (H19); set but not appended while the ERC-8021 format is unverified (F-351). */
  builderCode: string | null;
}

/** Base relay config; throws ConfigError when BASE_RPC_URL is set but the keystore triple is incomplete. */
export function loadBaseConfig(env: NodeJS.ProcessEnv = process.env): BaseConfig | null {
  if (isPlaceholder(env.BASE_RPC_URL)) return null;
  const missing = [
    ...(isPlaceholder(env.BASE_ACCOUNT) ? ['BASE_ACCOUNT'] : []),
    ...(isPlaceholder(env.BASE_PASSWORD_FILE) ? ['BASE_PASSWORD_FILE'] : []),
  ];
  if (missing.length > 0) throw new ConfigError(`BASE_RPC_URL is set but unset: ${missing.join(', ')}`);
  const attest = env.BASE_KEEPER_ATTEST ?? '';
  if (!['', '0', '1'].includes(attest.trim())) throw new ConfigError('BASE_KEEPER_ATTEST must be 0 or 1');
  const vaultRead = env.BASE_OUTLAYER_VAULT_READ ?? '';
  if (!['', '0', '1'].includes(vaultRead.trim())) throw new ConfigError('BASE_OUTLAYER_VAULT_READ must be 0 or 1');
  const vaultAddress = loadRepoIds(env).baseVault;
  if (vaultAddress === null) throw new ConfigError('BASE_RPC_URL is set but the vault is not pinned: set BASE_VAULT_ADDRESS or config.yaml base.vault');
  return {
    rpcUrl: (env.BASE_RPC_URL as string).trim(),
    keystoreDir: expandHome(isPlaceholder(env.BASE_KEYSTORE_DIR) ? '~/.foundry/keystores' : (env.BASE_KEYSTORE_DIR as string)),
    account: (env.BASE_ACCOUNT as string).trim(),
    passwordFile: expandHome(env.BASE_PASSWORD_FILE as string),
    vaultAddress: vaultAddress.trim(),
    keeperAttest: attest.trim() === '1',
    outlayerVaultRead: vaultRead.trim() === '1',
    logLookbackBlocks: int(env, 'BASE_LOG_LOOKBACK_BLOCKS', 10_000, 200, 100_000_000),
    builderCode: isPlaceholder(env.BASE_BUILDER_CODE) ? null : (env.BASE_BUILDER_CODE as string).trim(),
  };
}

export function isPlaceholder(v: string | undefined): boolean {
  return v === undefined || v.trim() === '' || v.startsWith('TODO-');
}

export function expandHome(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

function int(env: NodeJS.ProcessEnv, key: string, dflt: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return dflt;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${key} must be an integer in [${min}, ${max}]`);
  return n;
}

export class ConfigError extends Error {}

/** SR-12 / SR-31: with the relay on, the program and mint come from config, never from what an RPC reports. */
export function assertSolanaPinned(ids: RepoIds): void {
  const program = ids.solanaVaultProgram ?? ids.solanaProgramId;
  if (program === null) throw new ConfigError('KEEPER_SOLANA_KEYPAIR is set but the vault program is not pinned: set NECTAR_VAULT_PROGRAM_ID or config.yaml solana.vault_program');
  if (ids.solanaMint === null) throw new ConfigError('KEEPER_SOLANA_KEYPAIR is set but the vault mint is not pinned: set NECTAR_VAULT_MINT or config.yaml solana.mint');
  if (ids.solanaProgramId !== null && ids.solanaProgramId !== program) {
    throw new ConfigError('config.yaml solana.program_id and solana.vault_program differ: fix them or set NECTAR_VAULT_PROGRAM_ID');
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): KeeperConfig {
  const ids = loadRepoIds(env);
  const missing = [
    ...(ids.core === null ? ['CORE_ACCOUNT_ID'] : []),
    ...(ids.keeper === null ? ['KEEPER_ACCOUNT_ID'] : []),
    ...(isPlaceholder(env.KEEPER_KEY_PATH) ? ['KEEPER_KEY_PATH'] : []),
  ];
  if (missing.length > 0) throw new ConfigError(`unset: ${missing.join(', ')}`);
  const solanaKeypairPath = isPlaceholder(env.KEEPER_SOLANA_KEYPAIR) ? null : expandHome(env.KEEPER_SOLANA_KEYPAIR as string);
  if (solanaKeypairPath !== null) assertSolanaPinned(ids);
  return {
    rpcUrls: nearRpcUrls(env),
    coreAccountId: ids.core as string,
    keeperAccountId: ids.keeper as string,
    keyPath: expandHome(env.KEEPER_KEY_PATH as string),
    pollMs: int(env, 'KEEPER_POLL_MS', 10_000, 1_000, 3_600_000),
    pageSize: int(env, 'KEEPER_PAGE_SIZE', 50, 1, 500),
    gasTgas: int(env, 'KEEPER_GAS_TGAS', 300, 10, 300),
    healthPort: int(env, 'KEEPER_HEALTH_PORT', 8787, 0, 65_535),
    healthHost: env.KEEPER_HEALTH_HOST && env.KEEPER_HEALTH_HOST !== '' ? env.KEEPER_HEALTH_HOST : '127.0.0.1',
    dbPath: expandHome(env.KEEPER_DB_PATH && env.KEEPER_DB_PATH !== '' ? env.KEEPER_DB_PATH : '~/.nectar/keeper.sqlite'),
    solanaKeypairPath,
    solanaRpcUrl: isPlaceholder(env.SOLANA_RPC_URL) ? 'https://api.devnet.solana.com' : (env.SOLANA_RPC_URL as string),
    vaultProgramId: ids.solanaVaultProgram ?? ids.solanaProgramId,
    vaultMint: ids.solanaMint,
    base: loadBaseConfig(env),
  };
}
