// Environment → config. `.env` holds ids and key PATHS only (CLAUDE.md §1); key material is never read
// from the environment. Ids still set to `TODO-G2` are treated as unset.

import { homedir } from 'node:os';
import { resolve } from 'node:path';

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
  const missing = ['CORE_ACCOUNT_ID', 'KEEPER_ACCOUNT_ID', 'KEEPER_KEY_PATH'].filter((k) => isPlaceholder(env[k]));
  if (missing.length > 0) throw new ConfigError(`unset (TODO-G2?): ${missing.join(', ')}`);
  return {
    rpcUrl: env.NEAR_RPC_URL && env.NEAR_RPC_URL !== '' ? env.NEAR_RPC_URL : 'https://rpc.testnet.near.org',
    coreAccountId: env.CORE_ACCOUNT_ID as string,
    keeperAccountId: env.KEEPER_ACCOUNT_ID as string,
    keyPath: expandHome(env.KEEPER_KEY_PATH as string),
    pollMs: int(env, 'KEEPER_POLL_MS', 10_000, 1_000, 3_600_000),
    pageSize: int(env, 'KEEPER_PAGE_SIZE', 50, 1, 500),
    gasTgas: int(env, 'KEEPER_GAS_TGAS', 300, 10, 300),
    healthPort: int(env, 'KEEPER_HEALTH_PORT', 8787, 0, 65_535),
    healthHost: env.KEEPER_HEALTH_HOST && env.KEEPER_HEALTH_HOST !== '' ? env.KEEPER_HEALTH_HOST : '127.0.0.1',
    dbPath: expandHome(env.KEEPER_DB_PATH && env.KEEPER_DB_PATH !== '' ? env.KEEPER_DB_PATH : '~/.nectar/keeper.sqlite'),
  };
}
