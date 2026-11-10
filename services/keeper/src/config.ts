// Environment → config. `.env` holds ids and key PATHS only (CLAUDE.md §1); key material is never read
// from the environment. Account ids default to packages/config/config.yaml (accounts.core, accounts.keeper);
// env overrides; `TODO-*` values are treated as unset. KEEPER_KEY_PATH has no default (no default key).

import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { loadRepoIds } from './repo-config.ts';

export interface KeeperConfig {
  rpcUrl: string;
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
  /** optional cross-check of NEAR's remote_chain.vault_program */
  vaultProgramId: string | null;
  /** optional; else the vault is found by symbol */
  vaultMint: string | null;
  /** P2b Base relay (WO-29b); null = BASE_RPC_URL unset = relay disabled. */
  base: BaseConfig | null;
}

export interface BaseConfig {
  rpcUrl: string;
  keystoreDir: string;
  account: string;
  passwordFile: string;
  vaultAddress: string | null;
  keeperAttest: boolean;
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
  return {
    rpcUrl: (env.BASE_RPC_URL as string).trim(),
    keystoreDir: expandHome(isPlaceholder(env.BASE_KEYSTORE_DIR) ? '~/.foundry/keystores' : (env.BASE_KEYSTORE_DIR as string)),
    account: (env.BASE_ACCOUNT as string).trim(),
    passwordFile: expandHome(env.BASE_PASSWORD_FILE as string),
    vaultAddress: isPlaceholder(env.BASE_VAULT_ADDRESS) ? null : (env.BASE_VAULT_ADDRESS as string).trim(),
    keeperAttest: attest.trim() === '1',
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): KeeperConfig {
  const ids = loadRepoIds(env);
  const missing = [
    ...(ids.core === null ? ['CORE_ACCOUNT_ID'] : []),
    ...(ids.keeper === null ? ['KEEPER_ACCOUNT_ID'] : []),
    ...(isPlaceholder(env.KEEPER_KEY_PATH) ? ['KEEPER_KEY_PATH'] : []),
  ];
  if (missing.length > 0) throw new ConfigError(`unset: ${missing.join(', ')}`);
  return {
    rpcUrl: env.NEAR_RPC_URL && env.NEAR_RPC_URL !== '' ? env.NEAR_RPC_URL : 'https://test.rpc.fastnear.com',
    coreAccountId: ids.core as string,
    keeperAccountId: ids.keeper as string,
    keyPath: expandHome(env.KEEPER_KEY_PATH as string),
    pollMs: int(env, 'KEEPER_POLL_MS', 10_000, 1_000, 3_600_000),
    pageSize: int(env, 'KEEPER_PAGE_SIZE', 50, 1, 500),
    gasTgas: int(env, 'KEEPER_GAS_TGAS', 300, 10, 300),
    healthPort: int(env, 'KEEPER_HEALTH_PORT', 8787, 0, 65_535),
    healthHost: env.KEEPER_HEALTH_HOST && env.KEEPER_HEALTH_HOST !== '' ? env.KEEPER_HEALTH_HOST : '127.0.0.1',
    dbPath: expandHome(env.KEEPER_DB_PATH && env.KEEPER_DB_PATH !== '' ? env.KEEPER_DB_PATH : '~/.nectar/keeper.sqlite'),
    solanaKeypairPath: isPlaceholder(env.KEEPER_SOLANA_KEYPAIR) ? null : expandHome(env.KEEPER_SOLANA_KEYPAIR as string),
    solanaRpcUrl: isPlaceholder(env.SOLANA_RPC_URL) ? 'https://api.devnet.solana.com' : (env.SOLANA_RPC_URL as string),
    vaultProgramId: isPlaceholder(env.NECTAR_VAULT_PROGRAM_ID) ? null : (env.NECTAR_VAULT_PROGRAM_ID as string),
    vaultMint: isPlaceholder(env.NECTAR_VAULT_MINT) ? null : (env.NECTAR_VAULT_MINT as string),
    base: loadBaseConfig(env),
  };
}
