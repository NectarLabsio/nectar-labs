import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { hostKind, isLandingPath, readHosts } from "@/lib/hosts";

// Per-host sitemap (WO-34a §5, WO-62b; F-460 sitemap.md). headers() makes this a request-time route ("cached by default unless it
// uses a Request-time API"), so SITE, APP and STATUS each list only their own routes (STATUS: its root, the status page). Local mode: every route on the requesting origin.
// Static routes only; dynamic ones (/feed/[symbol], /position/[id], /quote/[id], /note/[id]) are reached from these pages.
const ROUTES = [
  "/",
  "/about",
  "/status",
  "/changelog",
  "/brand",
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
  const kind = hostKind(hosts, host);
  if (kind === "status") return [{ url: `${hosts.status}/` }];
  const onSite = kind === "site";
  const origin = onSite ? hosts.site : hosts.app;
  // Landing routes on SITE, the rest on APP; /status moves to the STATUS sitemap when STATUS_URL is set.
  const listed = ROUTES.filter((p) => isLandingPath(p) === onSite && !(hosts.status && p === "/status"));
  return listed.map((p) => ({ url: `${origin}${p}` }));
}
