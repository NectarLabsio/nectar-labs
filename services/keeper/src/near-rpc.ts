// NEAR JSON-RPC endpoint fallback for the keeper and the Feed (WO-35k). Twin file: services/keeper/src/near-rpc.ts and
// services/feed/src/near-rpc.ts are byte-identical (a keeper test checks it); edit both.
//
// Same order and policy as packages/sdk/src/rpc.ts TESTNET_RPC_FALLBACKS + resilientRpcTransport (used by the web app; F-413):
// FastNEAR x2, dRPC, Intear. The SDK file is not imported because Node's TS type stripping cannot load it (constructor parameter
// properties), so the list is mirrored here and a test keeps the two equal. Every Provider method call runs on one endpoint; a
// 429, 5xx, timeout or network error cools that endpoint (jittered exponential backoff, shared by every caller) and the call
// moves to the next one. Contract errors (panics, unknown method, bad args) are never retried. No stickiness: FastNEAR is asked
// first again once its cooldown ends. Logs carry the endpoint host only (no path, query, key or client address).

import { JsonRpcProvider, type Provider } from 'near-api-js';

/** Mirror of packages/sdk/src/rpc.ts TESTNET_RPC_FALLBACKS (F-413: dRPC and Intear are public, keyless free tiers). */
export const TESTNET_RPC_FALLBACKS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.fastnear.com', 'https://near-testnet.drpc.org', 'https://testnet-rpc.intea.rs'] as const;

const blank = (v: string | undefined): boolean => v === undefined || v.trim() === '' || v.startsWith('TODO-');
const norm = (u: string): string => u.trim().replace(/\/+$/, '');

function isLoopback(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '::1' || h === '[::1]' || h.startsWith('127.');
  } catch {
    return false;
  }
}

/**
 * Endpoint order. NEAR_RPC_URLS (comma list) = exactly that list. NEAR_RPC_URL = that endpoint first, then TESTNET_RPC_FALLBACKS,
 * unless it is a loopback sandbox or NEAR_RPC_FALLBACK is 0/off/false (then it stays alone). Neither = TESTNET_RPC_FALLBACKS.
 */
export function nearRpcUrls(env: NodeJS.ProcessEnv): string[] {
  const dedupe = (list: readonly string[]): string[] => [...new Set(list.map(norm).filter((s) => s !== ''))];
  if (!blank(env.NEAR_RPC_URLS)) {
    const list = dedupe((env.NEAR_RPC_URLS as string).split(','));
    if (list.length > 0) return list;
  }
  if (!blank(env.NEAR_RPC_URL)) {
    const one = norm(env.NEAR_RPC_URL as string);
    const off = /^(0|off|false|no)$/i.test((env.NEAR_RPC_FALLBACK ?? '').trim());
    return off || isLoopback(one) ? [one] : dedupe([one, ...TESTNET_RPC_FALLBACKS]);
  }
  return [...TESTNET_RPC_FALLBACKS];
}

/** Host of an endpoint URL for logs and /health (never the path or query, which could hold a key). */
export function endpointHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-url';
  }
}

export type RpcFailure = 'throttled' | 'server' | 'timeout' | 'network';

export class RpcTimeoutError extends Error {
  constructor(method: string, ms: number) {
    super(`${method}: no answer within ${ms} ms`);
    this.name = 'RpcTimeoutError';
  }
}

const RETRY_TYPES = new Set(['TIMEOUT_ERROR', 'INTERNAL_ERROR', 'NO_SYNCED_BLOCKS', 'NOT_SYNCED_YET', 'RetriesExceeded', 'TimeoutError']);
const NETWORK_RE = /fetch failed|failed to fetch|FetchError|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EPIPE|socket hang up|UND_ERR/i;

/** Why an RPC error may succeed on another endpoint, or null when it is final (contract / request errors). */
export function classifyRpcError(e: unknown): RpcFailure | null {
  if (e instanceof RpcTimeoutError) return 'timeout';
  if (!(e instanceof Error)) return null;
  const rec = e as Error & { cause?: unknown; type?: unknown; code?: unknown };
  const cause = typeof rec.cause === 'number' ? rec.cause : null;
  if (cause === 429 || rec.code === -429) return 'throttled';
  if (cause === 408) return 'timeout';
  if (cause !== null && cause >= 500 && cause <= 599) return 'server';
  const text = `${e.name} ${e.message}`;
  if (typeof rec.type === 'string' && RETRY_TYPES.has(rec.type)) return rec.type.includes('TIMEOUT') || rec.type === 'TimeoutError' ? 'timeout' : 'server';
  if (rec.cause instanceof Error) {
    const inner = classifyRpcError(rec.cause);
    if (inner !== null) return inner;
  }
  // Text checks only for transport-level errors: a contract panic message must never cool an endpoint.
  if (/panic|contract|wasm|method/i.test(text)) return null;
  if (/\b429\b|too many requests/i.test(text)) return 'throttled';
  if (NETWORK_RE.test(text)) return 'network';
  return null;
}

/** Backoff before attempt n + 1 (n >= 1): base * 2^(n-1) * jitter in [0.5, 1.5). Same formula as the SDK. */
export function backoffMs(n: number, baseMs: number, random: () => number = Math.random): number {
  return Math.round(baseMs * 2 ** (n - 1) * (0.5 + random()));
}

