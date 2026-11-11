#!/usr/bin/env node
// WO-34c crawler, reused by the production verifier (WO-34v).
//   node apps/web/scripts/crawl.mjs --site https://SITE --app https://APP [--docs https://APP/docs] --out evidence/crawl [--max 400]
// Follows every internal link on SITE, APP and DOCS (docs = APP /docs via the rewrite), asserts 200 after redirects and the WO-34a
// redirect codes, checks external links answer < 400 (GET, 10 s timeout), and collects console errors per route in both themes at
// 1440 and 400 px (Playwright; PW_CHANNEL=chrome uses installed Chrome). Writes crawl.json + crawl.md under --out. Exit 1 on failures.
import { mkdirSync, writeFileSync } from "node:fs";
import { request as httpReq } from "node:http";
import { request as httpsReq } from "node:https";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const trim = (u) => (u ?? "").replace(/\/+$/, "");
const SITE = trim(arg("site", process.env.SITE_URL));
const APP = trim(arg("app", process.env.APP_URL));
const DOCS = trim(arg("docs", `${APP}/docs`));
const OUT = resolve(arg("out", "crawl-report"));
const MAX = Number(arg("max", "400"));
if (!SITE || !APP) {
  console.error("usage: crawl.mjs --site <url> --app <url> [--docs <url>] --out <dir>");
  process.exit(2);
}
const siteHost = new URL(SITE).host;
const appHost = new URL(APP).host;
const internal = (u) => [siteHost, appHost].includes(u.host);

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
const fail = (kind, where, detail) => failures.push({ kind, where, detail });

// 1. WO-34a redirect codes.
const expectRedirect = async (label, url, status, location, host) => {
  const r = await raw(url, host);
  const ok = r.status === status && r.location === location;
  if (!ok) fail("redirect", label, `got ${r.status} ${r.location ?? ""}; want ${status} ${location}`);
  return { label, url, host: host ?? new URL(url).host, status: r.status, location: r.location, want: `${status} ${location}`, ok };
};
const redirects = [
  await expectRedirect("APP / → /feed", `${APP}/`, 307, `${APP}/feed`),
  await expectRedirect("app route on SITE → APP", `${SITE}/borrow?asset=NVDAx`, 308, `${APP}/borrow?asset=NVDAx`),
  await expectRedirect("SITE /docs/* → APP (legal pages link /docs/<slug>)", `${SITE}/docs/security/audits`, 308, `${APP}/docs/security/audits`),
  await expectRedirect("landing route on APP → SITE", `${APP}/security`, 308, `${SITE}/security`),
  await expectRedirect("www.<site> → SITE", `${SITE}/talk`, 301, `${SITE}/talk`, `www.${siteHost}`),
];

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

const queue = [`${SITE}/`, `${APP}/feed`, `${DOCS}/`];
const seen = new Set(queue);
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
  const rec = { url, status: c.final, finalUrl: c.finalUrl, hops: c.hops, console: {}, links: 0 };
  routes.push(rec);
  if (c.final !== 200) {
    fail("status", url, `final ${c.final} after ${c.hops.map((h) => h.status).join(" → ")}`);
    continue;
  }
  const finalU = new URL(c.finalUrl);
  if (!internal(finalU)) continue;
  for (const { v, ctx } of contexts) {
    const page = await ctx.newPage();
    const errs = [];
    page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 300)));
    page.on("pageerror", (e) => errs.push(`pageerror: ${String(e.message).slice(0, 300)}`));
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
    if (errs.length) fail("console", `${c.finalUrl} [${key}]`, errs.join(" | "));
  }
}
await browser.close();

const externals = [];
for (const [href, from] of external) {
  const r = await chain(href);
  const ok = r.final > 0 && r.final < 400;
  externals.push({ href, from, status: r.final, ok });
  if (!ok) fail("external", href, `status ${r.final} (linked from ${from})`);
}

const report = { generated: new Date().toISOString(), site: SITE, app: APP, docs: DOCS, variants: VARIANTS.map((v) => `${v.theme}@${v.width}`), redirects, routes, externals, failures, truncated: queue.length > 0 };
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "crawl.json"), `${JSON.stringify(report, null, 2)}\n`);
const md = [
  `# Crawl ${report.generated}`,
  "",
  `SITE ${SITE} · APP ${APP} · DOCS ${DOCS} · ${routes.length} internal URLs · ${externals.length} external links · variants ${report.variants.join(", ")}${report.truncated ? ` · TRUNCATED at --max ${MAX}` : ""}`,
  "",
  `## Failures: ${failures.length}`,
  "",
  ...failures.map((f) => `- **${f.kind}** ${f.where}: ${f.detail.replace(/\|/g, "\\|")}`),
  "",
  "## Redirects (WO-34a)",
  "",
  "| Check | Host | Got | Want | OK |",
  "| --- | --- | --- | --- | --- |",
  ...redirects.map((r) => `| ${r.label} | ${r.host} | ${r.status} ${r.location ?? ""} | ${r.want} | ${r.ok ? "yes" : "NO"} |`),
  "",
  "## Internal URLs",
  "",
  "| URL | Chain | Final | Console errors (4 variants) |",
  "| --- | --- | --- | --- |",
  ...routes.map((r) => `| ${r.url} | ${r.hops.map((h) => h.status).join(" → ")} | ${r.status} | ${Object.values(r.console).reduce((n, e) => n + e.length, 0)} |`),
  "",
  "## External links",
  "",
  "| URL | Status | First seen on |",
  "| --- | --- | --- |",
  ...externals.map((e) => `| ${e.href} | ${e.status} | ${e.from} |`),
  "",
].join("\n");
writeFileSync(resolve(OUT, "crawl.md"), md);
console.log(`crawl: ${routes.length} internal, ${externals.length} external, ${failures.length} failures → ${OUT}`);
process.exit(failures.length ? 1 : 0);
