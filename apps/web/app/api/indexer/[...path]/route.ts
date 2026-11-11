import { FEED_URL } from "@/lib/env";
import { FEED_QUERY, isAllowedFeedPath } from "@/lib/api/feed-paths";

export const dynamic = "force-dynamic";

// Same-origin proxy to the Feed API (services/feed/openapi.yaml): the browser never talks to the indexer host directly.
// Only the documented read-only paths pass (lib/api/feed-paths.ts); query strings are re-built from an allow-list.
// Errors reach the browser as generic strings; details go to the server log (R2-11).
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!isAllowedFeedPath(path)) return Response.json({ error: "not found" }, { status: 404 });
  const p = path.join("/");
  // Not an error to the browser: an unset indexer is a supported configuration (the panels say so), so no 5xx noise.
  if (!FEED_URL) return Response.json({ configured: false, error: "Feed indexer not configured" }, { status: 200, headers: { "cache-control": "no-store" } });
  const inUrl = new URL(req.url);
  const out = new URL(`${FEED_URL.replace(/\/$/, "")}/${p}`);
  for (const k of FEED_QUERY) {
    const v = inUrl.searchParams.get(k);
    if (v !== null && /^\d{1,20}$/.test(v)) out.searchParams.set(k, v);
  }
  try {
    const r = await fetch(out, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (r.status >= 500) {
      console.error(`feed proxy: upstream ${p} → HTTP ${r.status}`);
      return Response.json({ configured: true, error: "Feed API error" }, { status: 502 });
    }
    const body: unknown = await r.json();
    return Response.json(body, { status: r.status });
  } catch (e) {
    console.error(`feed proxy: ${p} failed: ${e instanceof Error ? e.message : String(e)}`);
    return Response.json({ configured: true, error: "Feed API unreachable" }, { status: 502 });
  }
}