export type RpcLog = (level: 'info' | 'warn', msg: string, fields: Record<string, string | number>) => void;

export interface FallbackOptions {
  urls: readonly string[];
  /** Passes over the endpoint list per call (default 2). */
  attempts?: number;
  /** First cooldown after a failure (default 250 ms), doubled per consecutive failure, jittered, capped by maxDelayMs (30 s). */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Per-attempt timeout for reads (default 10 s) and for send* methods (default 60 s; nearcore itself answers TIMEOUT_ERROR). */
  timeoutMs?: number;
  sendTimeoutMs?: number;
  /** Builds the per-endpoint provider (tests inject fakes). Default: JsonRpcProvider without its own retries. */
  makeProvider?: (url: string) => Provider;
  log?: RpcLog;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface RpcStatus {
  endpoints: string[];
  last_served: string | null;
  failovers: number;
  cooling: string[];
}

export interface FallbackRpc {
  /** A near-api-js Provider (also accepted by Account) whose every call walks the endpoints. */
  provider: Provider;
  status(): RpcStatus;
}

type AnyMethod = (...args: unknown[]) => Promise<unknown>;

export function fallbackRpc(o: FallbackOptions): FallbackRpc {
  const urls = o.urls.length > 0 ? o.urls.map(norm) : [...TESTNET_RPC_FALLBACKS];
  const make = o.makeProvider ?? ((url: string) => new JsonRpcProvider({ url }, { retries: 1, wait: 0, backoff: 1 }));
  const providers = urls.map((u) => make(u));
  const attempts = Math.max(1, o.attempts ?? 2);
  const base = o.baseDelayMs ?? 250;
  const cap = Math.max(base, o.maxDelayMs ?? 30_000);
  const readTimeout = o.timeoutMs ?? 10_000;
  const sendTimeout = o.sendTimeoutMs ?? 60_000;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = o.random ?? Math.random;
  const now = o.now ?? Date.now;
  const log: RpcLog = o.log ?? (() => undefined);
  const coolUntil = new Map<number, number>();
  const failures = new Map<number, number>();
  let lastServed: number | null = null;
  let failovers = 0;
  const coolLeft = (i: number): number => (coolUntil.get(i) ?? 0) - now();
  const pick = (tried: ReadonlySet<number>): number => {
    let soonest = -1;
    for (let i = 0; i < urls.length; i++) {
      if (tried.has(i)) continue;
      if (coolLeft(i) <= 0) return i;
      if (soonest < 0 || coolLeft(i) < coolLeft(soonest)) soonest = i;
    }
    return soonest;
  };
  const withTimeout = async (method: string, ms: number, p: Promise<unknown>): Promise<unknown> => {
    if (ms <= 0) return p;
    let timer: ReturnType<typeof setTimeout> | undefined;
    p.catch(() => undefined);
    try {
      return await Promise.race([p, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new RpcTimeoutError(method, ms)), ms)))]);
    } finally {
      clearTimeout(timer);
    }
  };
  const run = async (method: string, args: unknown[]): Promise<unknown> => {
    const ms = method.startsWith('send') ? sendTimeout : readTimeout;
    let last: unknown = null;
    for (let pass = 0; pass < attempts; pass++) {
      const tried = new Set<number>();
      while (tried.size < urls.length) {
        const i = pick(tried);
        tried.add(i);
        const wait = coolLeft(i);
        if (wait > 0) await sleep(wait);
        const p = providers[i] as Provider;
        const fn = Reflect.get(p, method) as AnyMethod;
        try {
          const v = await withTimeout(method, ms, fn.apply(p, args));
          failures.delete(i);
          if (lastServed !== i) {
            log('info', 'rpc_endpoint', { endpoint: endpointHost(urls[i] as string), previous: lastServed === null ? 'none' : endpointHost(urls[lastServed] as string), method });
            lastServed = i;
          }
          return v;
        } catch (e) {
          const why = classifyRpcError(e);
          if (why === null) throw e;
          last = e;
          failovers++;
          const n = (failures.get(i) ?? 0) + 1;
          failures.set(i, n);
          const cool = Math.min(cap, backoffMs(n, base, random));
          coolUntil.set(i, Math.max(coolUntil.get(i) ?? 0, now() + cool));
          log('warn', 'rpc_failover', { endpoint: endpointHost(urls[i] as string), reason: why, method, cooldown_ms: cool });
        }
      }
    }
    throw last ?? new Error(`${method}: no RPC endpoint answered`);
  };
  const target = providers[0] as Provider;
  const provider = new Proxy(target, {
    get(t, prop, recv) {
      const v: unknown = Reflect.get(t, prop, recv);
      if (typeof v !== 'function' || typeof prop !== 'string' || prop === 'constructor') return v;
      return (...args: unknown[]) => run(prop, args);
    },
  });
  return {
    provider,
    status: () => ({
      endpoints: urls.map(endpointHost),
      last_served: lastServed === null ? null : endpointHost(urls[lastServed] as string),
      failovers,
      cooling: urls.filter((_, i) => coolLeft(i) > 0).map(endpointHost),
    }),
  };
}
