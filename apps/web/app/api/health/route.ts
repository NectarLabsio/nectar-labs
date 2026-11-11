import { NectarViews, resilientRpcTransport, rpcEndpoints, type FetchLike } from "@nectar/sdk";
import { getPublicConfig } from "@/lib/config.server";
import { RPC_URL } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Answers newer than this are reused, like /api/feed (R2-11): a loop on /api/health cannot spend the server's RPC quota. */
const FRESH_MS = 5_000;
/** One RPC attempt is aborted after this; a hung socket becomes a retryable transport error instead of a stuck read. */
const ATTEMPT_MS = 4_000;
/** The whole read (retries + fallbacks) settles by this deadline, so the shared in-flight promise can never hang every caller. */
const DEADLINE_MS = 10_000;

interface Cached { core: string; at: number; status: number; body: Record<string, unknown> }
let last: Cached | null = null;
let inflight: Promise<Cached> | null = null;

const timedFetch: FetchLike = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(ATTEMPT_MS) });

function failed(core: string, why: string): Cached {
  // Details stay in the server log; the response carries a generic string.
  console.error(`health: RPC read failed: ${why}`);
  return { core, at: Date.now(), status: 502, body: { ok: false, deployed: true, core, error: "RPC read failed" } };
}

async function read(core: string, network: string): Promise<Cached> {
  // Same resilient client as the browser (retry on 429 / 5xx, then the FastNEAR testnet fallbacks, WO-33b §0), with a per-attempt timeout.
  const urls = rpcEndpoints(RPC_URL);
  const v = new NectarViews(core, resilientRpcTransport({ urls, fetch: timedFetch }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Cached>((resolve) => {
    timer = setTimeout(() => resolve(failed(core, `no answer within ${DEADLINE_MS} ms`)), DEADLINE_MS);
  });
  const answer = Promise.all([v.contractVersion(), v.getPool()]).then(
    ([version, pool]): Cached => ({ core, at: Date.now(), status: 200, body: { ok: true, deployed: true, core, version, pool, network, rpc: urls } }),
    (e: unknown) => failed(core, e instanceof Error ? e.message : String(e)),
  );
  try {
    return await Promise.race([answer, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

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
  const now = Date.now();
  let hit = last && last.core === c.core && now - last.at <= FRESH_MS ? last : null;
  if (!hit) {
    inflight ??= read(c.core, c.network).finally(() => {
      inflight = null;
    });
    hit = await inflight;
    last = hit;
  }
  const age_s = Math.max(0, Math.floor((Date.now() - hit.at) / 1000));
  return Response.json({ ...hit.body, as_of: new Date(hit.at).toISOString(), age_s }, { status: hit.status, headers });
}
