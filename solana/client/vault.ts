// nectar_vault v2 byte layouts, parsers and instruction builders (interface-v7 §E, solana/deploy.md). The kit types are
// type-only imports; the only runtime import is ./pda.ts (node:crypto), so the keeper can import this file directly.
// Every builder is exercised against the program in tests/nectar_vault.test.ts.
import type { AccountMeta, AccountRole, Address, Instruction } from "@solana/kit";
import { INSTRUCTIONS_SYSVAR_ADDRESS } from "./ed25519.ts";
import {
  ASSOCIATED_TOKEN_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  associatedTokenAddress,
  base58Encode,
  claimAddress,
  keyBytes,
  nonceAddress,
  positionAddress,
  u64le,
  vaultAddress,
  vaultTokensAddress,
} from "./pda.ts";

export const DISCRIMINATOR = {
  init_vault: [77, 79, 85, 150, 33, 217, 52, 106],
  open_position: [135, 128, 47, 77, 15, 152, 240, 49],
  settle: [175, 42, 185, 87, 144, 131, 102, 212],
  release: [253, 249, 15, 206, 28, 127, 193, 241],
  withdraw: [183, 18, 70, 156, 148, 109, 161, 34],
  claim: [62, 198, 214, 193, 213, 159, 108, 210],
} as const;

export const ACCOUNT_DISCRIMINATOR = {
  Vault: [211, 8, 232, 43, 2, 152, 117, 119],
  Position: [170, 188, 143, 228, 122, 64, 247, 208],
  NonceRecord: [108, 73, 223, 163, 215, 18, 237, 161],
  Claim: [155, 70, 22, 176, 123, 215, 246, 102],
} as const;

export const POSITION_LAYOUT_VERSION = 2;
export const NONCE_LAYOUT_VERSION = 2;
export const CLAIM_LAYOUT_VERSION = 1;

export const STATUS_OPEN = 1;
export const STATUS_SETTLED = 2;
export const STATUS_RELEASED = 3;
export const OP_SETTLE = 0;
export const OP_RELEASE = 1;

export const POSITION_V2 = { len: 131, version: 8, authority: 9, depositor: 41, amount: 73, status: 81, vault: 82, positionId: 114, bump: 122, withdrawable: 123 } as const;
export const NONCE_RECORD_V2 = { len: 91, version: 8, vault: 9, authority: 41, nonce: 73, positionId: 81, op: 89, kind: 90 } as const;
export const CLAIM_V1 = { len: 82, version: 8, vault: 9, recipient: 41, amount: 73, bump: 81 } as const;

export interface PositionV2 {
  version: number;
  authority: Uint8Array;
  depositor: string;
  amount: bigint;
  status: number;
  vault: string;
  positionId: bigint;
  bump: number;
  withdrawable: bigint;
}

export interface NonceRecordV2 {
  version: number;
  vault: string;
  authority: Uint8Array;
  nonce: bigint;
  positionId: bigint;
  op: number;
  kind: number;
}

export interface ClaimV1 {
  version: number;
  vault: string;
  recipient: string;
  amount: bigint;
  bump: number;
}

