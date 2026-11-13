import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { config, noHorizontalScroll, prime } from "./helpers";

// WO-62c "Get test assets": mocked RPC (faucet views, view_account, core views from the v2 fixture) + the localhost-only mock wallet.
// Nothing here signs on testnet; the real on-chain claim is recorded in EVIDENCE after the mock-ft upgrade (WO-61).
const FIXTURE = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/v2-views.json"), "utf8")) as Record<string, unknown>;
const CORE = config.accounts.core;
const NVDAX = config.collateral.nvdax!.token;
const USDC: string = config.accounts.usdc_mock;
const ME = "newcomer.testnet";
const STORAGE = "1250000000000000000000";
const NOW_NS = () => BigInt(Date.now()) * 1_000_000n;

type Status = { claimed: string; next_claim_at_ns: string; can_claim: boolean; storage_cost_yocto: string };
interface Opts { enabled?: boolean; nvdax?: Partial<Status>; usdc?: Partial<Status>; nearYocto?: string; reject?: string; ftBalance?: (token: string) => string }

async function setup(page: Page, o: Opts = {}) {
  await prime(page, "dark");
  await page.addInitScript(({ me, reject }) => {
    window.__NECTAR_E2E_MOCK__ = { features: [], near: { accountId: me, ...(reject ? { reject } : {}) } } as typeof window.__NECTAR_E2E_MOCK__;
  }, { me: ME, reject: o.reject ?? null });
  const cfg = (token: string) => ({ enabled: o.enabled ?? true, amount_per_claim: token === USDC ? "500000000" : "5000000", cap_per_account: token === USDC ? "1500000000" : "15000000", cooldown_s: 3600 });
  const st = (token: string): Status => ({ claimed: "0", next_claim_at_ns: "0", can_claim: o.enabled ?? true, storage_cost_yocto: STORAGE, ...(token === USDC ? o.usdc : o.nvdax) });
  await page.route("**/*fastnear.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    const body = req.postDataJSON() as { id: unknown; params?: { request_type?: string; account_id?: string; method_name?: string } } | null;
    const p = body?.params;
    const ok = (result: unknown) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ jsonrpc: "2.0", id: body!.id, result }) });
    if (p?.request_type === "view_account") return ok({ amount: o.nearYocto ?? "5000000000000000000000000", locked: "0", code_hash: "11111111111111111111111111111111", storage_usage: 182, block_height: 1, block_hash: "1" });
    if (p?.request_type !== "call_function" || !p.method_name) return route.continue();
    let v: unknown;
    if (p.method_name === "faucet_config") v = cfg(p.account_id!);
    else if (p.method_name === "faucet_status") v = st(p.account_id!);
    else if (p.method_name === "ft_balance_of") v = o.ftBalance?.(p.account_id!) ?? "0";
    else if (p.account_id === CORE && p.method_name in FIXTURE) v = FIXTURE[p.method_name];
    if (v === undefined) return route.continue();
    return ok({ result: Array.from(Buffer.from(JSON.stringify(v))), logs: [], block_height: 1, block_hash: "11111111111111111111111111111111" });
  });
}

const calls = (page: Page) => page.evaluate(() => window.__NECTAR_E2E_CALLS__ ?? []);
const button = (page: Page) => page.getByTestId("test-assets-button");

