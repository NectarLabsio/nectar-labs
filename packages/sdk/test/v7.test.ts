import { describe, expect, it } from "vitest";
import {
  aggregateCapacity,
  contractGeneration,
  encodeMsg,
  featureOn,
  feeStack,
  formatMultiplierE18,
  msg,
  multiplierIsOne,
  multiplierLine,
  originationFeeUsdE6,
  parseFeatures,
  sessionHeadline,
  sessionReasonText,
  sessionStatus,
  tx,
  txV2,
  valueUsdE6WithMultiplier,
  type ExitCapacity,
} from "../src/index";
import { loadPublicConfig } from "../src/config-node";

const v1Cap: ExitCapacity = {
  q_usd_e6: "3850000000",
  r_usd_e6: "0",
  d_usd_e6: "0",
  haircut_bps: 2500,
  session_open: false,
  oracle_price_usd_e6: "89000000",
  oracle_age_s: "42837",
  oracle_fresh: true,
  limit_bps_effective: 7000,
  capacity_usd_e6: "2887500000",
  oracle_source: "Owner",
};

describe("contract generation (interface-v7 §A6)", () => {
  it("only a 2. prefix is v2", () => {
    expect(contractGeneration("2.0.0-v7")).toBe("v2");
    expect(contractGeneration("nectar-core 0.1.0 p2")).toBe("v1");
    expect(contractGeneration(null)).toBe("v1");
  });
});

describe("LockCollateralAndBorrow v2 keys", () => {
  it("v1 msg is byte-identical when pay_to/referrer are absent", () => {
    expect(encodeMsg(msg.lockCollateralAndBorrow({ collateral: "NVDAx", borrow_usd_e6: "1000000", pre_liq_ltv_bps: 7500, pay_to: null, referrer: "" }))).toBe(
      '{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"1000000","pre_liq_ltv_bps":7500}}',
    );
  });
  it("appends pay_to (memo optional) and referrer in interface order", () => {
    expect(
      encodeMsg(
        msg.lockCollateralAndBorrow({ collateral: "NVDAx", borrow_usd_e6: "1000000", pre_liq_ltv_bps: 7500, pay_to: { receiver_id: "shop.testnet", memo: "order 42" }, referrer: "agent1.nectar.testnet" }),
      ),
    ).toBe('{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"1000000","pre_liq_ltv_bps":7500,"pay_to":{"receiver_id":"shop.testnet","memo":"order 42"},"referrer":"agent1.nectar.testnet"}}');
    expect(encodeMsg(msg.lockCollateralAndBorrow({ collateral: "NVDAx", borrow_usd_e6: "1", pre_liq_ltv_bps: 7500, pay_to: { receiver_id: "shop.testnet", memo: "" } }))).toBe(
      '{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"1","pre_liq_ltv_bps":7500,"pay_to":{"receiver_id":"shop.testnet"}}}',
    );
  });
  it("rejects bad account ids", () => {
    expect(() => msg.lockCollateralAndBorrow({ collateral: "NVDAx", borrow_usd_e6: "1", pre_liq_ltv_bps: 7500, pay_to: { receiver_id: "Bad Id" } })).toThrow();
    expect(() => msg.lockCollateralAndBorrow({ collateral: "NVDAx", borrow_usd_e6: "1", pre_liq_ltv_bps: 7500, referrer: "x" })).toThrow();
  });
  it("v2 borrow gets more gas and a merchant label", () => {
    const t = tx.borrow("nvdax-mock.nectar.testnet", "nectar-core-v2.nectar.testnet", "1000000", { collateral: "NVDAx", borrow_usd_e6: "1", pre_liq_ltv_bps: 7500, pay_to: { receiver_id: "shop.testnet" } });
    expect(t.gas).toBe("250000000000000");
    expect(t.label).toBe("Lock collateral and pay merchant");
    expect(tx.borrow("t.testnet", "c.testnet", "1", { collateral: "NVDAx", borrow_usd_e6: "1", pre_liq_ltv_bps: 7500 }).gas).toBe("200000000000000");
  });
});

describe("v2 owner and user calls", () => {
  it("validates the session calendar", () => {
    expect(txV2.setSessionCalendar("c", [["1", "2"], ["2", "5"]]).args).toEqual({ windows: [["1", "2"], ["2", "5"]] });
    expect(() => txV2.setSessionCalendar("c", [["1", "5"], ["4", "6"]])).toThrow(/overlaps/);
    expect(() => txV2.setSessionCalendar("c", [["5", "5"]])).toThrow(/open < close/);
  });
  it("withdraw_claimable carries 1 yocto; origination fee capped at 100 bps", () => {
    expect(txV2.withdrawClaimable("c").deposit).toBe("1");
    expect(() => txV2.setOriginationFeeBps("c", 101)).toThrow();
    expect(txV2.forceSessionClosed("c", "NVDAx", true).args).toEqual({ symbol: "NVDAx", closed: true });
  });
});

