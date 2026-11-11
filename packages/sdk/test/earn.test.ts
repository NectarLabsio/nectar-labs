import { describe, expect, it } from "vitest";
import {
  buyerFeeShareBps,
  parseEvidenceRows,
  placementLadder,
  portfolioActivity,
  portfolioSummary,
  quoteCeilingMaxBps,
  txV2,
  unitsAtCeiling,
  upsertFromView,
  weeklyFeesAtShareUsdE6,
  whatIfDiff,
  whatIfImpact,
  type CollateralView,
  type HealthView,
  type PositionView,
  type QuoteView,
  type ReserveNoteView,
} from "../src/index";

const usd = (n: number) => BigInt(n) * 1_000_000n;
const q = (id: string, remaining: number, bps: number, extra: Partial<QuoteView> = {}): QuoteView => ({ id, quote_id: id, buyer: "b.testnet", collateral: "NVDAx", committed_usd_e6: usd(remaining).toString(), remaining_usd_e6: usd(remaining).toString(), max_discount_bps: bps, notice_period_ns: "1", unlock_ns: null, buyer_remote_recipient: null, ...extra });
const PRICE = usd(185);

describe("Earn (PRD §4 demo state)", () => {
  it("ceiling stays strictly below the Reserve discount", () => {
    expect(quoteCeilingMaxBps(600)).toBe(575);
    expect(quoteCeilingMaxBps(610)).toBe(600);
    expect(quoteCeilingMaxBps(0)).toBe(500);
  });
  it("ladder: ascending discount, oldest first, a new quote after equal ceilings, Reserve last, exiting quotes out", () => {
    const rows = placementLadder([q("2", 25_000, 350), q("1", 40_000, 250), q("9", 1_000, 200, { unlock_ns: "5" })], { usd_e6: usd(5000), discount_bps: 400 }, { usd_e6: usd(25_000), discount_bps: 250 }, PRICE);
    expect(rows.map((r) => r.key)).toEqual(["q-1", "mine", "q-2", "reserve"]);
    expect(rows[1]!.buys_at_usd_e6).toBe(180_375_000n);
  });
  it("share, last week's fees and units", () => {
    const Q = usd(65_000);
    const R = usd(5_000);
    expect(buyerFeeShareBps(usd(25_000), Q, R)).toBe(2631);
    // $8.70 to a $5,000 Reserve implies 174 · 0.70 = $121.80 to all buyers.
    expect(weeklyFeesAtShareUsdE6(8_700_000n, Q, R, usd(25_000))).toBe(32_052_631n);
    expect(weeklyFeesAtShareUsdE6(8_700_000n, Q, 0n, usd(25_000))).toBeNull();
    // 25,000 / (185 · 0.98) = 137.892995…
    expect(unitsAtCeiling(usd(25_000), PRICE, 200, 6)).toBe(137_892_995n);
  });
});

const pos = (id: string, debt: number, status: PositionView["status"] = "Open", extra: Partial<PositionView> = {}): PositionView => ({ id, position_id: id, borrower: "b.testnet", collateral: "NVDAx", units: "300000000", debt_usd_e6: usd(debt).toString(), pre_liq_ltv_bps: 8000, opened_ns: "100", status, ...extra });
const health = (value: number, ltv: number): HealthView => ({ value_usd_e6: usd(value).toString(), debt_usd_e6: "0", ltv_bps: ltv, pre_liq_ltv_bps: 8000, oracle_fresh: true, triggerable: false });
const note = (id: string, value: number, fees: string, extra: Partial<ReserveNoteView["note"]> = {}): ReserveNoteView => ({
  note: { note_id: id, collateral: "NVDAx", owner: "b.testnet", deposited_usd_e6: usd(value).toString(), shares: "1", unit_debt: "0", fee_debt: "0", claimable_units: "0", claimable_fees_usd_e6: "0", unlock_ns: null, exit_shares: "0", exit_usdc_e6: "0", exited: false, created_ns: "200", ...extra },
  value_usd_e6: usd(value).toString(),
  claimable_units: "0",
  claimable_fees_usd_e6: fees,
  can_complete: false,
  transfer_locked: false,
});

describe("Portfolio", () => {
  it("net value = collateral + quotes + Reserve − debt; fees apart; worst health", () => {
    const s = portfolioSummary([{ position: pos("1", 28_000), health: health(55_500, 5045) }, { position: pos("2", 0, "Closed"), health: null }], [], [note("r-NVDAx-1", 50, "90000")]);
    expect(s.assets_usd_e6).toBe(usd(55_550));
    expect(s.net_usd_e6).toBe(usd(27_550));
    expect(s.fees_usd_e6).toBe(90_000n);
    expect(s.worst?.id).toBe("1");
    expect(s.worst?.health).toBeCloseTo(1.586, 3);
  });
  it("an exited Reserve Note counts for nothing", () => {
    expect(portfolioSummary([], [], [note("r-NVDAx-1", 50, "1", { exited: true })]).assets_usd_e6).toBe(0n);
  });
  it("activity newest first, closed loans say so", () => {
    const rows = portfolioActivity([pos("1", 28_000, "Open", { premium_usd_e6: "174000000" }), pos("0", 0, "Closed", { units: "0", opened_ns: "50" })], [], [note("r-NVDAx-1", 50, "0")], () => 6);
    expect(rows.map((r) => r.key)).toEqual(["r-NVDAx-1", "p-1", "p-0"]);
    expect(rows[1]!.title).toBe("Opened loan #1 with 300.00 NVDAx");
    expect(rows[1]!.detail).toContain("premium $174.00");
    expect(rows[2]!.amount).toBe("closed");
  });
});

