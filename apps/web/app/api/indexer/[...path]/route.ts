import { FEED_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

// Same-origin proxy to the Feed API (services/feed/openapi.yaml): the browser never talks to the indexer host directly.
// Only the documented read-only paths pass; query strings are re-built from an allow-list.
const ALLOWED = [/^api\/feed$/, /^api\/settlements$/, /^api\/oneclick$/, /^healthz$/, /^api\/asset\/[A-Za-z0-9._-]{1,32}$/];
const QUERY = ["limit", "position_id"] as const;

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const p = path.join("/");
  if (!ALLOWED.some((r) => r.test(p))) return Response.json({ error: "not found" }, { status: 404 });
  if (!FEED_URL) return Response.json({ configured: false, error: "Feed API not configured (NEXT_PUBLIC_FEED_URL)" }, { status: 503 });
  const inUrl = new URL(req.url);
  const out = new URL(`${FEED_URL.replace(/\/$/, "")}/${p}`);
  for (const k of QUERY) {
    const v = inUrl.searchParams.get(k);
    if (v !== null && /^\d{1,20}$/.test(v)) out.searchParams.set(k, v);
  }
  try {
    const r = await fetch(out, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    const body: unknown = await r.json();
    return Response.json(body, { status: r.status });
  } catch (e) {
    return Response.json({ configured: true, error: `Feed API unreachable: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
