// Resilient NEAR JSON-RPC view transport (WO-33b §0, G9 stability; cross-provider fallback WO-34g). FastNEAR answers bursts with
// HTTP 429 / JSON-RPC -429; public endpoints also drop to 5xx or hang. A view call moves to the next endpoint on 429, 5xx, a timeout or
// a network error; each failing endpoint cools down with jittered exponential backoff (shared by every caller of the transport), and
// the list is walked up to 3 times. Contract errors (method not found, panics) are never retried.
// Request shape = near-api-js 7.4.0 JsonRpcProvider.callFunction (F-012): query / call_function / finality "final".

/**
 * NEAR testnet RPC endpoints in fallback order (WO-34g). FastNEAR first: `test.rpc.fastnear.com` is the documented default (D-025,
 * F-369 providers page) and `rpc.testnet.fastnear.com` also serves testnet (F-369). Both sit behind one FastNEAR rate limiter, so the
 * public non-FastNEAR hosts from the F-369 providers table follow: dRPC and Intear. Both probed live 2026-11-11T22:31Z
 * (evidence/G3/rpc-probe-20261111T2231Z.log): chain_id testnet, head within 3 blocks of FastNEAR, nectar-core-v2 views byte-identical,
 * same UNKNOWN_ACCOUNT error shape, CORS open. They are contacted only while both FastNEAR hosts refuse or fail.
 * config.yaml is not consulted: this list is the single source for the browser, the web server routes and the tests.
 */
export const TESTNET_RPC_FALLBACKS = ["https://test.rpc.fastnear.com", "https://rpc.testnet.fastnear.com", "https://near-testnet.drpc.org", "https://testnet-rpc.intea.rs"] as const;

/** Ordered, de-duplicated endpoint list: the configured URL(s) first, then TESTNET_RPC_FALLBACKS in order. */
export function rpcEndpoints(primary?: string | readonly string[] | null, fallbacks: readonly string[] = TESTNET_RPC_FALLBACKS): string[] {
  const first = primary == null ? [] : typeof primary === "string" ? [primary] : [...primary];
  const out: string[] = [];
  for (const u of [...first, ...fallbacks]) {
    const t = u.trim().replace(/\/+$/, "");
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly method: string,
    override readonly cause?: unknown,
    /** true for throttling / transport failures (another attempt or endpoint may succeed). */
    readonly retryable = false,
    /** true when the node throttled us (HTTP 429 / JSON-RPC -429): the endpoint cools down for every caller. */
    readonly throttled = false,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export interface ViewTransport {
  call<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T>;
  /** `query view_account` (finality final): the account, or null when the RPC answers UNKNOWN_ACCOUNT. Optional for test transports. */
  viewAccount?(accountId: string): Promise<AccountView | null>;
  /** Drop cached answers (cachedTransport); called on an explicit reload, e.g. after a write. */
  clear?(): void;
}

/** `view_account` result fields the app reads (observed on test.rpc.fastnear.com 2026-11-11; missing account = cause UNKNOWN_ACCOUNT). */
export interface AccountView {
  amount: string;
  locked: string;
  code_hash: string;
  storage_usage: number;
}

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>;

export interface ResilientRpcOptions {
  /** Ordered endpoints; see `rpcEndpoints`. */
  urls: readonly string[];
  /** Passes over the endpoint list (default 3): each endpoint is tried at most this many times per call. */
  attempts?: number;
  /** First cooldown in ms after an endpoint fails (default 250); doubles per consecutive failure, jittered ×[0.5, 1.5), capped by maxDelayMs. */
  baseDelayMs?: number;
  /** Cooldown cap per endpoint in ms (default 30 000): a refusing FastNEAR is asked again at least this often. */
  maxDelayMs?: number;
  /** One attempt is abandoned after this many ms and counts as a retryable failure (default 8 000; 0 = no timeout). */
  timeoutMs?: number;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Requests in flight at once per transport (default 4); the rest queue, so one page cannot burst the RPC (WO-34f). */
  maxConcurrent?: number;
  now?: () => number;
}

/** Backoff before attempt `n + 1` (n ≥ 1): base · 2^(n−1) · jitter in [0.5, 1.5). */
export function backoffMs(n: number, baseMs: number, random: () => number = Math.random): number {
  return Math.round(baseMs * 2 ** (n - 1) * (0.5 + random()));
}

const RETRY_CAUSES = new Set(["TIMEOUT_ERROR", "INTERNAL_ERROR", "NO_SYNCED_BLOCKS", "NOT_SYNCED_YET"]);

interface RpcBody {
  result?: { result?: number[]; error?: string; logs?: string[] } & Record<string, unknown>;
  error?: { code?: number; name?: string; message?: string; data?: unknown; cause?: { name?: string; info?: unknown } };
}

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeResult(bytes: number[]): unknown {
  const text = new TextDecoder().decode(Uint8Array.from(bytes));
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** One `query` on one endpoint; throws RpcError with `retryable` set for 429 / 5xx / transport / timeout. `method` labels errors. */
async function queryOnce(f: FetchLike, url: string, method: string, params: Record<string, unknown>, timeoutMs = 0): Promise<NonNullable<RpcBody["result"]>> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: "nectar", method: "query", params });
  let status: number;
  let text: string;
  const ac = timeoutMs > 0 && typeof AbortController === "function" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const exchange = (async () => {
      const r = await f(url, { method: "POST", headers: { "content-type": "application/json" }, body, ...(ac ? { signal: ac.signal } : {}) });
      return { status: r.status, text: await r.text() };
    })();
    const timeout =
      timeoutMs > 0
        ? new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              ac?.abort();
              reject(new RpcError(`${method}: no answer within ${timeoutMs} ms (${url})`, method, "timeout", true, false));
            }, timeoutMs);
          })
        : null;
    if (timeout) exchange.catch(() => undefined);
    ({ status, text } = await (timeout ? Promise.race([exchange, timeout]) : exchange));
  } catch (e) {
    if (e instanceof RpcError) throw e;
    // In a browser a throttled FastNEAR answer (429) carries no CORS header, so it surfaces here as a TypeError, not a status:
    // treat a transport failure as throttling too, so every caller backs off (WO-34f crawl).
    throw new RpcError(`${method}: ${e instanceof Error ? e.message : String(e)} (${url})`, method, e, true, true);
  } finally {
    clearTimeout(timer);
  }
  let j: RpcBody | null = null;
  try {
    j = JSON.parse(text) as RpcBody;
  } catch {
    j = null;
  }
  const err = j?.error;
  if (err) {
    const cause = err.cause?.name;
    const retry = err.code === -429 || (cause !== undefined && RETRY_CAUSES.has(cause)) || (cause === undefined && (status === 429 || status >= 500));
    const detail = typeof err.data === "string" ? err.data : err.message ?? cause ?? "RPC error";
    throw new RpcError(`${method}: ${cause ?? err.name ?? "error"}: ${detail}`, method, err, retry, err.code === -429 || status === 429);
  }
  if (!j || status === 429 || status >= 500) throw new RpcError(`${method}: HTTP ${status} from ${url}`, method, text.slice(0, 200), status === 429 || status >= 500, status === 429);
  if (status >= 400) throw new RpcError(`${method}: HTTP ${status} from ${url}`, method, text.slice(0, 200), false);
  if (!j.result || typeof j.result !== "object") throw new RpcError(`${method}: malformed RPC response`, method, j, false);
  return j.result;
}

