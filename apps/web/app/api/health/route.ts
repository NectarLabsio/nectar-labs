import { NectarViews, rpcEndpoints } from "@nectar/sdk";
import { getPublicConfig } from "@/lib/config.server";
import { RPC_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = getPublicConfig();
  if (!c.core) return Response.json({ ok: false, deployed: false, pending: c.pending, network: c.network });
  try {
    // Same resilient client as the browser: retry on 429 / 5xx, then the FastNEAR testnet fallbacks (WO-33b §0).
    const v = NectarViews.fromRpc(c.core, RPC_URL);
    const [version, pool] = await Promise.all([v.contractVersion(), v.getPool()]);
    return Response.json({ ok: true, deployed: true, core: c.core, version, pool, network: c.network, rpc: rpcEndpoints(RPC_URL) });
  } catch (e) {
    return Response.json({ ok: false, deployed: true, core: c.core, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
