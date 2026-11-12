#!/usr/bin/env node
// WO-34c crawler, reused by the production verifier (WO-34v); WO-62d: docs and status hosts.
//   node apps/web/scripts/crawl.mjs [--site URL] [--app URL] [--docs URL] [--status URL] [--legacy LIST] --out evidence/crawl [--max 400]
// Each flag defaults to the env the server runs with: SITE_URL, APP_URL, DOCS_URL, STATUS_URL, LEGACY_HOSTS (pass all of them, or
// the redirect checks expect older routing). Internal hosts = SITE, APP, plus DOCS when it is its own origin (WO-62b: pages at the
// root, e.g. scripts/serve-docs.mjs) and STATUS when set; without DOCS_URL the docs are APP /docs. Follows every internal link from
// SITE /, APP /feed, DOCS / and STATUS /, plus the DOCS sitemap.xml, asserts 200 after redirects and the host routing redirects
// (crawl-hosts.mjs, mirrors lib/hosts.ts), checks external links answer < 400 (GET, 10 s timeout), and collects console errors per
// page in both themes at 1440 and 400 px (Playwright; PW_CHANNEL=chrome uses installed Chrome). A URL that redirects to a page
// already rendered is not rendered again. Writes crawl.json + crawl.md under --out. Exit 1 on failures.
// WO-34f politeness: --polite = one page at a time with a 1.5 s pause between page loads (--delay <ms> overrides); otherwise the four
// variants of a route load in parallel (--concurrency <n>, default 4). Console errors are split: "ours" (any console error except a
// failed load from a third-party host) fail the crawl; third-party network failures (RPC 429s, wallet hosts) are listed separately.
import { mkdirSync, writeFileSync } from "node:fs";
import { request as httpReq } from "node:http";
import { request as httpsReq } from "node:https";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { hostPlan, sitemapUrls, trimUrl as trim } from "./crawl-hosts.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const SITE_IN = trim(arg("site", process.env.SITE_URL));
const APP_IN = trim(arg("app", process.env.APP_URL));
const OUT = resolve(arg("out", "crawl-report"));
const MAX = Number(arg("max", "400"));
const POLITE = process.argv.includes("--polite");
const CONCURRENCY = Math.max(1, Number(arg("concurrency", POLITE ? "1" : "4")));
const DELAY = Math.max(0, Number(arg("delay", POLITE ? "1500" : "0")));
const pause = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
if (!SITE_IN || !APP_IN) {
  console.error("usage: crawl.mjs --site <url> --app <url> [--docs <url>] [--status <url>] [--legacy <host=kind,…>] --out <dir> (or SITE_URL, APP_URL, DOCS_URL, STATUS_URL, LEGACY_HOSTS)");
  process.exit(2);
}
const plan = hostPlan({ site: SITE_IN, app: APP_IN, docs: arg("docs", process.env.DOCS_URL), status: arg("status", process.env.STATUS_URL), legacy: arg("legacy", process.env.LEGACY_HOSTS) });
const { site: SITE, app: APP, docs: DOCS, status: STATUS } = plan;
const internal = (u) => plan.hosts.has(u.host.toLowerCase());
const hostLabel = (u) => plan.hosts.get(new URL(u).host.toLowerCase()) ?? "external";

/** One request, no redirect following; Host header overridable (for www.<site>). */
function raw(url, host, method = "GET") {
  const u = new URL(url);
  const req = u.protocol === "https:" ? httpsReq : httpReq;
  return new Promise((ok) => {
    const r = req(
      { hostname: u.hostname, port: u.port, path: `${u.pathname}${u.search}`, method, headers: { host: host ?? u.host, "user-agent": "nectar-crawl/1 (+verifier)" }, servername: host ? host.split(":")[0] : u.hostname, timeout: 10_000 },
      (res) => {
        res.resume();
        ok({ status: res.statusCode ?? 0, location: res.headers.location ?? null });
      },
    );
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", (e) => ok({ status: 0, location: null, error: String(e.message ?? e) }));
    r.end();
  });
}

