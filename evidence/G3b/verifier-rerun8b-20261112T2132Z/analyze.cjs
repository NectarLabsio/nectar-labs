// G3b run 8b: summarize crawl.json (polite + fast) and hydration probe outputs.
const fs = require("fs");
const EV = "/tmp/verify-G3b-r8b-20261112T2132Z.ev";
for (const name of ["crawl", "crawl-fast"]) {
  const j = JSON.parse(fs.readFileSync(`${EV}/${name}/crawl.json`, "utf8"));
  const red = j.redirects;
  console.log(`== ${name}: generated ${j.generated} politeness ${JSON.stringify(j.politeness)} docsOwnOrigin ${j.docsOwnOrigin}`);
  console.log(`internalHosts ${JSON.stringify(j.internalHosts)}`);
  console.log(`pagesPerHost ${JSON.stringify(j.pagesPerHost)} routes ${j.routes.length} sameAs ${j.routes.filter((r) => r.sameAs).length} truncated ${j.truncated}`);
  console.log(`docsSitemap urls ${j.docsSitemap.urls} notLinked ${j.docsSitemap.notLinked.length} ${j.docsSitemap.notLinked.join(" ")}`);
  console.log(`redirects ${red.length}, ok ${red.filter((r) => r.ok).length}`);
  if (name === "crawl") for (const r of red) console.log(`  ${r.ok ? "ok" : "NO"} ${r.label} | ${r.host} -> ${r.status} ${r.location ?? ""}`);
  const nonRendered = j.routes.filter((r) => !r.host && !r.sameAs);
  console.log(`routes not rendered (non-200 or external final): ${nonRendered.length} ${nonRendered.map((r) => `${r.url}=${r.status}`).join(" ")}`);
  const ext = j.externals;
  const bad = ext.filter((e) => !e.ok);
  console.log(`externals ${ext.length}, ok ${ext.filter((e) => e.ok).length}, soft ${ext.filter((e) => e.note && e.note.startsWith("bot")).length}, local ${ext.filter((e) => e.status === null).length}, bad ${bad.length}`);
  console.log(`failures ${j.failures.length} ourConsoleErrors ${j.ourConsoleErrors} warnings ${j.warnings.length}: ${j.warnings.map((w) => `${w.kind} ${w.where}`).join(" ; ").slice(0, 900)}`);
  const tp = j.thirdPartyNetworkFailures;
  const kinds = {};
  for (const t of tp) for (const d of t.detail) { const k = d.replace(/\(.*$/, "").replace(/\/[^ ]*$/, "").slice(0, 90); kinds[k] = (kinds[k] || 0) + 1; }
  console.log(`thirdParty page loads ${tp.length}; kinds ${JSON.stringify(kinds).slice(0, 700)}`);
  const hyd = j.routes.flatMap((r) => Object.values(r.console).flat()).filter((t) => /418|hydrat/i.test(t));
  console.log(`hydration-like console texts in crawl: ${hyd.length}`);
}
for (const name of ["hydration-plain", "hydration-crawlstyle", "hydration-plain-2"]) {
  const j = JSON.parse(fs.readFileSync(`${EV}/${name}.json`, "utf8"));
  const s = j.summary;
  const texts = j.loads.flatMap((l) => l.consoleErrors.map((c) => c.text));
  const cls = {};
  for (const t of texts) {
    let k = "OTHER: " + t.slice(0, 160);
    const cors = /^Access to fetch at '([^']+)'.*blocked by CORS policy/.exec(t);
    if (cors) k = `CORS refusal of ${new URL(cors[1]).host}`;
    else if (/^Failed to load resource/.test(t)) k = `Failed to load resource: ${t.slice(30, 110)}`;
    cls[k] = (cls[k] || 0) + 1;
  }
  const failAt = {};
  for (const l of j.loads) for (const c of l.consoleErrors) if (/^Failed to load resource/.test(c.text)) { const h = c.at ? new URL(c.at.replace(/:\d+:\d+$/, "")).host : "?"; failAt[h] = (failAt[h] || 0) + 1; }
  console.log(`== ${name}: loads ${s.loads} hydration ${s.hydrationErrors} consoleErrors ${s.consoleErrors} pageErrors ${s.pageErrors} navFail ${s.navFailures} at ${s.at}`);
  console.log(`  byTarget ${JSON.stringify(s.byTarget)}`);
  console.log(`  console classes ${JSON.stringify(cls)}`);
  console.log(`  failed-load hosts ${JSON.stringify(failAt)}`);
  const ms = j.loads.map((l) => l.ms);
  console.log(`  ms min ${Math.min(...ms)} max ${Math.max(...ms)}`);
}
