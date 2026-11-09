import { describe, expect, it } from "vitest";
import { exitGapUsdE6, oracleSourceLabel, safeHttpsUrl, tgas, tx } from "../src";

const core = "nectar-core.nectar.testnet";
const PYTH_ID = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";

describe("P1 owner builders (interface-p1.md)", () => {
  it("set_quoter_pin with explicit and empty pins", () => {
    const t = tx.setQuoterPin(core, "nectar.testnet/quoter", "v1");
    expect(t).toMatchObject({ receiverId: core, methodName: "set_quoter_pin", args: { project_id: "nectar.testnet/quoter", version_key: "v1" }, deposit: "0", gas: tgas(30) });
    expect(tx.setQuoterPin(core, "", "").label).toMatch(/P0 static pricing/);
  });
  it("set_quoter_config validates every field", () => {
    const ok = tx.setQuoterConfig(core, { deposit_yocto: "100000000000000000000000", gas_tgas: 100, max_instructions: "10000000000", max_memory_mb: 128, max_execution_seconds: 10 });
    expect(ok.args).toEqual({ deposit_yocto: "100000000000000000000000", gas_tgas: 100, max_instructions: "10000000000", max_memory_mb: 128, max_execution_seconds: 10 });
    expect(() => tx.setQuoterConfig(core, { deposit_yocto: "1.5", gas_tgas: 100, max_instructions: "1", max_memory_mb: 1, max_execution_seconds: 1 })).toThrow();
    expect(() => tx.setQuoterConfig(core, { deposit_yocto: "1", gas_tgas: 301, max_instructions: "1", max_memory_mb: 1, max_execution_seconds: 1 })).toThrow();
  });
  it("set_vol_bps, set_max_conf_bps bounds", () => {
    expect(tx.setVolBps(core, "NVDAx", 4500).args).toEqual({ symbol: "NVDAx", vol_bps: 4500 });
    expect(() => tx.setVolBps(core, "NVDAx", 70_000)).toThrow();
    expect(tx.setMaxConfBps(core, 200).args).toEqual({ max_conf_bps: 200 });
    expect(() => tx.setMaxConfBps(core, 10_001)).toThrow();
  });
  it("set_oracle_source encodes the externally tagged enum", () => {
    expect(tx.setOracleSource(core, "NVDAx", "Owner").args).toEqual({ symbol: "NVDAx", source: "Owner" });
    const p = tx.setOracleSource(core, "NVDAx", { Pyth: { account: "pyth-oracle.testnet", price_identifier: PYTH_ID } });
    expect(JSON.stringify(p.args)).toBe(`{"symbol":"NVDAx","source":{"Pyth":{"account":"pyth-oracle.testnet","price_identifier":"${PYTH_ID}"}}}`);
    expect(() => tx.setOracleSource(core, "NVDAx", { Pyth: { account: "pyth-oracle.testnet", price_identifier: "nothex" } })).toThrow();
  });
});

describe("feed helpers", () => {
  it("oracle label, exit gap, https-only links", () => {
    expect(oracleSourceLabel(undefined)).toBe("Owner");
    expect(oracleSourceLabel({ Pyth: { account: "pyth-oracle.testnet", price_identifier: PYTH_ID } })).toBe("Pyth");
    const cap = { q_usd_e6: "100", r_usd_e6: "50", d_usd_e6: "25", session_open: true };
    expect(exitGapUsdE6(200n, cap)).toBe(25n);
    expect(exitGapUsdE6(200n, { ...cap, session_open: false })).toBe(50n);
    expect(exitGapUsdE6(100n, cap)).toBe(0n);
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("http://x.test/a")).toBeNull();
    expect(safeHttpsUrl("https://x.test/a")).toBe("https://x.test/a");
  });
});
