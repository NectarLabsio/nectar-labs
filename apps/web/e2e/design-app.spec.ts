import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { config, noHorizontalScroll, prime } from "./helpers";

// WO-33b: Markets (/feed), Borrow (/borrow, /shield) and Position (/position/7) in design v2, against mocked v2 views whose
// numbers are the artboard demo state (PRD §4; fixtures only) and the localhost-only E2E mock wallet. Nothing signs on testnet.
const OUT = resolve(import.meta.dirname, "../../../evidence/G3/design");
mkdirSync(OUT, { recursive: true });
const FIXTURE = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/v2-views.json"), "utf8")) as Record<string, unknown>;
const CORE = config.accounts.core;
const BORROWER = "borrower1.nectar.testnet";
const S = 1_000_000_000n;
const NOW = BigInt(Date.now()) * 1_000_000n;
const NEXT_OPEN = ((NOW + 3n * 3600n * S) / (60n * S)) * 60n * S;
const CALENDAR = [[(NOW - 8n * 3600n * S).toString(), (NOW - 3600n * S).toString()], [NEXT_OPEN.toString(), (NEXT_OPEN + 23_400n * S).toString()]];
const CAP = { ...(FIXTURE.get_exit_capacity as Record<string, unknown>), q_usd_e6: "65000000000", r_usd_e6: "5000000000", d_usd_e6: "12000000000", haircut_bps: 400, session_open: true, session_reason: "open", forced_closed: false, oracle_price_usd_e6: "185000000", capacity_usd_e6: "78720000000", total_debt_usd_e6: "28000000000", aggregate_capacity_usd_e6: "78720000000", aggregate_headroom_usd_e6: "50720000000", multiplier_e18: "1000000000000000000" };
// Contract shape: the key is position_id, there is no id (interface-p0 Views).
const POS = { position_id: "7", borrower: BORROWER, collateral: "NVDAx", units: "300000000", debt_usd_e6: "28000000000", pre_liq_ltv_bps: 8000, opened_ns: NOW.toString(), status: "Open", remote: null };
const FEE_STACK = { limit_premium_bps: 300, shield_weekend_fee_bps: 15, shield_event_fee_bps: 25, origination_fee_bps: 30, referrer_share_bps: 5000, profit_lock_fee_bps: 50, keeper_fee_bps: 50, fee_split: { buyers_bps: 7000, lenders_bps: 2000, treasury_bps: 1000 } };
// DI-1: the Profit-Lock fill (28,000 · 1.005 = 28,140) exceeds the 20,000 voluntary-fill cap left today.
const PL_CAP = { ok: false, reason: "voluntary daily cap", debt_usd_e6: "28000000000", fee_usd_e6: "140000000", fill_usd_e6: "28140000000", units_repaid: "0", units_kept: "0", legs: [], remote: false, daily_cap_usd_e6: "20000000000", daily_used_usd_e6: "0" };

function views(method: string, args: Record<string, unknown>): unknown {
  switch (method) {
    case "get_exit_capacity":
      return CAP;
    case "list_positions":
      return Number(args.from_index ?? 0) === 0 ? [POS] : [];
    case "get_position":
      return String(args.position_id) === "7" ? POS : null;
    case "get_health":
      return { value_usd_e6: "55500000000", debt_usd_e6: "28000000000", ltv_bps: 5045, pre_liq_ltv_bps: 8000, triggerable: false, oracle_fresh: true };
    case "get_session_calendar":
      return Number(args.from_index ?? 0) === 0 ? CALENDAR : [];
    case "get_fee_stack":
      return FEE_STACK;
    case "get_shield_opens_today":
      return 1;
    case "get_shield":
      return null;
    case "preview_self_settle":
      return PL_CAP;
    case "get_collateral":
      return { ...(FIXTURE.get_collateral as Record<string, unknown>), shield: { weekend_fee_bps: 15, event_fee_bps: 25, event_window_end_ns: "0" } };
    case "preview_borrow": {
      const sh = args.shield as { kind: string } | undefined;
      const borrow = BigInt(String(args.borrow_usd_e6));
      const units = BigInt(String(args.units));
      const value = (units * 185n) / 1n;
      const staticLim = (value * 4000n) / 10_000n;
      const bc = sh ? 33_600_000_000n : 50_720_000_000n;
      const fee = sh ? (borrow * 15n + 9_999n) / 10_000n : borrow > staticLim ? ((borrow - staticLim) * 300n + 9_999n) / 10_000n : 0n;
      const orig = (borrow * 30n + 9_999n) / 10_000n;
      return { ...(FIXTURE.preview_borrow as Record<string, unknown>), b_c_usd_e6: bc.toString(), static_limit_usd_e6: staticLim.toString(), premium_usd_e6: fee.toString(), ...(sh ? { shield_fee_usd_e6: fee.toString() } : {}), origination_fee_usd_e6: orig.toString(), total_fees_usd_e6: (fee + orig).toString(), net_proceeds_usd_e6: (borrow - fee - orig).toString(), ok: borrow <= bc, reason: borrow <= bc ? null : "exceeds B_c", aggregate_headroom_usd_e6: "50720000000" };
    }
    default:
      return method in FIXTURE ? FIXTURE[method] : undefined;
  }
}