/** One view call on one endpoint. Request shape = near-api-js 7.4.0 callFunction (F-012). */
async function callOnce(f: FetchLike, url: string, contractId: string, method: string, args: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  const res = await queryOnce(f, url, method, { request_type: "call_function", finality: "final", account_id: contractId, method_name: method, args_base64: b64(JSON.stringify(args)) }, timeoutMs);
  if (res.error) throw new RpcError(`${method}: ${res.error}`, method, res, false);
  if (!Array.isArray(res.result)) throw new RpcError(`${method}: malformed RPC response`, method, res, false);
  return decodeResult(res.result);
}

/** True when an RpcError is the node saying the account does not exist (JSON-RPC error cause UNKNOWN_ACCOUNT). */
export function isUnknownAccount(e: unknown): boolean {
  if (!(e instanceof RpcError)) return false;
  const c = e.cause as RpcBody["error"] | undefined;
  return c?.cause?.name === "UNKNOWN_ACCOUNT";
}

async function viewAccountOnce(f: FetchLike, url: string, accountId: string, timeoutMs: number): Promise<AccountView | null> {
  try {
    const res = await queryOnce(f, url, "view_account", { request_type: "view_account", finality: "final", account_id: accountId }, timeoutMs);
    if (typeof res.amount !== "string") throw new RpcError("view_account: malformed RPC response", "view_account", res, false);
    return { amount: res.amount, locked: String(res.locked ?? "0"), code_hash: String(res.code_hash ?? ""), storage_usage: Number(res.storage_usage ?? 0) };
  } catch (e) {
    if (isUnknownAccount(e)) return null;
    throw e;
  }
}

/**
 * View transport with cross-provider failover (WO-34g). Each call walks the endpoints in list order, skipping any that is cooling
 * down; a retryable failure (429, 5xx, timeout, network error) cools that endpoint and moves on at once. When every endpoint left in
 * this pass is cooling, the call waits for the one that frees up first. At most `attempts` passes. There is no stickiness: once
 * FastNEAR's cooldown ends it is asked first again, so the fallback hosts are contacted only while FastNEAR refuses.
 */
