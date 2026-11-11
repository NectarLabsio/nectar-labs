// Resilient NEAR JSON-RPC view transport (WO-33b §0, G9 stability). FastNEAR answers bursts with HTTP 429 / JSON-RPC -429;
// public endpoints also drop to 5xx. A view call retries with jittered exponential backoff on those (max 3 attempts per
// endpoint), then falls through an ordered endpoint list. Contract errors (method not found, panics) are never retried.
// Request shape = near-api-js 7.4.0 JsonRpcProvider.callFunction (F-012): query / call_function / finality "final".
// Both FastNEAR hosts below answer testnet `status` (F-369).

/** Fallbacks after the configured endpoint (F-369: both serve NEAR testnet). */
export const TESTNET_RPC_FALLBACKS = ["https://test.rpc.fastnear.com", "https://rpc.testnet.fastnear.com"] as const;

/** Ordered, de-duplicated endpoint list: the configured URL(s) first, then the FastNEAR testnet hosts. */
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
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export interface ViewTransport {
  call<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T>;
  /** `query view_account` (finality final): the account, or null when the RPC answers UNKNOWN_ACCOUNT. Optional for test transports. */
  viewAccount?(accountId: string): Promise<AccountView | null>;
}

/** `view_account` result fields the app reads (observed on test.rpc.fastnear.com 2026-11-11; missing account = cause UNKNOWN_ACCOUNT). */
export interface AccountView {
  amount: string;
  locked: string;
  code_hash: string;
  storage_usage: number;
}

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>;

export interface ResilientRpcOptions {
  /** Ordered endpoints; see `rpcEndpoints`. */
  urls: readonly string[];
  /** Attempts per endpoint before moving to the next (default 3). */
  attempts?: number;
  /** First backoff in ms (default 250); doubles per attempt, jittered ×[0.5, 1.5). */
  baseDelayMs?: number;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
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
async function queryOnce(f: FetchLike, url: string, method: string, params: Record<string, unknown>): Promise<NonNullable<RpcBody["result"]>> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: "nectar", method: "query", params });
  let status: number;
  let text: string;
  try {
    const r = await f(url, { method: "POST", headers: { "content-type": "application/json" }, body });
    status = r.status;
    text = await r.text();
  } catch (e) {
    throw new RpcError(`${method}: ${e instanceof Error ? e.message : String(e)} (${url})`, method, e, true);
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
    throw new RpcError(`${method}: ${cause ?? err.name ?? "error"}: ${detail}`, method, err, retry);
  }
  if (!j || status === 429 || status >= 500) throw new RpcError(`${method}: HTTP ${status} from ${url}`, method, text.slice(0, 200), status === 429 || status >= 500);
  if (status >= 400) throw new RpcError(`${method}: HTTP ${status} from ${url}`, method, text.slice(0, 200), false);
  if (!j.result || typeof j.result !== "object") throw new RpcError(`${method}: malformed RPC response`, method, j, false);
  return j.result;
}

/** One view call on one endpoint. Request shape = near-api-js 7.4.0 callFunction (F-012). */
async function callOnce(f: FetchLike, url: string, contractId: string, method: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await queryOnce(f, url, method, { request_type: "call_function", finality: "final", account_id: contractId, method_name: method, args_base64: b64(JSON.stringify(args)) });
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

async function viewAccountOnce(f: FetchLike, url: string, accountId: string): Promise<AccountView | null> {
  try {
    const res = await queryOnce(f, url, "view_account", { request_type: "view_account", finality: "final", account_id: accountId });
    if (typeof res.amount !== "string") throw new RpcError("view_account: malformed RPC response", "view_account", res, false);
    return { amount: res.amount, locked: String(res.locked ?? "0"), code_hash: String(res.code_hash ?? ""), storage_usage: Number(res.storage_usage ?? 0) };
  } catch (e) {
    if (isUnknownAccount(e)) return null;
    throw e;
  }
}

/**
 * View transport with retry + endpoint fallback. The endpoint that last answered is tried first on the next call
 * (sticky), so one throttled host does not tax every read.
 */
export function resilientRpcTransport(o: ResilientRpcOptions): ViewTransport {
  const urls = o.urls.length ? [...o.urls] : rpcEndpoints(null);
  const attempts = Math.max(1, o.attempts ?? 3);
  const base = o.baseDelayMs ?? 250;
  const f: FetchLike = o.fetch ?? ((input, init) => fetch(input, init));
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = o.random ?? Math.random;
  let start = 0;
  const run = async <T>(method: string, once: (url: string) => Promise<T>): Promise<T> => {
    let last: RpcError | null = null;
    for (let k = 0; k < urls.length; k++) {
      const i = (start + k) % urls.length;
      for (let n = 1; n <= attempts; n++) {
        try {
          const v = await once(urls[i]!);
          start = i;
          return v;
        } catch (e) {
          const re = e instanceof RpcError ? e : new RpcError(`${method}: ${String(e)}`, method, e, false);
          if (!re.retryable) throw re;
          last = re;
          if (n < attempts) await sleep(backoffMs(n, base, random));
        }
      }
    }
    throw last ?? new RpcError(`${method}: no RPC endpoint answered`, method, undefined, true);
  };
  return {
    call: <T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> => run(method, async (url) => (await callOnce(f, url, contractId, method, args)) as T),
    viewAccount: (accountId: string) => run("view_account", (url) => viewAccountOnce(f, url, accountId)),
  };
}
