import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { config, noHorizontalScroll, prime } from "./helpers";

// WO-26b: /shield, Profit-Lock on /position/[id] and the voluntary-fills checkbox on /quote/new, against mocked v2 views
// (WO-23a methods answered per call args) and the localhost-only E2E mock wallet. window.__NECTAR_E2E_MOCK__ pins the flag
// state per test (default shields + profit_lock on, everything else off; `features: []` = all off), independent of config.yaml. Nothing here signs on testnet.

const FIXTURE = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/v2-views.json"), "utf8")) as Record<string, unknown>;
const CORE = config.accounts.core;
const BORROWER = "borrower1.nectar.testnet";
const S = 1_000_000_000n;
const NOW = BigInt(Date.now()) * 1_000_000n;
// Next calendar open 3 h from now; the previous window closed 1 h ago. Event window ends in 24 h.
const NEXT_OPEN = ((NOW + 3n * 3600n * S) / (60n * S)) * 60n * S;
const CALENDAR = [[(NOW - 8n * 3600n * S).toString(), (NOW - 3600n * S).toString()], [NEXT_OPEN.toString(), (NEXT_OPEN + 23_400n * S).toString()]];
const EVENT_END = NOW + 24n * 3600n * S;
const COLL = { ...(FIXTURE.get_collateral as Record<string, unknown>), shield: { weekend_fee_bps: 15, event_fee_bps: 25, event_window_end_ns: EVENT_END.toString() }, max_voluntary_fill_usd_e6_per_day: "1000000000", voluntary_filled_today_e6: "250000000" };
const FEE_STACK = { limit_premium_bps: 300, shield_weekend_fee_bps: 15, shield_event_fee_bps: 25, origination_fee_bps: 30, referrer_share_bps: 5000, profit_lock_fee_bps: 50, keeper_fee_bps: 50, fee_split: { buyers_bps: 7000, lenders_bps: 2000, treasury_bps: 1000 } };
const PL_OK = {
  ok: true,
  reason: null,
  debt_usd_e6: "10000000",
  fee_usd_e6: "50000",
  fill_usd_e6: "10050000",
  units_repaid: "116000",
  units_kept: "1884000",
  legs: [{ quote_id: "1", disc_bps: 250, fill_usd_e6: "10050000", units: "116000" }],
  remote: false,
  daily_cap_usd_e6: "1000000000",
  daily_used_usd_e6: "250000000",
};

interface Opts { features?: string[]; opens?: number; preview?: Record<string, unknown>; health?: Record<string, unknown>; caPending?: boolean; shield?: Record<string, unknown> | null }

async function setup(page: Page, o: Opts = {}) {
  await prime(page, "dark");
  await page.addInitScript(
    ({ features, borrower }) => {
      window.__NECTAR_E2E_MOCK__ = { features, near: { accountId: borrower } } as typeof window.__NECTAR_E2E_MOCK__;
    },
    { features: o.features ?? ["shields", "profit_lock"], borrower: BORROWER },
  );
  const cap = { ...(FIXTURE.get_exit_capacity as Record<string, unknown>), ca_pending: o.caPending === true };
  const views = (method: string, args: Record<string, unknown>): unknown => {
    switch (method) {
      case "get_collateral":
        return COLL;
      case "get_exit_capacity":
        return cap;
      case "get_session_calendar":
        return Number(args.from_index ?? 0) === 0 ? CALENDAR : [];
      case "get_fee_stack":
        return FEE_STACK;
      case "get_shield_opens_today":
        return o.opens ?? 2;
      case "preview_borrow": {
        const sh = args.shield as { kind: string } | undefined;
        if (!sh) return FIXTURE.preview_borrow;
        const borrow = BigInt(String(args.borrow_usd_e6));
        const bps = sh.kind === "Weekend" ? 15n : 25n;
        const fee = (borrow * bps + 9_999n) / 10_000n;
        const orig = (borrow * 30n + 9_999n) / 10_000n;
        return { ...(FIXTURE.preview_borrow as Record<string, unknown>), b_c_usd_e6: "47500000", premium_usd_e6: fee.toString(), shield_fee_usd_e6: fee.toString(), origination_fee_usd_e6: orig.toString(), total_fees_usd_e6: (fee + orig).toString(), net_proceeds_usd_e6: (borrow - fee - orig).toString(), ok: true, reason: null };
      }
      case "get_position":
        return { id: "7", borrower: BORROWER, collateral: "NVDAx", units: "2000000", debt_usd_e6: "10000000", pre_liq_ltv_bps: 7500, opened_ns: NOW.toString(), status: "Open", remote: null };
      case "get_health":
        return { value_usd_e6: "178000000", debt_usd_e6: "10000000", ltv_bps: 561, pre_liq_ltv_bps: 7500, triggerable: false, oracle_fresh: true, ...o.health };
      case "get_shield":
        return o.shield === undefined ? null : o.shield;
      case "preview_self_settle":
        return { ...PL_OK, ...o.preview };
      default:
        return method in FIXTURE ? FIXTURE[method] : undefined;
    }
  };
  await page.route("**/*fastnear.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    const body = req.postDataJSON() as { id: unknown; params?: { request_type?: string; account_id?: string; method_name?: string; args_base64?: string } } | null;
    const p = body?.params;
    if (p?.request_type !== "call_function" || !p.method_name) return route.continue();
    const args = p.args_base64 ? (JSON.parse(Buffer.from(p.args_base64, "base64").toString("utf8") || "{}") as Record<string, unknown>) : {};
    const v = p.method_name === "ft_balance_of" ? "1000000000000" : p.account_id === CORE ? views(p.method_name, args) : undefined;
    if (v === undefined) return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ jsonrpc: "2.0", id: body!.id, result: { result: Array.from(Buffer.from(JSON.stringify(v))), logs: [], block_height: 1, block_hash: "11111111111111111111111111111111" } }),
    });
  });
}

