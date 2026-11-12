import { request as httpRequest } from "node:http";
import { expect, test } from "@playwright/test";

// WO-34a / WO-62b host routing, no network: run against `next start` with the hosted env set to example hosts, e.g.
//   SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test DOCS_URL=https://docs.nectar.test \
//   STATUS_URL=https://status.nectar.test LEGACY_HOSTS=old-site.example.dev=site,old-app.example.dev=app npx next build && … next start -p 3613
//   E2E_HOSTED=1 E2E_BASE_URL=http://localhost:3613 npx playwright test e2e/hosts.spec.ts --project=desktop
// The Host header is set per request (node:http; no redirect following). Skipped in the local-mode suite.
// Other origins (e.g. http://site.localhost:3613 for the browser check, which Chrome resolves): E2E_SITE_URL, E2E_APP_URL,
// E2E_DOCS_URL, E2E_STATUS_URL, E2E_LEGACY_HOST (`host=kind`, must be listed in LEGACY_HOSTS) — same values as the server env.
const SITE = process.env.E2E_SITE_URL ?? "https://site.nectar.test";
const APP = process.env.E2E_APP_URL ?? "https://app.nectar.test";
const DOCS = process.env.E2E_DOCS_URL ?? "https://docs.nectar.test";
const STATUS = process.env.E2E_STATUS_URL ?? "https://status.nectar.test";
const [LEGACY_HOST, LEGACY_KIND] = (process.env.E2E_LEGACY_HOST ?? "old-app.example.dev=app").split("=") as [string, string];
const LEGACY_TARGET = ({ site: SITE, app: APP, docs: DOCS, status: STATUS } as Record<string, string>)[LEGACY_KIND] ?? APP;
const host = (origin: string): string => new URL(origin).host;
const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3100");

function hit(origin: string, path: string): Promise<{ status: number; location: string | null; body: string }> {
  return hitHost(host(origin), path);
}

