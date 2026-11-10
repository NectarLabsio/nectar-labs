import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PENDING_MSG, TESTNET_PENDING, config, prime } from "./helpers";

// WO-20: v7 P0 delta. Covers the v1 path (the live contract today) and a mocked v2 view fixture.
// features.* in packages/config/config.yaml are all false, so every v7 control must stay hidden on both paths.

const FIXTURE = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/v2-views.json"), "utf8")) as Record<string, unknown>;
const CORE = config.accounts.core;

/** Answer nectar-core view calls from the v2 fixture; everything else goes to the real testnet RPC. */
async function mockV2(page: Page) {
  await page.route("**/*fastnear.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    const body = req.postDataJSON() as { id: unknown; params?: { request_type?: string; account_id?: string; method_name?: string } } | null;
    const p = body?.params;
    if (p?.request_type === "call_function" && p.account_id === CORE && p.method_name && p.method_name in FIXTURE) {
      const bytes = Array.from(Buffer.from(JSON.stringify(FIXTURE[p.method_name])));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ jsonrpc: "2.0", id: body!.id, result: { result: bytes, logs: [], block_height: 1, block_hash: "11111111111111111111111111111111" } }),
      });
    }
    return route.continue();
  });
}

test.describe("landing v7", () => {
  test("hero, live card, how it works, FAQ, footer; no module sections while flags are off; copy rules", async ({ page }) => {
    await prime(page, "dark");
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Borrow against stocks without fire-sales" })).toBeVisible();
    await expect(page.getByTestId("live-limit-card")).toBeVisible();
    await expect(page.locator("#how")).toBeVisible();
    await expect(page.locator("#faq")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator("[data-feature]")).toHaveCount(0);
    const text = (await page.locator("body").innerText()).toLowerCase();
    expect(text).not.toContain("insurance");
    expect(text).not.toContain("without liquidations");
    expect(text).not.toContain("hackathon");
    expect(text).toContain("testnet");
    expect(text).toContain("mock collateral");
  });

  test("live card shows in-session vs weekend parameters from testnet", async ({ page }) => {
    test.skip(TESTNET_PENDING, PENDING_MSG);
    await prime(page, "dark");
    await page.goto("/");
    await expect(page.getByTestId("limit-in-session")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("limit-weekend")).toContainText("Weekend parameters");
    await expect(page.getByTestId("live-limit-card").getByTestId("session-badge")).toBeVisible();
  });
});

test.describe("v1 path (live contract)", () => {
  test.skip(TESTNET_PENDING, PENDING_MSG);
  test.beforeEach(async ({ page }) => prime(page, "dark"));

  test("feed equation card: live terms, canonical labels, session badge; no v2 aggregate rows", async ({ page }) => {
    await page.goto("/feed");
    const card = page.getByTestId("equation-card");
    await expect(card.getByTestId("eq-q")).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText("Nectar Reserve");
    await expect(card).toContainText("verified DEX depth");
    await expect(card.getByTestId("eq-h")).toContainText("bps");
    await expect(card.getByTestId("eq-total-debt")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: /Uplift/ })).toHaveCount(1);
    const badge = page.getByRole("table", { name: /exit capacity/i }).getByTestId("session-badge").first();
    await expect(badge).toContainText(/In session|Weekend parameters/);
    await expect(page.getByTestId("multiplier-line")).toHaveCount(0);
  });

  test("borrow: fee stack with total, no v7 controls even with ?ref=", async ({ page }) => {
    await page.goto(`/borrow?ref=agent1.nectar.testnet`);
    await page.getByLabel(/Collateral units/).fill("1");
    await page.getByLabel(/^Borrow/).fill("10");
    const fees = page.getByTestId("preview-fees");
    await expect(fees).toBeVisible({ timeout: 20_000 });
    await expect(fees).toContainText("Limit premium");
    await expect(fees).toContainText("the v1 contract charges none");
    await expect(page.getByTestId("preview-fees-total")).toContainText("$");
    await expect(page.getByTestId("pay-to")).toHaveCount(0);
    await expect(page.getByTestId("referrer")).toHaveCount(0);
    await expect(page.getByTestId("session-badge").first()).toBeVisible();
  });
});

test.describe("v2 path (mocked view fixture)", () => {
  test.skip(TESTNET_PENDING, PENDING_MSG);
  test.beforeEach(async ({ page }) => {
    await prime(page, "dark");
    await mockV2(page);
  });

  test("feed shows total debt, aggregate headroom and the contract's session reason", async ({ page }) => {
    await page.goto("/feed");
    const card = page.getByTestId("equation-card");
    await expect(card.getByTestId("eq-total-debt")).toHaveText("$1,200", { timeout: 20_000 });
    await expect(card.getByTestId("eq-headroom")).toHaveText("$1,687");
    await expect(card.getByTestId("session-badge")).toHaveAttribute("data-reason", "forced_closed");
    await expect(card.getByTestId("session-badge")).toContainText("Weekend parameters");
    await expect(card.getByTestId("session-badge")).toContainText("forced closed");
    // features.multiplier is false: no multiplier line even though M = 1.02 on the fixture.
    await expect(page.getByTestId("multiplier-line")).toHaveCount(0);
  });

  test("borrow uses the contract fee stack; pay_to and referrer stay hidden while their flags are off", async ({ page }) => {
    await page.goto("/borrow?ref=agent1.nectar.testnet");
    await page.getByLabel(/Collateral units/).fill("1");
    await page.getByLabel(/^Borrow/).fill("10");
    const fees = page.getByTestId("preview-fees");
    await expect(fees).toContainText("Origination (30 bps of the borrow)", { timeout: 20_000 });
    await expect(page.getByTestId("preview-fees-total")).toHaveText("$0.03");
    await expect(fees).toContainText("you receive $9.97");
    await expect(page.getByText("Aggregate headroom")).toBeVisible();
    await expect(page.getByTestId("pay-to")).toHaveCount(0);
    await expect(page.getByTestId("referrer")).toHaveCount(0);
  });
});
