import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPreimage,
  computeLimit,
  encodeMsg,
  formatUsdE6,
  bpsToPct,
  health,
  msg,
  parseEventLogs,
  parsePreimage,
  parseUnits,
  preimagePayloadHex,
  premiumUsdE6,
  signRequest,
  tx,
} from "../src/index";
import { loadPublicConfig } from "../src/config-node";

describe("ft_on_transfer msg (interface-p0.md)", () => {
  it("matches the documented JSON byte for byte", () => {
    expect(encodeMsg(msg.supplyLendingLiquidity())).toBe('"SupplyLendingLiquidity"');
    expect(
      encodeMsg(msg.fundPappusQuote({ collateral: "NVDAx", max_discount_bps: 250, notice_period_ns: "604800000000000", buyer_remote_recipient: null })),
    ).toBe('{"FundPappusQuote":{"collateral":"NVDAx","max_discount_bps":250,"notice_period_ns":"604800000000000","buyer_remote_recipient":null}}');
    expect(encodeMsg(msg.topUpQuote("0"))).toBe('{"TopUpQuote":{"quote_id":"0"}}');
    expect(encodeMsg(msg.lockCollateralAndBorrow({ collateral: "NVDAx", borrow_usd_e6: "1000000", pre_liq_ltv_bps: 7500 }))).toBe(
      '{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"1000000","pre_liq_ltv_bps":7500}}',
    );
    expect(encodeMsg(msg.repay("0"))).toBe('{"Repay":{"position_id":"0"}}');
  });
  it("rejects non-canonical integers and bad bps", () => {
    expect(() => msg.topUpQuote("01")).toThrow();
    expect(() => msg.repay("-1")).toThrow();
    expect(() => msg.lockCollateralAndBorrow({ collateral: "NVDAx", borrow_usd_e6: "1.5", pre_liq_ltv_bps: 7500 })).toThrow();
    expect(() => msg.fundPappusQuote({ collateral: "NVDAx", max_discount_bps: 10001, notice_period_ns: "1", buyer_remote_recipient: null })).toThrow();
  });
  it("ft_transfer_call carries 1 yocto and the msg string (F-013)", () => {
    const t = tx.fundQuote("usdc.t", "core.t", "100000000", { collateral: "NVDAx", max_discount_bps: 250, notice_period_ns: "604800000000000", buyer_remote_recipient: null });
    expect(t.receiverId).toBe("usdc.t");
    expect(t.methodName).toBe("ft_transfer_call");
    expect(t.deposit).toBe("1");
    expect(t.gas).toBe("100000000000000");
    expect(t.args).toEqual({ receiver_id: "core.t", amount: "100000000", memo: null, msg: encodeMsg(t.msg!) });
  });
});

describe("preimage (PRD §9)", () => {
  const fields = {
    chain: "solana-devnet",
    program: "NectarVau1t11111111111111111111111111111111",
    pos: 7n,
    quote: "3",
    repay_e6: "1250000000",
    seize_units: 9876543n,
    recipient: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
    nonce: 42n,
    expires: "1763164800",
  };
  const golden =
    "NECTAR_SETTLE_V1|chain=solana-devnet|program=NectarVau1t11111111111111111111111111111111|pos=7|quote=3|repay_e6=1250000000|seize_units=9876543|recipient=9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin|nonce=42|expires=1763164800";
  it("builds the exact canonical string", () => {
    expect(buildPreimage(fields)).toBe(golden);
  });
  it("round-trips and rejects non-canonical input", () => {
    expect(buildPreimage(parsePreimage(golden))).toBe(golden);
    expect(() => parsePreimage(golden.replace("pos=7", "pos=07"))).toThrow();
    expect(() => parsePreimage(golden.replace("|quote=3", "|quote= 3"))).toThrow();
    expect(() => buildPreimage({ ...fields, recipient: "a|b" })).toThrow();
    expect(() => buildPreimage({ ...fields, recipient: "a b" })).toThrow();
    expect(() => buildPreimage({ ...fields, nonce: (1n << 64n).toString() })).toThrow();
  });
  it("hex payload is utf8 bytes, no pre-hash; domain 1", () => {
    const hex = preimagePayloadHex(golden);
    expect(hex.length).toBe(golden.length * 2);
    expect(Buffer.from(hex, "hex").toString("utf8")).toBe(golden);
    expect(signRequest(golden, "solana-devnet/pos/7")).toEqual({ path: "solana-devnet/pos/7", payload_v2: { Eddsa: hex }, domain_id: 1 });
  });
});