const calls = (page: Page) => page.evaluate(() => window.__NECTAR_E2E_CALLS__ ?? []);

async function axeClean(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}

test.describe("/shield (mocked v2, shields on)", () => {
  test("weekend and event cards: fee, countdown, weekend limit, backing, opens left, faucet beside the dry quote; copy rules", async ({ page }) => {
    await setup(page);
    await page.goto("/shield");
    const wk = page.getByTestId("shield-weekend");
    const ev = page.getByTestId("shield-event");
    await expect(wk.getByTestId("shield-weekend-fee-bps")).toHaveText("15 bps", { timeout: 20_000 });
    await expect(ev.getByTestId("shield-event-fee-bps")).toHaveText("25 bps");
    await expect(wk.getByTestId("shield-weekend-countdown")).toHaveText(/^0?2h \d\dm \d\ds$|^03h 00m 00s$/);
    await expect(ev.getByTestId("shield-event-countdown")).toHaveText(/^(2[34]h \d\dm \d\ds|1d 00h \d\dm \d\ds)$/);
    await expect(wk.getByTestId("shield-weekend-end")).toContainText("New York");
    // (1 − 0.25) × (3,850 + 0) = 2,887.50; Q = 3,850
    await expect(wk.getByTestId("shield-weekend-weekend-limit")).toHaveText("$2,887.50");
    await expect(wk.getByTestId("shield-weekend-backing")).toHaveText("$3,850.00");
    await expect(wk).toContainText("3 of 5 opens left today");
    await expect(page.getByTestId("shield-opens-left")).toHaveText("3 of 5");
    await expect(wk).toContainText("sized at the weekend limit even while the market is open");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("A weekend-safe limit with committed buyers behind it");
    const zap = page.getByTestId("zap-card");
    await expect(zap.getByTestId("nvdax-faucet")).toHaveText("Get demo NVDAx");
    await expect(zap).toContainText("Testnet mock mint");
    await expect(zap.getByTestId("zap-dry-quote")).toBeVisible();
    await expect(page.locator("header a[href=\"/shield\"], nav a[href=\"/shield\"]").first()).toBeAttached();
    const text = (await page.locator("body").innerText()).toLowerCase();
    expect(text).not.toContain("insurance");
    expect(text).not.toContain("hackathon");
    expect(text).toContain("testnet");
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    await axeClean(page);
  });

  test("open a Weekend Shield: sign modal shows the shield msg, 250 TGas, 1 yocto, fee stack; then the mock wallet records it", async ({ page }) => {
    await setup(page);
    await page.goto("/shield");
    await page.getByLabel(/Collateral units/).fill("2");
    const wk = page.getByTestId("shield-weekend");
    await wk.getByLabel(/Amount \(Weekend Shield\)/).fill("4");
    await expect(wk.getByText("Shields start at $5 on testnet")).toBeVisible();
    await expect(wk.getByTestId("shield-weekend-open")).toBeDisabled();
    await wk.getByLabel(/Amount \(Weekend Shield\)/).fill("10");
    await expect(wk.getByTestId("shield-weekend-fees")).toContainText("Weekend Shield fee (15 bps", { timeout: 20_000 });
    await expect(wk.getByTestId("shield-weekend-your-limit")).toHaveText("$47.50");
    await wk.getByTestId("shield-weekend-open").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("Review: Open Weekend Shield");
    await expect(modal.getByTestId("sign-msg")).toContainText('"kind": "Weekend"');
    await expect(modal.getByTestId("sign-msg")).toContainText(`"window_end_ns": "${NEXT_OPEN}"`);
    await expect(modal.getByTestId("sign-msg")).toContainText('"borrow_usd_e6": "10000000"');
    await expect(modal.getByTestId("sign-gas")).toHaveText("250 TGas");
    await expect(modal.getByTestId("sign-deposit")).toHaveText("1 yoctoNEAR");
    await expect(modal.getByTestId("sign-fees")).toContainText("$0.04");
    await expect(modal).toContainText("only committed buyers can settle it");
    await modal.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(modal).toHaveCount(0);
    const c = await calls(page);
    expect(c).toHaveLength(1);
    expect(c[0]!.methodName).toBe("ft_transfer_call");
    expect(JSON.parse(String(c[0]!.args.msg))).toEqual({ LockCollateralAndBorrow: { collateral: "NVDAx", borrow_usd_e6: "10000000", pre_liq_ltv_bps: 7250, shield: { kind: "Weekend", window_end_ns: NEXT_OPEN.toString() } } });
  });

  test("daily limit reached disables both cards with the reason", async ({ page }) => {
    await setup(page, { opens: 5 });
    await page.goto("/shield");
    await expect(page.getByTestId("shield-opens-left")).toHaveText("0 of 5", { timeout: 20_000 });
    await page.getByLabel(/Collateral units/).fill("2");
    await page.getByTestId("shield-event").getByLabel(/Amount \(Event Shield\)/).fill("10");
    await expect(page.getByTestId("shield-event").getByText("Daily limit reached")).toBeVisible();
    await expect(page.getByTestId("shield-event-open")).toBeDisabled();
  });

  test("flags off: honest disabled state, no Shields nav link", async ({ page }) => {
    await setup(page, { features: [] });
    await page.goto("/shield");
    await expect(page.getByText("Shields are not enabled on this deployment")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("shield-weekend")).toHaveCount(0);
    await expect(page.locator("a[href=\"/shield\"]")).toHaveCount(0);
  });
});

