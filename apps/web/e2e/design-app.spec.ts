import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { config, noHorizontalScroll, prime } from "./helpers";

// WO-33b/c: Markets, Borrow, Position, Portfolio, Earn, Curator and Agents in design v2, against mocked v2 views whose
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
const CAP = { ...(FIXTURE.get_exit_capacity as Record<string, unknown>), q_usd_e6: "65000000000", r_usd_e6: "5000000000", d_usd_e6: "12000000000", haircut_bps: 1000, session_open: true, session_reason: "open", forced_closed: false, oracle_price_usd_e6: "185000000", capacity_usd_e6: "73800000000", total_debt_usd_e6: "28000000000", aggregate_capacity_usd_e6: "73800000000", aggregate_headroom_usd_e6: "45800000000", multiplier_e18: "1000000000000000000" };
// Contract shape: the key is position_id, there is no id (interface-p0 Views).
const POS = { position_id: "7", borrower: BORROWER, collateral: "NVDAx", units: "300000000", debt_usd_e6: "28000000000", pre_liq_ltv_bps: 8000, opened_ns: NOW.toString(), status: "Open", remote: null };
const NOTES = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/notes.json"), "utf8")) as { nft_token_svg: Record<string, string> };
const OWNER = "nectar.testnet";
// Contract shape: the key is quote_id (types.rs). The fixture must not carry `id`, or it hides the mapping (WO-33c item 0).
const quote = (id: string, buyer: string, rem: string, bps: number) => ({ quote_id: id, buyer, collateral: "NVDAx", committed_usd_e6: rem, remaining_usd_e6: rem, max_discount_bps: bps, notice_period_ns: "604800000000000", unlock_ns: null, buyer_remote_recipient: null, secrets_profile: null, fee_debt_e18: "0", claimable_fees_usd_e6: "0", created_ns: NOW.toString(), accepts_voluntary_fills: false });
const QUOTES = [quote("1", "buyer1.nectar.testnet", "40000000000", 250), quote("2", "buyer2.nectar.testnet", "25000000000", 350)];
const RESERVE = { ...(FIXTURE.get_reserve as Record<string, unknown>), r_usd_e6: "5000000000", shares: "5000000000", usdc_e6: "5000000000", discount_bps: 600, fees_7d_usd_e6: "8700000", realised_apr_7d_bps: "907" };
const RNOTE = { note: { note_id: "r-NVDAx-1", collateral: "NVDAx", owner: BORROWER, deposited_usd_e6: "50000000", shares: "50000000", unit_debt: "0", fee_debt: "0", claimable_units: "0", claimable_fees_usd_e6: "0", unlock_ns: null, exit_shares: "0", exit_usdc_e6: "0", exited: false, created_ns: (NOW + 1n).toString() }, value_usd_e6: "50000000", claimable_units: "0", claimable_fees_usd_e6: "90000", can_complete: false, transfer_locked: false };
const TOKENS = [{ token_id: "p-7", owner_id: BORROWER }, { token_id: "r-NVDAx-1", owner_id: BORROWER }];
// The deployed parameters (WO-62a B3; evidence/claims/deployed-params-20261112T192755Z.json); Q, R and D stay demo figures.
const DEMO_COLL = { ...(FIXTURE.get_collateral as Record<string, unknown>), base_haircut_bps: 1000, weekend_haircut_bps: 2500, max_nectar_ltv_bps: 7000, limit_premium_bps: 300, verified_dex_depth_usd_e6: "12000000000", oracle_price_usd_e6: "185000000", forced_closed: false, multiplier_e18: "1000000000000000000", remote_chain: { chain_id: "solana-devnet", vault_program: "V1", mpc_domain_id: 1 }, shield: { weekend_fee_bps: 15, event_fee_bps: 25, event_window_end_ns: "0" }, max_voluntary_fill_usd_e6_per_day: "20000000000", reserve: { ...((FIXTURE.get_collateral as { reserve: Record<string, unknown> }).reserve), usdc_e6: "5000000000", shares: "5000000000", discount_bps: 600 } };
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
    case "list_quotes":
      return QUOTES;
    case "get_quote":
      return QUOTES.find((q) => q.quote_id === String(args.quote_id)) ?? null;
    case "get_reserve":
      return RESERVE;
    case "get_reserve_note":
      return String(args.note_id) === "r-NVDAx-1" ? RNOTE : null;
    case "nft_supply_for_owner":
      return String(TOKENS.length);
    case "nft_tokens_for_owner":
      return Number(args.from_index ?? 0) === 0 ? TOKENS : [];
    case "nft_token_svg":
      return NOTES.nft_token_svg[String(args.token_id)] ?? NOTES.nft_token_svg["p-7"];
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
      const bc = sh ? 24_500_000_000n : 45_800_000_000n;
      const fee = sh ? (borrow * 15n + 9_999n) / 10_000n : borrow > staticLim ? ((borrow - staticLim) * 300n + 9_999n) / 10_000n : 0n;
      const orig = (borrow * 30n + 9_999n) / 10_000n;
      return { ...(FIXTURE.preview_borrow as Record<string, unknown>), b_c_usd_e6: bc.toString(), static_limit_usd_e6: staticLim.toString(), premium_usd_e6: fee.toString(), ...(sh ? { shield_fee_usd_e6: fee.toString() } : {}), origination_fee_usd_e6: orig.toString(), total_fees_usd_e6: (fee + orig).toString(), net_proceeds_usd_e6: (borrow - fee - orig).toString(), ok: borrow <= bc, reason: borrow <= bc ? null : "exceeds B_c", aggregate_headroom_usd_e6: "45800000000" };
    }
    default:
      return method in FIXTURE ? FIXTURE[method] : undefined;
  }
}

