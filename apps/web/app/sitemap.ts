import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isLandingPath, readHosts } from "@/lib/hosts";

// Per-host sitemap (WO-34a §5). headers() makes this a request-time route (sitemap.md: "cached by default unless it uses a
// Request-time API"), so SITE and APP each list only their own routes. Local mode: every route on the requesting origin.
// Static routes only; dynamic ones (/feed/[symbol], /position/[id], /quote/[id], /note/[id]) are reached from these pages.
// WO-34b adds /about, /status, /changelog, /brand: append them here when their pages land.
const ROUTES = [
  "/",
  "/security",
  "/talk",
  "/legal/privacy",
  "/legal/cookies",
  "/legal/terms",
  "/legal/disclaimers",
  "/feed",
  "/borrow",
  "/quote/new",
  "/reserve",
  "/notes",
  "/shield",
  "/keepers",
  "/agents",
  "/console",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0]!.trim().toLowerCase();
  const hosts = readHosts();
  if (!hosts) {
    const proto = h.get("x-forwarded-proto") ?? "http";
    return ROUTES.map((p) => ({ url: `${proto}://${host}${p}` }));
  }
  const onSite = host === hosts.siteHost;
  const origin = onSite ? hosts.site : hosts.app;
  return ROUTES.filter((p) => isLandingPath(p) === onSite && !(p === "/" && !onSite)).map((p) => ({ url: `${origin}${p}` }));
}
