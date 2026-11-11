import { NectarViews, type ExitCapacity } from "@nectar/sdk";
import { getPublicConfig } from "@/lib/config.server";
import { RPC_URL } from "@/lib/env";

// Read on every request (never prerendered): a build-time snapshot must not be served as the chain's current state (G3b).
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Reads newer than this are reused; anything older is re-read from the chain. */
const FRESH_MS = 5_000;

interface Snapshot {
  core: string;
  assets: Array<{ symbol: string; capacity: ExitCapacity }>;
  at: number;
}
let last: Snapshot | null = null;

function body(s: Snapshot, now: number, extra: Record<string, unknown> = {}) {
  const age_s = Math.max(0, Math.floor((now - s.at) / 1000));
  return { deployed: true, core: s.core, as_of: new Date(s.at).toISOString(), age_s, stale: now - s.at > FRESH_MS, assets: s.assets, ...extra };
}

/**
 * GET /api/feed — exit capacity per collateral from on-chain views (indexer history comes later). Every answer carries
 * `as_of` and `age_s`; when the RPC fails, the last good read is returned with `stale: true` and the error, never as fresh.
 */
export async function GET() {
  const c = getPublicConfig();
  const headers = { "cache-control": "no-store" };
  if (!c.core) return Response.json({ deployed: false, pending: c.pending, assets: [] }, { headers });
  const now = Date.now();
  if (last && last.core === c.core && now - last.at <= FRESH_MS) return Response.json(body(last, now), { headers });
  try {
    const v = NectarViews.fromRpc(c.core, RPC_URL);
    const cs = await v.listCollaterals(0, 50);
    const assets = await Promise.all(cs.map(async (col) => ({ symbol: col.symbol, capacity: await v.getExitCapacity(col.symbol) })));
    last = { core: c.core, assets, at: Date.now() };
    return Response.json(body(last, Date.now()), { headers });
  } catch (e) {
    // R2-11: details in the server log, a generic string in the response.
    console.error(`feed: RPC read failed: ${e instanceof Error ? e.message : String(e)}`);
    const error = "RPC read failed";
    if (last && last.core === c.core) return Response.json(body(last, Date.now(), { error }), { status: 200, headers });
    return Response.json({ deployed: true, error }, { status: 502, headers });
  }
}