function check(data: Uint8Array, name: string, len: number, disc: readonly number[], version: number): DataView {
  if (data.length !== len) throw new Error(`${name} account is ${data.length} bytes, expected ${len}`);
  if (!disc.every((b, i) => data[i] === b)) throw new Error(`not a nectar_vault ${name} account`);
  if (data[8] !== version) throw new Error(`${name} layout version is ${data[8]}, expected ${version}`);
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

const key = (data: Uint8Array, at: number): string => base58Encode(data.subarray(at, at + 32));

/** Parses a `Position` v2 account. The caller must first check that the account owner is the vault program. */
export function parsePosition(data: Uint8Array): PositionV2 {
  const L = POSITION_V2;
  const v = check(data, "Position", L.len, ACCOUNT_DISCRIMINATOR.Position, POSITION_LAYOUT_VERSION);
  return {
    version: v.getUint8(L.version),
    authority: data.slice(L.authority, L.authority + 32),
    depositor: key(data, L.depositor),
    amount: v.getBigUint64(L.amount, true),
    status: v.getUint8(L.status),
    vault: key(data, L.vault),
    positionId: v.getBigUint64(L.positionId, true),
    bump: v.getUint8(L.bump),
    withdrawable: v.getBigUint64(L.withdrawable, true),
  };
}

/** Parses a `NonceRecord` v2 account. The caller must first check that the account owner is the vault program. */
export function parseNonceRecord(data: Uint8Array): NonceRecordV2 {
  const L = NONCE_RECORD_V2;
  const v = check(data, "NonceRecord", L.len, ACCOUNT_DISCRIMINATOR.NonceRecord, NONCE_LAYOUT_VERSION);
  return {
    version: v.getUint8(L.version),
    vault: key(data, L.vault),
    authority: data.slice(L.authority, L.authority + 32),
    nonce: v.getBigUint64(L.nonce, true),
    positionId: v.getBigUint64(L.positionId, true),
    op: v.getUint8(L.op),
    kind: v.getUint8(L.kind),
  };
}

/** Parses a `Claim` account. The caller must first check that the account owner is the vault program. */
export function parseClaim(data: Uint8Array): ClaimV1 {
  const L = CLAIM_V1;
  const v = check(data, "Claim", L.len, ACCOUNT_DISCRIMINATOR.Claim, CLAIM_LAYOUT_VERSION);
  return {
    version: v.getUint8(L.version),
    vault: key(data, L.vault),
    recipient: key(data, L.recipient),
    amount: v.getBigUint64(L.amount, true),
    bump: v.getUint8(L.bump),
  };
}

function i64le(n: bigint): Uint8Array {
  if (n < -(1n << 63n) || n >= 1n << 63n) throw new Error(`i64 out of range: ${n}`);
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, n, true);
  return out;
}

function concat(...parts: ReadonlyArray<ArrayLike<number>>): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export interface SettleArgs {
  positionId: bigint;
  quoteId: bigint;
  repayE6: bigint;
  seizeUnits: bigint;
  recipient: string; // base58
  nonce: bigint;
  expires: bigint;
  kind: number;
}

export function openPositionData(positionId: bigint, authority: Uint8Array, amount: bigint): Uint8Array {
  if (authority.length !== 32) throw new Error(`authority must be 32 bytes, got ${authority.length}`);
  return concat(DISCRIMINATOR.open_position, u64le(positionId), authority, u64le(amount));
}

/** 89 bytes. */
export function settleData(a: SettleArgs): Uint8Array {
  return concat(
    DISCRIMINATOR.settle,
    u64le(a.positionId),
    u64le(a.quoteId),
    u64le(a.repayE6),
    u64le(a.seizeUnits),
    keyBytes(a.recipient),
    u64le(a.nonce),
    i64le(a.expires),
    [a.kind],
  );
}

/** 32 bytes. */
export const releaseData = (positionId: bigint, nonce: bigint, expires: bigint): Uint8Array =>
  concat(DISCRIMINATOR.release, u64le(positionId), u64le(nonce), i64le(expires));
/** 16 bytes. */
export const withdrawData = (positionId: bigint): Uint8Array => concat(DISCRIMINATOR.withdraw, u64le(positionId));
/** 8 bytes. */
export const claimData = (): Uint8Array => Uint8Array.from(DISCRIMINATOR.claim);

const READONLY = 0 as AccountRole;
const WRITABLE = 1 as AccountRole;
const WRITABLE_SIGNER = 3 as AccountRole;
const meta = (a: string, role: AccountRole): AccountMeta => ({ address: a as Address, role });

export interface VaultIds {
  program: string;
  mint: string;
  vault: string;
  vaultTokens: string;
  tokenProgram: string; // the owner of the mint account
}

export function vaultIds(program: string, mint: string, tokenProgram: string = TOKEN_PROGRAM): VaultIds {
  const vault = vaultAddress(program, mint);
  return { program, mint, vault, vaultTokens: vaultTokensAddress(program, vault), tokenProgram };
}

export type VaultInstruction = Instruction<string> & { accounts: AccountMeta[]; data: Uint8Array };

const ix = (ids: VaultIds, accounts: AccountMeta[], data: Uint8Array): VaultInstruction => ({
  programAddress: ids.program as Address,
  accounts,
  data,
});

