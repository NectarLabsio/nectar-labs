import { NectarViews } from "@nectar/sdk";
import { getPublicConfig } from "@/lib/config.server";
import { RPC_URL } from "@/lib/env";

export const revalidate = 10;

/** GET /api/feed — exit capacity per collateral from on-chain views (indexer history comes later). */
export async function GET() {
  const c = getPublicConfig();
  if (!c.core) return Response.json({ deployed: false, pending: c.pending, assets: [] });
  try {
    const v = NectarViews.fromRpc(c.core, RPC_URL);
    const cs = await v.listCollaterals(0, 50);
    const assets = await Promise.all(cs.map(async (col) => ({ symbol: col.symbol, capacity: await v.getExitCapacity(col.symbol) })));
    return Response.json({ deployed: true, core: c.core, assets });
  } catch (e) {
    return Response.json({ deployed: true, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
