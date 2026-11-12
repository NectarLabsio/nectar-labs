import { describe, expect, it } from "vitest";
import {
  FAUCET_GAS_HEADROOM_YOCTO,
  FAUCET_MINT_GAS_TGAS,
  NectarViews,
  faucetDecision,
  faucetMint,
  faucetNearNeeded,
  faucetPublicConfig,
  isMethodNotFound,
  readFaucetConfig,
  readFaucetStatus,
  spendableYocto,
  walletErrorKind,
  type FaucetConfigView,
  type FaucetStatusView,
  type ViewTransport,
} from "../src";
import { loadPublicConfig } from "../src/config-node";

// WO-62c: builders and readers for the mock-ft faucet (WO-61 interface).
const NOW_MS = Date.UTC(2026, 10, 13, 9, 0);
const NOW_NS = BigInt(NOW_MS) * 1_000_000n;
const CFG: FaucetConfigView = { enabled: true, amount_per_claim: "5000000", cap_per_account: "15000000", cooldown_s: 3600 };
const ST: FaucetStatusView = { claimed: "0", next_claim_at_ns: "0", can_claim: true, storage_cost_yocto: "1250000000000000000000" };

function recorder(answers: Record<string, unknown>): { t: ViewTransport; calls: Array<[string, string, Record<string, unknown>]> } {
  const calls: Array<[string, string, Record<string, unknown>]> = [];
  return {
    calls,
    t: {
      call: async <T>(contractId: string, method: string, args: Record<string, unknown>) => {
        calls.push([contractId, method, args]);
        return answers[method] as T;
      },
    },
  };
}

describe("faucet_mint action builder", () => {
  it("calls faucet_mint with no args, 30 Tgas and exactly the quoted storage cost", () => {
    const i = faucetMint("nvdax-mock.nectar.testnet", "1250000000000000000000", "NVDAx");
    expect(i).toEqual({ receiverId: "nvdax-mock.nectar.testnet", methodName: "faucet_mint", args: {}, gas: "30000000000000", deposit: "1250000000000000000000", label: "Get test NVDAx" });
    expect(FAUCET_MINT_GAS_TGAS).toBe(30);
  });
  it("accepts a zero deposit (existing claimant) and refuses bad input", () => {
    expect(faucetMint("usdc-mock.nectar.testnet", "0").deposit).toBe("0");
    expect(() => faucetMint("usdc-mock.nectar.testnet", "-1")).toThrow(/decimal integer/);
    expect(() => faucetMint("usdc-mock.nectar.testnet", "1.5")).toThrow(/decimal integer/);
    expect(() => faucetMint("Not An Account", "0")).toThrow(/account id/);
  });
});

describe("faucet view readers", () => {
  it("faucet_config takes no args, faucet_status takes account_id, on the token account", async () => {
    const { t, calls } = recorder({ faucet_config: CFG, faucet_status: ST });
    expect(await readFaucetConfig(t, "usdc-mock.nectar.testnet")).toEqual(CFG);
    expect(await readFaucetStatus(t, "usdc-mock.nectar.testnet", "alice.testnet")).toEqual(ST);
    expect(calls).toEqual([
      ["usdc-mock.nectar.testnet", "faucet_config", {}],
      ["usdc-mock.nectar.testnet", "faucet_status", { account_id: "alice.testnet" }],
    ]);
  });
  it("NectarViews exposes the same readers on any token", async () => {
    const { t, calls } = recorder({ faucet_config: CFG, faucet_status: ST });
    const v = new NectarViews("core.testnet", t);
    await v.faucetConfig("nvdax-mock.nectar.testnet");
    await v.faucetStatus("nvdax-mock.nectar.testnet", "bob.testnet");
    expect(calls.map((c) => c[0])).toEqual(["nvdax-mock.nectar.testnet", "nvdax-mock.nectar.testnet"]);
    expect(calls[1]![2]).toEqual({ account_id: "bob.testnet" });
  });
});