async function setup(page: Page, theme: "dark" | "light" = "dark", over: Record<string, unknown> = {}) {
  await prime(page, theme);
  await page.addInitScript((b) => {
    window.__NECTAR_E2E_MOCK__ = { features: ["shields", "profit_lock", "solana_remote", "notes", "pay_to"], near: { accountId: b } } as typeof window.__NECTAR_E2E_MOCK__;
  }, BORROWER);
  await page.route("**/*fastnear.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    const body = req.postDataJSON() as { id: unknown; params?: { request_type?: string; account_id?: string; method_name?: string; args_base64?: string } } | null;
    const p = body?.params;
    if (p?.request_type !== "call_function" || !p.method_name) return route.continue();
    const args = p.args_base64 ? (JSON.parse(Buffer.from(p.args_base64, "base64").toString("utf8") || "{}") as Record<string, unknown>) : {};
    const v = p.method_name === "ft_balance_of" ? "600000000" : p.account_id === CORE ? (p.method_name in over ? over[p.method_name] : views(p.method_name, args)) : undefined;
    if (v === undefined) return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ jsonrpc: "2.0", id: body!.id, result: { result: Array.from(Buffer.from(JSON.stringify(v))), logs: [], block_height: 1, block_hash: "11111111111111111111111111111111" } }) });
  });
}

async function axeClean(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}

const ROUTES = [
  ["feed", "/feed", async (page: Page) => expect(page.getByTestId("hero-capacity")).toHaveText("$78,720", { timeout: 20_000 })],
  ["borrow", "/borrow", async (page: Page) => {
    await page.getByLabel("You lock").fill("300");
    await page.getByLabel("You borrow").fill("20000");
    await expect(page.getByTestId("preview-fees")).toBeVisible({ timeout: 20_000 });
  }],
  ["shield", "/shield", async (page: Page) => {
    await page.getByLabel("You lock").fill("300");
    await page.getByLabel("You borrow").fill("20000");
    await expect(page.getByTestId("preview-fees")).toContainText("Weekend Shield fee (15 bps", { timeout: 20_000 });
  }],
  ["position", "/position/7", async (page: Page) => expect(page.getByTestId("position-status")).toHaveText("Open", { timeout: 20_000 })],
] as const;

for (const theme of ["dark", "light"] as const) {
  for (const width of [1440, 400] as const) {
    for (const [name, path, ready] of ROUTES) {
      test(`design v2 ${name} ${width}px ${theme}: no h-scroll, axe clean, screenshot`, async ({ page }, info) => {
        test.skip(info.project.name !== "desktop", "viewport set explicitly; one run per size");
        await setup(page, theme);
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(path);
        await ready(page);
        expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
        await axeClean(page);
        await page.screenshot({ path: `${OUT}/${name}-${width}-${theme}.png`, fullPage: true });
      });
    }
  }
}

