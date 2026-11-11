// WO-34w: NectarVaultBase calldata against viem (the encoder the keeper uses) and the Solidity source. viem is loaded by path at runtime
// because it is a dependency of services/keeper, not of this package.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVM_SELECTOR, decodePositionOf, isEvmDepositor, openPositionCalldata, positionOfCalldata, releaseCalldata, settleCalldata } from "../src/index";

interface Viem {
  parseAbi: (sigs: readonly string[]) => readonly unknown[];
  encodeFunctionData: (a: { abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) => string;
  encodeAbiParameters: (types: readonly { type: string }[], values: readonly unknown[]) => string;
  toFunctionSelector: (sig: string) => string;
}
const viem = (await import(/* @vite-ignore */ new URL("../../../services/keeper/node_modules/viem/_esm/index.js", import.meta.url).href)) as Viem;

const SOL = readFileSync(new URL("../../../evm/src/NectarVaultBase.sol", import.meta.url), "utf8");
const ABI = viem.parseAbi([
  "struct Settle { uint64 positionId; uint64 quoteId; uint256 repayE6; uint256 seizeRaw; address recipient; uint64 nonce; uint64 expires; uint8 kind; }",
  "struct Release { uint64 positionId; address recipient; uint64 nonce; uint64 expires; }",
  "function openPosition(uint64 id, address authority, uint256 amount)",
  "function positionOf(uint64 id, address depositor) view returns (address authority, address slotDepositor, uint256 amount, uint8 status)",
  "function settle(Settle m, address depositor, uint8 v, bytes32 r, bytes32 s)",
  "function release(Release m, address depositor, uint8 v, bytes32 r, bytes32 s)",
]);

const DEPOSITOR = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const R = `0x${"ab".repeat(32)}`;
const S = `0x${"cd".repeat(32)}`;
const sig = { v: 27, r: R, s: S };

describe("NectarVaultBase calldata", () => {
  it("the signatures exist in the Solidity source", () => {
    expect(SOL).toContain("function openPosition(uint64 id, address authority, uint256 amount) external");
    expect(SOL).toMatch(/function positionOf\(uint64 id, address depositor\)/);
    expect(SOL).toContain("function settle(Settle calldata m, address depositor, uint8 v, bytes32 r, bytes32 s) external");
    expect(SOL).toContain("function release(Release calldata m, address depositor, uint8 v, bytes32 r, bytes32 s) external");
  });
  it("selectors match keccak of each signature", () => {
    expect(`0x${EVM_SELECTOR.openPosition}`).toBe(viem.toFunctionSelector("function openPosition(uint64,address,uint256)"));
    expect(`0x${EVM_SELECTOR.positionOf}`).toBe(viem.toFunctionSelector("function positionOf(uint64,address)"));
    expect(`0x${EVM_SELECTOR.settle}`).toBe(viem.toFunctionSelector("function settle((uint64,uint64,uint256,uint256,address,uint64,uint64,uint8),address,uint8,bytes32,bytes32)"));
    expect(`0x${EVM_SELECTOR.release}`).toBe(viem.toFunctionSelector("function release((uint64,address,uint64,uint64),address,uint8,bytes32,bytes32)"));
  });
  it("positionOf(id, depositor)", () => {
    expect(positionOfCalldata(7n, DEPOSITOR)).toBe(viem.encodeFunctionData({ abi: ABI, functionName: "positionOf", args: [7n, DEPOSITOR] }));
  });
  it("openPosition", () => {
    expect(openPositionCalldata(7n, RECIPIENT, 10n ** 24n)).toBe(viem.encodeFunctionData({ abi: ABI, functionName: "openPosition", args: [7n, RECIPIENT, 10n ** 24n] }));
  });
  it("settle carries the depositor after the struct", () => {
    const m = { positionId: 7n, quoteId: 3n, repayE6: 1_000_000n, seizeRaw: 5n * 10n ** 18n, recipient: RECIPIENT, nonce: 9n, expires: 1_800_000_000n, kind: 1 };
    expect(settleCalldata(m, DEPOSITOR, sig)).toBe(viem.encodeFunctionData({ abi: ABI, functionName: "settle", args: [m, DEPOSITOR, 27, R, S] }));
  });
  it("release carries the depositor after the struct", () => {
    const m = { positionId: 7n, recipient: DEPOSITOR, nonce: 9n, expires: 1_800_000_000n };
    expect(releaseCalldata(m, DEPOSITOR, { ...sig, v: 28 })).toBe(viem.encodeFunctionData({ abi: ABI, functionName: "release", args: [m, DEPOSITOR, 28, R, S] }));
  });
  it("decodes the positionOf answer", () => {
    const data = viem.encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint8" }], [RECIPIENT, DEPOSITOR, 42n, 2]);
    expect(decodePositionOf(data)).toEqual({ authority: RECIPIENT, depositor: DEPOSITOR, amount: 42n, status: 2 });
    expect(() => decodePositionOf("0x00")).toThrow(/four/);
  });
  it("range and format checks", () => {
    expect(() => positionOfCalldata(1n << 64n, DEPOSITOR)).toThrow(/uint64/);
    expect(() => positionOfCalldata(1n, "0x12")).toThrow(/address/);
    expect(() => releaseCalldata({ positionId: 1n, recipient: DEPOSITOR, nonce: 1n, expires: 1n }, DEPOSITOR, { v: 27, r: "0x00", s: S })).toThrow(/32 bytes/);
    expect(isEvmDepositor(DEPOSITOR)).toBe(true);
    expect(isEvmDepositor(`0x${"0".repeat(40)}`)).toBe(false);
    expect(isEvmDepositor("3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV")).toBe(false);
  });
});
