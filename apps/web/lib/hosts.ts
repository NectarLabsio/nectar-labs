// Host routing (WO-34a two hosts; WO-62b status host, docs at the DOCS_URL root, legacy hosts). Pure: read by proxy.ts,
// next.config.ts, metadata routes, the API guard and lib/hosts.test.ts.
// SITE_URL and APP_URL unset (either one) = local single-host mode: every route serves on whatever host asked, no redirects
// (in-app /docs explainer, /status on the same host). Production hosts: packages/config/config.yaml `site.production_hosts`.

export interface Hosts {
  /** Landing origin, e.g. https://nectarlabs.io (no trailing slash). */
  site: string;
  /** App origin, e.g. https://testnet.nectarlabs.io. */
  app: string;
  siteHost: string;
  appHost: string;
  /** Status origin, e.g. https://status.nectarlabs.io. Null: /status is served on SITE (WO-34a behaviour). */
  status: string | null;
  statusHost: string | null;
  /** Docs origin, e.g. https://docs.nectarlabs.io; docs pages live at its root (WO-62b, F-459). Null: the in-app /docs page. */
  docs: string | null;
  /** LEGACY_HOSTS: lower-case Host → the canonical origin it 308s to (same path + query). */
  legacy: ReadonlyMap<string, string>;
}

export type HostKind = "site" | "app" | "docs" | "status";

type Env = Record<string, string | undefined>;

