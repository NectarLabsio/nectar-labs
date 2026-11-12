// G3b run 8 (d) extra: docs served at the ROOT (serve-docs.mjs). Every page in the docs build sitemap at <docs>/<path> → 200 with no
// /docs/ prefix; every /assets/*.css|js and /img/* it references → 200; old /docs/<path> still resolves; and from SITE/APP/STATUS
// /docs/<path>?q → 308 → <docs>/<path>?q → 200. Usage: node docs-sweep.mjs <sitemap.xml> <docsOrigin> <site> <app> <status> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";

const [, , SITEMAP, DOCS, SITE, APP, STATUS, OUT] = process.argv;
const raw = (url) => new Promise((ok) => {
  const u = new URL(url);
  const r = request({ hostname: "localhost", port: u.port, path: `${u.pathname}${u.search}`, method: "GET", headers: { host: u.host } }, (res) => {
    let b = "";
    res.setEncoding("utf8");
    res.on("data", (c) => (b += c));
    res.on("end", () => ok({ status: res.statusCode, location: res.headers.location ?? null, body: b }));
  });
  r.on("error", (e) => ok({ status: 0, error: String(e) }));
  r.end();
});
const locs = [...readFileSync(SITEMAP, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
const out = { docs: DOCS, sitemapPages: locs.length, sitemapOrigins: [...new Set([...readFileSync(SITEMAP, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).origin))], pages: [], assets: {}, prefixed: [], redirects: [], failures: [] };
const assets = new Set();
for (const p of locs) {
  const r = await raw(`${DOCS}${p}`);
  out.pages.push({ path: p, status: r.status });
  if (p.startsWith("/docs/")) out.failures.push(`sitemap path keeps the /docs/ prefix: ${p}`);
  if (r.status !== 200) out.failures.push(`page ${p} → ${r.status}`);
  for (const m of r.body?.matchAll(/(?:href|src)="(\/(?:assets|img)\/[^"]+)"/g) ?? []) assets.add(m[1]);
  const docsHrefs = [...(r.body?.matchAll(/href="(\/docs\/[^"]*)"/g) ?? [])].map((m) => m[1]);
  if (docsHrefs.length) out.failures.push(`page ${p} links with the old /docs/ prefix: ${docsHrefs.slice(0, 3).join(", ")}`);
}
for (const a of assets) {
  const r = await raw(`${DOCS}${a}`);
  out.assets[a] = r.status;
  if (r.status !== 200) out.failures.push(`asset ${a} → ${r.status}`);
}
for (const p of ["/docs", "/docs/", "/docs/start/quick-start", "/docs/integrate/sdk"]) {
  const r = await raw(`${DOCS}${p}`);
  out.prefixed.push({ path: p, status: r.status });
  if (r.status !== 200) out.failures.push(`old prefix ${p} → ${r.status}`);
}
for (const origin of [SITE, APP, STATUS]) {
  for (const p of ["/docs?x=1", "/docs/start/quick-start?x=1", "/docs/integrate/feed-rest"]) {
    const r = await raw(`${origin}${p}`);
    const want = `${DOCS}/${p.replace(/^\/docs\/?/, "").replace(/^\?/, "?")}`.replace(`${DOCS}/?`, `${DOCS}/?`);
    const f = r.location ? await raw(r.location) : { status: 0 };
    out.redirects.push({ from: `${origin}${p}`, status: r.status, location: r.location, want, final: f.status });
    if (r.status !== 308 || r.location !== want || f.status !== 200) out.failures.push(`${origin}${p} → ${r.status} ${r.location} (want 308 ${want}) → ${f.status}`);
  }
}
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`docs at root: ${locs.length} sitemap pages (origins ${out.sitemapOrigins.join(", ")}), ${assets.size} assets, ${out.prefixed.length} old-prefix paths, ${out.redirects.length} redirects; failures ${out.failures.length}`);
for (const f of out.failures.slice(0, 20)) console.log(`  FAIL ${f}`);
process.exitCode = out.failures.length ? 1 : 0;
