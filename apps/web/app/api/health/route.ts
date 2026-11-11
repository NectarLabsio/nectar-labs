import { NectarViews, rpcEndpoints } from "@nectar/sdk";
import { getPublicConfig } from "@/lib/config.server";
import { RPC_URL } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Answers newer than this are reused, like /api/feed (R2-11): a loop on /api/health cannot spend the server's RPC quota. */
const FRESH_MS = 5_000;

interface Cached { core: string; at: number; status: number; body: Record<string, unknown> }
let last: Cached | null = null;
let inflight: Promise<Cached> | null = null;

async function read(core: string, network: string): Promise<Cached> {
  try {
    // Same resilient client as the browser: retry on 429 / 5xx, then the FastNEAR testnet fallbacks (WO-33b §0).
    const v = NectarViews.fromRpc(core, RPC_URL);
    const [version, pool] = await Promise.all([v.contractVersion(), v.getPool()]);
    return { core, at: Date.now(), status: 200, body: { ok: true, deployed: true, core, version, pool, network, rpc: rpcEndpoints(RPC_URL) } };
  } catch (e) {
    // Details stay in the server log; the response carries a generic string.
    console.error(`health: RPC read failed: ${e instanceof Error ? e.message : String(e)}`);
    return { core, at: Date.now(), status: 502, body: { ok: false, deployed: true, core, error: "RPC read failed" } };
  }
}

export async function GET() {
  const c = getPublicConfig();
  const headers = { "cache-control": "no-store" };
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