function origin(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/**
 * LEGACY_HOSTS = comma list `host=site|app|docs|status` (WO-62b §3), e.g. `old-app.example.dev=app,old-site.example.dev=site`.
 * The real list (the `*.vercel.app` names) lives in the Vercel env only. A project-domain redirect for a vercel.app host is not
 * documented (F-457), so this proxy path is the mechanism; it mirrors Vercel's host-scoped redirect (F-456: 308, path and query
 * kept). Entries naming a canonical host, an unset target, a bad kind or a malformed host are dropped (no loops, no guesses).
 */
export function parseLegacyHosts(raw: string | undefined, targets: Partial<Record<HostKind, string | null>>): Map<string, string> {
  const out = new Map<string, string>();
  const canonical = new Set(
    Object.values(targets)
      .filter((t): t is string => !!t)
      .map((t) => new URL(t).host.toLowerCase()),
  );
  for (const part of (raw ?? "").split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const host = part.slice(0, eq).trim().toLowerCase();
    const kind = part.slice(eq + 1).trim().toLowerCase();
    if (!/^[a-z0-9.-]+(:\d+)?$/.test(host) || canonical.has(host)) continue;
    if (kind !== "site" && kind !== "app" && kind !== "docs" && kind !== "status") continue;
    const target = targets[kind];
    if (target) out.set(host, target);
  }
  return out;
}

/** Every origin, or null in local mode. Bad URLs count as unset; STATUS_URL / DOCS_URL equal to SITE or APP count as unset. */
export function readHosts(env: Env = process.env): Hosts | null {
  const s = origin(env.SITE_URL);
  const a = origin(env.APP_URL);
  if (!s || !a || s.host === a.host) return null;
  const taken = new Set([s.host, a.host]);
  const st = origin(env.STATUS_URL);
  const statusUrl = st && !taken.has(st.host) ? st : null;
  if (statusUrl) taken.add(statusUrl.host);
  const d = docsUrl(env);
  const docs = d && !taken.has(new URL(d).host) ? d : null;
  const site = s.origin;
  const app = a.origin;
  const status = statusUrl?.origin ?? null;
  return {
    site,
    app,
    siteHost: s.host.toLowerCase(),
    appHost: a.host.toLowerCase(),
    status,
    statusHost: statusUrl?.host.toLowerCase() ?? null,
    docs,
    legacy: parseLegacyHosts(env.LEGACY_HOSTS, { site, app, status, docs }),
  };
}

/** Public docs URL = DOCS_URL without a trailing slash (pages at its root, WO-62b). Unset or invalid: "" (the in-app /docs page). */
export function docsUrl(env: Env = process.env): string {
  const d = origin(env.DOCS_URL);
  return d ? `${d.origin}${d.pathname.replace(/\/+$/, "")}` : "";
}

/** Routes that belong to the landing host. Everything else (except /api and assets) belongs to the app host. */
export const LANDING_EXACT = ["/", "/about", "/security", "/status", "/changelog", "/brand", "/talk"] as const;
export const LANDING_PREFIX = ["/legal"] as const;

export function isLandingPath(path: string): boolean {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if ((LANDING_EXACT as readonly string[]).includes(p)) return true;
  return LANDING_PREFIX.some((pre) => p === pre || p.startsWith(`${pre}/`));
}

/** `/docs` and `/docs/<rest>` → `/<rest>` on the docs origin (prefix dropped); null for any other path. */
export function docsPath(path: string): string | null {
  if (path !== "/docs" && !path.startsWith("/docs/")) return null;
  return path.slice("/docs".length) || "/";
}

/** Served on every host unchanged: API routes, Next assets, public files and metadata routes. */
export function isSharedPath(path: string): boolean {
  if (path.startsWith("/api/") || path === "/api" || path.startsWith("/_next/")) return true;
  if (path === "/robots.txt" || path === "/sitemap.xml" || path === "/favicon.ico" || path.startsWith("/brand/")) return true;
  return /^\/(icon|apple-icon|opengraph-image|twitter-image)(\.[a-z]+)?$/.test(path);
}

export type Route =
  | { kind: "next" }
  | { kind: "rewrite"; path: string }
  | { kind: "redirect"; status: 301 | 307 | 308; location: string };

const redirect = (status: 301 | 307 | 308, location: string): Route => ({ kind: "redirect", status, location });

/**
 * Decide what a request gets. `host` is the Host (or X-Forwarded-Host) header; `search` is the query string (kept everywhere).
 * In order: legacy host → its origin (308, same path) · www.<site> → SITE (301) · /docs[/<rest>] → DOCS/<rest> (308) on SITE, APP
 * and STATUS · shared paths served · STATUS `/` → rewrite /status, STATUS `/status` → STATUS `/`, other STATUS paths → their
 * canonical host (308) · `/status` on SITE or APP → STATUS `/` (308) · APP `/` → `/feed` (307) · app route on SITE → APP (308) ·
 * landing-only route on APP → SITE (308). Unknown hosts (preview deployments, localhost) are served as-is.
 */
export function route(h: Hosts | null, host: string | null, path: string, search: string): Route {
  if (!h || !host) return { kind: "next" };
  const hn = host.split(",")[0]!.trim().toLowerCase();
  const tail = `${path}${search}`;
  const legacy = h.legacy.get(hn);
  if (legacy) return redirect(308, `${legacy}${tail}`);
  if (hn === `www.${h.siteHost}`) return redirect(301, `${h.site}${tail}`);
  const ours = hn === h.siteHost || hn === h.appHost || (h.statusHost !== null && hn === h.statusHost);
  if (!ours) return { kind: "next" };
  const docs = h.docs ? docsPath(path) : null;
  if (docs) return redirect(308, `${h.docs}${docs}${search}`);
  if (isSharedPath(path)) return { kind: "next" };
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (h.status && p === "/status") {
    // STATUS `/status` and SITE/APP `/status`: one hop to the status root.
    return redirect(308, `${h.status}/${search}`);
  }
  if (hn === h.statusHost) {
    if (path === "/") return { kind: "rewrite", path: "/status" };
    return redirect(308, `${isLandingPath(path) ? h.site : h.app}${tail}`);
  }
  if (hn === h.appHost) {
    if (path === "/") return redirect(307, `${h.app}/feed${search}`);
    if (isLandingPath(path)) return redirect(308, `${h.site}${tail}`);
    return { kind: "next" };
  }
  if (isLandingPath(path)) return { kind: "next" };
  return redirect(308, `${h.app}${tail}`);
}

/** Which origin a path is canonical on (metadataBase / sitemap). Null in local mode. */
export function canonicalOrigin(h: Hosts | null, path: string): string | null {
  if (!h) return null;
  if (h.status && path === "/status") return h.status;
  return isLandingPath(path) ? h.site : h.app;
}

/** The host a metadata route (robots.txt, sitemap.xml) is answering for, from the request headers. */
export function hostKind(h: Hosts, host: string): "site" | "app" | "status" {
  if (h.statusHost && host === h.statusHost) return "status";
  return host === h.appHost ? "app" : "site";
}
