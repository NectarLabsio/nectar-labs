// NectarVaultBase calldata (interface-v7 §E, evm/src/NectarVaultBase.sol): slots are keyed by (id, depositor), so `positionOf` and
// `settle` / `release` name the depositor. Hand-encoded because every argument is static, so the SDK needs no EVM runtime; the
// selectors and bytes are checked against viem and the Solidity source in packages/sdk/test/evm.test.ts.

export type Hex = `0x${string}`;

/** First four bytes of keccak256 of each signature below. */
export const EVM_SELECTOR = {
  /** openPosition(uint64,address,uint256) */
  openPosition: "1e125296",
  /** positionOf(uint64,address) */
  positionOf: "543d8b01",
  /** settle((uint64,uint64,uint256,uint256,address,uint64,uint64,uint8),address,uint8,bytes32,bytes32) */
  settle: "722cad37",
  /** release((uint64,address,uint64,uint64),address,uint8,bytes32,bytes32) */
  release: "490e76b8",
} as const;

export const EVM_STATUS = { None: 0, Open: 1, Settled: 2, Released: 3 } as const;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const WORD_RE = /^0x[0-9a-fA-F]{64}$/;

/** Same rule as nectar-core `valid_evm_recipient`: a 0x address that is not zero. */
export function isEvmDepositor(s: string): boolean {
  return ADDRESS_RE.test(s) && /[1-9a-fA-F]/.test(s.slice(2));
}

function uintWord(n: bigint, bits: number, field: string): string {
  if (n < 0n || n >= 1n << BigInt(bits)) throw new Error(`${field} does not fit uint${bits}`);
  return n.toString(16).padStart(64, "0");
}

function addressWord(a: string, field: string): string {
  if (!ADDRESS_RE.test(a)) throw new Error(`${field} must be a 0x address`);
  return a.slice(2).toLowerCase().padStart(64, "0");
}

function bytes32Word(h: string, field: string): string {
  if (!WORD_RE.test(h)) throw new Error(`${field} must be 32 bytes of hex`);
  return h.slice(2).toLowerCase();
}

export function openPositionCalldata(id: bigint, authority: string, amount: bigint): Hex {
  return `0x${EVM_SELECTOR.openPosition}${uintWord(id, 64, "id")}${addressWord(authority, "authority")}${uintWord(amount, 256, "amount")}`;
}

export function positionOfCalldata(id: bigint, depositor: string): Hex {
  return `0x${EVM_SELECTOR.positionOf}${uintWord(id, 64, "id")}${addressWord(depositor, "depositor")}`;
}

export interface EvmPosition {
  authority: Hex;
  depositor: Hex;
  amount: bigint;
  /** `EVM_STATUS`: an all-zero answer means the slot was never opened. */
  status: number;
}

/** Decodes the `positionOf` return data: `(address authority, address slotDepositor, uint256 amount, uint8 status)`. */
export function decodePositionOf(data: string): EvmPosition {
  const h = data.startsWith("0x") ? data.slice(2) : data;
  if (h.length !== 256 || !/^[0-9a-fA-F]*$/.test(h)) throw new Error("positionOf must return four 32-byte words");
  const word = (i: number) => h.slice(i * 64, (i + 1) * 64);
  return { authority: `0x${word(0).slice(24)}`, depositor: `0x${word(1).slice(24)}`, amount: BigInt(`0x${word(2)}`), status: Number(BigInt(`0x${word(3)}`)) };
}

export interface EvmSignature {
  v: number;
  r: string;
  s: string;
}

export interface EvmSettleMessage {
  positionId: bigint;
  quoteId: bigint;
  repayE6: bigint;
  seizeRaw: bigint;
  recipient: string;
  nonce: bigint;
  expires: bigint;
  kind: number;
}

export interface EvmReleaseMessage {
  positionId: bigint;
  recipient: string;
  nonce: bigint;
  expires: bigint;
}

const signatureWords = (sig: EvmSignature): string => `${uintWord(BigInt(sig.v), 8, "v")}${bytes32Word(sig.r, "r")}${bytes32Word(sig.s, "s")}`;

/** `settle(Settle m, address depositor, uint8 v, bytes32 r, bytes32 s)`. The typed data does not name the depositor; the slot does. */
export function settleCalldata(m: EvmSettleMessage, depositor: string, sig: EvmSignature): Hex {
  const struct = [
    uintWord(m.positionId, 64, "positionId"),
    uintWord(m.quoteId, 64, "quoteId"),
    uintWord(m.repayE6, 256, "repayE6"),
    uintWord(m.seizeRaw, 256, "seizeRaw"),
    addressWord(m.recipient, "recipient"),
    uintWord(m.nonce, 64, "nonce"),
    uintWord(m.expires, 64, "expires"),
    uintWord(BigInt(m.kind), 8, "kind"),
  ].join("");
  return `0x${EVM_SELECTOR.settle}${struct}${addressWord(depositor, "depositor")}${signatureWords(sig)}`;
}

/** `release(Release m, address depositor, uint8 v, bytes32 r, bytes32 s)`. */
export function releaseCalldata(m: EvmReleaseMessage, depositor: string, sig: EvmSignature): Hex {
  const struct = [uintWord(m.positionId, 64, "positionId"), addressWord(m.recipient, "recipient"), uintWord(m.nonce, 64, "nonce"), uintWord(m.expires, 64, "expires")].join("");
  return `0x${EVM_SELECTOR.release}${struct}${addressWord(depositor, "depositor")}${signatureWords(sig)}`;
}
