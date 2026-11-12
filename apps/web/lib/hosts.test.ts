import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalOrigin, docsUrl, hostKind, parseLegacyHosts, readHosts, route, type Hosts, type Route } from "./hosts.ts";

// WO-62b route() table. Example hosts only (*.nectar.test, *.example.dev); the real legacy list lives in the Vercel env.
const SITE = "https://site.nectar.test";
const APP = "https://app.nectar.test";
const DOCS = "https://docs.nectar.test";
const STATUS = "https://status.nectar.test";
const LEGACY = "old-site.example.dev=site, OLD-APP.example.dev=app,old-docs.example.dev=docs,old-status.example.dev=status";

const full = readHosts({ SITE_URL: SITE, APP_URL: APP, DOCS_URL: DOCS, STATUS_URL: STATUS, LEGACY_HOSTS: LEGACY })!;
const twoHost = readHosts({ SITE_URL: SITE, APP_URL: APP })!;

const next: Route = { kind: "next" };
const r308 = (location: string): Route => ({ kind: "redirect", status: 308, location });

function table(h: Hosts | null, rows: Array<[host: string, pathAndQuery: string, want: Route]>) {
  for (const [host, pq, want] of rows) {
    const i = pq.indexOf("?");
    const [path, search] = i < 0 ? [pq, ""] : [pq.slice(0, i), pq.slice(i)];
    assert.deepEqual(route(h, host, path, search), want, `${host}${pq}`);
  }
}

test("readHosts: local mode, two-host mode, full mode", () => {
  assert.equal(readHosts({}), null);
  assert.equal(readHosts({ SITE_URL: SITE }), null);
  assert.equal(readHosts({ SITE_URL: SITE, APP_URL: SITE }), null);
  assert.equal(readHosts({ SITE_URL: "ftp://x", APP_URL: APP }), null);
  assert.equal(twoHost.status, null);
  assert.equal(twoHost.docs, null);
  assert.equal(twoHost.legacy.size, 0);
  assert.equal(full.status, STATUS);
  assert.equal(full.statusHost, "status.nectar.test");
  assert.equal(full.docs, DOCS);
  // STATUS_URL / DOCS_URL that collide with SITE or APP are ignored.
  const clash = readHosts({ SITE_URL: SITE, APP_URL: APP, STATUS_URL: APP, DOCS_URL: SITE })!;
  assert.equal(clash.status, null);
  assert.equal(clash.docs, null);
});

test("docsUrl: DOCS_URL without trailing slash, no APP_URL fallback", () => {
  assert.equal(docsUrl({ DOCS_URL: `${DOCS}/` }), DOCS);
  assert.equal(docsUrl({ APP_URL: APP }), "");
  assert.equal(docsUrl({ DOCS_URL: "not a url" }), "");
});

test("parseLegacyHosts: kinds, case, unset targets, canonical hosts and junk dropped", () => {
  assert.deepEqual(
    [...full.legacy.entries()],
    [
      ["old-site.example.dev", SITE],
      ["old-app.example.dev", APP],
      ["old-docs.example.dev", DOCS],
      ["old-status.example.dev", STATUS],
    ],
  );
  const m = parseLegacyHosts("a.example.dev=status,b.example.dev=docs,site.nectar.test=app,c.example.dev=nope,bad host=app,=app,d.example.dev", { site: SITE, app: APP, status: null, docs: null });
  assert.equal(m.size, 0);
});

test("local mode: everything is served as-is", () => {
  table(null, [
    ["localhost:3100", "/", next],
    ["localhost:3100", "/status", next],
    ["localhost:3100", "/docs/integrate/sdk", next],
    ["old-app.example.dev", "/feed", next],
  ]);
  assert.equal(canonicalOrigin(null, "/feed"), null);
});

test("www.<site> → SITE (301), path and query kept", () => {
  table(full, [["www.site.nectar.test", "/feed?x=1", { kind: "redirect", status: 301, location: `${SITE}/feed?x=1` }]]);
});

test("legacy hosts → their origin (308), same path + query, before any other rule", () => {
  table(full, [
    ["old-site.example.dev", "/about?ref=x", r308(`${SITE}/about?ref=x`)],
    ["old-site.example.dev", "/feed", r308(`${SITE}/feed`)],
    ["old-app.example.dev", "/", r308(`${APP}/`)],
    ["old-app.example.dev", "/position/7?tab=a", r308(`${APP}/position/7?tab=a`)],
    ["Old-App.example.dev", "/api/health", r308(`${APP}/api/health`)],
    ["old-docs.example.dev", "/docs/integrate/sdk", r308(`${DOCS}/docs/integrate/sdk`)],
    ["old-status.example.dev", "/", r308(`${STATUS}/`)],
  ]);
  // Not listed: served as-is (preview deployments).
  table(full, [["preview-123.example.dev", "/feed", next]]);
});

