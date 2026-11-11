// Solana settle / release relay and deposit watcher (WO-16 Part 2; interface-v7.md §B; solana/deploy.md).
// `@solana/kit` 8.6.0 (F-081/F-186). The Ed25519 verify instruction and the preimage strings come from
// solana/client (imported, not copied). The keeper never prices and never builds a payload of its own:
// every settle / release argument is transcribed from the message NEAR signed, and the transcription is
// checked by rebuilding the exact string (the vault rebuilds the same bytes on-chain and verifies them).
//
// Constants not in the vault IDL, verified from source on 2026-11-10 (not yet FACTS rows; reported):
//   Associated Token program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL and ATA seeds [owner, token_program, mint]:
//     spl-associated-token-account-client 2.0.0 src/lib.rs:10, src/address.rs:56-68 (~/.cargo registry)
//   System program 11111111111111111111111111111111: solana-system-interface 1.0.0 src/lib.rs
//   Vault account discriminator = sha256("account:Vault")[..8] (Anchor rule; the same rule reproduces the
//     Position / settle / release discriminators listed in solana/deploy.md)
// The token program is not hard-coded: it is the owner of the mint account.
//
// Vault v2: interface-v7 §E (D-027, as amended 2026-11-11) and solana/deploy.md "Interface v2"; test/solana.test.ts checks the
// PDAs, layouts and account orders against solana/client/vault.ts.

import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getAddressDecoder,
  getAddressEncoder,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type AccountMeta,
  type Address,
  type Blockhash,
  type Instruction,
  type KeyPairSigner,
  type Signature,
  type TransactionSigner,
} from '@solana/kit';
import { readFileSync, statSync } from 'node:fs';
import { INSTRUCTIONS_SYSVAR_ADDRESS, ed25519VerifyInstruction, hexToBytes } from '../../../solana/client/ed25519.ts';
import {
  KIND_LEGACY,
  KIND_PRELIQ,
  KIND_SELF,
  releasePreimage,
  settlePreimage,
  utf8,
  type ReleaseFields,
  type SettleFields,
  type SettleKind,
} from '../../../solana/client/preimage.ts';
import { DEFAULT_BACKOFF, backoffDelayMs, cappedCooldownMs, type BackoffOptions } from './backoff.ts';
import type { CoreReader, KeeperWriter, TxResult } from './chain.ts';
import type { KeeperDb } from './db.ts';
import { KeyFileError } from './keyfile.ts';
import { errMsg, type Logger } from './log.ts';

// ------------------------------------------------------------------ constants (solana/deploy.md "Interface")

export const SETTLE_DISCRIMINATOR = Uint8Array.from([175, 42, 185, 87, 144, 131, 102, 212]);
export const RELEASE_DISCRIMINATOR = Uint8Array.from([253, 249, 15, 206, 28, 127, 193, 241]);
export const POSITION_DISCRIMINATOR = Uint8Array.from([170, 188, 143, 228, 122, 64, 247, 208]);
export const VAULT_DISCRIMINATOR = Uint8Array.from([211, 8, 232, 43, 2, 152, 117, 119]);
export const NONCE_RECORD_DISCRIMINATOR = Uint8Array.from([108, 73, 223, 163, 215, 18, 237, 161]);
/** §E: disc · version u8 · vault · authority · nonce u64 · position_id u64 · op u8 · kind u8. */
export const NONCE_RECORD_VERSION = 2;
export const NONCE_RECORD_LEN = 8 + 1 + 32 + 32 + 8 + 8 + 1 + 1;
export const OP_SETTLE = 0;
export const OP_RELEASE = 1;
/** `Position` v2 (deploy.md); `withdrawable u64` @123 is not read here. */
export const POSITION_LAYOUT = { len: 131, layoutVersion: 2, version: 8, authority: 9, depositor: 41, amount: 73, status: 81, vault: 82, positionId: 114, bump: 122 } as const;
/** A position stays after settle or release, until the depositor withdraws: existence says nothing, the status byte does. */
export const POSITION_STATUS_OPEN = 1;
export const POSITION_STATUS_SETTLED = 2;
export const POSITION_STATUS_RELEASED = 3;
export const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const SYSTEM_PROGRAM_ADDRESS = address('11111111111111111111111111111111');

const U64_MAX = (1n << 64n) - 1n;
const I64_MAX = (1n << 63n) - 1n;
const B58 = '[1-9A-HJ-NP-Za-km-z]{32,44}';
const enc = getAddressEncoder();
const dec = getAddressDecoder();
const ab = (a: Address): Uint8Array => Uint8Array.from(enc.encode(a) as unknown as ArrayLike<number>);

// ------------------------------------------------------------------ preimage transcription

function u64(name: string, s: string): bigint {
  const v = BigInt(s);
  if (v > U64_MAX) throw new Error(`${name} does not fit u64`);
  return v;
}

const SETTLE_RE = new RegExp(
  `^NECTAR_SETTLE_V1\\|chain=solana-devnet\\|program=(${B58})\\|pos=(\\d+)\\|quote=(\\d+)\\|repay_e6=(\\d+)\\|seize_units=(\\d+)` +
    `\\|recipient=(${B58})\\|nonce=(\\d+)\\|expires=(\\d+)(\\|kind=(PRELIQ|SELF))?$`,
);
const RELEASE_RE = new RegExp(
  `^NECTAR_RELEASE_V1\\|chain=solana-devnet\\|vault=(${B58})\\|pos=(\\d+)\\|recipient=(${B58})\\|nonce=(\\d+)\\|expires=(\\d+)$`,
);

/** Settle preimage → vault arguments. Kind from the suffix: none = 0, `|kind=PRELIQ` = 1, `|kind=SELF` = 2. */
export function parseSettlePreimage(s: string): SettleFields {
  const m = SETTLE_RE.exec(s);
  if (m === null) throw new Error('settle preimage does not match NECTAR_SETTLE_V1');
  const kind: SettleKind = m[10] === 'PRELIQ' ? KIND_PRELIQ : m[10] === 'SELF' ? KIND_SELF : KIND_LEGACY;
  const f: SettleFields = {
    program: m[1] as string,
    positionId: u64('pos', m[2] as string),
    quoteId: u64('quote', m[3] as string),
    repayE6: u64('repay_e6', m[4] as string),
    seizeUnits: u64('seize_units', m[5] as string),
    recipient: m[6] as string,
    nonce: u64('nonce', m[7] as string),
    expires: BigInt(m[8] as string),
    kind,
  };
  if (f.expires > I64_MAX) throw new Error('expires does not fit i64');
  address(f.program);
  address(f.recipient);
  // Round trip: the vault rebuilds this exact string from the arguments (leading zeros etc. would not survive).
  if (settlePreimage(f) !== s) throw new Error('settle preimage does not round-trip');
  return f;
}

export function parseReleasePreimage(s: string): ReleaseFields {
  const m = RELEASE_RE.exec(s);
  if (m === null) throw new Error('release message does not match NECTAR_RELEASE_V1');
  const f: ReleaseFields = {
    program: m[1] as string,
    positionId: u64('pos', m[2] as string),
    recipient: m[3] as string,
    nonce: u64('nonce', m[4] as string),
    expires: BigInt(m[5] as string),
  };
  if (f.expires > I64_MAX) throw new Error('expires does not fit i64');
  address(f.program);
  address(f.recipient);
  if (releasePreimage(f) !== s) throw new Error('release message does not round-trip');
  return f;
}