describe("session badge", () => {
  it("v1 derives from the owner flag and oracle age", () => {
    const closed = sessionStatus(v1Cap);
    expect(closed).toEqual({ open: false, reason: "no_calendar", source: "derived-v1" });
    expect(sessionHeadline(closed)).toBe("Weekend parameters");
    expect(sessionStatus({ ...v1Cap, session_open: true, oracle_age_s: "60" }).open).toBe(true);
    expect(sessionStatus({ ...v1Cap, session_open: true, oracle_age_s: "901" }).reason).toBe("stale_price");
  });
  it("v2 trusts the contract reason", () => {
    const s = sessionStatus({ ...v1Cap, session_open: false, session_reason: "forced_closed" });
    expect(s).toEqual({ open: false, reason: "forced_closed", source: "contract" });
    expect(sessionReasonText(s)).toBe("forced closed");
    expect(sessionReasonText(sessionStatus({ ...v1Cap, session_reason: "outside_hours" }))).toMatch(/calendar/);
  });
});

describe("multiplier (§A3)", () => {
  it("formats and detects M ≠ 1", () => {
    expect(multiplierIsOne("1000000000000000000")).toBe(true);
    expect(multiplierIsOne(undefined)).toBe(true);
    expect(formatMultiplierE18("1020000000000000000")).toBe("1.02");
    expect(formatMultiplierE18("2000000000000000000")).toBe("2");
    expect(multiplierLine("NVDAx", "1020000000000000000")).toBe("1 NVDAx = 1.02 shares after corporate actions");
  });
  it("V uses M for Underlying and ignores it for TokenIncludesMultiplier", () => {
    const m = 1_020_000_000_000_000_000n;
    expect(valueUsdE6WithMultiplier(1_000_000n, 100_000_000n, 6, m)).toBe(102_000_000n);
    expect(valueUsdE6WithMultiplier(1_000_000n, 100_000_000n, 6, m, "TokenIncludesMultiplier")).toBe(100_000_000n);
  });
});

describe("fee stack (§A5)", () => {
  it("v1: premium only, no origination", () => {
    const f = feeStack(100_000_000n, { b_c_usd_e6: "0", static_limit_usd_e6: "0", premium_usd_e6: "3000000", ok: true, reason: null }, { generation: "v1" });
    expect(f).toMatchObject({ premium_usd_e6: 3_000_000n, origination_usd_e6: 0n, total_usd_e6: 3_000_000n, net_usd_e6: 97_000_000n, source: "local" });
  });
  it("v2 local fallback: origination rounds up, half to referrer", () => {
    expect(originationFeeUsdE6(1_000_001n, 30)).toBe(3001n);
    const f = feeStack(100_000_000n, { b_c_usd_e6: "0", static_limit_usd_e6: "0", premium_usd_e6: "0", ok: true, reason: null }, { generation: "v2", originationFeeBps: 30, referrer: "a.testnet" });
    expect(f).toMatchObject({ origination_usd_e6: 300_000n, referrer_share_usd_e6: 150_000n, total_usd_e6: 300_000n, net_usd_e6: 99_700_000n });
  });
  it("v2 contract figures win", () => {
    const f = feeStack(
      100_000_000n,
      { b_c_usd_e6: "0", static_limit_usd_e6: "0", premium_usd_e6: "1", ok: true, reason: null, origination_fee_usd_e6: "2", referrer_share_usd_e6: "1", total_fees_usd_e6: "3", net_proceeds_usd_e6: "99999997" },
      { generation: "v2" },
    );
    expect(f).toMatchObject({ total_usd_e6: 3n, net_usd_e6: 99_999_997n, source: "contract" });
  });
});

describe("aggregate capacity (§A1)", () => {
  it("prefers contract fields, else computes", () => {
    expect(aggregateCapacity(v1Cap)).toEqual({ capacity_usd_e6: 2_887_500_000n, total_debt_usd_e6: null, headroom_usd_e6: null });
    expect(aggregateCapacity({ ...v1Cap, capacity_usd_e6: undefined }).capacity_usd_e6).toBe(2_887_500_000n);
    expect(aggregateCapacity({ ...v1Cap, total_debt_usd_e6: "500000000", aggregate_capacity_usd_e6: "2887500000" }).headroom_usd_e6).toBe(2_387_500_000n);
  });
});

describe("features", () => {
  it("parses config flags (all false today) and needs v2", () => {
    const cfg = loadPublicConfig();
    expect(Object.values(cfg.features).every((v) => v === false)).toBe(true);
    const f = parseFeatures({ pay_to: true, bogus: true, referrals: "yes" });
    expect(f.pay_to).toBe(true);
    expect(f.referrals).toBe(false);
    expect(featureOn(f, "v2", "pay_to")).toBe(true);
    expect(featureOn(f, "v1", "pay_to")).toBe(false);
    expect(featureOn(f, null, "pay_to")).toBe(false);
  });
});
