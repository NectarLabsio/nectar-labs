import { describe, expect, it } from "vitest";
import {
  NectarViews,
  SHIELD_TAGLINE,
  encodeMsg,
  eventShieldWindow,
  formatWindowCountdown,
  formatNewYork,
  msg,
  nextWindowOpen,
  profitLockBlock,
  profitLockFill,
  profitLockSummary,
  selfSettleReasonText,
  shieldFeeUsdE6,
  shieldOpensLeft,
  shieldReasonText,
  tx,
  txV2,
  weekendShieldWindow,
  type SelfSettlePreview,
  type SessionWindow,
  type ViewTransport,
} from "../src";

const S = 1_000_000_000n;
// Fri 2026-11-13 21:00 UTC (16:00 New York, EST) → Mon 2026-11-16 14:30 UTC (09:30 New York) = 65.5 h.
const FRI_CLOSE = BigInt(Date.UTC(2026, 10, 13, 21, 0)) * 1_000_000n;
const MON_OPEN = BigInt(Date.UTC(2026, 10, 16, 14, 30)) * 1_000_000n;
const CAL: SessionWindow[] = [
  [(FRI_CLOSE - 23_400n * S).toString(), FRI_CLOSE.toString()],
  [MON_OPEN.toString(), (MON_OPEN + 23_400n * S).toString()],
];

describe("shield msg (WO-23a)", () => {
  it("appends shield only when set; v1 shape unchanged otherwise", () => {
    expect(encodeMsg(msg.lockCollateralAndBorrow({ collateral: "NVDAx", borrow_usd_e6: "5000000", pre_liq_ltv_bps: 7500, shield: null }))).toBe(
      '{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"5000000","pre_liq_ltv_bps":7500}}',
    );
    expect(encodeMsg(msg.lockCollateralAndBorrow({ collateral: "NVDAx", borrow_usd_e6: "5000000", pre_liq_ltv_bps: 7500, shield: { kind: "Weekend", window_end_ns: MON_OPEN.toString() } }))).toBe(
      `{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"5000000","pre_liq_ltv_bps":7500,"shield":{"kind":"Weekend","window_end_ns":"${MON_OPEN}"}}}`,
    );
    expect(() => msg.lockCollateralAndBorrow({ collateral: "NVDAx", borrow_usd_e6: "1", pre_liq_ltv_bps: 7500, shield: { kind: "Weekend", window_end_ns: "0" } })).toThrow();
    expect(() => msg.lockCollateralAndBorrow({ collateral: "NVDAx", borrow_usd_e6: "1", pre_liq_ltv_bps: 7500, shield: { kind: "Bad" as "Event", window_end_ns: "1" } })).toThrow();
  });

  it("tx.borrow labels a Shield and uses v2 gas", () => {
    const i = tx.borrow("nvdax-mock.nectar.testnet", "core", "1000000", { collateral: "NVDAx", borrow_usd_e6: "5000000", pre_liq_ltv_bps: 7500, shield: { kind: "Event", window_end_ns: "9" } });
    expect(i.label).toBe("Open Event Shield");
    expect(i.gas).toBe("250000000000000");
    expect(i.deposit).toBe("1");
  });

  it("fundPappusQuote appends accepts_voluntary_fills only when true", () => {
    const base = { collateral: "NVDAx", max_discount_bps: 250, notice_period_ns: "604800000000000", buyer_remote_recipient: null };
    const v1 = '{"FundPappusQuote":{"collateral":"NVDAx","max_discount_bps":250,"notice_period_ns":"604800000000000","buyer_remote_recipient":null}}';
    expect(encodeMsg(msg.fundPappusQuote(base))).toBe(v1);
    expect(encodeMsg(msg.fundPappusQuote({ ...base, accepts_voluntary_fills: false }))).toBe(v1);
    expect(encodeMsg(msg.fundPappusQuote({ ...base, accepts_voluntary_fills: true }))).toBe(v1.replace("null}}", 'null,"accepts_voluntary_fills":true}}'));
  });

  it("self_settle carries 1 yocto and 300 TGas", () => {
    const i = txV2.selfSettle("core", "7");
    expect(i).toMatchObject({ receiverId: "core", methodName: "self_settle", args: { position_id: "7" }, deposit: "1", gas: "300000000000000" });
    expect(() => txV2.selfSettle("core", "-1")).toThrow();
  });
});