// ------------------------------------------------------------------ instruction data (Anchor borsh)

/** disc(8) · position_id u64 · quote_id u64 · repay_e6 u64 · seize_units u64 · recipient [32] · nonce u64 · expires i64 · kind u8 = 89 B */
export function settleIxData(f: SettleFields): Uint8Array {
  const out = new Uint8Array(8 + 8 * 4 + 32 + 8 + 8 + 1);
  const v = new DataView(out.buffer);
  out.set(SETTLE_DISCRIMINATOR, 0);
  v.setBigUint64(8, f.positionId, true);
  v.setBigUint64(16, f.quoteId, true);
  v.setBigUint64(24, f.repayE6, true);
  v.setBigUint64(32, f.seizeUnits, true);
  out.set(ab(address(f.recipient)), 40);
  v.setBigUint64(72, f.nonce, true);
  v.setBigInt64(80, f.expires, true);
  out[88] = f.kind;
  return out;
}

/** disc(8) · position_id u64 · nonce u64 · expires i64 = 32 B */
export function releaseIxData(positionId: bigint, nonce: bigint, expires: bigint): Uint8Array {
  const out = new Uint8Array(32);
  const v = new DataView(out.buffer);
  out.set(RELEASE_DISCRIMINATOR, 0);
  v.setBigUint64(8, positionId, true);
  v.setBigUint64(16, nonce, true);
  v.setBigInt64(24, expires, true);
  return out;
}

// ------------------------------------------------------------------ accounts and PDAs

export function u64le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

async function pda(program: Address, seeds: Uint8Array[]): Promise<Address> {
  const [a] = await getProgramDerivedAddress({ programAddress: program, seeds });
  return a;
}

export const vaultPda = (program: Address, mint: Address): Promise<Address> => pda(program, [utf8('vault'), ab(mint)]);
export const vaultTokensPda = (program: Address, vault: Address): Promise<Address> => pda(program, [utf8('tokens'), ab(vault)]);
/** §E (SR-8): the depositor is in the seeds, so a squatter's slot for the same id is a different account. */
export const positionPda = (program: Address, vault: Address, id: bigint, depositor: Address): Promise<Address> =>
  pda(program, [utf8('pos'), ab(vault), u64le(id), ab(depositor)]);
/** §E (SR-1, N1): scoped to the depositor-bound slot and its authority, so neither another slot nor a reopen under another key burns this nonce. */
export const noncePda = (program: Address, position: Address, authority: Uint8Array, nonce: bigint): Promise<Address> =>
  pda(program, [utf8('nonce'), ab(position), authority, u64le(nonce)]);
export const claimPda = (program: Address, vault: Address, recipient: Address): Promise<Address> =>
  pda(program, [utf8('claim'), ab(vault), ab(recipient)]);
export const associatedTokenAddress = (owner: Address, tokenProgram: Address, mint: Address): Promise<Address> =>
  pda(ASSOCIATED_TOKEN_PROGRAM_ADDRESS, [ab(owner), ab(tokenProgram), ab(mint)]);

export interface PositionAccount {
  version: number;
  authority: Uint8Array;
  depositor: Address;
  amount: bigint;
  status: number;
  vault: Address;
  positionId: bigint;
  bump: number;
}

/** `Position` v2: exact length, discriminator and layout version. */
export function parsePositionAccount(data: Uint8Array): PositionAccount {
  const L = POSITION_LAYOUT;
  if (data.length !== L.len) throw new Error(`position account is ${data.length} bytes, expected ${L.len}`);
  if (!POSITION_DISCRIMINATOR.every((b, i) => data[i] === b)) throw new Error('not a nectar_vault Position account');
  if (data[L.version] !== L.layoutVersion) throw new Error(`position layout version ${data[L.version]} != ${L.layoutVersion}`);
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    version: data[L.version] as number,
    authority: data.slice(L.authority, L.authority + 32),
    depositor: dec.decode(data.subarray(L.depositor, L.depositor + 32)),
    amount: v.getBigUint64(L.amount, true),
    status: data[L.status] as number,
    vault: dec.decode(data.subarray(L.vault, L.vault + 32)),
    positionId: v.getBigUint64(L.positionId, true),
    bump: data[L.bump] as number,
  };
}

export interface NonceRecord {
  version: number;
  vault: Address;
  authority: Uint8Array;
  nonce: bigint;
  positionId: bigint;
  op: number;
  kind: number;
}

/** Decodes a §E NonceRecord; throws unless the length and discriminator are exact. */
export function parseNonceRecord(data: Uint8Array): NonceRecord {
  if (data.length !== NONCE_RECORD_LEN) throw new Error(`nonce record is ${data.length} bytes, expected ${NONCE_RECORD_LEN}`);
  if (!NONCE_RECORD_DISCRIMINATOR.every((b, i) => data[i] === b)) throw new Error('not a nectar_vault NonceRecord account');
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    version: data[8] as number,
    vault: dec.decode(data.subarray(9, 41)),
    authority: data.slice(41, 73),
    nonce: v.getBigUint64(73, true),
    positionId: v.getBigUint64(81, true),
    op: data[89] as number,
    kind: data[90] as number,
  };
}

/** `Vault`: disc @0, version u8 @8, symbol String (u32 LE length + bytes) @9, mint Pubkey after the symbol (solana lib.rs). */
export function parseVaultAccount(data: Uint8Array): { symbol: string; mint: Address } {
  if (data.length < 13 || !VAULT_DISCRIMINATOR.every((b, i) => data[i] === b)) throw new Error('not a nectar_vault Vault account');
  const len = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(9, true);
  if (len > 16 || data.length < 13 + len + 32) throw new Error('vault account too short');
  return { symbol: new TextDecoder().decode(data.subarray(13, 13 + len)), mint: dec.decode(data.subarray(13 + len, 13 + len + 32)) };
}

export interface VaultContext {
  program: Address;
  vault: Address;
  mint: Address;
  vaultTokens: Address;
  tokenProgram: Address;
}

const w = (a: Address): AccountMeta => ({ address: a, role: AccountRole.WRITABLE });
const r = (a: Address): AccountMeta => ({ address: a, role: AccountRole.READONLY });

/** Every account a v2 settle or release can name. */
export interface LegAccounts {
  payer: Address;
  vault: Address;
  mint: Address;
  vaultTokens: Address;
  position: Address;
  recipient: Address;
  recipientTokens: Address;
  claim: Address;
  nonceRecord: Address;
  instructions: Address;
  tokenProgram: Address;
  associatedTokenProgram: Address;
  systemProgram: Address;
}
type AccountOrder = ReadonlyArray<readonly [keyof LegAccounts, AccountRole]>;

