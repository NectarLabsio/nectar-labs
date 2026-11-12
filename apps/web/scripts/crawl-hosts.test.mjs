// node --test apps/web/scripts/crawl-hosts.test.mjs — the crawl's host plan (WO-62d) against lib/hosts.ts routing (WO-62b).
import assert from "node:assert/strict";
import { test } from "node:test";
import { hostPlan, parseLegacy, sitemapUrls } from "./crawl-hosts.mjs";

const SITE = "http://site.localhost:3982";
const APP = "http://app.localhost:3982";
const DOCS = "http://docs.localhost:3984";
const STATUS = "http://status.localhost:3982";
const byLabel = (plan, re) => plan.redirects.filter((r) => re.test(r.label));

test("hosted, five values: DOCS and STATUS are internal hosts and seeds", () => {
  const p = hostPlan({ site: `${SITE}/`, app: APP, docs: `${DOCS}/`, status: STATUS, legacy: "old-site.localhost:3982=site,old-app.localhost:3982=app" });
  assert.equal(p.docsOwnOrigin, true);
  assert.deepEqual([...p.hosts], [["site.localhost:3982", "site"], ["app.localhost:3982", "app"], ["status.localhost:3982", "status"], ["docs.localhost:3984", "docs"]]);
  assert.deepEqual(p.seeds, [`${SITE}/`, `${APP}/feed`, `${DOCS}/`, `${STATUS}/`]);
});

test("hosted: /docs/<rest> on SITE, APP and STATUS → DOCS/<rest> (prefix dropped), never APP/docs", () => {
  const p = hostPlan({ site: SITE, app: APP, docs: DOCS, status: STATUS });
  const docs = byLabel(p, /\/docs/);
  assert.deepEqual(
    docs.map((r) => [r.url, r.status, r.location]),
    [
      [`${SITE}/docs/security/audits`, 308, `${DOCS}/security/audits`],
      [`${APP}/docs/security/audits`, 308, `${DOCS}/security/audits`],
      [`${STATUS}/docs/security/audits`, 308, `${DOCS}/security/audits`],
      [`${SITE}/docs?x=1`, 308, `${DOCS}/?x=1`],
    ],
  );
  assert.ok(!p.redirects.some((r) => r.location.startsWith(`${APP}/docs`)));
});

test("hosted: status host routing and legacy hosts", () => {
  const p = hostPlan({ site: SITE, app: APP, docs: DOCS, status: STATUS, legacy: "old-site.localhost:3982=site,old-app.localhost:3982=app" });
  assert.deepEqual(
    byLabel(p, /STATUS/).filter((r) => !/docs/.test(r.label)).map((r) => [r.url, r.location]),
    [
      [`${SITE}/status?x=1`, `${STATUS}/?x=1`],
      [`${STATUS}/status`, `${STATUS}/`],
      [`${STATUS}/feed?x=1`, `${APP}/feed?x=1`],
      [`${STATUS}/about`, `${SITE}/about`],
    ],
  );
  assert.deepEqual(
    byLabel(p, /^legacy/).map((r) => [r.url, r.status, r.location]),
    [
      ["http://old-site.localhost:3982/about?y=2", 308, `${SITE}/about?y=2`],
      ["http://old-app.localhost:3982/feed?x=1", 308, `${APP}/feed?x=1`],
    ],
  );
  const www = byLabel(p, /^www/)[0];
  assert.equal(www?.host, "www.site.localhost:3982");
});

test("two hosts only (no DOCS_URL / STATUS_URL): WO-34a expectations, docs = APP/docs on the APP host", () => {
  const p = hostPlan({ site: SITE, app: APP });
  assert.equal(p.docsOwnOrigin, false);
  assert.equal(p.docs, `${APP}/docs`);
  assert.equal(p.status, null);
  assert.deepEqual([...p.hosts.values()], ["site", "app"]);
  assert.deepEqual(byLabel(p, /\/docs/).map((r) => r.location), [`${APP}/docs/security/audits`]);
  assert.equal(byLabel(p, /STATUS/).length, 0);
});

test("DOCS_URL or STATUS_URL on a taken host count as unset (readHosts)", () => {
  const p = hostPlan({ site: SITE, app: APP, docs: `${APP}/docs`, status: SITE });
  assert.equal(p.docsOwnOrigin, false);
  assert.equal(p.status, null);
  const q = hostPlan({ site: SITE, app: APP, docs: STATUS, status: STATUS });
  assert.equal(q.status, STATUS);
  assert.equal(q.docsOwnOrigin, false);
});

test("parseLegacy drops canonical hosts, unset targets, bad kinds and malformed hosts", () => {
  const out = parseLegacy("old.example.dev=app, app.localhost:3982=app,x.dev=docs,y.dev=wiki,bad host=site,z.dev=SITE", { site: SITE, app: APP, docs: null, status: null });
  assert.deepEqual(out, [
    { host: "old.example.dev", kind: "app", target: APP },
    { host: "z.dev", kind: "site", target: SITE },
  ]);
});

test("sitemapUrls re-bases another origin onto DOCS and keeps DOCS URLs", () => {
  const xml = `<urlset><url><loc>http://localhost:3000/security/audits</loc></url><url><loc>${DOCS}/integrate/sdk</loc></url><url><loc>http://localhost:3000/security/audits</loc></url><url><loc>mailto:x@y</loc></url></urlset>`;
  assert.deepEqual(sitemapUrls(xml, DOCS), [`${DOCS}/security/audits`, `${DOCS}/integrate/sdk`]);
});