async function setup(page: Page, theme: "dark" | "light" = "dark", over: Record<string, unknown> = {}, account = BORROWER) {
  await prime(page, theme);
  await page.addInitScript((b) => {
    window.__NECTAR_E2E_MOCK__ = { features: ["shields", "profit_lock", "solana_remote", "notes", "pay_to", "reserve", "agent_skill", "x402"], near: { accountId: b } } as typeof window.__NECTAR_E2E_MOCK__;
  }, account);
  await page.route("**/*fastnear.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    const body = req.postDataJSON() as { id: unknown; params?: { request_type?: string; account_id?: string; method_name?: string; args_base64?: string } } | null;
    const p = body?.params;
    if (p?.request_type !== "call_function" || !p.method_name) return route.continue();
    const args = p.args_base64 ? (JSON.parse(Buffer.from(p.args_base64, "base64").toString("utf8") || "{}") as Record<string, unknown>) : {};
    const v = p.method_name === "ft_balance_of" ? (over.ft_balance_of ?? "600000000") : p.account_id === CORE ? (p.method_name in over ? over[p.method_name] : views(p.method_name, args)) : undefined;
    if (v === undefined) return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ jsonrpc: "2.0", id: body!.id, result: { result: Array.from(Buffer.from(JSON.stringify(v))), logs: [], block_height: 1, block_hash: "11111111111111111111111111111111" } }) });
  });
}

async function axeClean(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.any[0]?.message ?? ""}`).join(" | ")}`)).toEqual([]);
}

const ROUTES = [
  ["feed", "/feed", async (page: Page) => expect(page.getByTestId("hero-capacity")).toHaveText("$73,800", { timeout: 20_000 })],
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
  ["portfolio", "/notes", async (page: Page) => expect(page.getByTestId("net-value")).toHaveText("$27,550", { timeout: 20_000 })],
  ["earn", "/quote", async (page: Page) => {
    await page.getByLabel("You commit").fill("500");
    await expect(page.getByTestId("placement-ladder")).toContainText("Your quote", { timeout: 20_000 });
  }],
  ["reserve", "/reserve", async (page: Page) => {
    await page.getByLabel("You deposit").fill("100");
    await expect(page.getByTestId("reserve-after")).toContainText("$5,100", { timeout: 20_000 });
  }],
  ["console", "/console", async (page: Page) => expect(page.getByTestId("whatif-session-exit")).toBeVisible({ timeout: 20_000 })],
  ["agents", "/agents", async (page: Page) => expect(page.getByTestId("example-call")).toBeVisible({ timeout: 20_000 })],
  ["market", "/feed/NVDAx", async (page: Page) => expect(page.getByTestId("market-exit")).toHaveText("$73,800", { timeout: 20_000 })],
] as const;