describe("shield windows", () => {
  it("weekend ends exactly at the next calendar open, ≤ 65.5 h", () => {
    const w = weekendShieldWindow(CAL, FRI_CLOSE);
    expect(w).toEqual({ ok: true, input: { kind: "Weekend", window_end_ns: MON_OPEN.toString() }, ends_in_s: 235_800 });
    const early = weekendShieldWindow(CAL, FRI_CLOSE - S);
    expect(early.ok).toBe(false);
    expect(weekendShieldWindow(CAL, MON_OPEN).ok).toBe(false); // no window after the last open
    expect(nextWindowOpen(CAL, MON_OPEN - 1n)).toBe(MON_OPEN);
    expect(nextWindowOpen([], 0n)).toBeNull();
  });

  it("event ends at min(curator end, now + 72 h)", () => {
    const now = 1_000n * S;
    expect(eventShieldWindow("0", now).ok).toBe(false);
    expect(eventShieldWindow((now + 3600n * S).toString(), now)).toEqual({ ok: true, input: { kind: "Event", window_end_ns: (now + 3600n * S).toString() }, ends_in_s: 3600 });
    const far = eventShieldWindow((now + 500_000n * S).toString(), now);
    expect(far.ok && far.input.window_end_ns).toBe((now + 259_200n * S).toString());
  });

  it("fees, countdown, opens left, New York time", () => {
    expect(shieldFeeUsdE6(5_000_000n, 15)).toBe(7_500n);
    expect(shieldFeeUsdE6(1n, 15)).toBe(1n); // rounded up like math::shield_fee
    expect(profitLockFill(100_000_000n)).toEqual({ fee_usd_e6: 500_000n, fill_usd_e6: 100_500_000n });
    expect(profitLockFill(1n).fee_usd_e6).toBe(1n);
    expect(formatWindowCountdown(235_800)).toBe("2d 17h 30m 00s");
    expect(formatWindowCountdown(-5)).toBe("00m 00s");
    expect(shieldOpensLeft(2)).toBe(3);
    expect(shieldOpensLeft(9)).toBe(0);
    expect(formatNewYork(MON_OPEN)).toBe("Mon 09:30 New York");
    expect(SHIELD_TAGLINE).not.toMatch(/insurance/i);
  });

  it("reason texts never say insurance", () => {
    for (const r of ["shield below minimum", "shield daily limit", "no event window", "weekend shield above 65.5 h"]) {
      expect(shieldReasonText(r)).toBeTruthy();
      expect(shieldReasonText(r)).not.toMatch(/insurance/i);
    }
    expect(shieldReasonText(null)).toBeNull();
    expect(selfSettleReasonText("no voluntary capacity")).toMatch(/opted into voluntary fills/);
  });
});

describe("profit-lock preview", () => {
  const ok: SelfSettlePreview = {
    ok: true,
    reason: null,
    debt_usd_e6: "100000000",
    fee_usd_e6: "500000",
    fill_usd_e6: "100500000",
    units_repaid: "1200000",
    units_kept: "800000",
    legs: [
      { quote_id: "1", disc_bps: 200, fill_usd_e6: "60000000", units: "700000" },
      { quote_id: "2", disc_bps: 300, fill_usd_e6: "40500000", units: "500000" },
    ],
    remote: false,
    daily_cap_usd_e6: "1000000000",
    daily_used_usd_e6: "250000000",
  };

  it("summarises legs (fill-weighted discount) and cap left", () => {
    const s = profitLockSummary(ok);
    expect(s.units_sold).toBe(1_200_000n);
    expect(s.units_kept).toBe(800_000n);
    expect(s.discount_bps).toBe(240); // (60·200 + 40.5·300) / 100.5 = 240.29
    expect([s.min_disc_bps, s.max_disc_bps]).toEqual([200, 300]);
    expect(s.daily_cap_left_usd_e6).toBe(750_000_000n);
    expect(profitLockSummary({ ...ok, legs: [], daily_used_usd_e6: "2000000000" })).toMatchObject({ discount_bps: null, daily_cap_left_usd_e6: 0n });
  });

  it("blocks with a reason: health, CA, no capacity, cap", () => {
    expect(profitLockBlock(ok, {})).toBeNull();
    expect(profitLockBlock(ok, { triggerable: true })?.kind).toBe("health");
    expect(profitLockBlock(ok, { caPending: true })?.kind).toBe("ca_pending");
    expect(profitLockBlock({ ...ok, ok: false, reason: "no voluntary capacity" }, {})?.kind).toBe("no_capacity");
    expect(profitLockBlock({ ...ok, ok: false, reason: "voluntary daily cap" }, {})?.kind).toBe("daily_cap");
    expect(profitLockBlock({ ...ok, ok: false, reason: "oracle stale" }, {})).toMatchObject({ kind: "other", text: expect.stringMatching(/stale/) });
  });
});

describe("v2 shield views send only given args", () => {
  it("preview_borrow, get_fee_stack, get_shield, preview_self_settle", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const t: ViewTransport = { call: async <T,>(_c: string, m: string, a: Record<string, unknown>) => (calls.push([m, a]), null as T) };
    const v = new NectarViews("core", t);
    await v.previewBorrow("NVDAx", "1", "2");
    await v.previewBorrow("NVDAx", "1", "2", null, { kind: "Weekend", window_end_ns: "5" }, "b.testnet");
    await v.getFeeStack();
    await v.getFeeStack("NVDAx");
    await v.getShield("3");
    await v.getShieldOpensToday("b.testnet");
    await v.previewSelfSettle("3");
    expect(calls).toEqual([
      ["preview_borrow", { symbol: "NVDAx", units: "1", borrow_usd_e6: "2" }],
      ["preview_borrow", { symbol: "NVDAx", units: "1", borrow_usd_e6: "2", shield: { kind: "Weekend", window_end_ns: "5" }, borrower: "b.testnet" }],
      ["get_fee_stack", {}],
      ["get_fee_stack", { symbol: "NVDAx" }],
      ["get_shield", { position_id: "3" }],
      ["get_shield_opens_today", { account_id: "b.testnet" }],
      ["preview_self_settle", { position_id: "3" }],
    ]);
  });
});