describe("limit maths (interface-p0.md Encoding)", () => {
  const base = {
    decimals: 6,
    base_ltv_bps: 4000,
    max_nectar_ltv_bps: 7000,
    base_haircut_bps: 1000,
    weekend_haircut_bps: 2500,
    limit_premium_bps: 300,
  };
  it("capacity binds when Q is small; weekend haircut and D=0 when closed", () => {
    // 1000 units at $100 = $100,000. Q = $65,000, R = 0, D = $20,000.
    const r = computeLimit({ ...base, units: 1000_000000n, price_usd_e6: 100_000000n, session_open: false, q_usd_e6: 65_000_000000n, r_usd_e6: 0n, d_usd_e6: 20_000_000000n });
    expect(r.value_usd_e6).toBe(100_000_000000n);
    expect(r.haircut_bps).toBe(2500);
    expect(r.d_effective_usd_e6).toBe(0n);
    expect(r.capacity_cap_usd_e6).toBe(48_750_000000n);
    expect(r.b_c_usd_e6).toBe(48_750_000000n);
    expect(r.binding).toBe("capacity");
    expect(r.static_limit_usd_e6).toBe(40_000_000000n);
    const open = computeLimit({ ...base, units: 1000_000000n, price_usd_e6: 100_000000n, session_open: true, q_usd_e6: 65_000_000000n, r_usd_e6: 0n, d_usd_e6: 20_000_000000n });
    expect(open.b_c_usd_e6).toBe(70_000_000000n);
    expect(open.binding).toBe("ltv");
  });
  it("premium only above static, rounded up", () => {
    expect(premiumUsdE6(40_000_000000n, 40_000_000000n, 300)).toBe(0n);
    expect(premiumUsdE6(45_000_000000n, 40_000_000000n, 300)).toBe(150_000000n);
    expect(premiumUsdE6(40_000_000001n, 40_000_000000n, 300)).toBe(1n);
  });
  it("health trigger rule debt*1e4 > V*pre_liq", () => {
    expect(health(1000_000000n, 100_000000n, 6, 75_000_000000n, 7500).triggerable).toBe(false);
    expect(health(1000_000000n, 100_000000n, 6, 75_000_000001n, 7500).triggerable).toBe(true);
  });
  // Shared vectors written by contracts/nectar-core/tests/model.py (WO-2). Skipped until that file exists.
  const csv = resolve(__dirname, "../../../contracts/nectar-core/tests/model.csv");
  it.skipIf(!existsSync(csv))("model.csv vectors present (column mapping wired when WO-2 lands)", () => {
    expect(readFileSync(csv, "utf8").split("\n").length).toBeGreaterThan(1);
  });
});

describe("events + format + config", () => {
  it("parses nectar NEP-297 logs only", () => {
    const ev = parseEventLogs([
      'EVENT_JSON:{"standard":"nectar","version":"1.0.0","event":"quote_funded","data":[{"quote_id":"0","buyer":"b.t","collateral":"NVDAx","amount_usd_e6":"100000000","max_discount_bps":250}]}',
      'EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[]}',
      "plain log",
    ]);
    expect(ev).toHaveLength(1);
    expect(ev[0]?.event).toBe("quote_funded");
  });
  it("formats and parses fixed point", () => {
    expect(formatUsdE6(65_000_000000n)).toBe("$65,000.00");
    expect(formatUsdE6("-1500000")).toBe("-$1.50");
    expect(parseUnits("1,234.5", 6)).toBe(1_234_500000n);
    expect(() => parseUnits("1.1234567", 6)).toThrow();
    expect(bpsToPct(6250)).toBe("62.5 %");
  });
  it("R2-06: commas are thousands separators only (a decimal comma is refused)", () => {
    expect(() => parseUnits("1,5", 6)).toThrow(/commas only group thousands/);
    expect(() => parseUnits("12,34", 6)).toThrow();
    expect(() => parseUnits("1,2345", 6)).toThrow();
    expect(() => parseUnits(",500", 6)).toThrow();
    expect(() => parseUnits("1234,567", 6)).toThrow();
    expect(() => parseUnits("1,234,", 6)).toThrow();
    expect(parseUnits("1,234", 6)).toBe(1_234_000000n);
    expect(parseUnits("12,345,678.9", 6)).toBe(12_345_678_900000n);
    expect(parseUnits("1,500.", 6)).toBe(1_500_000000n);
    expect(parseUnits("1.5", 6)).toBe(1_500000n);
    expect(parseUnits(" 15 ", 6)).toBe(15_000000n);
    expect(parseUnits(".5", 6)).toBe(500000n);
    expect(bpsToPct(4000)).toBe("40 %");
  });
  it("loads config.yaml and reports TODO ids as pending", () => {
    const c = loadPublicConfig(__dirname);
    expect(c.collaterals[0]?.symbol).toBe("NVDAx");
    expect(c.feeSplit.buyers_bps + c.feeSplit.lenders_bps + c.feeSplit.treasury_bps).toBe(10_000);
    if (c.core === null) expect(c.pending).toContain("accounts.core");
  });
});