test("docs: SITE, APP and STATUS /docs[/<rest>] → DOCS root (308), prefix dropped, query kept", () => {
  for (const host of ["site.nectar.test", "app.nectar.test", "status.nectar.test"]) {
    table(full, [
      [host, "/docs", r308(`${DOCS}/`)],
      [host, "/docs/", r308(`${DOCS}/`)],
      [host, "/docs/integrate/sdk?x=1", r308(`${DOCS}/integrate/sdk?x=1`)],
      [host, "/docs/security/audits", r308(`${DOCS}/security/audits`)],
    ]);
  }
  // /docsearch is not a docs path.
  table(full, [["app.nectar.test", "/docsearch", next]]);
  // Hosted without DOCS_URL: /docs is an app route (in-app explainer), SITE sends it to APP.
  table(twoHost, [
    ["app.nectar.test", "/docs/integrate/sdk", next],
    ["site.nectar.test", "/docs", r308(`${APP}/docs`)],
  ]);
});

test("status host: / serves the status page, /status → /, other paths → their canonical host", () => {
  table(full, [
    ["status.nectar.test", "/", { kind: "rewrite", path: "/status" }],
    ["status.nectar.test", "/?ref=x", { kind: "rewrite", path: "/status" }],
    ["status.nectar.test", "/status?ref=x", r308(`${STATUS}/?ref=x`)],
    ["status.nectar.test", "/about", r308(`${SITE}/about`)],
    ["status.nectar.test", "/legal/privacy", r308(`${SITE}/legal/privacy`)],
    ["status.nectar.test", "/feed?x=1", r308(`${APP}/feed?x=1`)],
    ["status.nectar.test", "/position/7", r308(`${APP}/position/7`)],
    // Shared paths are served on the status host too (the page reads /api/health and /api/indexer/health same-origin).
    ["status.nectar.test", "/api/health", next],
    ["status.nectar.test", "/api/indexer/health", next],
    ["status.nectar.test", "/_next/data/x.json", next],
    ["status.nectar.test", "/robots.txt", next],
    ["status.nectar.test", "/sitemap.xml", next],
    ["status.nectar.test", "/brand/mark.svg", next],
  ]);
});

test("SITE and APP /status → STATUS root (308) when STATUS_URL is set", () => {
  table(full, [
    ["site.nectar.test", "/status", r308(`${STATUS}/`)],
    ["site.nectar.test", "/status?x=1", r308(`${STATUS}/?x=1`)],
    ["app.nectar.test", "/status", r308(`${STATUS}/`)],
  ]);
});

test("STATUS_URL unset: today's split (status on SITE)", () => {
  table(twoHost, [
    ["site.nectar.test", "/status", next],
    ["app.nectar.test", "/status", r308(`${SITE}/status`)],
    ["status.nectar.test", "/", next],
  ]);
});

test("two-host split unchanged", () => {
  for (const h of [full, twoHost]) {
    table(h, [
      ["app.nectar.test", "/?ref=a", { kind: "redirect", status: 307, location: `${APP}/feed?ref=a` }],
      ["site.nectar.test", "/", next],
      ["site.nectar.test", "/security", next],
      ["site.nectar.test", "/legal/terms", next],
      ["site.nectar.test", "/feed", r308(`${APP}/feed`)],
      ["site.nectar.test", "/borrow?asset=NVDAx", r308(`${APP}/borrow?asset=NVDAx`)],
      ["app.nectar.test", "/keepers", next],
      ["app.nectar.test", "/about", r308(`${SITE}/about`)],
      ["app.nectar.test", "/legal/privacy", r308(`${SITE}/legal/privacy`)],
      ["site.nectar.test", "/api/health", next],
      ["app.nectar.test", "/api/health", next],
      // First X-Forwarded-Host entry wins; case-insensitive.
      ["APP.nectar.test, proxy.internal", "/keepers", next],
    ]);
  }
});

test("canonicalOrigin and hostKind", () => {
  assert.equal(canonicalOrigin(full, "/status"), STATUS);
  assert.equal(canonicalOrigin(twoHost, "/status"), SITE);
  assert.equal(canonicalOrigin(full, "/about"), SITE);
  assert.equal(canonicalOrigin(full, "/feed"), APP);
  assert.equal(hostKind(full, "status.nectar.test"), "status");
  assert.equal(hostKind(full, "app.nectar.test"), "app");
  assert.equal(hostKind(full, "site.nectar.test"), "site");
  assert.equal(hostKind(twoHost, "status.nectar.test"), "site");
});