/** Accounts: depositor (signer, w), vault, mint, vault_tokens (w), depositor_tokens (w), position (w), token_program, system_program. */
export function openPositionInstruction(
  ids: VaultIds,
  depositor: string,
  depositorTokens: string,
  f: { positionId: bigint; authority: Uint8Array; amount: bigint },
): VaultInstruction {
  return ix(
    ids,
    [
      meta(depositor, WRITABLE_SIGNER),
      meta(ids.vault, READONLY),
      meta(ids.mint, READONLY),
      meta(ids.vaultTokens, WRITABLE),
      meta(depositorTokens, WRITABLE),
      meta(positionAddress(ids.program, ids.vault, f.positionId, depositor), WRITABLE),
      meta(ids.tokenProgram, READONLY),
      meta(SYSTEM_PROGRAM, READONLY),
    ],
    openPositionData(f.positionId, f.authority, f.amount),
  );
}

/**
 * Accounts: payer (signer, w), vault, mint, vault_tokens (w), position (w), recipient_account, recipient_tokens (w),
 * claim (w), nonce_record (w), instructions sysvar, token_program, associated_token_program, system_program.
 * Goes immediately after the Ed25519 verify instruction.
 */
export function settleInstruction(ids: VaultIds, payer: string, depositor: string, a: SettleArgs): VaultInstruction {
  const position = positionAddress(ids.program, ids.vault, a.positionId, depositor);
  return ix(
    ids,
    [
      meta(payer, WRITABLE_SIGNER),
      meta(ids.vault, READONLY),
      meta(ids.mint, READONLY),
      meta(ids.vaultTokens, WRITABLE),
      meta(position, WRITABLE),
      meta(a.recipient, READONLY),
      meta(associatedTokenAddress(a.recipient, ids.mint, ids.tokenProgram), WRITABLE),
      meta(claimAddress(ids.program, ids.vault, a.recipient), WRITABLE),
      meta(nonceAddress(ids.program, position, a.nonce), WRITABLE),
      meta(INSTRUCTIONS_SYSVAR_ADDRESS, READONLY),
      meta(ids.tokenProgram, READONLY),
      meta(ASSOCIATED_TOKEN_PROGRAM, READONLY),
      meta(SYSTEM_PROGRAM, READONLY),
    ],
    settleData(a),
  );
}

/**
 * Accounts: payer (signer, w), vault, position (w), nonce_record (w), instructions sysvar, system_program.
 * Goes immediately after the Ed25519 verify instruction. Moves no tokens; the depositor then calls `withdraw`.
 */
export function releaseInstruction(
  ids: VaultIds,
  payer: string,
  depositor: string,
  f: { positionId: bigint; nonce: bigint; expires: bigint },
): VaultInstruction {
  const position = positionAddress(ids.program, ids.vault, f.positionId, depositor);
  return ix(
    ids,
    [
      meta(payer, WRITABLE_SIGNER),
      meta(ids.vault, READONLY),
      meta(position, WRITABLE),
      meta(nonceAddress(ids.program, position, f.nonce), WRITABLE),
      meta(INSTRUCTIONS_SYSVAR_ADDRESS, READONLY),
      meta(SYSTEM_PROGRAM, READONLY),
    ],
    releaseData(f.positionId, f.nonce, f.expires),
  );
}

/** Accounts: depositor (signer, w), vault, mint, vault_tokens (w), position (w), destination (w), token_program. */
export function withdrawInstruction(ids: VaultIds, depositor: string, positionId: bigint, destination: string): VaultInstruction {
  return ix(
    ids,
    [
      meta(depositor, WRITABLE_SIGNER),
      meta(ids.vault, READONLY),
      meta(ids.mint, READONLY),
      meta(ids.vaultTokens, WRITABLE),
      meta(positionAddress(ids.program, ids.vault, positionId, depositor), WRITABLE),
      meta(destination, WRITABLE),
      meta(ids.tokenProgram, READONLY),
    ],
    withdrawData(positionId),
  );
}

/** Accounts: recipient (signer, w), vault, mint, vault_tokens (w), claim (w), destination (w), token_program. */
export function claimInstruction(ids: VaultIds, recipient: string, destination: string): VaultInstruction {
  return ix(
    ids,
    [
      meta(recipient, WRITABLE_SIGNER),
      meta(ids.vault, READONLY),
      meta(ids.mint, READONLY),
      meta(ids.vaultTokens, WRITABLE),
      meta(claimAddress(ids.program, ids.vault, recipient), WRITABLE),
      meta(destination, WRITABLE),
      meta(ids.tokenProgram, READONLY),
    ],
    claimData(),
  );
}
