import { NectarViews, RpcError, resilientRpcTransport, rpcEndpoints } from "@nectar/sdk";
import { getPublicConfig } from "@/lib/config.server";
import { healthChecker, type HealthSnapshot } from "@/lib/api/health";
import { RPC_URL } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Answers newer than this are reused, like /api/feed (R2-11): a loop on /api/health cannot spend the server's RPC quota. */
const FRESH_MS = 5_000;
/** One RPC attempt is aborted after this; a hung socket becomes a retryable transport error and the next provider is asked. */
const ATTEMPT_MS = 4_000;
/** The whole read (failover + retries) settles by this deadline, so the shared in-flight promise can never hang every caller. */
const DEADLINE_MS = 10_000;
/** WO-34g: when every RPC provider refuses, the last good snapshot is served (ok, with `stale_s`) while it is at most this old. */
const STALE_OK_MS = 60_000;

/** Same list and client as the browser (FastNEAR ×2, then dRPC and Intear; @nectar/sdk TESTNET_RPC_FALLBACKS, F-369). */
const urls = rpcEndpoints(RPC_URL);
/** One transport per server instance, so a provider's cooldown after a 429 carries over to the next read. */
const transport = resilientRpcTransport({ urls, timeoutMs: ATTEMPT_MS });

/** A public reason (no internals): the server log keeps the detail. */
function reasonOf(e: unknown): string {
  if (e instanceof RpcError && e.throttled) return "every RPC provider refused the read (rate limited)";
  if (e instanceof RpcError && e.retryable) return "no RPC provider answered (timeout or server error)";
  return "RPC read failed";
}

function failed(core: string, reason: string, detail: string): HealthSnapshot {
  console.error(`health: RPC read failed: ${detail}`);
  return { core, at: Date.now(), status: 502, body: { ok: false, deployed: true, core, error: reason } };
}

async function read(core: string, network: string): Promise<HealthSnapshot> {
  const v = new NectarViews(core, transport);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<HealthSnapshot>((resolve) => {
    timer = setTimeout(() => resolve(failed(core, `no RPC answer within ${DEADLINE_MS / 1000} s`, `deadline ${DEADLINE_MS} ms`)), DEADLINE_MS);
  });
  const answer = Promise.all([v.contractVersion(), v.getPool()]).then(
    ([version, pool]): HealthSnapshot => ({ core, at: Date.now(), status: 200, body: { ok: true, deployed: true, core, version, pool, network, rpc: urls } }),
    (e: unknown) => failed(core, reasonOf(e), e instanceof Error ? e.message : String(e)),
  );
  try {
    return await Promise.race([answer, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Reuse within FRESH_MS; when every provider refuses, the last good snapshot while ≤ STALE_OK_MS old (lib/api/health.ts). */
const health = healthChecker({ read, freshMs: FRESH_MS, staleOkMs: STALE_OK_MS });

/**
 * Next's router prefetches in-app links with `RSC: 1` (+ `Next-Router-Prefetch`). It drops any answer that is not a Flight
 * payload without reading or cancelling the body, and Chrome then keeps that fetch open until GC: networkidle never comes
 * (GATE_FAIL_G3B_R2). A router request gets an empty 204, which completes with its headers; it also skips the RPC read.
 */
function isRouterRequest(req: Request): boolean {
  return req.headers.get("rsc") === "1" || req.headers.has("next-router-prefetch") || req.headers.has("next-router-segment-prefetch");
}

export async function GET(req: Request) {
  const headers = { "cache-control": "no-store" };
  if (isRouterRequest(req)) return new Response(null, { status: 204, headers });
  const c = getPublicConfig();
  if (!c.core) return Response.json({ ok: false, deployed: false, pending: c.pending, network: c.network }, { headers });
  const r = await health(c.core, c.network);
  return Response.json(r.body, { status: r.status, headers });
}