/** settle accounts, in deploy.md order. */
export const SETTLE_ACCOUNT_ORDER: AccountOrder = [
  ['payer', AccountRole.WRITABLE_SIGNER],
  ['vault', AccountRole.READONLY],
  ['mint', AccountRole.READONLY],
  ['vaultTokens', AccountRole.WRITABLE],
  ['position', AccountRole.WRITABLE],
  ['recipient', AccountRole.READONLY],
  ['recipientTokens', AccountRole.WRITABLE],
  ['claim', AccountRole.WRITABLE],
  ['nonceRecord', AccountRole.WRITABLE],
  ['instructions', AccountRole.READONLY],
  ['tokenProgram', AccountRole.READONLY],
  ['associatedTokenProgram', AccountRole.READONLY],
  ['systemProgram', AccountRole.READONLY],
];

/** release accounts, in deploy.md order; release only records `withdrawable`, so it moves no tokens. */
export const RELEASE_ACCOUNT_ORDER: AccountOrder = [
  ['payer', AccountRole.WRITABLE_SIGNER],
  ['vault', AccountRole.READONLY],
  ['position', AccountRole.WRITABLE],
  ['nonceRecord', AccountRole.WRITABLE],
  ['instructions', AccountRole.READONLY],
  ['systemProgram', AccountRole.READONLY],
];

const slotIndex = (order: AccountOrder, name: keyof LegAccounts): number => order.findIndex(([n]) => n === name);

const metas = (order: AccountOrder, a: Partial<LegAccounts>): AccountMeta[] =>
  order.map(([name, role]) => {
    const value = a[name];
    if (value === undefined) throw new Error(`account ${name} not provided`);
    return { address: value, role };
  });

export async function settleAccounts(v: VaultContext, payer: Address, position: Address, authority: Uint8Array, f: SettleFields): Promise<AccountMeta[]> {
  const recipient = address(f.recipient);
  return metas(SETTLE_ACCOUNT_ORDER, {
    payer,
    vault: v.vault,
    mint: v.mint,
    vaultTokens: v.vaultTokens,
    position,
    recipient,
    recipientTokens: await associatedTokenAddress(recipient, v.tokenProgram, v.mint),
    claim: await claimPda(v.program, v.vault, recipient),
    nonceRecord: await noncePda(v.program, position, authority, f.nonce),
    instructions: INSTRUCTIONS_SYSVAR_ADDRESS,
    tokenProgram: v.tokenProgram,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
  });
}

export async function releaseAccounts(v: VaultContext, payer: Address, position: Address, authority: Uint8Array, nonce: bigint): Promise<AccountMeta[]> {
  return metas(RELEASE_ACCOUNT_ORDER, {
    payer,
    vault: v.vault,
    position,
    nonceRecord: await noncePda(v.program, position, authority, nonce),
    instructions: INSTRUCTIONS_SYSVAR_ADDRESS,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
  });
}

/** `[Ed25519 verify ix, settle ix]`; nothing may sit between them (the vault reads the previous instruction). */
export async function buildSettleInstructions(
  v: VaultContext,
  payer: Address,
  position: Address,
  authority: Uint8Array,
  preimage: string,
  signature: Uint8Array,
): Promise<Instruction[]> {
  const f = parseSettlePreimage(preimage);
  if (f.program !== v.program) throw new Error('preimage program != vault program');
  return [
    ed25519VerifyInstruction(authority, signature, utf8(preimage)),
    { programAddress: v.program, accounts: await settleAccounts(v, payer, position, authority, f), data: settleIxData(f) },
  ];
}

export async function buildReleaseInstructions(
  v: VaultContext,
  payer: Address,
  position: Address,
  depositor: Address,
  authority: Uint8Array,
  message: string,
  signature: Uint8Array,
): Promise<Instruction[]> {
  const f = parseReleasePreimage(message);
  if (f.program !== v.program) throw new Error('release vault != vault program');
  if (f.recipient !== depositor) throw new Error('release recipient != position depositor');
  return [
    ed25519VerifyInstruction(authority, signature, utf8(message)),
    { programAddress: v.program, accounts: await releaseAccounts(v, payer, position, authority, f.nonce), data: releaseIxData(f.positionId, f.nonce, f.expires) },
  ];
}

// ------------------------------------------------------------------ RPC port (mockable) + kit adapter

export interface SolAccount {
  owner: Address;
  data: Uint8Array;
}

export type SigState = { kind: 'pending' } | { kind: 'confirmed' } | { kind: 'failed'; err: string };

/** A landed transaction, with account indexes resolved and inner (CPI) instructions flattened in. */
export interface SolTx {
  succeeded: boolean;
  instructions: Array<{ program: Address; accounts: Address[]; data: Uint8Array }>;
}

export interface SigEntry {
  signature: string;
  ok: boolean;
}

export interface SolanaPort {
  getAccount(a: Address): Promise<SolAccount | null>;
  latestBlockhash(): Promise<{ blockhash: Blockhash; lastValidBlockHeight: bigint }>;
  blockHeight(): Promise<bigint>;
  sendBase64(wire: string): Promise<string>;
  status(sig: string): Promise<SigState>;
  /** One page of the txs touching `a`, newest first, strictly older than `before`. Anyone can add to this list. */
  signaturesPage(a: Address, before: string | null, limit: number): Promise<SigEntry[]>;
  transaction(sig: string): Promise<SolTx | null>;
}

const b64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64'));

export class KitSolanaPort implements SolanaPort {
  private readonly rpc: ReturnType<typeof createSolanaRpc>;
  constructor(url: string) {
    this.rpc = createSolanaRpc(url);
  }
  async getAccount(a: Address): Promise<SolAccount | null> {
    const { value } = await this.rpc.getAccountInfo(a, { encoding: 'base64', commitment: 'confirmed' }).send();
    return value === null ? null : { owner: value.owner, data: b64(value.data[0]) };
  }
  async latestBlockhash(): Promise<{ blockhash: Blockhash; lastValidBlockHeight: bigint }> {
    const { value } = await this.rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
    return value;
  }
  async blockHeight(): Promise<bigint> {
    return await this.rpc.getBlockHeight({ commitment: 'confirmed' }).send();
  }
  async sendBase64(wire: string): Promise<string> {
    return await this.rpc
      .sendTransaction(wire as ReturnType<typeof getBase64EncodedWireTransaction>, { encoding: 'base64', preflightCommitment: 'confirmed' })
      .send();
  }
  async status(sig: string): Promise<SigState> {
    const { value } = await this.rpc.getSignatureStatuses([sig as Signature], { searchTransactionHistory: true }).send();
    const s = value[0];
    if (s === null || s === undefined) return { kind: 'pending' };
    if (s.err !== null) return { kind: 'failed', err: JSON.stringify(s.err, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x)) };
    return s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized' ? { kind: 'confirmed' } : { kind: 'pending' };
  }
  async signaturesPage(a: Address, before: string | null, limit: number): Promise<SigEntry[]> {
    const list = await this.rpc.getSignaturesForAddress(a, { limit, commitment: 'confirmed', ...(before === null ? {} : { before: before as Signature }) }).send();
    return list.map((x) => ({ signature: x.signature, ok: x.err === null }));
  }
  async transaction(sig: string): Promise<SolTx | null> {
    const res = await this.rpc.getTransaction(sig as Signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }).send();
    if (res === null) return null;
    const meta = res.meta;
    if (meta === null) return { succeeded: false, instructions: [] };
    // Index space per the RPC: static keys, then loaded writable, then loaded readonly.
    const keys: Address[] = [...res.transaction.message.accountKeys, ...meta.loadedAddresses.writable, ...meta.loadedAddresses.readonly];
    const all = [...res.transaction.message.instructions, ...(meta.innerInstructions ?? []).flatMap((x) => x.instructions)];
    const instructions = all.map((ix) => ({
      program: keys[ix.programIdIndex] as Address,
      accounts: ix.accounts.map((i) => keys[i] as Address),
      data: Uint8Array.from(getBase58Encoder().encode(ix.data) as unknown as ArrayLike<number>),
    }));
    return { succeeded: meta.err === null, instructions };
  }
}