test.describe("design v2 flows (mocked)", () => {
  test("markets: hero from views, schedule labelled as not history, chain filter, account dock", async ({ page }) => {
    await setup(page);
    await page.goto("/feed");
    await expect(page.getByTestId("hero-capacity")).toHaveText("$78,720", { timeout: 20_000 });
    await expect(page.getByTestId("week-chart-note")).toContainText("not recorded history");
    const t = page.getByTestId("markets-table");
    await page.getByRole("group", { name: "Filter by chain" }).getByRole("button", { name: "Base" }).click();
    await expect(t.locator("tr[data-chain=near]")).toHaveCount(0);
    await expect(t.locator("tr[data-chain=base]")).toContainText("Local fork, not live");
    await page.getByRole("group", { name: "Filter by chain" }).getByRole("button", { name: "Solana" }).click();
    await expect(t.locator("tr[data-chain=sol]")).toContainText("Live on testnet (devnet leg)");
    await expect(page.getByTestId("account-dock")).toContainText("Health of loan #7");
  });

  test("borrow with a Weekend Shield: review drawer → wallet payload → sign modal → recorded, confirmed state", async ({ page }) => {
    await setup(page);
    await page.goto("/borrow");
    await page.getByLabel("You lock").fill("300");
    await page.getByLabel("You borrow").fill("20000");
    await page.getByTestId("protection-weekend").click();
    await expect(page.getByTestId("borrow-limit")).toHaveText("$33,600", { timeout: 20_000 });
    await expect(page.getByTestId("receive")).toHaveText("$19,910.00");
    await page.getByTestId("review-borrow").click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toContainText("Review borrow");
    await drawer.getByTestId("show-wallet-payload").click();
    await expect(drawer.getByTestId("review-msg")).toContainText('"kind": "Weekend"');
    await expect(drawer.getByTestId("review-deposit")).toHaveText("1 yoctoNEAR");
    await drawer.getByTestId("confirm-in-wallet").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("Review:");
    await expect(modal.getByTestId("sign-msg")).toContainText('"borrow_usd_e6": "20000000000"');
    await expect(modal.getByTestId("sign-fees-total")).toHaveText("$90.00");
    await modal.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(page.getByRole("dialog")).toContainText("Loan opened");
    await expect(page.getByText("Weekend Shield opened").first()).toBeVisible();
    const c = await page.evaluate(() => window.__NECTAR_E2E_CALLS__ ?? []);
    expect(JSON.parse(String(c[0]!.args.msg)).LockCollateralAndBorrow.shield).toEqual({ kind: "Weekend", window_end_ns: NEXT_OPEN.toString() });
  });

  test("position DI-1: Profit-Lock over the daily cap offers Repay $X first, which pre-fills Repay", async ({ page }) => {
    await setup(page);
    await page.goto("/position/7");
    await page.getByRole("tab", { name: "Profit-Lock" }).click();
    const n = page.getByTestId("pl-cap-notice");
    await expect(n).toContainText("$28,140.00", { timeout: 20_000 });
    await expect(n).toContainText("$20,000.00");
    await n.getByTestId("pl-repay-first").click();
    await expect(page.getByLabel("You repay")).toHaveValue("8099.51");
    await expect(page.getByTestId("debt-after")).toHaveText("$19,900.49");
  });

  test("position states come from real state: at risk pre-fills the repay that restores health 1", async ({ page }) => {
    await setup(page, "dark", { get_health: { value_usd_e6: "33600000000", debt_usd_e6: "28000000000", ltv_bps: 8334, pre_liq_ltv_bps: 8000, triggerable: true, oracle_fresh: true } });
    await page.goto("/position/7");
    await expect(page.getByTestId("position-status")).toHaveText("At risk", { timeout: 20_000 });
    const n = page.getByTestId("risk-notice");
    await expect(n).toContainText("Health is below 1 at $112.00");
    await n.getByRole("button", { name: "Repay $1,120.00" }).click();
    await expect(page.getByLabel("You repay")).toHaveValue("1120.00");
    await page.getByTestId("repay-submit").click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByTestId("sign-msg")).toContainText("Repay");
    await expect(modal.getByTestId("sign-deposit")).toHaveText("1 yoctoNEAR");
  });

  test("position settling: notice, no repay form", async ({ page }) => {
    await setup(page, "dark", { get_position: { ...POS, status: "Settling" } });
    await page.goto("/position/7");
    await expect(page.getByTestId("position-status")).toHaveText("Settling", { timeout: 20_000 });
    await expect(page.getByTestId("settling-notice")).toContainText("Settling with committed buyers");
    await expect(page.getByTestId("repay-submit")).toHaveCount(0);
  });

  test("position closed: closed panel, no actions", async ({ page }) => {
    await setup(page, "dark", { get_position: { ...POS, status: "Closed", debt_usd_e6: "0" } });
    await page.goto("/position/7");
    await expect(page.getByTestId("position-status")).toHaveText("Closed", { timeout: 20_000 });
    await expect(page.getByTestId("position-closed")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Repay" })).toHaveCount(0);
  });
});