function hitHost(hostHeader: string, path: string): Promise<{ status: number; location: string | null; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: base.hostname, port: base.port, path, method: "GET", headers: { host: hostHeader } }, (res) => {
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
  test.skip(process.env.E2E_HOSTED !== "1", "needs next start with the hosted env set (see header)");
  test.skip(({ isMobile }) => isMobile, "HTTP-only checks: desktop project is enough");

  test("www.<site> → SITE with 301, path and query kept", async () => {
    const r = await hitHost(`www.${host(SITE)}`, "/feed?x=1");
    expect(r.status).toBe(301);
    expect(r.location).toBe(`${SITE}/feed?x=1`);
  });

  test("APP / → /feed", async () => {
    const r = await hit(APP, "/?ref=a");
    expect(r.status).toBe(307);
    expect(r.location).toBe(`${APP}/feed?ref=a`);
  });

  test("app routes on SITE → APP with 308", async () => {
    for (const p of ["/feed", "/borrow?asset=NVDAx", "/position/7"]) {
      const r = await hit(SITE, p);
      expect(r.status, p).toBe(308);
      expect(r.location, p).toBe(`${APP}${p}`);
    }
  });

  test("landing-only routes on APP → SITE with 308", async () => {
    for (const p of ["/about", "/legal/privacy", "/security?x=1", "/changelog", "/brand", "/talk"]) {
      const r = await hit(APP, p);
      expect(r.status, p).toBe(308);
      expect(r.location, p).toBe(`${SITE}${p}`);
    }
  });

  test("/docs and /docs/<rest> on SITE, APP and STATUS → DOCS root with 308, prefix dropped, query kept", async () => {
    for (const origin of [SITE, APP, STATUS]) {
      const root = await hit(origin, "/docs");
      expect(root.status, `${origin}/docs`).toBe(308);
      expect(root.location).toBe(`${DOCS}/`);
      const page = await hit(origin, "/docs/integrate/sdk?x=1");
      expect(page.status, `${origin}/docs/integrate/sdk`).toBe(308);
      expect(page.location).toBe(`${DOCS}/integrate/sdk?x=1`);
    }
  });

  test("STATUS / serves the status page; /status anywhere → STATUS / with 308", async () => {
    const r = await hit(STATUS, "/");
    expect(r.status).toBe(200);
    expect(r.body).toMatch(/<h1[^>]*>Status<\/h1>/);
    // The app shell, not the landing nav: links leave the status host as absolute URLs, the footer "Status" link stays on "/".
    expect(r.body).toContain(`href="${APP}/feed"`);
    expect(r.body).toContain(`href="${SITE}/about"`);
    expect(r.body).toContain(`href="${DOCS}/`);
    for (const origin of [SITE, APP, STATUS]) {
      const s = await hit(origin, "/status?x=1");
      expect(s.status, `${origin}/status`).toBe(308);
      expect(s.location).toBe(`${STATUS}/?x=1`);
    }
  });

  test("other paths on STATUS → their canonical host with 308; shared paths served", async () => {
    for (const [p, to] of [["/about", SITE], ["/legal/terms", SITE], ["/feed?x=1", APP], ["/position/7", APP]] as const) {
      const r = await hit(STATUS, p);
      expect(r.status, p).toBe(308);
      expect(r.location, p).toBe(`${to}${p}`);
    }
    expect([200, 502]).toContain((await hit(STATUS, "/api/health")).status);
    expect((await hit(STATUS, "/brand/mark.svg")).status).toBe(200);
  });

  test("legacy host → its canonical origin with 308, same path and query", async () => {
    for (const p of ["/feed?x=1", "/about", "/"]) {
      const r = await hitHost(LEGACY_HOST, p);
      expect(r.status, p).toBe(308);
      expect(r.location, p).toBe(`${LEGACY_TARGET}${p}`);
    }
  });

  test("each host serves its own routes; /api serves on all", async () => {
    expect((await hit(SITE, "/")).status).toBe(200);
    expect((await hit(SITE, "/security")).status).toBe(200);
    expect((await hit(APP, "/keepers")).status).toBe(200);
    for (const o of [SITE, APP, STATUS]) expect([200, 502]).toContain((await hit(o, "/api/health")).status);
  });

  test("per-host robots, sitemap, canonical and og:url", async () => {
    const siteRobots = (await hit(SITE, "/robots.txt")).body;
    expect(siteRobots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    const appRobots = (await hit(APP, "/robots.txt")).body;
    expect(appRobots).toContain(`Sitemap: ${APP}/sitemap.xml`);
    expect(appRobots).not.toContain("/docs/");
    const statusRobots = (await hit(STATUS, "/robots.txt")).body;
    expect(statusRobots).toContain(`Sitemap: ${STATUS}/sitemap.xml`);
    const siteMap = (await hit(SITE, "/sitemap.xml")).body;
    expect(siteMap).toContain(`${SITE}/security`);
    expect(siteMap).not.toContain(`${SITE}/feed`);
    expect(siteMap).not.toContain("/status<");
    const appMap = (await hit(APP, "/sitemap.xml")).body;
    expect(appMap).toContain(`${APP}/feed`);
    expect(appMap).not.toContain("/security");
    const statusMap = (await hit(STATUS, "/sitemap.xml")).body;
    expect(statusMap).toContain(`<loc>${STATUS}/</loc>`);
    expect(statusMap).not.toContain("/feed");
    const keepers = (await hit(APP, "/keepers")).body;
    expect(keepers).toContain(`<link rel="canonical" href="${APP}/keepers"`);
    expect(keepers).toContain(`<meta property="og:url" content="${APP}/keepers"`);
    const security = (await hit(SITE, "/security")).body;
    expect(security).toContain(`<link rel="canonical" href="${SITE}/security"`);
    expect(security).toContain(`<meta property="og:url" content="${SITE}/security"`);
    const status = (await hit(STATUS, "/")).body;
    expect(status).toContain(`<link rel="canonical" href="${STATUS}"`);
    expect(status).toContain(`<meta property="og:url" content="${STATUS}"`);
  });

  // Browser check (needs origins Chrome can reach, e.g. E2E_*_URL=http://<name>.localhost:<port>, and E2E_HOSTED_BROWSER=1): the
  // status page hydrates on the status host without a mismatch (usePagePath maps the browser's `/` back to /status).
  test("status host hydrates with the app shell and no console errors", async ({ page }) => {
    test.skip(process.env.E2E_HOSTED_BROWSER !== "1", "needs browser-reachable origins (see comment)");
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${STATUS}/`);
    await expect(page.getByRole("heading", { level: 1, name: "Status" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Markets" })).toHaveAttribute("href", `${APP}/feed`);
    await page.waitForTimeout(1500);
    expect(errors.filter((e) => /hydrat|did not match|Minified React error #418/i.test(e))).toEqual([]);
  });
});
