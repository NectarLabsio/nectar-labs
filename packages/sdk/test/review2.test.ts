import { describe, expect, it } from "vitest";
import {
  MainnetRpcError,
  NectarViews,
  assertNotMainnetRpc,
  describeTransferAmount,
  formatUnitsTrim,
  intentHash,
  isImplicitAccount,
  isMainnetUrl,
  isTestnetSigner,
  resilientRpcTransport,
  testnetSignerBlock,
  tokenTable,
  tx,
  txNotes,
  type FetchLike,
} from "../src/index";

// Review 2 (docs/work/review-2-findings.md): R2-06 amount display, R2-07 intent hash, R2-09 view_account, R2-10 network guards.

function scripted(replies: Array<{ status: number; body: unknown } | Error>) {
  const seen: Array<Record<string, unknown>> = [];
  const f: FetchLike = async (_url, init) => {
    seen.push(JSON.parse(init.body) as Record<string, unknown>);
    const r = replies.shift() ?? new Error("no reply scripted");
    if (r instanceof Error) throw r;
    const text = JSON.stringify(r.body);
    return { status: r.status, ok: r.status < 400, text: async () => text };
  };
  return { f, seen };
}
const opts = (f: FetchLike) => ({ urls: ["https://a.example"], fetch: f, sleep: async () => undefined, random: () => 0.5 });

// Shapes observed on test.rpc.fastnear.com, 2026-11-11 (query view_account, finality final).
const UNKNOWN = (id: string) => ({
  jsonrpc: "2.0",
  id: "nectar",
  error: { name: "HANDLER_ERROR", cause: { info: { block_height: 1, requested_account_id: id }, name: "UNKNOWN_ACCOUNT" }, code: -32000, message: "Server error", data: `account ${id} does not exist while viewing` },
});
const EXISTS = { jsonrpc: "2.0", id: "nectar", result: { amount: "867079915132972581060305522944", block_hash: "x", block_height: 1, code_hash: "11111111111111111111111111111111", locked: "0", storage_paid_at: 0, storage_usage: 182 } };

describe("R2-09 view_account through the resilient transport", () => {
  it("existing account → view; UNKNOWN_ACCOUNT → null (not retried); request shape", async () => {
    const { f, seen } = scripted([{ status: 200, body: EXISTS }, { status: 200, body: UNKNOWN("alise.testnet") }]);
    const t = resilientRpcTransport(opts(f));
    await expect(t.viewAccount!("alice.testnet")).resolves.toMatchObject({ amount: "867079915132972581060305522944", storage_usage: 182 });
    await expect(t.viewAccount!("alise.testnet")).resolves.toBeNull();
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ method: "query", params: { request_type: "view_account", finality: "final", account_id: "alice.testnet" } });
  });
  it("transport failures throw (callers fail closed) after retries", async () => {
    const { f, seen } = scripted([{ status: 503, body: {} }, { status: 503, body: {} }, { status: 503, body: {} }]);
    const v = new NectarViews("core.testnet", resilientRpcTransport(opts(f)));
    await expect(v.accountExists("alice.testnet")).rejects.toThrow(/HTTP 503/);
    expect(seen).toHaveLength(3);
  });
  it("NectarViews.accountExists maps to a boolean", async () => {
    const { f } = scripted([{ status: 200, body: EXISTS }, { status: 200, body: UNKNOWN("nobody.testnet") }]);
    const v = new NectarViews("core.testnet", resilientRpcTransport(opts(f)));
    expect(await v.accountExists("alice.testnet")).toBe(true);
    expect(await v.accountExists("nobody.testnet")).toBe(false);
  });
  it("view calls still decode after the refactor", async () => {
    const { f } = scripted([{ status: 200, body: { jsonrpc: "2.0", id: "nectar", result: { result: Array.from(new TextEncoder().encode('"2.0.0-v7"')), logs: [] } } }]);
    expect(await new NectarViews("core.testnet", resilientRpcTransport(opts(f))).contractVersion()).toBe("2.0.0-v7");
  });
});