/** Follow redirects manually; returns the chain and the final status. */
async function chain(url) {
  const hops = [];
  let cur = url;
  for (let i = 0; i < 8; i++) {
    const r = await raw(cur);
    hops.push({ url: cur, status: r.status, ...(r.error ? { error: r.error } : {}) });
    if (r.status >= 300 && r.status < 400 && r.location) cur = new URL(r.location, cur).href;
    else return { hops, final: r.status, finalUrl: cur };
  }
  return { hops, final: 0, finalUrl: cur, error: "too many redirects" };
}

const failures = [];
const thirdPartyFailures = [];
const fail = (kind, where, detail) => failures.push({ kind, where, detail });

// 1. Host routing redirects (WO-34a, WO-62b; list in crawl-hosts.mjs).
const expectRedirect = async ({ label, url, status, location, host }) => {
  const r = await raw(url, host);
  const ok = r.status === status && r.location === location;
  if (!ok) fail("redirect", label, `got ${r.status} ${r.location ?? ""}; want ${status} ${location}`);
  return { label, url, host: host ?? new URL(url).host, status: r.status, location: r.location, want: `${status} ${location}`, ok };
};
const redirects = [];
for (const want of plan.redirects) redirects.push(await expectRedirect(want));

// DOCS sitemap (own origin only): the sidebar renders collapsed categories lazily, so links alone may miss pages.
let docsSitemap = [];
if (plan.docsOwnOrigin) {
  try {
    const res = await fetch(`${DOCS}/sitemap.xml`, { headers: { "user-agent": "nectar-crawl/1 (+verifier)" }, signal: AbortSignal.timeout(10_000) });
    if (res.ok) docsSitemap = sitemapUrls(await res.text(), DOCS);
    else fail("status", `${DOCS}/sitemap.xml`, `status ${res.status}`);
  } catch (e) {
    fail("status", `${DOCS}/sitemap.xml`, String(e.message ?? e));
  }
}

// 2. Render + link discovery (Playwright), 3. status chains, 4. external links.
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const VARIANTS = [
  { theme: "dark", width: 1440, height: 900 },
  { theme: "light", width: 1440, height: 900 },
  { theme: "dark", width: 400, height: 860 },
  { theme: "light", width: 400, height: 860 },
];
const contexts = [];
for (const v of VARIANTS) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("nectar-theme", t);
      localStorage.setItem("nectar-consent", JSON.stringify({ v: 1, analytics: false, at: Date.now() }));
      localStorage.setItem("theme", t);
    } catch {}
  }, v.theme);
  contexts.push({ v, ctx });
}

const queue = [...new Set([...plan.seeds, ...docsSitemap])];
const seen = new Set(queue);
const linked = new Set(); // every internal href found on a rendered page
const renderedAt = new Map(); // final URL → the queued URL that rendered it
const routes = [];
const external = new Map();
const norm = (href, base) => {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
};