test.describe("Profit-Lock on /position/[id] (mocked v2)", () => {
  test("preview → sign modal (self_settle, 1 yocto, 300 TGas) → recorded", async ({ page }) => {
    await setup(page, { shield: { position_id: "7", kind: "Weekend", window_end_ns: NEXT_OPEN.toString(), fee_bps: 15, fee_usd_e6: "15000", active: true, committed_buyers_only: true } });
    await page.goto("/position/7");
    const pl = page.getByTestId("profit-lock");
    await expect(pl.getByTestId("pl-units-sold")).toHaveText("0.116 NVDAx", { timeout: 20_000 });
    await expect(pl.getByTestId("pl-units-kept")).toHaveText("1.884 NVDAx");
    await expect(pl.getByTestId("pl-discount")).toHaveText("2.5 %");
    await expect(pl.getByTestId("pl-fee")).toHaveText("$0.05");
    await expect(pl.getByTestId("pl-cap-left")).toContainText("$750.00 of $1,000.00");
    await expect(page.getByTestId("position-shield")).toContainText("committed buyers only");
    await pl.getByTestId("pl-settle").click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("self_settle");
    await expect(modal.getByTestId("sign-args")).toContainText('"position_id": "7"');
    await expect(modal.getByTestId("sign-deposit")).toHaveText("1 yoctoNEAR");
    await expect(modal.getByTestId("sign-gas")).toHaveText("300 TGas");
    await expect(modal.getByTestId("sign-fees")).toContainText("Profit-Lock fee (50 bps");
    await modal.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(modal).toHaveCount(0);
    const c = await calls(page);
    expect(c.map((x) => [x.methodName, x.args])).toEqual([["self_settle", { position_id: "7" }]]);
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    await axeClean(page);
  });

  for (const [name, o, kind] of [
    ["health < 1", { health: { triggerable: true } }, "health"],
    ["corporate action pending", { caPending: true }, "ca_pending"],
    ["no opted-in capacity", { preview: { ok: false, reason: "no voluntary capacity", legs: [], units_repaid: "0", units_kept: "0" } }, "no_capacity"],
  ] as const) {
    test(`disabled with a reason: ${name}`, async ({ page }) => {
      await setup(page, o as Opts);
      await page.goto("/position/7");
      const pl = page.getByTestId("profit-lock");
      await expect(pl.getByTestId("pl-reason")).toHaveAttribute("data-kind", kind, { timeout: 20_000 });
      await expect(pl.getByTestId("pl-settle")).toBeDisabled();
    });
  }
});

test.describe("/quote/new voluntary fills (mocked v2)", () => {
  test("checkbox adds accepts_voluntary_fills to the FundPappusQuote msg", async ({ page }) => {
    await setup(page);
    await page.goto("/quote/new");
    const box = page.getByLabel("Accept voluntary fills (Profit-Lock)");
    await expect(box).not.toBeChecked({ timeout: 20_000 });
    await box.check();
    await page.getByLabel(/^Amount/).fill("100");
    await page.getByRole("button", { name: "Fund quote" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByTestId("sign-msg")).toContainText('"accepts_voluntary_fills": true');
    await modal.getByRole("button", { name: "Open wallet to sign" }).click();
    const c = await calls(page);
    expect(JSON.parse(String(c[0]!.args.msg)).FundPappusQuote.accepts_voluntary_fills).toBe(true);
    await axeClean(page);
  });

  test("flag off: no checkbox", async ({ page }) => {
    await setup(page, { features: [] });
    await page.goto("/quote/new");
    await expect(page.getByRole("button", { name: "Fund quote" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("voluntary-fills")).toHaveCount(0);
  });
});
