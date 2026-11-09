import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { PENDING_MSG, TESTNET_PENDING, prime } from "./helpers";

// P1 surfaces (WO-12). Read-only: no wallet, no writes.
test.describe("P1 read-only surfaces", () => {
  test.beforeEach(async ({ page }) => prime(page, "dark"));

  test("quote form offers 7 d / 30 d notice presets", async ({ page }) => {
    await page.goto("/quote/new");
    test.skip(TESTNET_PENDING, PENDING_MSG);
    await expect(page.getByRole("radio", { name: "7 d" }).or(page.getByRole("button", { name: "7 d" })).first()).toBeVisible();
    await expect(page.getByRole("radio", { name: "30 d" }).or(page.getByRole("button", { name: "30 d" })).first()).toBeVisible();
  });

  test("feed shows oracle badge, no 1Click route for NVDAx, settlement history", async ({ page }) => {
    test.skip(TESTNET_PENDING, PENDING_MSG);
    // NVDAx route status is sampled by the Feed API (/api/oneclick), not hard-coded: serve a fixture of that shape.
    const body = readFileSync(resolve(import.meta.dirname, "fixtures/oneclick.json"), "utf8");
    await page.route("**/api/indexer/api/oneclick", (r) => r.fulfill({ status: 200, contentType: "application/json", body }));
    await page.goto("/feed");
    await expect(page.getByText("no 1Click route").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^(owner|Pyth) · \d+s · /).first()).toBeVisible();
    await expect(page.getByText(/P0 static pricing|OutLayer quoter/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Settlement history" })).toBeVisible();
    await expect(page.getByText(/Indexer not connected|Feed API unavailable|Recent pre-liquidation settlements|No settlements yet/).first()).toBeVisible({ timeout: 10_000 });
  });

  test("console exposes owner forms read-only with payload preview", async ({ page }) => {
    test.skip(TESTNET_PENDING, PENDING_MSG);
    await page.goto("/console");
    await expect(page.getByText("Owner actions · quoter and oracle")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Use owner oracle" })).toBeDisabled();
    await page.getByText("Payload: set_oracle_source").click();
    await expect(page.locator("pre").filter({ hasText: '"source": "Owner"' })).toBeVisible();
    await page.getByLabel("vol_bps for NVDAx").fill("4500");
    await expect(page.getByText("Payload: set_vol_bps")).toBeVisible();
  });

  test("keepers page shows triggers section and run-a-keeper snippet", async ({ page }) => {
    await page.goto("/keepers");
    await expect(page.getByRole("heading", { name: /Last triggers/ })).toBeVisible();
    await expect(page.getByText("pnpm --filter keeper start", { exact: false })).toBeVisible();
  });

  test("indexer proxy only passes documented paths", async ({ request }) => {
    expect((await request.get("/api/indexer/admin")).status()).toBe(404);
    expect([200, 502, 503]).toContain((await request.get("/api/indexer/api/settlements?limit=5")).status());
    expect([200, 502, 503]).toContain((await request.get("/api/indexer/api/oneclick")).status());
  });
});
