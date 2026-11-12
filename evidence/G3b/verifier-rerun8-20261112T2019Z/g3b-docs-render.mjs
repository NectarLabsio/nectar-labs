// G3b run 8 (d) supplement: crawl.mjs treats the DOCS host as external (internal = SITE + APP only), so with docs at the root it renders
// no docs page. This renders every docs sitemap page at <docs>/<path> in real Chrome (dark@1440, light@400) and records console errors,
// page errors, failed same-origin requests and the Docusaurus "did not load properly" banner. Read-only.
// Usage (from apps/web): node g3b-docs-render.mjs <sitemap.xml> <docsOrigin> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [, , SITEMAP, DOCS, OUT] = process.argv;
const paths = [...readFileSync(SITEMAP, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
const browser = await chromium.launch({ channel: "chrome" });
const variants = [{ theme: "dark", width: 1440, height: 900 }, { theme: "light", width: 400, height: 860 }];
const res = { docs: DOCS, pages: paths.length, variants: variants.map((v) => `${v.theme}@${v.width}`), loads: 0, problems: [] };
for (const v of variants) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, v.theme);
  for (const p of paths) {
    const page = await ctx.newPage();
    const errs = [];
    const docsHost = new URL(DOCS).host;
    page.on("console", (m) => { if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 200)}`); });
    page.on("pageerror", (e) => errs.push(`pageerror: ${String(e.message).slice(0, 200)}`));
    page.on("response", (r) => { try { const u = new URL(r.url()); if (u.host === docsHost && r.status() >= 400) errs.push(`HTTP ${r.status()} ${u.pathname}`); } catch {} });
    page.on("requestfailed", (r) => { try { const u = new URL(r.url()); if (u.host === docsHost) errs.push(`requestfailed ${u.pathname}`); } catch {} });
    const resp = await page.goto(`${DOCS}${p}`, { waitUntil: "load", timeout: 30_000 }).catch((e) => { errs.push(`navigation: ${String(e.message).slice(0, 150)}`); return null; });
    await page.waitForTimeout(400);
    const banner = await page.getByText("did not load properly").count();
    if (banner) errs.push("docusaurus 'did not load properly' banner");
    if (resp && resp.status() !== 200) errs.push(`status ${resp.status()}`);
    res.loads++;
    if (errs.length) res.problems.push({ path: p, variant: `${v.theme}@${v.width}`, errs });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
writeFileSync(OUT, JSON.stringify(res, null, 2));
console.log(`docs render: ${res.pages} pages × ${variants.length} variants = ${res.loads} loads; pages with problems: ${res.problems.length}`);
for (const x of res.problems.slice(0, 15)) console.log(`  ${x.path} [${x.variant}] ${x.errs.join(" | ").slice(0, 300)}`);
process.exitCode = res.problems.length ? 1 : 0;
