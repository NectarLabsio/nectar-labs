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

import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getAddressDecoder,
  getAddressEncoder,
  getBase58Decoder,
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
  type Base58EncodedBytes,
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
import { DEFAULT_BACKOFF, backoffDelayMs, type BackoffOptions } from './backoff.ts';
import type { CoreReader, KeeperWriter, TxResult } from './chain.ts';
import type { KeeperDb } from './db.ts';
import { KeyFileError } from './keyfile.ts';
import { errMsg, type Logger } from './log.ts';

// ------------------------------------------------------------------ constants (solana/deploy.md "Interface")

export const SETTLE_DISCRIMINATOR = Uint8Array.from([175, 42, 185, 87, 144, 131, 102, 212]);
export const RELEASE_DISCRIMINATOR = Uint8Array.from([253, 249, 15, 206, 28, 127, 193, 241]);
export const POSITION_DISCRIMINATOR = Uint8Array.from([170, 188, 143, 228, 122, 64, 247, 208]);
export const VAULT_DISCRIMINATOR = Uint8Array.from([211, 8, 232, 43, 2, 152, 117, 119]);
export const POSITION_ACCOUNT_LEN = 123;
export const POSITION_STATUS_OPEN = 1;
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
export const positionPda = (program: Address, vault: Address, id: bigint): Promise<Address> =>
  pda(program, [utf8('pos'), ab(vault), u64le(id)]);
export const noncePda = (program: Address, vault: Address, nonce: bigint): Promise<Address> =>
  pda(program, [utf8('nonce'), ab(vault), u64le(nonce)]);
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