for (const theme of ["dark", "light"] as const) {
  for (const width of [1440, 400] as const) {
    for (const [name, path, ready] of ROUTES) {
      test(`design v2 ${name} ${width}px ${theme}: no h-scroll, axe clean, screenshot`, async ({ page }, info) => {
        test.skip(info.project.name !== "desktop", "viewport set explicitly; one run per size");
        await setup(page, theme, name === "console" || name === "market" ? { get_collateral: DEMO_COLL } : {});
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
    await expect(page.getByTestId("hero-capacity")).toHaveText("$73,800", { timeout: 20_000 });
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
    await expect(page.getByTestId("borrow-limit")).toHaveText("$24,500", { timeout: 20_000 });
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

  test("review 2 (R2-06, R2-07): decimal comma refused; review shows the parsed amount; a change under an open review closes it", async ({ page }) => {
    await setup(page);
    await page.goto("/borrow");
    await page.getByLabel("You lock").fill("1,5");
    await expect(page.getByText("Use a dot for decimals; commas only group thousands (1,234.5)")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("You lock").fill("300");
    await page.getByLabel("You borrow").fill("20,000");
    await expect(page.getByTestId("preview-fees")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("review-borrow").click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByTestId("review-units")).toHaveText("300 NVDAx");
    await drawer.getByTestId("show-wallet-payload").click();
    await expect(drawer.getByTestId("review-amount")).toHaveText("300 NVDAx (300000000 base units)");
    await expect(drawer.getByTestId("confirm-in-wallet")).toBeEnabled();
    // The loan changes while the review is open: the review closes and nothing can be signed from the stale one.
    await page.getByLabel("You borrow").fill("10000");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("review-stale")).toContainText("Nothing was signed");
    await page.getByTestId("review-borrow").click();
    await page.getByRole("dialog").getByTestId("confirm-in-wallet").click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByTestId("sign-amount")).toHaveText("300 NVDAx (300000000 base units)");
    await expect(modal.getByTestId("sign-msg")).toContainText('"borrow_usd_e6": "10000000000"');
    expect(await page.evaluate(() => (window.__NECTAR_E2E_CALLS__ ?? []).length)).toBe(0);
  });

  test("review 2 (R2-10): a signer that is not a testnet account sees Wrong network and the sign modal refuses", async ({ page }) => {
    await setup(page, "dark", {}, "alice.near");
    await page.goto("/borrow");
    await expect(page.getByTestId("wrong-network")).toContainText("alice.near is not a NEAR testnet account", { timeout: 20_000 });
    await page.getByLabel("You lock").fill("300");
    await page.getByLabel("You borrow").fill("20000");
    await expect(page.getByTestId("preview-fees")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("review-borrow").click();
    await page.getByRole("dialog").getByTestId("confirm-in-wallet").click();
    const modal = page.getByRole("dialog");
    await modal.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(modal.getByRole("alert")).toContainText("alice.near is not a NEAR testnet account");
    expect(await page.evaluate(() => (window.__NECTAR_E2E_CALLS__ ?? []).length)).toBe(0);
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

  test("portfolio: net value, weekend outlook, tabs from views", async ({ page }) => {
    await setup(page);
    await page.goto("/notes");
    await expect(page.getByTestId("net-value")).toHaveText("$27,550", { timeout: 20_000 });
    await expect(page.getByTestId("assets")).toHaveText("$55,550");
    await expect(page.getByTestId("debt")).toHaveText("$28,000");
    await expect(page.getByTestId("portfolio-health")).toHaveText("1.59");
    await expect(page.getByTestId("fees-earned")).toHaveText("$0.09");
    await expect(page.getByTestId("weekend-outlook")).toContainText("Loan #7 has a health of 1.59 and is flagged only below $116.66");
    await expect(page.getByTestId("loan-7-status")).toHaveText("Open");
    await page.getByRole("tab", { name: /^Deposits/ }).click();
    await expect(page.getByTestId("reserve-note-r-NVDAx-1")).toContainText("1 %", { timeout: 20_000 });
    await page.getByRole("tab", { name: /^Notes/ }).click();
    await expect(page.getByTestId("notes-grid").locator(".note-card")).toHaveCount(2, { timeout: 20_000 });
    await page.getByRole("tab", { name: "Activity" }).click();
    await expect(page.getByTestId("activity-p-7")).toContainText("Opened loan #7 with 300.00 NVDAx");
    await expect(page.getByTestId("activity-r-NVDAx-1")).toHaveAttribute("href", "/note/r-NVDAx-1");
  });

  test("portfolio at risk warns; no debt says nothing to do", async ({ page }) => {
    await setup(page, "dark", { get_health: { value_usd_e6: "33600000000", debt_usd_e6: "28000000000", ltv_bps: 8334, pre_liq_ltv_bps: 8000, triggerable: true, oracle_fresh: true } });
    await page.goto("/notes");
    await expect(page.getByTestId("weekend-outlook")).toContainText("below its flag line", { timeout: 20_000 });
    await expect(page.getByTestId("loan-7-status")).toHaveText("At risk");
  });

  test("portfolio empty account: empty states and the faucet link", async ({ page }) => {
    await setup(page, "dark", { list_positions: [], list_quotes: [], nft_supply_for_owner: "0", nft_tokens_for_owner: [], ft_balance_of: "0" });
    await page.goto("/notes");
    await expect(page.getByTestId("loans-empty")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("weekend-outlook")).toContainText("no open debt");
    await expect(page.getByText("No NVDAx (mock) balance")).toBeVisible();
    await page.getByRole("tab", { name: /^Deposits/ }).click();
    await expect(page.getByTestId("deposits-empty")).toBeVisible();
    await page.getByRole("tab", { name: "Activity" }).click();
    await expect(page.getByTestId("activity-empty")).toBeVisible();
  });

  test("earn: ladder in settlement order from views, share and last week's fees, sign modal", async ({ page }) => {
    await setup(page, "dark", { ft_balance_of: "100000000000" });
    await page.goto("/quote");
    await page.getByLabel("You commit").fill("25000");
    const rows = page.getByTestId("placement-ladder").locator("li");
    await expect(rows).toHaveCount(4, { timeout: 20_000 });
    // Equal ceilings fill oldest first, so a new 2.50% quote stands behind q-1; the Reserve is last.
    await expect(rows.nth(0)).toContainText("q-1, buyer1.nectar.testnet");
    await expect(rows.nth(1)).toContainText("Your quote");
    await expect(rows.nth(2)).toContainText("q-2");
    await expect(rows.nth(3)).toContainText("Nectar Reserve");
    await expect(page.getByTestId("fee-share")).toHaveText("26.31%");
    await expect(page.getByTestId("fee-week")).toHaveText("$32.05");
    await expect(page.getByTestId("units-max")).toHaveText("138.6 NVDAx");
    // The slider stops below the Reserve's 6.00%.
    await expect(page.getByRole("slider", { name: "Discount ceiling" })).toHaveAttribute("max", "575");
    await page.getByRole("slider", { name: "Discount ceiling" }).fill("150");
    await expect(rows.nth(0)).toContainText("Your quote");
    await page.getByTestId("quote-submit").click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByTestId("sign-msg")).toContainText('"max_discount_bps": 150');
    await expect(modal.getByTestId("sign-deposit")).toHaveText("1 yoctoNEAR");
    await modal.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(modal).toHaveCount(0);
    const c = await page.evaluate(() => window.__NECTAR_E2E_CALLS__ ?? []);
    expect(c[0]).toMatchObject({ methodName: "ft_transfer_call", args: { amount: "25000000000" } });
  });

  test("earn: mode tabs keep the address; Reserve waterfall", async ({ page }) => {
    await setup(page);
    await page.goto("/quote");
    await page.getByRole("tab", { name: "Join the Reserve" }).click();
    await expect(page).toHaveURL(/\/reserve$/);
    await page.getByLabel("You deposit").fill("100");
    await expect(page.getByTestId("reserve-after")).toContainText("$5,100", { timeout: 20_000 });
    await expect(page.getByTestId("reserve-share")).toHaveText("1.96%");
    await expect(page.getByText("2. The Reserve, at 6.00%")).toBeVisible();
    await expect(page.getByRole("img", { name: "70% buyers and Reserve, 20% lenders, 10% treasury" })).toBeVisible();
  });

  test("quote page: the contract's quote_id drives actions and the Note link", async ({ page }) => {
    await setup(page, "dark", {}, "buyer1.nectar.testnet");
    await page.goto("/quote/1");
    await expect(page.getByTestId("quote-remaining")).toHaveText("$40,000.00", { timeout: 20_000 });
    await expect(page.getByTestId("note-link")).toHaveAttribute("href", "/note/q-1");
    await page.getByRole("button", { name: "Claim fees" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByTestId("sign-args")).toContainText('"quote_id": "1"');
  });

  test("curator: what-if impact before signing, full upsert in the sign modal, keeps remote_chain", async ({ page }) => {
    await setup(page, "dark", { get_collateral: DEMO_COLL }, OWNER);
    await page.goto("/console");
    await expect(page.getByTestId("whatif-session-exit")).toHaveText("$73,800", { timeout: 20_000 });
    await expect(page.getByTestId("whatif-closed-exit")).toHaveText("$52,500");
    await expect(page.getByTestId("whatif-primary")).toBeDisabled();
    await page.getByRole("slider", { name: "Haircut in session" }).fill("1100");
    await expect(page.getByTestId("whatif-session-exit")).toHaveText("$72,980");
    await expect(page.getByTestId("whatif-session-delta")).toHaveText("−$820");
    await expect(page.getByTestId("whatif-changes")).toHaveText("1 change");
    await page.getByTestId("whatif-primary").click();
    await expect(page.getByTestId("whatif-diff")).toContainText("1000 → 1100");
    await expect(page.getByTestId("whatif-primary")).toHaveText("Sign as nectar.testnet");
    await page.getByTestId("whatif-primary").click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByTestId("sign-args")).toContainText('"base_haircut_bps": 1100');
    await expect(modal.getByTestId("sign-args")).toContainText('"chain_id": "solana-devnet"');
    await expect(modal.getByTestId("sign-gas")).toHaveText("30 TGas");
    await expect(modal.getByTestId("sign-deposit")).toHaveText("0 NEAR");
    await modal.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(modal).toHaveCount(0);
    const c = await page.evaluate(() => window.__NECTAR_E2E_CALLS__ ?? []);
    expect(c.map((x) => x.methodName)).toEqual(["upsert_collateral"]);
  });

  test("curator read-only: sliders move, signing does not; a closed-capacity shortfall warns; evidence from EVIDENCE.md", async ({ page }) => {
    await setup(page, "dark", { get_collateral: DEMO_COLL });
    await page.goto("/console");
    await expect(page.getByTestId("console-readonly")).toContainText(BORROWER, { timeout: 20_000 });
    await page.getByRole("slider", { name: "Haircut when closed" }).fill("2500");
    await page.getByRole("slider", { name: "Haircut in session" }).fill("0");
    await expect(page.getByTestId("whatif-closed-free")).toHaveText("$24,500");
    await expect(page.getByTestId("whatif-primary")).toHaveText("Only nectar.testnet can sign changes");
    await expect(page.getByTestId("whatif-primary")).toBeDisabled();
    await expect(page.getByTestId("console-daily-cap")).toHaveText("$20,000");
    await expect(page.getByTestId("console-shields")).toHaveText("15 / 25 bps");
    await expect(page.getByTestId("evidence-solana-settlement")).toHaveText("Pass");
    await expect(page.getByTestId("evidence-base-settlement")).toHaveText("Pass, local fork");
  });

  test("market: ladder and limit from views, session toggle, unknown symbol", async ({ page }) => {
    await setup(page, "dark", { get_collateral: DEMO_COLL });
    await page.goto("/feed/NVDAx");
    await expect(page.getByTestId("market-exit")).toHaveText("$73,800", { timeout: 20_000 });
    await expect(page.getByTestId("market-free")).toHaveText("$45,800");
    // 221.7602 + 140.0364 + 28.7522 (Reserve at 600 bps) = 390.5488; units are truncated here, so the page never overstates what buyers can take.
    await expect(page.getByTestId("market-units")).toHaveText("390.54");
    await expect(page.getByTestId("market-ladder").locator("tbody tr")).toHaveCount(4);
    await expect(page.getByTestId("market-formula")).toContainText("$82,000 × (1 − 10.00%) = $73,800");
    await page.getByRole("group", { name: "Market state" }).getByRole("button", { name: "Closed or Shield" }).click();
    await expect(page.getByTestId("market-formula")).toContainText("$70,000 × (1 − 25.00%) = $52,500");
    await expect(page.getByTestId("market-formula")).toContainText("$24,500");
    await expect(page.getByTestId("market-activity")).toContainText("Opened loan #7");
  });

  test("market: unknown symbol is an empty state", async ({ page }) => {
    await setup(page, "dark", { get_collateral: null });
    await page.goto("/feed/ZZZ");
    await expect(page.getByTestId("market-empty")).toContainText("No market for ZZZ", { timeout: 20_000 });
  });

  test("agents: replay steps through four labelled calls", async ({ page }) => {
    await setup(page);
    await page.goto("/agents");
    await expect(page.getByTestId("run-label")).toContainText("not a call made on testnet");
    await page.getByTestId("replay").click();
    await expect(page.getByTestId("replay")).toHaveText("Running");
    await expect(page.locator(".nx-run[data-state=todo]")).toHaveCount(3);
    await expect(page.locator(".nx-run[data-state=done]")).toHaveCount(4, { timeout: 15_000 });
    await expect(page.getByTestId("replay")).toHaveText("Replay the run");
  });
});