describe("Curator what-if", () => {
  const market = { q_usd_e6: usd(65_000), r_usd_e6: usd(5_000), d_usd_e6: usd(12_000), debt_usd_e6: usd(28_000), base_ltv_bps: 4000, example_value_usd_e6: usd(55_500), example_borrow_usd_e6: usd(30_000) };
  const now = { base_haircut_bps: 400, weekend_haircut_bps: 1200, max_nectar_ltv_bps: 8500, limit_premium_bps: 300 };
  it("reproduces the demo numbers", () => {
    const i = whatIfImpact(now, market);
    expect(i.session_exit_usd_e6).toBe(usd(78_720));
    expect(i.closed_exit_usd_e6).toBe(usd(61_600));
    expect(i.closed_free_usd_e6).toBe(usd(33_600));
    expect(i.weekend_limit_usd_e6).toBe(usd(33_600));
    expect(i.premium_example_usd_e6).toBe(234_000_000n);
  });
  it("capacity below debt: free goes negative, the limit stops at 0", () => {
    const i = whatIfImpact({ ...now, weekend_haircut_bps: 9000 }, market);
    expect(i.closed_free_usd_e6).toBe(usd(7_000) - usd(28_000));
    expect(i.weekend_limit_usd_e6).toBe(0n);
  });
  it("diff lists only what moved", () => {
    expect(whatIfDiff(now, { ...now, limit_premium_bps: 350 })).toEqual([{ field: "limit_premium_bps", from: 300, to: 350 }]);
  });
  it("upsert keeps the stored remote_chain, which the contract overwrites", () => {
    const c = { symbol: "NVDAx", token: "n.testnet", decimals: 6, price_feed_id: "x", base_ltv_bps: 4000, max_nectar_ltv_bps: 8500, base_haircut_bps: 400, weekend_haircut_bps: 1200, limit_premium_bps: 300, pre_liq_min_bps: 6500, pre_liq_max_bps: 8000, verified_dex_depth_usd_e6: "5", remote_chain: { chain_id: "solana-devnet", vault_program: "V", mpc_domain_id: 1 }, price_kind: "Underlying" } as CollateralView;
    const t = txV2.upsertCollateral("core.testnet", upsertFromView(c, { ...now, base_haircut_bps: 500 }));
    expect(t.methodName).toBe("upsert_collateral");
    expect(t.deposit).toBe("0");
    expect(t.args).toMatchObject({ symbol: "NVDAx", config: { base_haircut_bps: 500, remote_chain: { chain_id: "solana-devnet" }, price_kind: "Underlying", verified_dex_depth_usd_e6: "5" } });
  });
  it("the contract's bps rules are refused before the wallet", () => {
    const c = { symbol: "NVDAx", token: "n.testnet", decimals: 6, price_feed_id: "x", base_ltv_bps: 4000, max_nectar_ltv_bps: 8500, base_haircut_bps: 400, weekend_haircut_bps: 1200, limit_premium_bps: 300, pre_liq_min_bps: 6500, pre_liq_max_bps: 8000, verified_dex_depth_usd_e6: "5" } as CollateralView;
    expect(() => txV2.upsertCollateral("core.testnet", upsertFromView(c, { ...now, max_nectar_ltv_bps: 3000 }))).toThrow(/base_ltv/);
  });
});

describe("Evidence table", () => {
  const md = [
    "| Gate | Status | When | Commit | Evidence |",
    "| G2b testnet deploy v2 | PASS (re-run) | t | c | e |",
    "| G2b (first run) | FAIL — superseded | t | c | e |",
    "| G13 Base round trip | PASS — local fork of Base Sepolia (D-026) | t | c | e |",
    "| G9 package | FAIL | t | c | e |",
  ].join("\n");
  it("reads the exact gate row, the fork qualifier, and pending when absent", () => {
    expect(parseEvidenceRows(md, [{ label: "Deploy", gate: "G2b testnet" }, { label: "Base", gate: "G13 Base" }, { label: "Nine", gate: "G9" }, { label: "None", gate: "G99" }])).toEqual([
      { label: "Deploy", state: "pass", qualifier: null },
      { label: "Base", state: "pass", qualifier: "local fork" },
      { label: "Nine", state: "fail", qualifier: null },
      { label: "None", state: "pending", qualifier: null },
    ]);
  });
});