/** `Position` (123 B): disc @0, version @8, authority @9, depositor @41, amount @73, status @81, vault @82, position_id @114, bump @122. */
export function parsePositionAccount(data: Uint8Array): PositionAccount {
  if (data.length !== POSITION_ACCOUNT_LEN) throw new Error(`position account is ${data.length} bytes, expected ${POSITION_ACCOUNT_LEN}`);
  if (!POSITION_DISCRIMINATOR.every((b, i) => data[i] === b)) throw new Error('not a nectar_vault Position account');
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    version: data[8] as number,
    authority: data.slice(9, 41),
    depositor: dec.decode(data.subarray(41, 73)),
    amount: v.getBigUint64(73, true),
    status: data[81] as number,
    vault: dec.decode(data.subarray(82, 114)),
    positionId: v.getBigUint64(114, true),
    bump: data[122] as number,
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

/** settle accounts in deploy.md order. */
export async function settleAccounts(v: VaultContext, payer: Address, position: Address, depositor: Address, f: SettleFields): Promise<AccountMeta[]> {
  const recipient = address(f.recipient);
  return [
    { address: payer, role: AccountRole.WRITABLE_SIGNER },
    r(v.vault),
    r(v.mint),
    w(v.vaultTokens),
    w(position),
    w(depositor),
    w(await associatedTokenAddress(depositor, v.tokenProgram, v.mint)),
    r(recipient),
    w(await associatedTokenAddress(recipient, v.tokenProgram, v.mint)),
    w(await noncePda(v.program, v.vault, f.nonce)),
    r(INSTRUCTIONS_SYSVAR_ADDRESS),
    r(v.tokenProgram),
    r(ASSOCIATED_TOKEN_PROGRAM_ADDRESS),
    r(SYSTEM_PROGRAM_ADDRESS),
  ];
}

/** release accounts: settle's list without recipient_account and recipient_tokens. */
export async function releaseAccounts(v: VaultContext, payer: Address, position: Address, depositor: Address, nonce: bigint): Promise<AccountMeta[]> {
  return [
    { address: payer, role: AccountRole.WRITABLE_SIGNER },
    r(v.vault),
    r(v.mint),
    w(v.vaultTokens),
    w(position),
    w(depositor),
    w(await associatedTokenAddress(depositor, v.tokenProgram, v.mint)),
    w(await noncePda(v.program, v.vault, nonce)),
    r(INSTRUCTIONS_SYSVAR_ADDRESS),
    r(v.tokenProgram),
    r(ASSOCIATED_TOKEN_PROGRAM_ADDRESS),
    r(SYSTEM_PROGRAM_ADDRESS),
  ];
}

/** `[Ed25519 verify ix, settle ix]`; nothing may sit between them (the vault reads the previous instruction). */
export async function buildSettleInstructions(
  v: VaultContext,
  payer: Address,
  position: Address,
  depositor: Address,
  authority: Uint8Array,
  preimage: string,
  signature: Uint8Array,
): Promise<Instruction[]> {
  const f = parseSettlePreimage(preimage);
  if (f.program !== v.program) throw new Error('preimage program != vault program');
  return [
    ed25519VerifyInstruction(authority, signature, utf8(preimage)),
    { programAddress: v.program, accounts: await settleAccounts(v, payer, position, depositor, f), data: settleIxData(f) },
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
    { programAddress: v.program, accounts: await releaseAccounts(v, payer, position, depositor, f.nonce), data: releaseIxData(f.positionId, f.nonce, f.expires) },
  ];
}

// ------------------------------------------------------------------ RPC port (mockable) + kit adapter

export interface SolAccount {
  owner: Address;
  data: Uint8Array;
}

export type SigState = { kind: 'pending' } | { kind: 'confirmed' } | { kind: 'failed'; err: string };

export interface SolanaPort {
  getAccount(a: Address): Promise<SolAccount | null>;
  /** Accounts of `program` whose data starts with `discriminator`. */
  programAccounts(program: Address, discriminator: Uint8Array): Promise<Array<{ address: Address; data: Uint8Array }>>;
  latestBlockhash(): Promise<{ blockhash: Blockhash; lastValidBlockHeight: bigint }>;
  blockHeight(): Promise<bigint>;
  sendBase64(wire: string): Promise<string>;
  status(sig: string): Promise<SigState>;
  /** The oldest signature touching `a` (the tx that created a nonce record), or null. */
  oldestSignatureFor(a: Address): Promise<string | null>;
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
  async programAccounts(program: Address, discriminator: Uint8Array): Promise<Array<{ address: Address; data: Uint8Array }>> {
    const bytes = getBase58Decoder().decode(discriminator) as Base58EncodedBytes;
    const res = await this.rpc
      .getProgramAccounts(program, { encoding: 'base64', commitment: 'confirmed', filters: [{ memcmp: { offset: 0n, bytes, encoding: 'base58' } }] })
      .send();
    return res.map((x) => ({ address: x.pubkey, data: b64(x.account.data[0]) }));
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
  async oldestSignatureFor(a: Address): Promise<string | null> {
    const list = await this.rpc.getSignaturesForAddress(a, { limit: 1000, commitment: 'confirmed' }).send();
    const ok = list.filter((x) => x.err === null);
    return ok.length === 0 ? null : (ok[ok.length - 1]?.signature ?? null);
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
  /** NECTAR_VAULT_MINT override: skips vault discovery */
  mintOverride?: Address | null;
  /** NECTAR_VAULT_PROGRAM_ID: when set, NEAR's remote_chain.vault_program must equal it */
  expectedProgram?: Address | null;
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
  private readonly opts: Required<Omit<RelayOptions, 'mintOverride' | 'expectedProgram'>> & Pick<RelayOptions, 'mintOverride' | 'expectedProgram'>;

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

  /** The vault for `symbol`: from NECTAR_VAULT_MINT, else the program's Vault account whose symbol matches. */
  private async vaultFor(symbol: string, program: Address): Promise<VaultContext> {
    const key = `${program}:${symbol}`;
    const hit = this.vaults.get(key);
    if (hit !== undefined) return hit;
    let mint: Address | null = this.opts.mintOverride ?? null;
    if (mint === null) {
      const found = (await this.sol.programAccounts(program, VAULT_DISCRIMINATOR))
        .map((a) => {
          try {
            return parseVaultAccount(a.data);
          } catch {
            return null;
          }
        })
        .filter((x): x is { symbol: string; mint: Address } => x !== null && x.symbol === symbol);
      if (found.length !== 1) throw new Error(`expected one vault for ${symbol}, found ${found.length}`);
      mint = (found[0] as { mint: Address }).mint;
    }
    const mintAcct = await this.sol.getAccount(mint);
    if (mintAcct === null) throw new Error('vault mint account not found');
    const vault = await vaultPda(program, mint);
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
    if (this.opts.expectedProgram != null && this.opts.expectedProgram !== prog) throw new Error('remote_chain.vault_program != NECTAR_VAULT_PROGRAM_ID');
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
      this.status.awaitingDeposit = awaiting.length;
      let pendingS = 0;
      let pendingR = 0;
      for (const p of settling) if (await this.item('settle', p, report)) pendingS++;
      for (const p of releasing) if (await this.item('release', p, report)) pendingR++;
      for (const p of awaiting) await this.item('deposit', p, report);
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
    this.db.setRetry(key, attempts, this.opts.nowMs() + delay);
    return delay;
  }

  private async readOpenPosition(program: Address, vault: VaultContext, id: bigint): Promise<{ addr: Address; acct: PositionAccount } | null> {
    const addr = await positionPda(program, vault.vault, id);
    const raw = await this.sol.getAccount(addr);
    if (raw === null) return null;
    if (raw.owner !== program) throw new Error('position PDA not owned by the vault program');
    const acct = parsePositionAccount(raw.data);
    if (acct.vault !== vault.vault || acct.positionId !== id) throw new Error('position PDA fields do not match');
    return { addr, acct };
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
    return await this.relayLeg('settle', id, vault, f.nonce, f.expires, p, async (pos) =>
      buildSettleInstructions(vault, this.payer.address, pos.addr, pos.acct.depositor, pos.acct.authority, d.preimage, hexToBytes(d.signature_hex as string)),
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
    return await this.relayLeg('release', id, vault, f.nonce, f.expires, p, async (pos) =>
      buildReleaseInstructions(vault, this.payer.address, pos.addr, pos.acct.depositor, pos.acct.authority, d.message, hexToBytes(d.signature_hex)),
    );
  }

  /**
   * Idempotent core: a used nonce PDA means the leg already landed (maybe before a crash) → relay the tx that created it;
   * a missing position PDA without the nonce means something else closed it → skip. Otherwise send and confirm, then relay.
   */
  private async relayLeg(
    op: 'settle' | 'release',
    id: string,
    vault: VaultContext,
    nonce: bigint,
    expires: bigint,
    p: PositionLike,
    build: (pos: { addr: Address; acct: PositionAccount }) => Promise<Instruction[]>,
  ): Promise<Outcome> {
    const nonceAddr = await noncePda(vault.program, vault.vault, nonce);
    if ((await this.sol.getAccount(nonceAddr)) !== null) {
      const sig = await this.sol.oldestSignatureFor(nonceAddr);
      if (sig === null) return { kind: 'skip', reason: 'nonce_used_signature_not_found' };
      this.log.info('solana_leg_already_landed', { op, position_id: id, solana_tx_sig: sig });
      await this.relayToNear(op, id, sig);
      return { kind: 'done', sig };
    }
    const pos = await this.readOpenPosition(vault.program, vault, BigInt(id));
    if (pos === null) return { kind: 'skip', reason: 'position_pda_missing' };
    if (pos.acct.status !== POSITION_STATUS_OPEN) return { kind: 'skip', reason: 'position_pda_not_open' };
    const nearAuth = ed25519AuthorityBytes(p.remote?.authority);
    if (nearAuth !== null && !eqBytes(nearAuth, pos.acct.authority)) return { kind: 'skip', reason: 'authority_mismatch' };
    if (BigInt(Math.floor(this.opts.nowMs() / 1000)) >= expires) return { kind: 'skip', reason: 'signature_expired' };

    const ixs = await build(pos);
    const bh = await this.sol.latestBlockhash();
    const { wire, signature } = await signToWire(ixs, this.payer, bh);
    this.log.info('solana_tx_sending', { op, position_id: id, solana_tx_sig: signature });
    await this.sol.sendBase64(wire);
    await this.confirm(signature, bh.lastValidBlockHeight);
    this.log.info('solana_tx_confirmed', { op, position_id: id, solana_tx_sig: signature });
    await this.relayToNear(op, id, signature);
    return { kind: 'done', sig: signature };
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
    if (!str(p.units)) return;
    const vault = await this.vaultFor(p.collateral as string, program);
    const pos = await this.readOpenPosition(program, vault, BigInt(id));
    if (pos === null) return; // not deposited yet
    if (pos.acct.status !== POSITION_STATUS_OPEN || pos.acct.amount < BigInt(p.units)) {
      report.skipped.push({ id, reason: 'deposit_below_reserved' });
      return;
    }
    const nearAuth = ed25519AuthorityBytes(p.remote?.authority);
    if (nearAuth === null || !eqBytes(nearAuth, pos.acct.authority)) {
      report.skipped.push({ id, reason: 'authority_mismatch' });
      return;
    }
    const res = await this.writer.call('confirm_remote_deposit', { position_id: id });
    if (!res.ok) throw new Error(`confirm_remote_deposit failed: ${(res.failure ?? '').slice(0, 200)}`);
    // OutLayer answers asynchronously: do not call again until the cooldown passes.
    this.db.setRetry(key, 0, this.opts.nowMs() + this.opts.depositCooldownMs);
    this.status.depositsConfirmed++;
    report.deposits.push(id);
    this.log.info('remote_deposit_confirm_requested', { position_id: id, tx_hash: res.txHash });
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

/** Devnet only (CLAUDE.md §1): refuse a mainnet RPC. */
export function assertDevnetRpc(url: string): void {
  if (/mainnet/i.test(url)) throw new Error('SOLANA_RPC_URL points at mainnet; devnet only');
}