test.describe("Get test assets (mocked RPC + mock wallet)", () => {
  test("happy path: one review with both faucet_mint calls, one wallet request, amounts and both tx", async ({ page }) => {
    await setup(page);
    await page.goto("/borrow");
    await expect(button(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("test-assets")).toContainText("Mock assets, no value");
    await button(page).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toContainText("Review: Get test assets");
    await expect(dlg.getByTestId("test-assets-summary")).toContainText("5 NVDAx and 500 USDC");
    for (const k of [0, 1]) {
      await expect(dlg.getByTestId(`batch-${k}-gas`)).toHaveText("30 TGas");
      await expect(dlg.getByTestId(`batch-${k}-deposit`)).toHaveText("0.00125 NEAR");
      await expect(dlg.getByTestId(`batch-${k}-args`)).toHaveText("{}");
    }
    await expect(dlg.getByTestId("batch-tx-0")).toContainText(NVDAX);
    await expect(dlg.getByTestId("batch-tx-1")).toContainText(USDC);
    expect(await calls(page)).toEqual([]);
    await dlg.getByTestId("batch-confirm").click();
    const res = page.getByTestId("test-assets-result");
    await expect(res).toContainText("Test assets sent");
    await expect(res.getByTestId("test-assets-NVDAx")).toContainText("Received 5 NVDAx.");
    await expect(res.getByTestId("test-assets-USDC")).toContainText("Received 500 USDC.");
    await expect(res).toContainText("mock-faucet_mint-0");
    await expect(res).toContainText("mock-faucet_mint-1");
    const c = await calls(page);
    expect(c.map((x) => [x.receiverId, x.methodName, x.gas, x.deposit, x.batch])).toEqual([
      [NVDAX, "faucet_mint", "30000000000000", STORAGE, 2],
      [USDC, "faucet_mint", "30000000000000", STORAGE, 2],
    ]);
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page }).include("[data-testid=test-assets]").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });

  test("after a claim the composer balance refreshes without a reload and Review borrow can enable (WO-74)", async ({ page }) => {
    const minted = { nvdax: "0" };
    await setup(page, { ftBalance: (token) => (token === NVDAX ? minted.nvdax : "0") });
    await page.goto("/borrow");
    await expect(button(page)).toBeVisible({ timeout: 20_000 });
    const units = page.getByTestId("amt-units");
    await expect(units).toContainText("Balance 0.00 NVDAx", { timeout: 20_000 });
    await page.getByLabel("You lock").fill("5");
    await page.getByLabel("You borrow").fill("10");
    await expect(units).toContainText("More than your balance");
    await expect(page.getByTestId("review-borrow")).toBeDisabled();
    await button(page).click();
    // The faucet_mint lands with the batch; nothing on the page polls, so only the claim callback can re-read the balance.
    minted.nvdax = "5000000";
    await page.getByRole("dialog").getByTestId("batch-confirm").click();
    await expect(page.getByTestId("test-assets-NVDAx")).toContainText("Received 5 NVDAx.");
    await expect(units).toContainText("Balance 5.00 NVDAx");
    await expect(units).not.toContainText("More than your balance");
    await expect(page.getByTestId("review-borrow")).toBeEnabled({ timeout: 20_000 });
  });

  test("cooldown on one token: skips it, says when, signs only the other", async ({ page }) => {
    await setup(page, { nvdax: { can_claim: false, claimed: "5000000", next_claim_at_ns: (NOW_NS() + 2_520n * 1_000_000_000n).toString() } });
    await page.goto("/borrow");
    await button(page).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByTestId("test-assets-summary")).toContainText(/NVDAx: next claim in 4[12] min/);
    await expect(dlg.getByTestId("batch-tx-1")).toHaveCount(0);
    await dlg.getByTestId("batch-confirm").click();
    const res = page.getByTestId("test-assets-result");
    await expect(res.getByTestId("test-assets-USDC")).toContainText("Received 500 USDC.");
    await expect(res.getByTestId("test-assets-NVDAx")).toContainText(/next claim in 4[12] min/);
    expect((await calls(page)).map((x) => x.receiverId)).toEqual([USDC]);
  });

  test("cap reached on both: no wallet request, the cap is stated", async ({ page }) => {
    await setup(page, { nvdax: { can_claim: false, claimed: "15000000" }, usdc: { can_claim: false, claimed: "1500000000" } });
    await page.goto("/borrow");
    await button(page).click();
    const res = page.getByTestId("test-assets-result");
    await expect(res).toContainText("Nothing to claim right now");
    await expect(res).toContainText("NVDAx: account cap reached (15 NVDAx of 15 NVDAx claimed).");
    await expect(res).toContainText("USDC: account cap reached (1,500 USDC of 1,500 USDC claimed).");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await calls(page)).toEqual([]);
  });

  test("faucet disabled: said plainly, nothing signed", async ({ page }) => {
    await setup(page, { enabled: false });
    await page.goto("/borrow");
    await button(page).click();
    await expect(page.getByTestId("test-assets-result")).toContainText("NVDAx: the faucet is switched off on this token.");
    await expect(page.getByTestId("test-assets-result")).toContainText("USDC: the faucet is switched off on this token.");
    expect(await calls(page)).toEqual([]);
  });

  test("wallet rejects: honest error, nothing sent", async ({ page }) => {
    await setup(page, { reject: "User rejected the request" });
    await page.goto("/borrow");
    await button(page).click();
    await page.getByRole("dialog").getByTestId("batch-confirm").click();
    await expect(page.getByTestId("test-assets-error")).toContainText("Wallet rejected the request");
    await expect(page.getByTestId("test-assets-error")).toContainText("Nothing was sent.");
    expect(await calls(page)).toEqual([]);
  });

  test("not enough NEAR for storage and gas: gas faucet link, wallet never opens", async ({ page }) => {
    await setup(page, { nearYocto: "1000000000000000000000" });
    await page.goto("/borrow");
    await button(page).click();
    const err = page.getByTestId("test-assets-error");
    await expect(err).toContainText("Not enough NEAR for storage and gas");
    await expect(err.getByTestId("test-assets-gas-faucet")).toHaveAttribute("href", "https://near-faucet.io/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await calls(page)).toEqual([]);
  });

  test("no wallet: no button, 'connect a wallet first'", async ({ page }) => {
    await prime(page, "dark");
    await page.goto("/borrow");
    await expect(page.getByTestId("test-assets-connect")).toContainText("connect a wallet first", { timeout: 20_000 });
    await expect(button(page)).toHaveCount(0);
  });

  test("absent on SITE routes (landing pages), even with a wallet connected", async ({ page }) => {
    await setup(page);
    for (const p of ["/", "/about", "/security"]) {
      await page.goto(p);
      await page.waitForLoadState("load");
      await expect(page.getByTestId("test-assets"), p).toHaveCount(0);
    }
  });
});