describe("R2-10 network guards", () => {
  it("testnet signers only: .testnet or implicit", () => {
    expect(isTestnetSigner("alice.testnet")).toBe(true);
    expect(isTestnetSigner("borrower1.nectar.testnet")).toBe(true);
    expect(isTestnetSigner("ab".repeat(32))).toBe(true);
    expect(isTestnetSigner("0x" + "ab".repeat(20))).toBe(true);
    expect(isTestnetSigner("alice.near")).toBe(false);
    expect(isTestnetSigner("near")).toBe(false);
    expect(isTestnetSigner("testnet")).toBe(false);
    expect(isTestnetSigner("alice.testnet.near")).toBe(false);
    expect(isTestnetSigner("AB".repeat(32))).toBe(false);
    expect(isTestnetSigner("0x" + "ab".repeat(19))).toBe(false);
    expect(isTestnetSigner(null)).toBe(false);
    expect(isImplicitAccount("ab".repeat(32))).toBe(true);
    expect(testnetSignerBlock("alice.near")).toMatch(/alice\.near is not a NEAR testnet account/);
    expect(testnetSignerBlock("alice.testnet")).toBeNull();
  });
  it("mainnet RPC URLs are refused (NEAR and Solana)", () => {
    for (const u of ["https://rpc.mainnet.near.org", "https://rpc.mainnet.fastnear.com", "https://api.mainnet-beta.solana.com", "https://MAINNET.helius-rpc.com/?k=1"]) {
      expect(isMainnetUrl(u)).toBe(true);
      expect(() => assertNotMainnetRpc(u, "NEXT_PUBLIC_NEAR_RPC")).toThrow(MainnetRpcError);
    }
    for (const u of ["https://test.rpc.fastnear.com", "https://rpc.testnet.fastnear.com", "https://api.devnet.solana.com"]) {
      expect(assertNotMainnetRpc(u, "X")).toBe(u);
    }
    expect(() => assertNotMainnetRpc("https://rpc.mainnet.near.org", "NEXT_PUBLIC_NEAR_RPC")).toThrow(/NEXT_PUBLIC_NEAR_RPC/);
  });
});

describe("R2-06 decoded amount for the sign modal", () => {
  const tokens = { "nvdax-mock.nectar.testnet": { symbol: "NVDAx", decimals: 6 }, "usdc-mock.nectar.testnet": { symbol: "USDC", decimals: 6, usd: true } };
  it("ft_transfer_call: token units (and USD for USDC)", () => {
    const b = tx.borrow("nvdax-mock.nectar.testnet", "core.testnet", "15000000", { collateral: "NVDAx", borrow_usd_e6: "5000000", pre_liq_ltv_bps: 7500 });
    expect(describeTransferAmount(b, tokens)).toBe("15 NVDAx (15000000 base units)");
    const r = tx.repay("usdc-mock.nectar.testnet", "core.testnet", "1500000", "7");
    expect(describeTransferAmount(r, tokens)).toBe("1.5 USDC ($1.50) (1500000 base units)");
    const unk = tx.supply("other.testnet", "core.testnet", "42");
    expect(describeTransferAmount(unk, tokens)).toBe("42 base units of other.testnet (decimals unknown)");
    expect(describeTransferAmount(txNotes.nftTransfer("core.testnet", "p-1", "a.testnet"), tokens)).toBeNull();
  });
  it("tokenTable maps config tokens (collaterals + USDC)", () => {
    const t = tokenTable({ usdc: "usdc-mock.nectar.testnet", usdcDecimals: 6, collaterals: [{ symbol: "NVDAx", token: "nvdax-mock.nectar.testnet", decimals: 6 }, { symbol: "X", token: null, decimals: 8 }] });
    expect(t).toEqual(tokens);
  });
  it("formatUnitsTrim drops trailing zeros only after a decimal point", () => {
    expect(formatUnitsTrim(15_000_000n, 6)).toBe("15");
    expect(formatUnitsTrim(1_500_000n, 6)).toBe("1.5");
    expect(formatUnitsTrim(100_000_000n, 6)).toBe("100");
    expect(formatUnitsTrim(1_234_567_000_001n, 6)).toBe("1,234,567.000001");
    expect(formatUnitsTrim(100n, 0)).toBe("100");
  });
});

describe("R2-07 intent hash", () => {
  const a = { collateral: "NVDAx", borrow_usd_e6: "5000000", pre_liq_ltv_bps: 7500 };
  it("changes when the signed call changes, stable otherwise", () => {
    const plain = tx.borrow("nvdax-mock.nectar.testnet", "core.testnet", "15000000", a);
    const same = tx.borrow("nvdax-mock.nectar.testnet", "core.testnet", "15000000", { ...a });
    const shield = tx.borrow("nvdax-mock.nectar.testnet", "core.testnet", "15000000", { ...a, shield: { kind: "Weekend", window_end_ns: "1" } });
    const more = tx.borrow("nvdax-mock.nectar.testnet", "core.testnet", "150000000", a);
    expect(intentHash(plain)).toBe(intentHash(same));
    expect(intentHash(plain)).not.toBe(intentHash(shield));
    expect(intentHash(plain)).not.toBe(intentHash(more));
    expect(intentHash(null)).toBeNull();
  });
});