describe("faucetDecision", () => {
  it("can_claim = true: claim, deposit = storage_cost_yocto", () => {
    expect(faucetDecision(CFG, ST, NOW_MS)).toEqual({ ok: true, deposit: "1250000000000000000000" });
  });
  it("disabled wins over every other reason", () => {
    expect(faucetDecision({ ...CFG, enabled: false }, { ...ST, can_claim: false, claimed: "15000000", next_claim_at_ns: (NOW_NS + 10n ** 12n).toString() }, NOW_MS)).toEqual({ ok: false, block: { kind: "disabled" } });
  });
  it("cap: claimed + amount_per_claim > cap", () => {
    expect(faucetDecision(CFG, { ...ST, can_claim: false, claimed: "15000000" }, NOW_MS)).toEqual({ ok: false, block: { kind: "cap", claimed: "15000000", cap: "15000000" } });
    // 12 claimed, 5 more would exceed 15
    expect(faucetDecision(CFG, { ...ST, can_claim: false, claimed: "12000000" }, NOW_MS)).toMatchObject({ ok: false, block: { kind: "cap" } });
  });
  it("cooldown: seconds until next_claim_at_ns, rounded up; number or string ns", () => {
    const next = NOW_NS + 2_520n * 1_000_000_000n + 1n;
    expect(faucetDecision(CFG, { ...ST, can_claim: false, claimed: "5000000", next_claim_at_ns: next.toString() }, NOW_MS)).toEqual({ ok: false, block: { kind: "cooldown", waitS: 2521, nextClaimAtNs: next.toString() } });
    const r = faucetDecision(CFG, { ...ST, can_claim: false, claimed: "5000000", next_claim_at_ns: Number(NOW_NS / 1_000_000n + 60_000n) * 1_000_000 }, NOW_MS);
    expect(r.ok === false && r.block.kind === "cooldown" ? r.block.waitS : null).toBeGreaterThanOrEqual(59);
  });
  it("refused when the contract says no and none of the known reasons applies", () => {
    expect(faucetDecision(CFG, { ...ST, can_claim: false, claimed: "0", next_claim_at_ns: "0" }, NOW_MS)).toEqual({ ok: false, block: { kind: "refused" } });
  });
});

describe("NEAR balance check", () => {
  it("spendable = amount minus storage staking not covered by locked (1E19 yocto/byte, F-176)", () => {
    expect(spendableYocto({ amount: "1000000000000000000000000", locked: "0", storage_usage: 182 })).toBe(10n ** 24n - 182n * 10n ** 19n);
    expect(spendableYocto({ amount: "1000", locked: "0", storage_usage: 182 })).toBe(0n);
    expect(spendableYocto({ amount: "5000", locked: String(182n * 10n ** 19n), storage_usage: 182 })).toBe(5000n);
  });
  it("needed = sum of deposits + gas headroom", () => {
    expect(faucetNearNeeded(["1250000000000000000000", "0"])).toBe(1_250_000_000_000_000_000_000n + FAUCET_GAS_HEADROOM_YOCTO);
    expect(faucetNearNeeded([])).toBe(FAUCET_GAS_HEADROOM_YOCTO);
  });
});

describe("walletErrorKind / isMethodNotFound", () => {
  it("classifies wallet and chain errors", () => {
    expect(walletErrorKind("User rejected the request")).toBe("rejected");
    expect(walletErrorKind("User cancelled the action")).toBe("rejected");
    expect(walletErrorKind('{"InvalidTxError":{"NotEnoughBalance":{"signer_id":"a.testnet"}}}')).toBe("low-balance");
    expect(walletErrorKind('{"ActionError":{"kind":{"LackBalanceForState":{"account_id":"a.testnet"}}}}')).toBe("low-balance");
    expect(walletErrorKind("Smart contract panicked: faucet: cooldown")).toBe("error");
    expect(walletErrorKind(null)).toBe("error");
  });
  it("MethodNotFound = the token has no faucet views yet", () => {
    expect(isMethodNotFound(new Error("faucet_status: wasm execution failed with error: MethodResolveError(MethodNotFound)"))).toBe(true);
    expect(isMethodNotFound(new Error("faucet_status: HTTP 503"))).toBe(false);
  });
});

describe("faucetPublicConfig", () => {
  it("reads the config.yaml faucet block", () => {
    const f = loadPublicConfig().faucet;
    expect(f.gas_faucet).toMatch(/^https:\/\//);
    expect(f.tokens.map((t) => t.symbol)).toEqual(["NVDAx", "USDC"]);
    for (const t of f.tokens) expect(t.amount_per_claim).toMatch(/^[0-9]+$/);
  });
  it("missing or malformed input degrades to an empty faucet", () => {
    expect(faucetPublicConfig(undefined)).toEqual({ cooldown_s: null, gas_faucet: null, tokens: [] });
    expect(faucetPublicConfig({ gas_faucet: "http://insecure.example", tokens: [{ symbol: "X", token: "TODO-G2" }, { symbol: "Y", token: "y.testnet", amount_per_claim: 5 }] })).toEqual({
      cooldown_s: null,
      gas_faucet: null,
      tokens: [{ symbol: "Y", token: "y.testnet", amount_per_claim: "5", cap_per_account: "0" }],
    });
  });
});
