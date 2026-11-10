import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { noHorizontalScroll, prime } from "./helpers";

// WO-12b: /feed renders the Feed API's GET /api/oneclick (WO-11c §3). The browser call to the same-origin proxy is intercepted
// with a fixture of that shape, so this spec needs neither a running feed nor live 1Click sampling.
const FIXTURE = readFileSync(resolve(import.meta.dirname, "fixtures/oneclick.json"), "utf8");
const ONECLICK = "**/api/indexer/api/oneclick";

test.describe("1Click reference depth on /feed", () => {
  test.beforeEach(async ({ page }) => prime(page, "dark"));

  test("renders pair samples, signature status and NVDAx route status from the API", async ({ page }) => {
    await page.route(ONECLICK, (r) => r.fulfill({ status: 200, contentType: "application/json", body: FIXTURE }));
    await page.goto("/feed");
    const panel = page.locator("section", { has: page.getByRole("heading", { name: "1Click reference depth" }) });
    await expect(panel.getByText("WNEAR → USDC", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText("signature verified")).toBeVisible();
    await expect(panel.getByText("2026-11-10 09:00 UTC")).toBeVisible();
    const table = panel.getByRole("table", { name: /1Click dry quotes for WNEAR → USDC/ });
    await expect(table.getByRole("row")).toHaveCount(4);
    for (const m of ["0.5×", "1×", "2×"]) await expect(table.getByText(m, { exact: true })).toBeVisible();
    await expect(table.getByText("2.85", { exact: true })).toBeVisible();
    await expect(table.getByText("2.84145", { exact: true })).toBeVisible();
    await expect(table.getByText("0.3 %", { exact: true })).toBeVisible();
    await expect(table.getByText("0.79 %", { exact: true })).toBeVisible();
    await expect(panel.locator(".kv", { hasText: "NVDAx" }).getByText("no 1Click route")).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
  });

  test("shows '1Click data unavailable' and no route badge when the API is unreachable", async ({ page }) => {
    await page.route(ONECLICK, (r) =>
      r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ configured: true, error: "Feed API unreachable: fixture" }) }),
    );
    await page.goto("/feed");
    await expect(page.getByText("1Click data unavailable")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("signature verified")).toHaveCount(0);
    await expect(page.getByText("no 1Click route")).toHaveCount(0);
  });

  test("Feed indexer not configured: one notice with the docs link, no 5xx fetches (also with a mocked unset indexer)", async ({ page }) => {
    // Answer the proxy as a server without NEXT_PUBLIC_FEED_URL does, so this holds whether or not the build has a Feed URL.
    const unset = JSON.stringify({ configured: false, error: "Feed indexer not configured" });
    await page.route("**/api/indexer/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: unset }));
    const bad: string[] = [];
    page.on("response", (r) => {
      if (r.status() >= 500) bad.push(`${r.status()} ${r.url()}`);
    });
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /\b50\d\b/.test(m.text())) consoleErrors.push(m.text());
    });
    await page.goto("/feed");
    const panel = page.locator("section", { has: page.getByRole("heading", { name: "1Click reference depth" }) });
    await expect(panel.getByText("Feed indexer not configured")).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByRole("link", { name: "Feed API docs" })).toHaveAttribute("href", /feed-rest|\/docs$/);
    await expect(panel.getByText("1Click data unavailable")).toHaveCount(0);
    await expect(page.getByText("Feed indexer not configured")).toHaveCount(2); // 1Click panel + settlement history
    expect(bad).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the proxy itself answers 200 configured:false when the build has no Feed URL", async ({ request }) => {
    const r = await request.get("/api/indexer/api/oneclick");
    const body = (await r.json()) as { configured?: boolean };
    test.skip(body.configured !== false, "this build has NEXT_PUBLIC_FEED_URL set");
    expect(r.status()).toBe(200);
  });

  test("empty pair list is stated, not faked", async ({ page }) => {
    await page.route(ONECLICK, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ as_of: "2026-11-10T09:00:00Z", pairs: [], assets: [] }) }),
    );
    await page.goto("/feed");
    await expect(page.getByText("No verified 1Click sample sets yet.", { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("no 1Click route")).toHaveCount(0);
  });
});