while (queue.length && routes.length < MAX) {
  const url = queue.shift();
  const c = await chain(url);
  const rec = { url, status: c.final, finalUrl: c.finalUrl, hops: c.hops, console: {}, thirdParty: {}, links: 0 };
  routes.push(rec);
  if (c.final !== 200) {
    fail("status", url, `final ${c.final} after ${c.hops.map((h) => h.status).join(" → ")}`);
    continue;
  }
  const finalU = new URL(c.finalUrl);
  if (!internal(finalU)) continue;
  if (renderedAt.has(c.finalUrl)) {
    rec.sameAs = renderedAt.get(c.finalUrl);
    continue;
  }
  renderedAt.set(c.finalUrl, url);
  rec.host = hostLabel(c.finalUrl);
  const renderOne = async ({ v, ctx }) => {
    const page = await ctx.newPage();
    const errs = [];
    const thirdParty = [];
    const hostOfUrl = (u) => {
      try {
        return new URL(u);
      } catch {
        return null;
      }
    };
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const text = m.text().slice(0, 300);
      const at = hostOfUrl(m.location()?.url ?? "");
      // Chrome logs every failed subresource as a console error; a failed load from another host (RPC, wallet) is a third-party
      // network failure, not an error from our code. Everything else counts as ours.
      // Chrome also logs a CORS refusal when a throttled third-party answer (FastNEAR 429) has no CORS header; the text names the target.
      const cors = /^Access to fetch at '([^']+)'.*blocked by CORS policy/.exec(text);
      const corsAt = cors ? hostOfUrl(cors[1]) : null;
      if (corsAt && !internal(corsAt)) thirdParty.push(`console: CORS refusal of a ${corsAt.host} answer (throttled: no CORS header on the 429)`);
      else if (/^Failed to load resource/.test(text) && at && /^(https?|wss?):$/.test(at.protocol) && !internal(at)) thirdParty.push(`console: ${text} (${at.href.slice(0, 160)})`);
      else errs.push(text);
    });
    page.on("pageerror", (e) => errs.push(`pageerror: ${String(e.message).slice(0, 300)}`));
    page.on("requestfailed", (r) => {
      const u = hostOfUrl(r.url());
      if (u && !internal(u) && /^https?:$/.test(u.protocol)) thirdParty.push(`requestfailed: ${r.failure()?.errorText ?? "?"} ${u.host}${u.pathname.slice(0, 80)}`);
    });
    page.on("response", (r) => {
      const u = hostOfUrl(r.url());
      if (u && !internal(u) && r.status() >= 400) thirdParty.push(`HTTP ${r.status()} ${u.host}${u.pathname.slice(0, 80)}`);
    });
    try {
      await page.goto(c.finalUrl, { waitUntil: "load", timeout: 30_000 });
      await page.waitForTimeout(800);
      if (v === VARIANTS[0]) {
        const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
        rec.links = hrefs.length;
        for (const h of hrefs) {
          const u = norm(h, c.finalUrl);
          if (!u) continue;
          if (internal(u)) {
            linked.add(u.href);
            if (!seen.has(u.href)) {
              seen.add(u.href);
              queue.push(u.href);
            }
          } else if (!external.has(u.href)) external.set(u.href, c.finalUrl);
        }
      }
    } catch (e) {
      errs.push(`navigation: ${String(e.message ?? e).slice(0, 200)}`);
    }
    await page.close();
    const key = `${v.theme}@${v.width}`;
    rec.console[key] = errs;
    rec.thirdParty[key] = thirdParty;
    if (errs.length) fail("console", `${c.finalUrl} [${key}]`, errs.join(" | "));
    if (thirdParty.length) thirdPartyFailures.push({ where: `${c.finalUrl} [${key}]`, detail: thirdParty });
    await pause(DELAY);
  };
  for (let i = 0; i < contexts.length; i += CONCURRENCY) await Promise.all(contexts.slice(i, i + CONCURRENCY).map(renderOne));
}
await browser.close();

// External links. 403/429 are bot walls or rate limits (nearblocks, explorer.solana.com answer browsers fine): warnings for a
// manual check, not failures. Links to localhost / 127.0.0.1 are local-run instructions in the docs: listed, not fetched.
const externals = [];
const warnings = [];
for (const [href, from] of external) {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(href)) {
    externals.push({ href, from, status: null, ok: true, note: "local-run link, not fetched" });
    warnings.push({ kind: "local-link", where: href, detail: `linked from ${from}` });
    continue;
  }
  const r = await chain(href);
  const soft = r.final === 403 || r.final === 429;
  const ok = r.final > 0 && r.final < 400;
  externals.push({ href, from, status: r.final, ok, ...(soft ? { note: "bot wall / rate limit: check by hand" } : {}) });
  if (soft) warnings.push({ kind: "external-soft", where: href, detail: `status ${r.final} (linked from ${from})` });
  else if (!ok) fail("external", href, `status ${r.final} (linked from ${from})`);
}