export function resilientRpcTransport(o: ResilientRpcOptions): ViewTransport {
  const urls = o.urls.length ? [...o.urls] : rpcEndpoints(null);
  const attempts = Math.max(1, o.attempts ?? 3);
  const base = o.baseDelayMs ?? 250;
  const cap = Math.max(base, o.maxDelayMs ?? 30_000);
  const timeoutMs = Math.max(0, o.timeoutMs ?? 8_000);
  const f: FetchLike = o.fetch ?? ((input, init) => fetch(input, init));
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = o.random ?? Math.random;
  const now = o.now ?? Date.now;
  const max = Math.max(1, o.maxConcurrent ?? 4);
  // WO-34f: a failure cools that endpoint for every caller of this transport (not just the one that saw it), and at most `max`
  // requests are in flight, so a page with many views queues instead of spraying the node. Throttling is expected, so the
  // transport never logs it; callers see an RpcError only when every endpoint keeps failing.
  const coolUntil = new Map<string, number>();
  const failures = new Map<string, number>();
  let active = 0;
  const waiting: (() => void)[] = [];
  const acquire = async (): Promise<void> => {
    if (active < max) {
      active++;
      return;
    }
    await new Promise<void>((r) => waiting.push(r));
  };
  const release = (): void => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
  const coolLeft = (url: string): number => (coolUntil.get(url) ?? 0) - now();
  /** First endpoint (list order) not tried in this pass and not cooling; else the untried one that frees up first. */
  const pick = (tried: ReadonlySet<string>): string => {
    let soonest: string | null = null;
    for (const u of urls) {
      if (tried.has(u)) continue;
      if (coolLeft(u) <= 0) return u;
      if (soonest === null || coolLeft(u) < coolLeft(soonest)) soonest = u;
    }
    return soonest!;
  };
  const run = async <T>(method: string, once: (url: string) => Promise<T>): Promise<T> => {
    let last: RpcError | null = null;
    for (let pass = 0; pass < attempts; pass++) {
      const tried = new Set<string>();
      while (tried.size < urls.length) {
        const url = pick(tried);
        tried.add(url);
        const wait = coolLeft(url);
        if (wait > 0) await sleep(wait);
        await acquire();
        try {
          const v = await once(url);
          failures.delete(url);
          return v;
        } catch (e) {
          const re = e instanceof RpcError ? e : new RpcError(`${method}: ${String(e)}`, method, e, false);
          if (!re.retryable) throw re;
          last = re;
          const n = (failures.get(url) ?? 0) + 1;
          failures.set(url, n);
          coolUntil.set(url, Math.max(coolUntil.get(url) ?? 0, now() + Math.min(cap, backoffMs(n, base, random))));
        } finally {
          release();
        }
      }
    }
    throw last ?? new RpcError(`${method}: no RPC endpoint answered`, method, undefined, true);
  };
  return {
    call: <T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> => run(method, async (url) => (await callOnce(f, url, contractId, method, args, timeoutMs)) as T),
    viewAccount: (accountId: string) => run("view_account", (url) => viewAccountOnce(f, url, accountId, timeoutMs)),
  };
}

export interface CacheOptions {
  /** How long a successful answer is reused (default 8 s). Errors are never cached. */
  ttlMs?: number;
  now?: () => number;
}

/**
 * In-flight de-duplication + a short TTL cache per (contract, method, args) and per view_account id (WO-34f). Several components
 * asking for the same view while a page renders share one request; a second render within `ttlMs` reuses the answer. `clear()`
 * drops everything (an explicit reload after a write must read fresh state).
 */
export function cachedTransport(inner: ViewTransport, o: CacheOptions = {}): ViewTransport {
  const ttl = Math.max(0, o.ttlMs ?? 8_000);
  const now = o.now ?? Date.now;
  const done = new Map<string, { at: number; value: unknown }>();
  const pending = new Map<string, Promise<unknown>>();
  let generation = 0;
  const memo = <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const hit = done.get(key);
    if (hit && now() - hit.at < ttl) return Promise.resolve(hit.value as T);
    const inFlight = pending.get(key);
    if (inFlight) return inFlight as Promise<T>;
    const gen = generation;
    const p = load().then(
      (value) => {
        if (pending.get(key) === p) pending.delete(key);
        if (gen === generation && ttl > 0) {
          if (done.size > 500) for (const [k, v] of done) if (now() - v.at >= ttl) done.delete(k);
          done.set(key, { at: now(), value });
        }
        return value;
      },
      (e: unknown) => {
        if (pending.get(key) === p) pending.delete(key);
        throw e;
      },
    );
    pending.set(key, p);
    return p;
  };
  const viewAccount = inner.viewAccount?.bind(inner);
  return {
    call: <T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> => memo(`call|${contractId}|${method}|${JSON.stringify(args)}`, () => inner.call<T>(contractId, method, args)),
    ...(viewAccount ? { viewAccount: (accountId: string) => memo(`account|${accountId}`, () => viewAccount(accountId)) } : {}),
    clear: () => {
      generation++;
      done.clear();
      pending.clear();
      inner.clear?.();
    },
  };
}
