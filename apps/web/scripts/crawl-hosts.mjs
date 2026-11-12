// Host plan for crawl.mjs (WO-62d): which hosts are internal, where the crawl starts and which redirects it asserts. Pure, so
// crawl-hosts.test.mjs can check it without a server. It mirrors lib/hosts.ts (readHosts + route(), WO-34a + WO-62b); the hosted
// e2e (e2e/hosts.spec.ts) asserts the same routing per request. Pass the same values the server runs with (SITE_URL, APP_URL,
// DOCS_URL, STATUS_URL, LEGACY_HOSTS); a crawl with fewer values than the server expects the older behaviour and fails.

/** @param {string | undefined | null} u */
export const trimUrl = (u) => (u ?? "").replace(/\/+$/, "");

/** @param {string} u */
const hostOf = (u) => new URL(u).host.toLowerCase();

/**
 * LEGACY_HOSTS `host=site|app|docs|status,…` → [{ host, kind, target }], with lib/hosts.ts parseLegacyHosts's rules: entries naming
 * a canonical host, an unset target, a bad kind or a malformed host are dropped.
 * @param {string | undefined} raw
 * @param {Record<string, string | null>} targets
 */
export function parseLegacy(raw, targets) {
  const canonical = new Set(
    Object.values(targets)
      .filter((t) => !!t)
      .map((t) => hostOf(/** @type {string} */ (t))),
  );
  const out = [];
  for (const part of (raw ?? "").split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const host = part.slice(0, eq).trim().toLowerCase();
    const kind = part.slice(eq + 1).trim().toLowerCase();
    if (!/^[a-z0-9.-]+(:\d+)?$/.test(host) || canonical.has(host)) continue;
    const target = Object.hasOwn(targets, kind) ? targets[kind] : null;
    if (typeof target === "string" && target) out.push({ host, kind, target });
  }
  return out;
}

/** A path that is canonical on each host kind, used for the legacy-host check (query included: it must survive the hop). */
const LEGACY_PATH = { site: "/about?y=2", app: "/feed?x=1", docs: "/security/audits?z=3", status: "/?z=3" };

/**
 * @param {{ site: string, app: string, docs?: string, status?: string, legacy?: string }} env
 * @returns {{ site: string, app: string, docs: string, status: string | null, docsOwnOrigin: boolean,
 *   hosts: Map<string, "site" | "app" | "docs" | "status">, seeds: string[],
 *   redirects: { label: string, url: string, status: number, location: string, host?: string }[] }}
 */
export function hostPlan(env) {
  const site = new URL(trimUrl(env.site)).origin;
  const app = new URL(trimUrl(env.app)).origin;
  const siteHost = hostOf(site);
  const appHost = hostOf(app);
  // readHosts: STATUS_URL is an origin; equal to SITE or APP = unset. DOCS_URL keeps its path; equal to a taken host = unset.
  const taken = new Set([siteHost, appHost]);
  const st = trimUrl(env.status);
  const status = st && !taken.has(hostOf(st)) ? new URL(st).origin : null;
  if (status) taken.add(hostOf(status));
  const docsRaw = trimUrl(env.docs);
  const docsOwnOrigin = !!docsRaw && !taken.has(hostOf(docsRaw));
  // Without its own origin the docs are the in-app /docs page on APP (WO-34a), which is what the crawl covered before WO-62b.
  const docs = docsOwnOrigin ? docsRaw : `${app}/docs`;

  /** @type {Map<string, "site" | "app" | "docs" | "status">} */
  const hosts = new Map([
    [siteHost, "site"],
    [appHost, "app"],
  ]);
  if (status) hosts.set(hostOf(status), "status");
  if (docsOwnOrigin) hosts.set(hostOf(docs), "docs");

  const seeds = [`${site}/`, `${app}/feed`, `${docs}/`, ...(status ? [`${status}/`] : [])];

  /** @type {{ label: string, url: string, status: number, location: string, host?: string }[]} */
  const redirects = [];
  /** @param {string} label @param {string} url @param {number} code @param {string} location @param {string} [host] */
  const want = (label, url, code, location, host) => redirects.push({ label, url, status: code, location, ...(host ? { host } : {}) });

  want("APP / → /feed", `${app}/`, 307, `${app}/feed`);
  want("app route on SITE → APP", `${site}/borrow?asset=NVDAx`, 308, `${app}/borrow?asset=NVDAx`);
  if (docsOwnOrigin) {
    // WO-62b: SITE, APP and STATUS `/docs` and `/docs/<rest>` → 308 DOCS/<rest>, prefix dropped, query kept.
    const origins = [["SITE", site], ["APP", app], ...(status ? [["STATUS", status]] : [])];
    for (const [k, o] of origins) want(`${k} /docs/<rest> → DOCS/<rest> (WO-62b, prefix dropped)`, `${o}/docs/security/audits`, 308, `${docs}/security/audits`);
    want("SITE /docs?x=1 → DOCS/?x=1 (WO-62b, query kept)", `${site}/docs?x=1`, 308, `${docs}/?x=1`);
  } else {
    want("SITE /docs/* → APP (WO-34a, no DOCS_URL)", `${site}/docs/security/audits`, 308, `${app}/docs/security/audits`);
  }
  want("landing route on APP → SITE", `${app}/security`, 308, `${site}/security`);
  want("www.<site> → SITE", `${site}/talk`, 301, `${site}/talk`, `www.${siteHost}`);
  if (status) {
    want("SITE /status → STATUS / (WO-62b, query kept)", `${site}/status?x=1`, 308, `${status}/?x=1`);
    want("STATUS /status → STATUS /", `${status}/status`, 308, `${status}/`);
    want("app route on STATUS → APP", `${status}/feed?x=1`, 308, `${app}/feed?x=1`);
    want("landing route on STATUS → SITE", `${status}/about`, 308, `${site}/about`);
  }
  for (const l of parseLegacy(env.legacy, { site, app, status, docs: docsOwnOrigin ? docs : null })) {
    const path = LEGACY_PATH[/** @type {keyof typeof LEGACY_PATH} */ (l.kind)];
    want(`legacy ${l.host} → ${l.kind.toUpperCase()} (path + query kept)`, `${new URL(l.target).protocol}//${l.host}${path}`, 308, `${l.target}${path}`);
  }
  return { site, app, docs, status, docsOwnOrigin, hosts, seeds, redirects };
}

/**
 * Sitemap `<loc>` values → URLs on the docs origin. A docs build made without DOCS_URL writes another origin into its sitemap
 * (local mode: http://localhost:3000); those paths are re-based onto `docs`. Duplicates dropped, order kept.
 * @param {string} xml
 * @param {string} docs
 */
export function sitemapUrls(xml, docs) {
  const docsHost = hostOf(docs);
  const out = new Set();
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    let u;
    try {
      u = new URL(/** @type {string} */ (m[1]).replace(/&amp;/g, "&"));
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol)) continue;
    u.hash = "";
    out.add(u.host.toLowerCase() === docsHost ? u.href : new URL(`${docs}${u.pathname}${u.search}`).href);
  }
  return [...out];
}