/** Solana CLI keypair file (JSON array of 64 bytes), 0600. The key never leaves the returned signer and is never logged. */
export async function loadSolanaFeePayer(path: string, envName = 'KEEPER_SOLANA_KEYPAIR'): Promise<KeyPairSigner> {
  let st;
  try {
    st = statSync(path);
  } catch {
    throw new KeyFileError(`keypair file not found at ${envName}`);
  }
  if (!st.isFile()) throw new KeyFileError(`${envName} is not a regular file`);
  if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) {
    throw new KeyFileError(`${envName} file mode ${(st.mode & 0o777).toString(8)} is too open; chmod 600`);
  }
  let arr: unknown;
  try {
    arr = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new KeyFileError(`${envName} is not valid JSON`);
  }
  if (!Array.isArray(arr) || arr.length !== 64 || !arr.every((x) => Number.isInteger(x) && x >= 0 && x <= 255)) {
    throw new KeyFileError(`${envName} must be a JSON array of 64 bytes (solana-keygen format)`);
  }
  const bytes = Uint8Array.from(arr as number[]);
  try {
    return await createKeyPairSignerFromBytes(bytes);
  } finally {
    bytes.fill(0);
  }
}

export async function signToWire(instructions: Instruction[], payer: TransactionSigner, blockhash: { blockhash: Blockhash; lastValidBlockHeight: bigint }): Promise<{ wire: string; signature: string }> {
  const msg = pipe(
    createTransactionMessage({ version: 'legacy' }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const tx = await signTransactionMessageWithSigners(msg);
  return { wire: getBase64EncodedWireTransaction(tx), signature: getSignatureFromTransaction(tx) };
}

// ------------------------------------------------------------------ NEAR view shapes (tolerant; interface-v7 §B)

interface RemoteView {
  /** pinned at reserve time (v2): `solana-devnet`, `base-sepolia`, … */
  chain_id?: string;
  vault_program?: string;
  status?: string;
  authority?: string;
  /** §E (SR-8): the address the borrower committed to at reserve time. */
  committed_depositor?: string | null;
  /** set once a deposit is proven */
  depositor?: string | null;
  reserved_units?: string;
  expires_ns?: string;
  confirming?: boolean;
}
interface PositionLike {
  position_id?: string;
  id?: string;
  status?: string;
  collateral?: string;
  units?: string;
  remote?: RemoteView | null;
}
interface PendingSettlementView {
  position_id: string;
  quote_id: string;
  nonce: string;
  expires: string;
  preimage: string;
  signature_hex: string | null;
  recipient: string;
  status: string;
}
interface PendingReleaseView {
  message: string;
  signature_hex: string;
  nonce: string;
  expires: string;
  status?: string;
}
interface RemoteChainView {
  chain_id: string;
  vault_program: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown): v is string => typeof v === 'string';

/** The only remote chain this relay serves (interface-v7 §B). */
export const SOLANA_CHAIN_ID = 'solana-devnet';

/**
 * True unless the position is pinned to another remote chain. Positions without `remote.chain_id` (v1, or NEAR-held)
 * pass here and are resolved through the collateral's primary remote chain, which must also be solana-devnet.
 */
export function isSolanaPosition(p: { remote?: { chain_id?: unknown } | null }): boolean {
  const c = p.remote?.chain_id;
  return c === undefined || c === null || c === SOLANA_CHAIN_ID;
}

function asPending(v: unknown): PendingSettlementView | null {
  if (!isObj(v)) return null;
  const ok = ['position_id', 'quote_id', 'nonce', 'expires', 'preimage', 'recipient', 'status'].every((k) => str(v[k]));
  return ok && (v.signature_hex === null || str(v.signature_hex)) ? (v as unknown as PendingSettlementView) : null;
}
function asRelease(v: unknown): PendingReleaseView | null {
  if (!isObj(v)) return null;
  return ['message', 'signature_hex', 'nonce', 'expires'].every((k) => str(v[k])) ? (v as unknown as PendingReleaseView) : null;
}

/** "ed25519:<base58>" → 32 bytes; null for anything else (e.g. a Base 0x authority). */
export function ed25519AuthorityBytes(s: string | undefined): Uint8Array | null {
  if (s === undefined || !s.startsWith('ed25519:')) return null;
  const b = getBase58Encoder().encode(s.slice('ed25519:'.length));
  return b.length === 32 ? Uint8Array.from(b as unknown as ArrayLike<number>) : null;
}

const eqBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

// ------------------------------------------------------------------ the relay

export interface RelayOptions {
  pageSize: number;
  maxPages?: number;
  backoff?: BackoffOptions;
  /** wait between signature-status polls */
  confirmPollMs?: number;
  /** cooldown after a confirm_remote_deposit call (OutLayer answers asynchronously) */
  depositCooldownMs?: number;
  /** SR-12: the pinned mint; the vault is PDA("vault", mint), never discovered by symbol */
  mint: Address;
  /** SR-31: the pinned program; a position naming any other program is refused */
  expectedProgram: Address;
  /** N4: ceiling of the confirm_remote_deposit cooldown, which doubles per unchanged vault observation */
  maxConfirmCooldownMs?: number;
  /** N4: how often an expired reservation's slot is re-read (it may stay empty forever) */
  expiredRescanMs?: number;
  /** N2b: signatures listed per address when looking for the tx that landed a leg (anyone can pad this list) */
  maxLandedSignatures?: number;
  /** N2b: RPC budget of that search per tick; it resumes where it stopped, so a padded address only delays its own leg */
  landedPagesPerTick?: number;
  landedTxsPerTick?: number;
  nowMs?: () => number;
  rand?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RelayStatus {
  enabled: boolean;
  v2: boolean | null;
  lastTickAt: number | null;
  lastTickOk: boolean;
  lastError: string | null;
  pendingSettlements: number;
  pendingReleases: number;
  awaitingDeposit: number;
  settlesRelayed: number;
  releasesRelayed: number;
  depositsConfirmed: number;
}

export interface RelayReport {
  settled: string[];
  released: string[];
  deposits: string[];
  skipped: Array<{ id: string; reason: string }>;
  failed: Array<{ id: string; error: string }>;
}

/** Release relay method: WO-21 adds `relay_release_result` or extends `relay_settlement_result`; try in that order. */
export const RELEASE_RELAY_METHODS = ['relay_release_result', 'relay_settlement_result'] as const;
const METHOD_MISSING = /MethodNotFound|MethodResolveError|CodeDoesNotExist/;

export class SolanaRelay {
  readonly status: RelayStatus;
  private readonly inFlight = new Set<string>();
  private readonly vaults = new Map<string, VaultContext>();
  private readonly remoteChains = new Map<string, RemoteChainView | null>();
  private readonly scans = new Map<string, HistoryScan>();
  private readonly opts: Required<RelayOptions>;

  private readonly near: CoreReader;
  private readonly writer: KeeperWriter;
  private readonly sol: SolanaPort;
  private readonly payer: TransactionSigner;
  private readonly db: KeeperDb;
  private readonly log: Logger;

  constructor(near: CoreReader, writer: KeeperWriter, sol: SolanaPort, payer: TransactionSigner, db: KeeperDb, log: Logger, opts: RelayOptions) {
    this.near = near;
    this.writer = writer;
    this.sol = sol;
    this.payer = payer;
    this.db = db;
    this.log = log;
    this.opts = {
      maxPages: 200,
      backoff: DEFAULT_BACKOFF,
      confirmPollMs: 2_000,
      depositCooldownMs: 60_000,
      maxConfirmCooldownMs: 21_600_000,
      expiredRescanMs: 600_000,
      maxLandedSignatures: 100_000,
      landedPagesPerTick: 10,
      landedTxsPerTick: 200,
      nowMs: Date.now,
      rand: Math.random,
      sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
      ...opts,
    };
    this.status = {
      enabled: true,
      v2: null,
      lastTickAt: null,
      lastTickOk: false,
      lastError: null,
      pendingSettlements: 0,
      pendingReleases: 0,
      awaitingDeposit: 0,
      settlesRelayed: 0,
      releasesRelayed: 0,
      depositsConfirmed: 0,
    };
  }

  /** v2 iff `contract_version()` starts with "2."; v1 has no such view (or an older one). */
  private async isV2(): Promise<boolean> {
    if (this.status.v2 !== null) return this.status.v2;
    try {
      const { value } = await this.near.view('contract_version', {});
      this.status.v2 = str(value) && value.startsWith('2.');
    } catch {
      this.status.v2 = false;
    }
    return this.status.v2;
  }

  private async listPositions(): Promise<PositionLike[]> {
    const out: PositionLike[] = [];
    for (let page = 0; page < this.opts.maxPages; page++) {
      const { value } = await this.near.view('list_positions', { from_index: page * this.opts.pageSize, limit: this.opts.pageSize });
      if (!Array.isArray(value)) throw new Error('list_positions did not return an array');
      for (const p of value) if (isObj(p)) out.push(p as PositionLike);
      if (value.length < this.opts.pageSize) break;
    }
    return out;
  }

  private async remoteChain(symbol: string): Promise<RemoteChainView | null> {
    if (this.remoteChains.has(symbol)) return this.remoteChains.get(symbol) ?? null;
    const { value } = await this.near.view('get_collateral', { symbol });
    const rc = isObj(value) && isObj(value.remote_chain) && str(value.remote_chain.vault_program) && str(value.remote_chain.chain_id)
      ? { chain_id: value.remote_chain.chain_id, vault_program: value.remote_chain.vault_program }
      : null;
    this.remoteChains.set(symbol, rc);
    return rc;
  }

  /** SR-12: the vault is PDA("vault", pinned mint). `init_vault` is permissionless, so other Vault accounts are never listed. */
  private async vaultFor(symbol: string, program: Address): Promise<VaultContext> {
    const key = `${program}:${symbol}`;
    const hit = this.vaults.get(key);
    if (hit !== undefined) return hit;
    const mint = this.opts.mint;
    const vault = await vaultPda(program, mint);
    const raw = await this.sol.getAccount(vault);
    if (raw === null) throw new Error('vault account not found for the pinned mint');
    if (raw.owner !== program) throw new Error('vault PDA not owned by the vault program');
    const parsed = parseVaultAccount(raw.data);
    if (parsed.mint !== mint) throw new Error('vault mint != pinned mint');
    if (parsed.symbol !== symbol) throw new Error(`vault symbol ${parsed.symbol} != collateral ${symbol}`);
    const mintAcct = await this.sol.getAccount(mint);
    if (mintAcct === null) throw new Error('vault mint account not found');
    const ctx: VaultContext = { program, vault, mint, vaultTokens: await vaultTokensPda(program, vault), tokenProgram: mintAcct.owner };
    this.vaults.set(key, ctx);
    return ctx;
  }

  /**
   * The Solana vault program of a position, or null when it is not a Solana position. v2 positions carry the chain and
   * vault pinned at reserve time (`remote.chain_id` / `remote.vault_program`); v1 positions fall back to the collateral's
   * primary `remote_chain`, which must itself be solana-devnet.
   */
  private async programFor(p: PositionLike): Promise<Address | null> {
    let vaultProgram: string;
    if (str(p.remote?.chain_id)) {
      if (p.remote.chain_id !== SOLANA_CHAIN_ID || !str(p.remote.vault_program)) return null;
      vaultProgram = p.remote.vault_program;
    } else {
      const rc = await this.remoteChain(p.collateral as string);
      if (rc === null || rc.chain_id !== SOLANA_CHAIN_ID) return null;
      vaultProgram = rc.vault_program;
    }
    const prog = address(vaultProgram);
    if (this.opts.expectedProgram !== prog) throw new Error('vault_program from NEAR != pinned vault program');
    return prog;
  }

  async tick(): Promise<RelayReport> {
    const report: RelayReport = { settled: [], released: [], deposits: [], skipped: [], failed: [] };
    try {
      const v2 = await this.isV2();
      const positions = await this.listPositions();
      const settling = positions.filter((p) => p.status === 'Settling');
      const releasing = v2 ? positions.filter((p) => p.remote?.status === 'Releasing') : [];
      const awaiting = v2 ? positions.filter((p) => p.remote?.status === 'AwaitingDeposit') : [];
      // N4: an expired reservation with no proven deposit can still hold a late one, which must be proven to be released.
      const late = v2 ? positions.filter((p) => p.remote?.status === 'Expired' && !str(p.remote.depositor)) : [];
      this.status.awaitingDeposit = awaiting.length;
      let pendingS = 0;
      let pendingR = 0;
      for (const p of settling) if (await this.item('settle', p, report)) pendingS++;
      for (const p of releasing) if (await this.item('release', p, report)) pendingR++;
      for (const p of [...awaiting, ...late]) await this.item('deposit', p, report);
      this.status.pendingSettlements = pendingS;
      this.status.pendingReleases = pendingR;
      this.status.lastTickOk = true;
      this.status.lastError = null;
    } catch (e) {
      this.status.lastTickOk = false;
      this.status.lastError = errMsg(e);
      this.log.error('solana_relay_tick_failed', { error: errMsg(e).slice(0, 300) });
    }
    this.status.lastTickAt = this.opts.nowMs();
    return report;
  }

  /** Returns true when the item is a pending remote leg (counted for /healthz). */
  private async item(op: 'settle' | 'release' | 'deposit', p: PositionLike, report: RelayReport): Promise<boolean> {
    const id = p.position_id ?? p.id;
    if (!str(id) || !str(p.collateral)) return false;
    // Chain gate (WO-29b): a position pinned to another remote chain (e.g. base-sepolia) is never ours; its pending
    // views carry an EIP-712 digest, not a NECTAR_*_V1 preimage, and must not reach the Solana parser.
    if (!isSolanaPosition(p)) return false;
    const key = `sol:${op}:${id}`;
    if (this.inFlight.has(key)) return true;
    const now = this.opts.nowMs();
    const retry = this.db.retry(key);
    if (retry !== null && retry.next_attempt_at > now) {
      report.skipped.push({ id, reason: 'backoff' });
      return true;
    }
    this.inFlight.add(key);
    try {
      const program = await this.programFor(p);
      if (program === null) return false; // NEAR-held collateral or another spoke's position: nothing to do on Solana
      if (op === 'deposit') {
        await this.deposit(id, p, program, report, key);
        return true;
      }
      const outcome = op === 'settle' ? await this.settle(id, p, program) : await this.release(id, p, program);
      if (outcome.kind === 'none') return false;
      if (outcome.kind === 'skip') {
        report.skipped.push({ id, reason: outcome.reason });
        this.log.warn('solana_relay_skipped', { op, position_id: id, reason: outcome.reason });
        this.setBackoff(key, retry?.attempts ?? 0);
        return true;
      }
      this.db.clearRetry(key);
      if (op === 'settle') {
        report.settled.push(id);
        this.status.settlesRelayed++;
      } else {
        report.released.push(id);
        this.status.releasesRelayed++;
      }
      return true;
    } catch (e) {
      report.failed.push({ id, error: errMsg(e) });
      const delay = this.setBackoff(key, retry?.attempts ?? 0);
      this.log.warn('solana_relay_failed', { op, position_id: id, retry_in_ms: delay, error: errMsg(e).slice(0, 300) });
      return true;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private setBackoff(key: string, prevAttempts: number): number {
    const attempts = prevAttempts + 1;
    const delay = backoffDelayMs(attempts - 1, this.opts.backoff, this.opts.rand);
    // Never shortens a cooldown already set: a failed confirm has spent allowance and keeps its own.
    this.db.setRetry(key, attempts, Math.max(this.opts.nowMs() + delay, this.db.retry(key)?.next_attempt_at ?? 0));
    return delay;
  }

  /**
   * The depositor's slot, or null when nothing is deposited there. Anyone can pre-fund the PDA with a plain transfer, and
   * a system-owned account there is not a position.
   */
  private async readPosition(vault: VaultContext, id: bigint, depositor: Address): Promise<{ addr: Address; acct: PositionAccount } | null> {
    const addr = await positionPda(vault.program, vault.vault, id, depositor);
    const raw = await this.sol.getAccount(addr);
    if (raw === null || raw.owner === SYSTEM_PROGRAM_ADDRESS) return null;
    if (raw.owner !== vault.program) throw new Error('position PDA not owned by the vault program');
    const acct = parsePositionAccount(raw.data);
    if (acct.vault !== vault.vault || acct.positionId !== id || acct.depositor !== depositor) throw new Error('position PDA fields do not match');
    return { addr, acct };
  }

  /** §E: the committed depositor. A proven `remote.depositor` stands in for it and must agree when both are present. */
  private async depositorOf(id: string, p: PositionLike): Promise<Address | null> {
    let committed = p.remote?.committed_depositor;
    if (!str(committed)) {
      const { value } = await this.near.view('get_position', { position_id: id });
      const remote = isObj(value) ? value.remote : null;
      committed = isObj(remote) && str(remote.committed_depositor) ? remote.committed_depositor : null;
    }
    const proven = p.remote?.depositor;
    if (str(committed) && str(proven) && committed !== proven) throw new Error('remote.depositor != committed_depositor');
    const chosen = str(committed) ? committed : proven;
    return str(chosen) ? address(chosen) : null;
  }

  private async settle(id: string, p: PositionLike, program: Address): Promise<Outcome> {
    const { value } = await this.near.view('get_pending_settlement', { position_id: id });
    const d = asPending(value);
    if (d === null || d.status !== 'Signed' || d.signature_hex === null) return { kind: 'none' };
    const f = parseSettlePreimage(d.preimage);
    if (String(f.positionId) !== id || String(f.positionId) !== d.position_id) throw new Error('preimage pos != position id');
    if (String(f.nonce) !== d.nonce || String(f.expires) !== d.expires || String(f.quoteId) !== d.quote_id || f.recipient !== d.recipient) {
      throw new Error('preimage fields != pending settlement');
    }
    if (f.program !== program) throw new Error('preimage program != remote_chain.vault_program');
    const vault = await this.vaultFor(p.collateral as string, program);
    return await this.relayLeg({ op: 'settle', opCode: OP_SETTLE, kind: f.kind, id, vault, nonce: f.nonce, expires: f.expires, discriminator: SETTLE_DISCRIMINATOR, order: SETTLE_ACCOUNT_ORDER, landedStatus: POSITION_STATUS_SETTLED, p }, async (pos, authority) =>
      buildSettleInstructions(vault, this.payer.address, pos.addr, authority, d.preimage, hexToBytes(d.signature_hex as string)),
    );
  }

  private async release(id: string, p: PositionLike, program: Address): Promise<Outcome> {
    let value: unknown;
    try {
      ({ value } = await this.near.view('get_pending_release', { position_id: id }));
    } catch (e) {
      if (METHOD_MISSING.test(errMsg(e))) return { kind: 'none' }; // v1: no releases
      throw e;
    }
    const d = asRelease(value);
    if (d === null || (d.status !== undefined && d.status !== 'Signed')) return { kind: 'none' };
    const f = parseReleasePreimage(d.message);
    if (String(f.positionId) !== id || String(f.nonce) !== d.nonce || String(f.expires) !== d.expires) throw new Error('release message fields != pending release');
    if (f.program !== program) throw new Error('release vault != remote_chain.vault_program');
    const vault = await this.vaultFor(p.collateral as string, program);
    return await this.relayLeg({ op: 'release', opCode: OP_RELEASE, kind: 0, id, vault, nonce: f.nonce, expires: f.expires, discriminator: RELEASE_DISCRIMINATOR, order: RELEASE_ACCOUNT_ORDER, landedStatus: POSITION_STATUS_RELEASED, p, recipient: f.recipient }, async (pos, authority) =>
      buildReleaseInstructions(vault, this.payer.address, pos.addr, pos.acct.depositor, authority, d.message, hexToBytes(d.signature_hex)),
    );
  }

  /**
   * Idempotent core. Only the vault can own its nonce PDA, and the seeds bind the slot and NEAR's authority (§E, N1), so a
   * program-owned record that passes every field check proves the leg landed, whatever the slot's status is now: the depositor
   * may have withdrawn and reopened it. Anything else at that address (SR-2: a plain transfer) proves nothing and falls through
   * to the send path, because Anchor `init` accepts a pre-funded account.
   */
  private async relayLeg(leg: Leg, build: (pos: { addr: Address; acct: PositionAccount }, authority: Uint8Array) => Promise<Instruction[]>): Promise<Outcome> {
    const { op, id, vault, nonce, expires, p } = leg;
    const authority = ed25519AuthorityBytes(p.remote?.authority);
    if (authority === null) return { kind: 'skip', reason: 'authority_unknown' };
    const depositor = await this.depositorOf(id, p);
    if (depositor === null) return { kind: 'skip', reason: 'depositor_unknown' };
    if (leg.recipient !== undefined && leg.recipient !== depositor) throw new Error('release recipient != committed depositor');
    const positionAddr = await positionPda(vault.program, vault.vault, BigInt(id), depositor);
    const nonceAddr = await noncePda(vault.program, positionAddr, authority, nonce);
    const record = await this.sol.getAccount(nonceAddr);
    if (record !== null && record.owner === vault.program) {
      this.assertNonceRecord(record.data, leg, authority);
      return await this.relayFound(leg, await this.findLandedTx(leg, nonceAddr, positionAddr), 'nonce_used_tx_not_found');
    }
    if (record !== null) this.log.warn('solana_nonce_pda_not_a_record', { op, position_id: id, owner: record.owner });
    const pos = await this.readPosition(vault, BigInt(id), depositor);
    // N3: the slot left Open (or was withdrawn) without this nonce, so an older nonce of this leg may have landed before a re-sign.
    if (pos === null || pos.acct.status === leg.landedStatus) {
      const older = await this.findOlderLeg(leg, positionAddr, authority);
      if (older.kind !== 'none') return await this.relayFound(leg, older, 'older_leg_tx_not_found');
    }
    if (pos === null) return { kind: 'skip', reason: 'position_pda_missing' };
    if (pos.acct.status !== POSITION_STATUS_OPEN) return { kind: 'skip', reason: 'position_pda_not_open' };
    if (!eqBytes(authority, pos.acct.authority)) return { kind: 'skip', reason: 'authority_mismatch' };
    if (BigInt(Math.floor(this.opts.nowMs() / 1000)) >= expires) return { kind: 'skip', reason: 'signature_expired' };

    const ixs = await build(pos, authority);
    const bh = await this.sol.latestBlockhash();
    const { wire, signature } = await signToWire(ixs, this.payer, bh);
    this.log.info('solana_tx_sending', { op, position_id: id, solana_tx_sig: signature });
    await this.sol.sendBase64(wire);
    await this.confirm(signature, bh.lastValidBlockHeight);
    this.log.info('solana_tx_confirmed', { op, position_id: id, solana_tx_sig: signature });
    await this.relayToNear(op, id, signature);
    return { kind: 'done', sig: signature };
  }

  private async relayFound(leg: Leg, found: ScanResult<string>, notFound: string): Promise<Outcome> {
    if (found.kind === 'more') return { kind: 'skip', reason: 'landed_scan_in_progress' };
    if (found.kind === 'none') return { kind: 'skip', reason: notFound };
    this.log.info('solana_leg_already_landed', { op: leg.op, position_id: leg.id, solana_tx_sig: found.value });
    await this.relayToNear(leg.op, leg.id, found.value);
    return { kind: 'done', sig: found.value };
  }

  /** SR-2: every §E field must match this leg. A mismatch is refused; it is never read as "landed". */
  private assertNonceRecord(data: Uint8Array, leg: Leg, authority: Uint8Array): void {
    const r = parseNonceRecord(data);
    if (r.version !== NONCE_RECORD_VERSION) throw new Error(`nonce record version ${r.version} != ${NONCE_RECORD_VERSION}`);
    if (r.vault !== leg.vault.vault) throw new Error('nonce record vault mismatch');
    if (!eqBytes(r.authority, authority)) throw new Error('nonce record authority mismatch');
    if (r.nonce !== leg.nonce) throw new Error('nonce record nonce mismatch');
    if (String(r.positionId) !== leg.id) throw new Error('nonce record position mismatch');
    if (r.op !== leg.opCode) throw new Error('nonce record op mismatch');
    if (r.kind !== leg.kind) throw new Error('nonce record kind mismatch');
  }

  /**
   * N2b: walks one address's history oldest first, because the tx that created a record sits near the start while anyone can
   * append transfers after it. Bounded per tick; an RPC error or a spent budget leaves the walk where it stopped and the next
   * attempt resumes it, so rate limiting delays the search without restarting it.
   */
  private async walkHistory<T>(scope: string, a: Address, match: (tx: SolTx, sig: string) => Promise<T | null>): Promise<ScanResult<T>> {
    const key = `${scope}:${a}`;
    const scan = this.scans.get(key) ?? { sigs: [], before: null, listed: 0, complete: false, examined: 0 };
    this.scans.set(key, scan);
    for (let page = 0; !scan.complete; page++) {
      if (page >= this.opts.landedPagesPerTick) return { kind: 'more' };
      const limit = Math.min(SIGNATURE_PAGE, this.opts.maxLandedSignatures - scan.listed);
      const list = await this.sol.signaturesPage(a, scan.before, limit);
      for (const x of list) if (x.ok) scan.sigs.push(x.signature);
      scan.listed += list.length;
      scan.before = list[list.length - 1]?.signature ?? scan.before;
      scan.complete = list.length < limit || scan.listed >= this.opts.maxLandedSignatures;
    }
    for (let n = 0; scan.examined < scan.sigs.length; n++) {
      if (n >= this.opts.landedTxsPerTick) return { kind: 'more' };
      const sig = scan.sigs[scan.sigs.length - 1 - scan.examined] as string;
      const tx = await this.sol.transaction(sig);
      const value = tx !== null && tx.succeeded ? await match(tx, sig) : null;
      if (value !== null) return { kind: 'hit', value };
      scan.examined++;
    }
    return { kind: 'none' };
  }

  /** A finished search forgets its walks, so the next attempt reads fresh history. An unfinished one keeps them, finished walks included. */
  private endSearch<T>(found: ScanResult<T>, scope: string, addresses: Address[]): ScanResult<T> {
    if (found.kind !== 'more') for (const a of addresses) this.scans.delete(`${scope}:${a}`);
    return found;
  }

  /**
   * The nonce account of each instruction in `tx` that ran this op on this slot. The data is compared by discriminator only:
   * Anchor ignores trailing bytes, so the landing tx need not match what this keeper would have sent. Account positions
   * matter: a tx on another slot can list these accounts as trailing extras.
   */
  private legNonceAccounts(tx: SolTx, leg: Leg, positionAddr: Address): Address[] {
    const atPosition = slotIndex(leg.order, 'position');
    const atNonce = slotIndex(leg.order, 'nonceRecord');
    const out: Address[] = [];
    for (const ix of tx.instructions) {
      const nonceAccount = ix.accounts[atNonce];
      if (ix.program === leg.vault.program && eqBytes(ix.data.subarray(0, 8), leg.discriminator) && ix.accounts[atPosition] === positionAddr && nonceAccount !== undefined) out.push(nonceAccount);
    }
    return out;
  }

  /** N2: `init` lets exactly one successful instruction name this record on this slot, so that tx created it. The slot's history is the fallback. */
  private async findLandedTx(leg: Leg, nonceAddr: Address, positionAddr: Address): Promise<ScanResult<string>> {
    const created = async (tx: SolTx, sig: string): Promise<string | null> => (this.legNonceAccounts(tx, leg, positionAddr).includes(nonceAddr) ? sig : null);
    const scope = `landed:${leg.op}`;
    const viaNonce = await this.walkHistory(scope, nonceAddr, created);
    const found = viaNonce.kind === 'none' ? await this.walkHistory(scope, positionAddr, created) : viaNonce;
    return this.endSearch(found, scope, [nonceAddr, positionAddr]);
  }

  /** N3: a tx on this slot whose nonce record, under any nonce, is a valid record of this leg signed by NEAR's authority. */
  private async findOlderLeg(leg: Leg, positionAddr: Address, authority: Uint8Array): Promise<ScanResult<string>> {
    const scope = `older:${leg.op}`;
    const found = await this.walkHistory(scope, positionAddr, async (tx, sig) => {
      for (const candidate of this.legNonceAccounts(tx, leg, positionAddr)) {
        if (await this.isRecordOfLeg(candidate, leg, positionAddr, authority)) return sig;
      }
      return null;
    });
    return this.endSearch(found, scope, [positionAddr]);
  }

  /** The nonce is read from the record and the address re-derived from it: a record under another key is a different PDA. */
  private async isRecordOfLeg(a: Address, leg: Leg, positionAddr: Address, authority: Uint8Array): Promise<boolean> {
    const raw = await this.sol.getAccount(a);
    if (raw === null || raw.owner !== leg.vault.program) return false;
    let r: NonceRecord;
    try {
      r = parseNonceRecord(raw.data);
    } catch {
      return false;
    }
    if (r.version !== NONCE_RECORD_VERSION || r.vault !== leg.vault.vault || !eqBytes(r.authority, authority)) return false;
    if (String(r.positionId) !== leg.id || r.op !== leg.opCode || r.kind !== leg.kind) return false;
    return (await noncePda(leg.vault.program, positionAddr, authority, r.nonce)) === a;
  }

  private async confirm(sig: string, lastValidBlockHeight: bigint): Promise<void> {
    for (;;) {
      const s = await this.sol.status(sig);
      if (s.kind === 'confirmed') return;
      if (s.kind === 'failed') throw new Error(`solana tx failed: ${s.err.slice(0, 200)}`);
      if ((await this.sol.blockHeight()) > lastValidBlockHeight) throw new Error('solana tx expired (blockhash) before confirmation');
      await this.opts.sleep(this.opts.confirmPollMs);
    }
  }

  private async relayToNear(op: 'settle' | 'release', id: string, sig: string): Promise<void> {
    const methods = op === 'settle' ? (['relay_settlement_result'] as const) : RELEASE_RELAY_METHODS;
    let last = '';
    for (const m of methods) {
      let res: TxResult;
      try {
        res = await this.writer.call(m, { position_id: id, solana_tx_sig: sig });
      } catch (e) {
        last = errMsg(e);
        if (METHOD_MISSING.test(last)) continue;
        throw e;
      }
      if (res.ok) {
        this.log.info('solana_leg_relayed', { op, position_id: id, method: m, tx_hash: res.txHash, solana_tx_sig: sig });
        return;
      }
      last = res.failure ?? 'unknown failure';
      if (!METHOD_MISSING.test(last)) break;
    }
    throw new Error(`NEAR relay failed: ${last.slice(0, 200)}`);
  }

  private async deposit(id: string, p: PositionLike, program: Address, report: RelayReport, key: string): Promise<void> {
    const r = p.remote;
    const skip = (reason: string): void => void report.skipped.push({ id, reason });
    // SR-11: an AwaitingDeposit position has top-level units = 0; the reserved amount is remote.reserved_units.
    if (!str(r?.reserved_units)) return skip('reserved_units_unknown');
    if (r.confirming === true) return skip('confirm_in_flight');
    if (str(r.depositor)) return skip('deposit_already_proven'); // a refused loan: confirming again cannot change it
    const now = this.opts.nowMs();
    const expired = r.status === 'Expired' || (str(r.expires_ns) && BigInt(now) * 1_000_000n >= BigInt(r.expires_ns));
    if (expired) this.db.setRetry(key, 0, now + this.opts.expiredRescanMs); // the slot may stay empty forever: poll it slowly
    const depositor = await this.depositorOf(id, p);
    if (depositor === null) return skip('depositor_unknown');
    const vault = await this.vaultFor(p.collateral as string, program);
    const pos = await this.readPosition(vault, BigInt(id), depositor);
    if (pos === null) return; // not deposited yet
    if (pos.acct.status !== POSITION_STATUS_OPEN) return skip('position_pda_not_open'); // settled or released: the account outlives the deposit
    // N4: once expired no loan can follow, so a late or short deposit is proven for what it is and can then be released.
    if (pos.acct.amount === 0n || (!expired && pos.acct.amount < BigInt(r.reserved_units))) return skip('deposit_below_reserved');
    const nearAuth = ed25519AuthorityBytes(r.authority);
    if (nearAuth === null || !eqBytes(nearAuth, pos.acct.authority)) return skip('authority_mismatch');
    // SR-11, N4: each call costs gas reserve and key allowance, so an unchanged vault waits a doubling, capped cooldown. It is never given up on.
    const fingerprint = `${pos.acct.amount}:${pos.acct.status}`;
    const seen = this.db.confirmState(key);
    const attempts = seen !== null && seen.fingerprint === fingerprint ? seen.attempts + 1 : 1;
    // Recorded before the call: a failed or interrupted call has already spent allowance, and OutLayer answers asynchronously.
    this.db.setConfirmState(key, fingerprint, attempts, now);
    this.db.setRetry(key, 0, now + cappedCooldownMs(this.opts.depositCooldownMs, attempts, this.opts.maxConfirmCooldownMs));
    const res = await this.writer.call('confirm_remote_deposit', { position_id: id });
    if (!res.ok) throw new Error(`confirm_remote_deposit failed: ${(res.failure ?? '').slice(0, 200)}`);
    this.status.depositsConfirmed++;
    report.deposits.push(id);
    this.log.info('remote_deposit_confirm_requested', { position_id: id, tx_hash: res.txHash, late: expired });
  }

  async run(signal: AbortSignal, pollMs: number): Promise<void> {
    while (!signal.aborted) {
      await this.tick();
      await new Promise<void>((res) => {
        const t = setTimeout(res, pollMs);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          res();
        }, { once: true });
      });
    }
  }
}

type Outcome = { kind: 'none' } | { kind: 'skip'; reason: string } | { kind: 'done'; sig: string };
type ScanResult<T> = { kind: 'hit'; value: T } | { kind: 'none' } | { kind: 'more' };

/** getSignaturesForAddress returns at most 1000 per call. */
const SIGNATURE_PAGE = 1_000;

/** A resumable walk of one address's history. */
interface HistoryScan {
  /** successful signatures, newest first */
  sigs: string[];
  before: string | null;
  /** entries listed, failed ones included */
  listed: number;
  complete: boolean;
  /** how many of `sigs`, counted from the oldest, have been examined */
  examined: number;
}

/** One signed leg, as transcribed from NEAR's message. */
interface Leg {
  op: 'settle' | 'release';
  opCode: number;
  kind: number;
  id: string;
  vault: VaultContext;
  nonce: bigint;
  expires: bigint;
  /** the vault instruction this leg runs; a landed tx must have run it */
  discriminator: Uint8Array;
  order: AccountOrder;
  /** the status byte this leg leaves on the position */
  landedStatus: number;
  p: PositionLike;
  /** release only: the message's recipient, which must be the committed depositor */
  recipient?: string;
}

/** Devnet only (CLAUDE.md §1): refuse a mainnet RPC. */
export function assertDevnetRpc(url: string): void {
  if (/mainnet/i.test(url)) throw new Error('SOLANA_RPC_URL points at mainnet; devnet only');
}
