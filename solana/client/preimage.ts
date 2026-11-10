// Preimages nectar_vault rebuilds on-chain (interface-v7 §B). Kind 0 = the v1 preimage byte for byte
// (contracts/nectar-core/tests/preimage_vectors.json). The NEAR contract is the only production signer; this
// copy exists for tests and for the keeper to sanity-check a payload before relaying it.

export const SOLANA_CHAIN = "solana-devnet";

export const KIND_LEGACY = 0;
export const KIND_PRELIQ = 1;
export const KIND_SELF = 2;
export type SettleKind = typeof KIND_LEGACY | typeof KIND_PRELIQ | typeof KIND_SELF;

const SUFFIX: Record<SettleKind, string> = { 0: "", 1: "|kind=PRELIQ", 2: "|kind=SELF" };

export interface SettleFields {
  program: string; // vault program id, base58
  positionId: bigint;
  quoteId: bigint;
  repayE6: bigint;
  seizeUnits: bigint;
  recipient: string; // base58
  nonce: bigint;
  expires: bigint; // unix seconds
  kind: SettleKind;
}

export interface ReleaseFields {
  program: string; // vault program id, base58 (the `vault=` field)
  positionId: bigint;
  recipient: string; // position depositor, base58
  nonce: bigint;
  expires: bigint;
}

export function settlePreimage(f: SettleFields): string {
  return (
    `NECTAR_SETTLE_V1|chain=${SOLANA_CHAIN}|program=${f.program}|pos=${f.positionId}|quote=${f.quoteId}` +
    `|repay_e6=${f.repayE6}|seize_units=${f.seizeUnits}|recipient=${f.recipient}|nonce=${f.nonce}|expires=${f.expires}` +
    SUFFIX[f.kind]
  );
}

export function releasePreimage(f: ReleaseFields): string {
  return `NECTAR_RELEASE_V1|chain=${SOLANA_CHAIN}|vault=${f.program}|pos=${f.positionId}|recipient=${f.recipient}|nonce=${f.nonce}|expires=${f.expires}`;
}

export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