const ourConsole = failures.filter((f) => f.kind === "console").length;
// Rendered pages per host kind (each final URL once), and DOCS sitemap pages no rendered page links to (listed, not failures).
const pagesPerHost = Object.fromEntries([...new Set(plan.hosts.values())].map((k) => [k, routes.filter((r) => r.host === k).length]));
const sitemapOnly = docsSitemap.filter((u) => !linked.has(u));
const perHostText = Object.entries(pagesPerHost).map(([k, n]) => `${k} ${n}`).join(", ");
const report = { generated: new Date().toISOString(), site: SITE, app: APP, docs: DOCS, status: STATUS, docsOwnOrigin: plan.docsOwnOrigin, internalHosts: Object.fromEntries(plan.hosts), pagesPerHost, docsSitemap: { urls: docsSitemap.length, notLinked: sitemapOnly }, variants: VARIANTS.map((v) => `${v.theme}@${v.width}`), politeness: { polite: POLITE, concurrency: CONCURRENCY, delayMs: DELAY }, ourConsoleErrors: ourConsole, thirdPartyNetworkFailures: thirdPartyFailures, redirects, routes, externals, failures, warnings, truncated: queue.length > 0 };
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "crawl.json"), `${JSON.stringify(report, null, 2)}\n`);
const md = [
  `# Crawl ${report.generated}`,
  "",
  `SITE ${SITE} · APP ${APP} · DOCS ${DOCS}${plan.docsOwnOrigin ? " (own origin)" : " (APP /docs)"} · STATUS ${STATUS ?? "unset (/status on SITE)"} · ${routes.length} internal URLs · ${externals.length} external links · variants ${report.variants.join(", ")}${report.truncated ? ` · TRUNCATED at --max ${MAX}` : ""}`,
  `Rendered pages per host: ${perHostText} (${routes.filter((r) => r.host).length} total; ${routes.filter((r) => r.sameAs).length} URLs redirected to a page already rendered).`,
  ...(plan.docsOwnOrigin ? [`DOCS sitemap: ${docsSitemap.length} URLs queued, ${sitemapOnly.length} not linked from any rendered page${sitemapOnly.length ? `: ${sitemapOnly.join(", ")}` : ""}.`] : []),
  `Politeness: concurrency ${CONCURRENCY}, ${DELAY} ms between page loads${POLITE ? " (--polite)" : ""}.`,
  "",
  `## Our console errors: ${ourConsole}`,
  "",
  "Console errors from our pages (scripts, same-origin loads). Each one is also a failure below.",
  "",
  `## Third-party network failures: ${thirdPartyFailures.reduce((n, t) => n + t.detail.length, 0)} on ${thirdPartyFailures.length} page loads`,
  "",
  "Failed or >= 400 loads from other hosts (RPC throttling, wallet hosts); listed, not failures.",
  "",
  ...thirdPartyFailures.map((t) => `- ${t.where}: ${t.detail.join(" · ").replace(/\|/g, "\\|")}`),
  "",
  `## Failures: ${failures.length}`,
  "",
  ...failures.map((f) => `- **${f.kind}** ${f.where}: ${f.detail.replace(/\|/g, "\\|")}`),
  "",
  `## Warnings: ${warnings.length}`,
  "",
  ...warnings.map((w) => `- ${w.kind} ${w.where}: ${w.detail}`),
  "",
  "## Redirects (WO-34a, WO-62b)",
  "",
  "| Check | Host | Got | Want | OK |",
  "| --- | --- | --- | --- | --- |",
  ...redirects.map((r) => `| ${r.label} | ${r.host} | ${r.status} ${r.location ?? ""} | ${r.want} | ${r.ok ? "yes" : "NO"} |`),
  "",
  "## Internal URLs",
  "",
  "| URL | Host | Chain | Final | Our console errors (4 variants) | Third-party network failures |",
  "| --- | --- | --- | --- | --- | --- |",
  ...routes.map((r) => `| ${r.url} | ${r.host ?? (r.sameAs ? `same page as ${r.sameAs}` : "-")} | ${r.hops.map((h) => h.status).join(" → ")} | ${r.status} | ${Object.values(r.console).reduce((n, e) => n + e.length, 0)} | ${Object.values(r.thirdParty).reduce((n, e) => n + e.length, 0)} |`),
  "",
  "## External links",
  "",
  "| URL | Status | First seen on |",
  "| --- | --- | --- |",
  ...externals.map((e) => `| ${e.href} | ${e.status} | ${e.from} |`),
  "",
].join("\n");
writeFileSync(resolve(OUT, "crawl.md"), md);
console.log(`crawl: ${routes.length} internal (rendered: ${perHostText}), ${externals.length} external, ${failures.length} failures, ${ourConsole} our console errors, ${thirdPartyFailures.length} page loads with third-party network failures → ${OUT}`);
process.exit(failures.length ? 1 : 0);
