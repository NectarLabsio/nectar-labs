import { expect, test } from "@playwright/test";

// WO-42a (review 2): security headers and /api request guards against the production build. API-only, so desktop project only.
test.describe("hardening", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "HTTP-level checks, viewport-independent"));

  test("pages carry X-Frame-Options, HSTS and a CSP with frame-ancestors/object-src/base-uri/form-action", async ({ request }) => {
    const r = await request.get("/");
    const h = r.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["strict-transport-security"]).toMatch(/max-age=\d+/);
    const csp = h["content-security-policy"] ?? "";
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) expect(csp).toContain(d);
  });

  test("/api/copilot refuses cross-origin, non-JSON and oversized bodies before doing any work", async ({ request, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const cross = await request.post("/api/copilot", { headers: { "content-type": "application/json", origin: "https://evil.example", "sec-fetch-site": "cross-site" }, data: '{"fixture":true}' });
    expect(cross.status()).toBe(403);
    const noHeaders = await request.post("/api/copilot", { headers: { "content-type": "application/json" }, data: '{"fixture":true}' });
    expect(noHeaders.status()).toBe(403);
    const plain = await request.post("/api/copilot", { headers: { "content-type": "text/plain", origin }, data: '{"fixture":true}' });
    expect(plain.status()).toBe(415);
    const big = await request.post("/api/copilot", { headers: { "content-type": "application/json", origin }, data: JSON.stringify({ nonce: "ab".repeat(32), notes: "x".repeat(9000) }) });
    expect(big.status()).toBe(413);
  });

  test("/api/indexer refuses '.' and '..' id segments", async ({ request }) => {
    for (const p of ["/api/indexer/api/note/%2E%2E", "/api/indexer/api/note/%2E", "/api/indexer/api/asset/%2E%2E"]) expect((await request.get(p)).status(), p).toBe(404);
  });

  test("/api/health answers with an age and reuses a fresh read", async ({ request }) => {
    const a = (await (await request.get("/api/health")).json()) as { deployed: boolean; as_of?: string; error?: string };
    test.skip(!a.deployed, "no core deployed in config");
    const b = (await (await request.get("/api/health")).json()) as { as_of?: string };
    expect(b.as_of).toBe(a.as_of);
    if (a.error) expect(a.error).toBe("RPC read failed");
  });

  // GATE_FAIL_G3B_R2: Next's router dropped the JSON answer to an RSC prefetch unread, so Chrome never finished the fetch.
  test("/api/health answers a router (RSC) prefetch with an empty 204", async ({ request }) => {
    const r = await request.get("/api/health", { headers: { rsc: "1", "next-router-prefetch": "1", "next-router-segment-prefetch": "/_tree" } });
    expect(r.status()).toBe(204);
    expect((await r.body()).byteLength).toBe(0);
  });

  test("the footer Status link opens the /status page, /api/health is never RSC-prefetched, and /borrow reaches networkidle", async ({ page }) => {
    const prefetches: string[] = [];
    page.on("request", (q) => {
      if (q.url().includes("/api/health") && q.headers()["rsc"]) prefetches.push(q.url());
    });
    await page.goto("/borrow");
    const status = page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Status", exact: true });
    await status.scrollIntoViewIfNeeded();
    await expect(status).toHaveAttribute("href", "/status");
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    expect(prefetches).toEqual([]);
  });
});
