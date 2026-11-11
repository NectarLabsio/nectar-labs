// Two-host routing (WO-34a). Pure: read by proxy.ts, next.config.ts, metadata routes and the API guard.
// SITE_URL and APP_URL unset (either one) = local single-host mode: every route serves on whatever host asked, no redirects.

export interface Hosts {
  /** Landing origin, e.g. https://nectarlabs.io (no trailing slash). */
  site: string;
  /** App origin, e.g. https://ac.nectarlabs.io. */
  app: string;
  siteHost: string;
  appHost: string;
}

function origin(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/** Both origins, or null in local mode. Bad URLs count as unset. */
export function readHosts(env: Record<string, string | undefined> = process.env): Hosts | null {
  const s = origin(env.SITE_URL);
  const a = origin(env.APP_URL);
  if (!s || !a || s.host === a.host) return null;
  return { site: s.origin, app: a.origin, siteHost: s.host.toLowerCase(), appHost: a.host.toLowerCase() };
}

/** Public docs URL: DOCS_URL, else APP_URL + /docs, else "" (local: the in-app /docs page). */
export function docsUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.DOCS_URL) return env.DOCS_URL.replace(/\/$/, "");
  const a = origin(env.APP_URL);
  return a ? `${a.origin}/docs` : "";
}

/** The docs deployment origin (Docusaurus, baseUrl /docs/) that APP /docs rewrites to. Empty: no rewrite. */
export function docsOrigin(env: Record<string, string | undefined> = process.env): string {
  return origin(env.DOCS_ORIGIN)?.origin ?? "";
}

/** Routes that belong to the landing host. Everything else (except /api and assets) belongs to the app host. */
export const LANDING_EXACT = ["/", "/about", "/security", "/status", "/changelog", "/brand", "/talk"] as const;
export const LANDING_PREFIX = ["/legal"] as const;

export function isLandingPath(path: string): boolean {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if ((LANDING_EXACT as readonly string[]).includes(p)) return true;
  return LANDING_PREFIX.some((pre) => p === pre || p.startsWith(`${pre}/`));
}

/** Served on both hosts unchanged: API routes, Next assets, public files and metadata routes. */
export function isSharedPath(path: string): boolean {
  if (path.startsWith("/api/") || path === "/api" || path.startsWith("/_next/")) return true;
  if (path === "/robots.txt" || path === "/sitemap.xml" || path === "/favicon.ico" || path.startsWith("/brand/")) return true;
  return /^\/(icon|apple-icon|opengraph-image|twitter-image)(\.[a-z]+)?$/.test(path);
}

export type Route = { kind: "next" } | { kind: "redirect"; status: 301 | 307 | 308; location: string };

/**
 * Decide what a request gets. `host` is the Host (or X-Forwarded-Host) header; `pathAndQuery` keeps the query string.
 * www.<site> → SITE (301) · APP `/` → `/feed` (307) · app route on SITE → APP (308) · landing-only route on APP → SITE (308).
 * Unknown hosts (preview deployments, localhost) are served as-is.
 */
export function route(h: Hosts | null, host: string | null, path: string, search: string): Route {
  if (!h || !host) return { kind: "next" };
  const hn = host.split(",")[0]!.trim().toLowerCase();
  const tail = `${path}${search}`;
  if (hn === `www.${h.siteHost}`) return { kind: "redirect", status: 301, location: `${h.site}${tail}` };
  if (isSharedPath(path)) return { kind: "next" };
  if (hn === h.appHost) {
    if (path === "/") return { kind: "redirect", status: 307, location: `${h.app}/feed${search}` };
    if (isLandingPath(path)) return { kind: "redirect", status: 308, location: `${h.site}${tail}` };
    return { kind: "next" };
  }
  if (hn === h.siteHost) {
    if (isLandingPath(path)) return { kind: "next" };
    return { kind: "redirect", status: 308, location: `${h.app}${tail}` };
  }
  return { kind: "next" };
}

/** Which origin a path is canonical on (metadataBase / sitemap). Null in local mode. */
export function canonicalOrigin(h: Hosts | null, path: string): string | null {
  if (!h) return null;
  return isLandingPath(path) ? h.site : h.app;
}
