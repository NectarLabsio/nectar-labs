// x402 hosted mode (WO-34k). The relayer key may be env-held (X402_RELAYER_KEY_JSON, a near-cli credentials JSON,
// for platform secrets) instead of a 0600 file. An env-held key must be confirmed on chain as NOT FullAccess
// (view_access_key) or the service exits: fail closed, so an unreachable RPC also refuses. The key, its JSON and
// parse errors are never logged or echoed (errors name the variable only).
//
// F-328 conflict (reported, WO-34k): @fastnear/x402 requires a FULL-ACCESS relayer key and rejects function-call
// keys, so an env-held key that passes this check cannot settle in-process. Hosted x402 therefore settles through
// X402_FACILITATOR_URL (the facilitator holding the key stays off the platform), or does not settle at all.

import { KeyFileError } from '../../keeper/src/keyfile.ts';
import type { LoadedKey } from './keys.ts';

export interface EnvKey extends LoadedKey {
  publicKey: `ed25519:${string}`;
}

/** Parses X402_RELAYER_KEY_JSON. Needs public_key (to check the permission) and private_key/secret_key. */
export function parseEnvKey(raw: string, accountId: string, envName = 'X402_RELAYER_KEY_JSON'): EnvKey {
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    throw new KeyFileError(`${envName} is not valid JSON`);
  }
  if (typeof o !== 'object' || o === null || Array.isArray(o)) throw new KeyFileError(`${envName} is not a JSON object`);
  const r = o as Record<string, unknown>;
  const sk = typeof r.private_key === 'string' ? r.private_key : typeof r.secret_key === 'string' ? r.secret_key : null;
  if (sk === null || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,}$/.test(sk)) throw new KeyFileError(`${envName} has no ed25519 private_key`);
  const pk = r.public_key;
  if (typeof pk !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,50}$/.test(pk)) {
    throw new KeyFileError(`${envName} needs public_key (ed25519:…) so the key's permission can be checked`);
  }
  if (typeof r.account_id === 'string' && r.account_id !== accountId) {
    throw new KeyFileError(`${envName} account_id does not match X402_RELAYER_ACCOUNT_ID ${accountId}`);
  }
  return { accountId, publicKey: pk as `ed25519:${string}`, secretKey: sk as `ed25519:${string}` };
}

export type Permission = 'FullAccess' | 'FunctionCall';
/** view_access_key → permission; near-api-js 7.4.0 provider.viewAccessKey({accountId, publicKey}).permission (as keeper chain.ts). */
export type AccessKeyViewer = (accountId: string, publicKey: string) => Promise<Permission>;

export class FullAccessRefused extends Error {
  constructor(accountId: string) {
    super(
      `X402_RELAYER_KEY_JSON is a FullAccess key on ${accountId}; an env-held key must be a function-call key. ` +
        'Keep the full-access relayer in a 0600 file on a trusted host and point X402_FACILITATOR_URL at it.',
    );
    this.name = 'FullAccessRefused';
  }
}

/** Throws FullAccessRefused for FullAccess, and KeyFileError when the permission cannot be read (fail closed). */
export async function assertEnvKeyNotFullAccess(key: EnvKey, view: AccessKeyViewer): Promise<void> {
  let p: Permission;
  try {
    p = await view(key.accountId, key.publicKey);
  } catch {
    throw new KeyFileError(`cannot read the access key permission for X402_RELAYER_KEY_JSON on ${key.accountId}; refusing to start`);
  }
  if (p === 'FullAccess') throw new FullAccessRefused(key.accountId);
}

/** Real viewer over near-api-js (the same call the keeper uses, services/keeper/src/chain.ts). */
export async function nearAccessKeyViewer(rpcUrl: string): Promise<AccessKeyViewer> {
  const { JsonRpcProvider } = await import('near-api-js');
  const provider = new JsonRpcProvider({ url: rpcUrl });
  return async (accountId, publicKey) => {
    const ak = await provider.viewAccessKey({ accountId, publicKey });
    if (ak.permission === 'FullAccess') return 'FullAccess';
    if (typeof ak.permission === 'object' && ak.permission !== null && 'FunctionCall' in ak.permission) return 'FunctionCall';
    throw new Error('unexpected permission kind');
  };
}

export interface HealthDeps {
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  facilitator: 'remote' | 'in-process';
  relayerAccountId: string | null;
  version: string;
  /** Upstream Feed liveness: GET <FEED_URL>/healthz status, or null when unreachable. */
  feedStatus: () => Promise<number | null>;
}

/** /health body: no key material, no secrets, no facilitator URL (it may carry a host the operator keeps private). */
export async function healthReply(d: HealthDeps): Promise<{ status: number; body: Record<string, unknown> }> {
  const feed = await d.feedStatus().catch(() => null);
  const feedOk = feed !== null && feed < 500;
  return {
    status: feedOk ? 200 : 503,
    body: {
      ok: feedOk,
      network: d.network,
      asset: d.asset,
      amount: d.amount,
      pay_to: d.payTo,
      facilitator: d.facilitator,
      relayer_account: d.relayerAccountId,
      feed_upstream: feed === null ? 'unreachable' : feed,
      version: d.version,
    },
  };
}

export function feedHealthProbe(feedUrl: string, fetchImpl: typeof fetch = fetch): () => Promise<number | null> {
  return async () => {
    try {
      const r = await fetchImpl(`${feedUrl.replace(/\/+$/, '')}/healthz`, { signal: AbortSignal.timeout(3_000) });
      await r.body?.cancel();
      return r.status;
    } catch {
      return null;
    }
  };
}
