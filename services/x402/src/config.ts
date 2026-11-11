// x402 configuration (PRD v7 §10.5, F-328/F-329). Testnet only: the network id is fixed to `near:testnet`
// and anything that names mainnet is refused. Ids come from env, else packages/config/config.yaml (read with
// the feed's dependency-free flattener). Keys and secrets are PATHS (X402_RELAYER_KEY_PATH, AGENT1_KEY_PATH,
// X402_FACILITATOR_SECRET_PATH), loaded by keys.ts and never logged.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCorsOrigins } from '../../feed/src/cors.ts';
import { flattenYaml } from '../../feed/src/repo-config.ts';

export const NETWORK = 'near:testnet' as const;
/** 0.01 mock USDC (6 decimals) in smallest units. */
export const PRICE_AMOUNT = '10000';
export const ROUTE = 'GET /api/feed/export.csv';
export const SCHEME = 'exact' as const;
export const MAX_TIMEOUT_SECONDS = 120;
export const DEFAULT_RPC = 'https://test.rpc.fastnear.com';

const DEFAULT_CONFIG = fileURLToPath(new URL('../../../packages/config/config.yaml', import.meta.url));
const placeholder = (v: string | undefined): boolean => v === undefined || v.trim() === '' || v.startsWith('TODO-') || v === 'null';

export class ConfigError extends Error {}

export interface X402Config {
  network: typeof NETWORK;
  rpcUrl: string;
  asset: string;
  amount: string;
  payTo: string;
  /** Upstream (free, 127.0.0.1) Feed REST base. */
  feedUrl: string;
  /** Remote facilitator; null = in-process facilitator with our relayer. */
  facilitatorUrl: string | null;
  /** HTTP listener for our facilitator; null = in-process only (the default). Never set with facilitatorUrl. */
  facilitatorPort: number | null;
  /** 127.0.0.1 unless X402_FACILITATOR_HOST is set; X402_HOST does not apply (SR-32). */
  facilitatorHost: string;
  /** 0600 file with the bearer token: required by the listener, sent to facilitatorUrl when set. */
  facilitatorSecretPath: string | null;
  relayerAccountId: string;
  relayerKeyPath: string | null;
  /** true when X402_RELAYER_KEY_JSON is set (the value itself stays in env, read once by main.ts). */
  relayerKeyFromEnv: boolean;
  /** X402_CORS_ORIGINS allowlist; null = no CORS headers (as before). */
  corsOrigins: ReadonlySet<string> | null;
  port: number;
  host: string;
}

/** Throws unless every network hint is testnet. Mainnet is never accepted, whatever the source. */
export function assertTestnet(env: NodeJS.ProcessEnv, extra: readonly string[] = []): void {
  const net = env.NEAR_NETWORK;
  if (net !== undefined && net !== '' && net !== 'testnet') throw new ConfigError(`refusing NEAR_NETWORK=${net}: x402 runs on near:testnet only`);
  const hints = [env.X402_NETWORK, env.NEAR_RPC_URL, env.X402_RPC_URL, env.X402_FACILITATOR_URL, ...extra];
  for (const h of hints) {
    if (h !== undefined && /mainnet/i.test(h)) throw new ConfigError(`refusing ${JSON.stringify(h)}: mainnet is not allowed (testnet only)`);
  }
  if (env.X402_NETWORK !== undefined && env.X402_NETWORK !== '' && env.X402_NETWORK !== NETWORK) throw new ConfigError(`X402_NETWORK must be ${NETWORK}`);
}

export function yamlIds(env: NodeJS.ProcessEnv): Map<string, string> {
  try {
    return flattenYaml(readFileSync(placeholder(env.NECTAR_CONFIG_PATH) ? DEFAULT_CONFIG : (env.NECTAR_CONFIG_PATH as string), 'utf8'));
  } catch {
    return new Map();
  }
}

function listenerPort(v: string | undefined): number | null {
  if (placeholder(v) || v === 'off') return null;
  const port = Number(v);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError('X402_FACILITATOR_PORT must be a TCP port or "off"');
  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): X402Config {
  assertTestnet(env);
  const y = yamlIds(env);
  if (y.get('network') !== undefined && y.get('network') !== 'testnet') throw new ConfigError('config.yaml network is not testnet');
  const pick = (k: string, ...yamlKeys: string[]): string | null => {
    if (!placeholder(env[k])) return env[k] as string;
    for (const yk of yamlKeys) if (!placeholder(y.get(yk))) return y.get(yk) as string;
    return null;
  };
  const asset = pick('X402_ASSET', 'accounts.usdc_mock');
  // Treasury: accounts.treasury when config.yaml gains it, else the owner account (holds the treasury today).
  const payTo = pick('X402_PAY_TO', 'accounts.treasury', 'accounts.owner');
  const relayer = pick('X402_RELAYER_ACCOUNT_ID', 'v7.x402_relayer');
  if (asset === null) throw new ConfigError('no mock USDC token id (X402_ASSET or accounts.usdc_mock)');
  if (payTo === null) throw new ConfigError('no treasury account (X402_PAY_TO or accounts.treasury/accounts.owner)');
  if (relayer === null) throw new ConfigError('no relayer account (X402_RELAYER_ACCOUNT_ID or v7.x402_relayer)');
  const facilitatorUrl = pick('X402_FACILITATOR_URL');
  const facilitatorSecretPath = pick('X402_FACILITATOR_SECRET_PATH');
  const facilitatorPort = facilitatorUrl === null ? listenerPort(env.X402_FACILITATOR_PORT) : null;
  if (facilitatorPort !== null && facilitatorSecretPath === null) {
    throw new ConfigError('X402_FACILITATOR_PORT needs X402_FACILITATOR_SECRET_PATH: the HTTP facilitator never runs without a shared secret');
  }
  const relayerKeyPath = pick('X402_RELAYER_KEY_PATH');
  const relayerKeyFromEnv = !placeholder(env.X402_RELAYER_KEY_JSON);
  if (relayerKeyFromEnv && relayerKeyPath !== null) throw new ConfigError('set X402_RELAYER_KEY_PATH or X402_RELAYER_KEY_JSON, not both');
  if (relayerKeyFromEnv && facilitatorPort !== null) throw new ConfigError('X402_FACILITATOR_PORT is not available with an env-held relayer key');
  // Hosted: the platform injects PORT; X402_PORT (local) still wins when set.
  const portRaw = !placeholder(env.X402_PORT) ? (env.X402_PORT as string) : !placeholder(env.PORT) ? (env.PORT as string) : '8790';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError('X402_PORT / PORT must be a TCP port');
  return {
    network: NETWORK,
    rpcUrl: pick('X402_RPC_URL') ?? DEFAULT_RPC,
    asset,
    amount: PRICE_AMOUNT,
    payTo,
    feedUrl: pick('FEED_URL') ?? 'http://127.0.0.1:8788',
    facilitatorUrl,
    facilitatorPort,
    facilitatorHost: pick('X402_FACILITATOR_HOST') ?? '127.0.0.1',
    facilitatorSecretPath,
    relayerAccountId: relayer,
    relayerKeyPath,
    relayerKeyFromEnv,
    corsOrigins: parseCorsOrigins(env.X402_CORS_ORIGINS, 'X402_CORS_ORIGINS'),
    port,
    host: placeholder(env.X402_HOST) ? '127.0.0.1' : (env.X402_HOST as string),
  };
}
