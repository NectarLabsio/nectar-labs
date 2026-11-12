import { request as httpRequest } from "node:http";
import { expect, test } from "@playwright/test";

// WO-34a host routing, no network: run against `next start` with SITE_URL / APP_URL set, e.g.
//   SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test DOCS_ORIGIN=https://docs.nectar.test npx next start -p 3613
//   E2E_HOSTED=1 E2E_BASE_URL=http://localhost:3613 npx playwright test e2e/hosts.spec.ts --project=desktop
// The Host header is set per request (node:http; no redirect following). Skipped in the local-mode suite.
const SITE = "site.nectar.test";
const APP = "app.nectar.test";
const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3100");

function hit(host: string, path: string): Promise<{ status: number; location: string | null; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: base.hostname, port: base.port, path, method: "GET", headers: { host } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, location: (res.headers.location as string | undefined) ?? null, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test.describe("host routing (hosted mode)", () => {
  test.skip(process.env.E2E_HOSTED !== "1", "needs next start with SITE_URL/APP_URL set (see header)");
  test.skip(({ isMobile }) => isMobile, "HTTP-only checks: desktop project is enough");

  test("www.<site> → SITE with 301, path and query kept", async () => {
    const r = await hit(`www.${SITE}`, "/feed?x=1");
    expect(r.status).toBe(301);
    expect(r.location).toBe(`https://${SITE}/feed?x=1`);
  });

  test("APP / → /feed", async () => {
    const r = await hit(APP, "/?ref=a");
    expect(r.status).toBe(307);
    expect(r.location).toBe(`https://${APP}/feed?ref=a`);
  });

  test("app routes on SITE → APP with 308", async () => {
    for (const p of ["/feed", "/borrow?asset=NVDAx", "/position/7", "/docs", "/docs/integrate/sdk"]) {
      const r = await hit(SITE, p);
      expect(r.status, p).toBe(308);
      expect(r.location, p).toBe(`https://${APP}${p}`);
    }
  });

  test("landing-only routes on APP → SITE with 308", async () => {
    for (const p of ["/about", "/legal/privacy", "/security?x=1", "/status", "/changelog", "/brand", "/talk"]) {
      const r = await hit(APP, p);
      expect(r.status, p).toBe(308);
      expect(r.location, p).toBe(`https://${SITE}${p}`);
    }
  });

  test("each host serves its own routes; /api serves on both", async () => {
    expect((await hit(SITE, "/")).status).toBe(200);
    expect((await hit(SITE, "/security")).status).toBe(200);
    expect((await hit(APP, "/keepers")).status).toBe(200);
    for (const h of [SITE, APP]) expect([200, 502]).toContain((await hit(h, "/api/health")).status);
  });

  test("per-host robots, sitemap and canonical", async () => {
    const siteRobots = (await hit(SITE, "/robots.txt")).body;
    expect(siteRobots).toContain(`Sitemap: https://${SITE}/sitemap.xml`);
    const appRobots = (await hit(APP, "/robots.txt")).body;
    expect(appRobots).toContain(`Sitemap: https://${APP}/docs/sitemap.xml`);
    const siteMap = (await hit(SITE, "/sitemap.xml")).body;
    expect(siteMap).toContain(`https://${SITE}/security`);
    expect(siteMap).not.toContain(`https://${SITE}/feed`);
    const appMap = (await hit(APP, "/sitemap.xml")).body;
    expect(appMap).toContain(`https://${APP}/feed`);
    expect(appMap).not.toContain("/security");
    expect((await hit(APP, "/keepers")).body).toContain(`<link rel="canonical" href="https://${APP}/keepers"`);
    expect((await hit(SITE, "/security")).body).toContain(`<link rel="canonical" href="https://${SITE}/security"`);
  });

  // WO-34t: APP /docs/* → DOCS_ORIGIN/docs/* with the prefix kept. Needs a reachable docs origin, e.g. DOCS_ORIGIN=http://localhost:3742
  // with `node scripts/serve-docs.mjs --port 3742` (it strips /docs exactly like the docs deployment's vercel.json), and E2E_DOCS=1.
  test("APP /docs/* proxies to the docs deployment with the /docs prefix kept", async () => {
    test.skip(process.env.E2E_DOCS !== "1", "needs DOCS_ORIGIN pointing at a running docs server (see comment)");
    for (const p of ["/docs", "/docs/"]) {
      const r = await hit(APP, p);
      expect(r.status, p).toBe(200);
      expect(r.body, p).toContain("<html");
    }
    const page = await hit(APP, "/docs/start/quick-start");
    expect(page.status).toBe(200);
    expect(page.body).toMatch(/<title[^>]*>[^<]*Quick start/i);
    const main = page.body.match(/\/docs\/assets\/js\/main\.[0-9a-f]+\.js/)?.[0];
    expect(main, "page references /docs/assets/js/main.<hash>.js").toBeTruthy();
    const js = await hit(APP, main ?? "/docs/assets/js/main.js");
    expect(js.status).toBe(200);
    expect(js.body.length).toBeGreaterThan(1000);
  });
});
