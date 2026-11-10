// Base spoke relay (WO-29b; interface-v7.md §D; D-026). viem 2.57.17 (F-354) on chain 84532 only (F-355): Base Sepolia or
// the disclosed local fork of it. The keeper never prices and never builds a payload of its own: every `settle` /
// `release` argument is transcribed from the EIP-712 struct NEAR signed (`get_pending_settlement_evm` /
// `get_pending_release_evm`), and the transcription is checked twice before any gas is spent: the typed-data digest is
// rebuilt from the view fields and must equal the digest NEAR signed, and the signature must recover to the vault
// position's authority.
//
// Signer: a Foundry keystore account (BASE_KEYSTORE_DIR + BASE_ACCOUNT + BASE_PASSWORD_FILE), decrypted in-process
// (Web3 Secret Storage v3: scrypt + aes-128-ctr + keccak256 MAC; format observed on a `cast wallet new` 1.9.0 keystore,
// F-343). No raw private key is read from the environment, ever; startup refuses when a *PRIVATE_KEY* variable is set.
//
// Vault ABI: evm/src/NectarVaultBase.sol, checked with `forge inspect NectarVaultBase abi` and `cast sig` (selectors
// settle 0x29b82ac2, release 0xf8ac3116, positions 0x60f3ce04, nonceUsed 0x3c02a81e; test/fixtures/base_calldata.json).
//
// ERC-8021 builder-code suffix (H19): the suffix bytes are injected by the caller and appended only when non-null. The
// format is unverified (F-351, G10 open: every spec URL 404), so main.ts injects null even when BASE_BUILDER_CODE is set
// and /healthz says `unverified_not_appended`. TODO-H19: inject the suffix once F-351 is verified.

import { createDecipheriv, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  TransactionReceiptNotFoundError,
  concat,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  hashTypedData,
  http,
  isAddress,
  keccak256,
  parseAbi,
  recoverAddress,
  toHex,
  type Address,
  type Hex,
  type LocalAccount,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { DEFAULT_BACKOFF, backoffDelayMs, type BackoffOptions } from './backoff.ts';
import type { CoreReader, KeeperWriter } from './chain.ts';
import type { KeeperDb } from './db.ts';
import { KeyFileError } from './keyfile.ts';
import { errMsg, type Logger } from './log.ts';

// ------------------------------------------------------------------ constants

export const BASE_CHAIN_ID = 'base-sepolia';
export const BASE_SEPOLIA_EVM_CHAIN_ID = 84_532;
export const BASE_MAINNET_EVM_CHAIN_ID = 8_453;
export const KIND_PRELIQ = 1;
export const KIND_SELF = 2;
/** `enum Status { None, Open, Settled, Released }` */
export const VAULT_STATUS_NONE = 0;
export const VAULT_STATUS_OPEN = 1;

export const VAULT_ABI = parseAbi([
  'struct Settle { uint64 positionId; uint64 quoteId; uint256 repayE6; uint256 seizeRaw; address recipient; uint64 nonce; uint64 expires; uint8 kind; }',
  'struct Release { uint64 positionId; address recipient; uint64 nonce; uint64 expires; }',
  'function settle(Settle m, uint8 v, bytes32 r, bytes32 s)',
  'function release(Release m, uint8 v, bytes32 r, bytes32 s)',
  'function positions(uint64) view returns (address authority, address depositor, uint256 amount, uint8 status)',
  'function nonceUsed(uint64) view returns (bool)',
  'event PositionOpened(uint64 indexed positionId, address indexed authority, address indexed depositor, uint256 amount)',
  'event PositionSettled(uint64 indexed positionId, uint64 indexed quoteId, address indexed recipient, uint256 repayE6, uint256 seizeRaw, uint256 remainder, uint64 nonce, uint8 kind)',
  'event PositionReleased(uint64 indexed positionId, address indexed recipient, uint256 amount, uint64 nonce)',
]);

/** EIP-712 types (interface-v7 §D; contracts/nectar-core/src/evm.rs SETTLE_TYPE / RELEASE_TYPE). */
export const EIP712_TYPES = {
  Settle: [
    { name: 'positionId', type: 'uint64' },
    { name: 'quoteId', type: 'uint64' },
    { name: 'repayE6', type: 'uint256' },
    { name: 'seizeRaw', type: 'uint256' },
    { name: 'recipient', type: 'address' },
    { name: 'nonce', type: 'uint64' },
    { name: 'expires', type: 'uint64' },
    { name: 'kind', type: 'uint8' },
  ],
  Release: [
    { name: 'positionId', type: 'uint64' },
    { name: 'recipient', type: 'address' },
    { name: 'nonce', type: 'uint64' },
    { name: 'expires', type: 'uint64' },
  ],
} as const;

const U64_MAX = (1n << 64n) - 1n;
const U256_MAX = (1n << 256n) - 1n;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;

// ------------------------------------------------------------------ chain guards (CLAUDE.md §1: no mainnet)

/** Refuses an RPC URL that names a mainnet host; the chain id is checked again on the wire (assertBaseSepoliaChainId). */
export function assertBaseSepoliaRpc(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('BASE_RPC_URL is not a URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('BASE_RPC_URL must be http(s)');
  if (/mainnet/i.test(u.hostname) || /mainnet/i.test(u.pathname)) throw new ChainRefusedError('BASE_RPC_URL points at mainnet; Base Sepolia (84532) only');
}

export class ChainRefusedError extends Error {}

export function assertBaseSepoliaChainId(id: number): void {
  if (id === BASE_MAINNET_EVM_CHAIN_ID) throw new ChainRefusedError('RPC reports chain id 8453 (Base mainnet): refused; Base Sepolia (84532) only');
  if (id !== BASE_SEPOLIA_EVM_CHAIN_ID) throw new ChainRefusedError(`RPC reports chain id ${id}; Base Sepolia (84532) only`);
}

/** Names of set environment variables that look like a raw private key. The keeper refuses to run the Base relay with any. */
export function rawKeyEnvVars(env: NodeJS.ProcessEnv): string[] {
  return Object.keys(env).filter((k) => /PRIVATE_?KEY|SECRET_?KEY|MNEMONIC/i.test(k) && (env[k] ?? '').trim() !== '').sort();
}

// ------------------------------------------------------------------ Foundry keystore (Web3 Secret Storage v3)

const hexBytes = (name: string, s: unknown, len?: number): Buffer => {
  if (typeof s !== 'string') throw new KeyFileError(`keystore ${name} missing`);
  const h = s.startsWith('0x') ? s.slice(2) : s;
  if (!/^[0-9a-fA-F]*$/.test(h) || h.length % 2 !== 0) throw new KeyFileError(`keystore ${name} is not hex`);
  const b = Buffer.from(h, 'hex');
  if (len !== undefined && b.length !== len) throw new KeyFileError(`keystore ${name} must be ${len} bytes`);
  return b;
};

/**
 * Decrypts a v3 keystore (scrypt + aes-128-ctr). MAC = keccak256(dk[16..32] ‖ ciphertext) (constant-time compare).
 * Returns the 32-byte secp256k1 secret; the caller zeroes it.
 */
export function decryptKeystoreV3(json: unknown, password: string): Uint8Array {
  if (typeof json !== 'object' || json === null) throw new KeyFileError('keystore is not a JSON object');
  const o = json as Record<string, unknown>;
  if (o.version !== 3) throw new KeyFileError('keystore version must be 3');
  const c = (o.crypto ?? o.Crypto) as Record<string, unknown> | undefined;
  if (typeof c !== 'object' || c === null) throw new KeyFileError('keystore crypto section missing');
  if (c.cipher !== 'aes-128-ctr') throw new KeyFileError('keystore cipher must be aes-128-ctr');
  if (c.kdf !== 'scrypt') throw new KeyFileError('keystore kdf must be scrypt');
  const kp = c.kdfparams as Record<string, unknown> | undefined;
  if (typeof kp !== 'object' || kp === null) throw new KeyFileError('keystore kdfparams missing');
  const { n, r, p, dklen } = kp;
  if (!Number.isInteger(n) || (n as number) < 2 || (n as number) > 2 ** 20 || ((n as number) & ((n as number) - 1)) !== 0) {
    throw new KeyFileError('keystore scrypt n must be a power of two ≤ 2^20');
  }
  if (!Number.isInteger(r) || (r as number) < 1 || (r as number) > 32) throw new KeyFileError('keystore scrypt r out of range');
  if (!Number.isInteger(p) || (p as number) < 1 || (p as number) > 16) throw new KeyFileError('keystore scrypt p out of range');
  if (dklen !== 32) throw new KeyFileError('keystore scrypt dklen must be 32');
  const salt = hexBytes('salt', kp.salt);
  const iv = hexBytes('iv', (c.cipherparams as Record<string, unknown> | undefined)?.iv, 16);
  const ct = hexBytes('ciphertext', c.ciphertext, 32);
  const mac = hexBytes('mac', c.mac, 32);
  const N = n as number;
  const R = r as number;
  const dk = scryptSync(Buffer.from(password, 'utf8'), salt, 32, { N, r: R, p: p as number, maxmem: 128 * N * R * 2 + (1 << 20) });
  try {
    const want = Buffer.from(keccak256(concat([dk.subarray(16, 32), ct]), 'bytes'));
    if (!timingSafeEqual(want, mac)) throw new KeyFileError('keystore MAC mismatch (wrong password or corrupt file)');
    const d = createDecipheriv('aes-128-ctr', dk.subarray(0, 16), iv);
    const sk = Buffer.concat([d.update(ct), d.final()]);
    const out = Uint8Array.from(sk);
    sk.fill(0);
    return out;
  } finally {
    dk.fill(0);
  }
}

/** Foundry account names are file names inside the keystore dir; no separators, no dot-files. */
export function assertAccountName(name: string): void {
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/.test(name)) throw new KeyFileError('BASE_ACCOUNT must be a plain keystore file name');
}

/** Password file: 0600, trailing whitespace stripped (newline from `echo`). Never logged. */
export function readPasswordFile(path: string): string {
  let st;
  try {
    st = statSync(path);
  } catch {
    throw new KeyFileError('password file not found at BASE_PASSWORD_FILE');
  }
  if (!st.isFile()) throw new KeyFileError('BASE_PASSWORD_FILE is not a regular file');
  if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) {
    throw new KeyFileError(`BASE_PASSWORD_FILE file mode ${(st.mode & 0o777).toString(8)} is too open; chmod 600`);
  }
  const pw = readFileSync(path, 'utf8').replace(/\s+$/, '');
  if (pw === '') throw new KeyFileError('BASE_PASSWORD_FILE is empty');
  return pw;
}

/** Loads `<dir>/<account>` (the file `cast wallet new <dir> <account>` / `cast wallet import` writes) into a viem account. */
export function loadFoundryKeystore(dir: string, account: string, passwordFile: string): LocalAccount {
  assertAccountName(account);
  const path = join(dir, account);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new KeyFileError('keystore file not found (BASE_KEYSTORE_DIR/BASE_ACCOUNT)');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new KeyFileError('keystore file is not valid JSON');
  }
  const sk = decryptKeystoreV3(json, readPasswordFile(passwordFile));
  try {
    const acct = privateKeyToAccount(toHex(sk));
    const declared = (json as Record<string, unknown>).address;
    if (typeof declared === 'string' && declared !== '' && getAddress(declared.startsWith('0x') ? declared : `0x${declared}`) !== acct.address) {
      throw new KeyFileError('keystore address field does not match the decrypted key');
    }
    return acct;
  } finally {
    sk.fill(0);
  }
}

// ------------------------------------------------------------------ NEAR view shapes (contracts/nectar-core/src/types.rs)

export interface SettlementEvmView {
  digest: Hex;
  r: Hex | null;
  s: Hex | null;
  v: number | null;
  positionId: string;
  quoteId: string;
  repayE6: string;
  seizeRaw: string;
  recipient: string;
  nonce: string;
  expires: string;
  kind: number;
  status: string;
  chainId: number;
  verifyingContract: string;
  txHash: string | null;
}

export interface ReleaseEvmView {
  digest: Hex;
  r: Hex | null;
  s: Hex | null;
  v: number | null;
  positionId: string;
  recipient: string;
  nonce: string;
  expires: string;
  status: string;
  chainId: number;
  verifyingContract: string;
  txHash: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown): v is string => typeof v === 'string';
const optHex = (v: unknown): boolean => v === null || v === undefined || (str(v) && HEX32.test(v));

function asSettleView(v: unknown): SettlementEvmView | null {
  if (!isObj(v)) return null;
  const strs = ['digest', 'positionId', 'quoteId', 'repayE6', 'seizeRaw', 'recipient', 'nonce', 'expires', 'status', 'verifyingContract'];
  if (!strs.every((k) => str(v[k])) || typeof v.kind !== 'number' || typeof v.chainId !== 'number') return null;
  if (!optHex(v.r) || !optHex(v.s) || !(v.v === null || v.v === undefined || typeof v.v === 'number')) return null;
  return { ...(v as unknown as SettlementEvmView), r: (v.r as Hex | undefined) ?? null, s: (v.s as Hex | undefined) ?? null, v: (v.v as number | undefined) ?? null };
}

function asReleaseView(v: unknown): ReleaseEvmView | null {
  if (!isObj(v)) return null;
  const strs = ['digest', 'positionId', 'recipient', 'nonce', 'expires', 'status', 'verifyingContract'];
  if (!strs.every((k) => str(v[k])) || typeof v.chainId !== 'number') return null;
  if (!optHex(v.r) || !optHex(v.s) || !(v.v === null || v.v === undefined || typeof v.v === 'number')) return null;
  return { ...(v as unknown as ReleaseEvmView), r: (v.r as Hex | undefined) ?? null, s: (v.s as Hex | undefined) ?? null, v: (v.v as number | undefined) ?? null };
}

// ------------------------------------------------------------------ transcription: view → typed struct → calldata

function uint(name: string, s: string, max: bigint): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(s)) throw new Error(`${name} is not a canonical decimal`);
  const v = BigInt(s);
  if (v > max) throw new Error(`${name} out of range`);
  return v;
}

export interface Signature {
  v: number;
  r: Hex;
  s: Hex;
}

export interface SettleStruct {
  positionId: bigint;
  quoteId: bigint;
  repayE6: bigint;
  seizeRaw: bigint;
  recipient: Address;
  nonce: bigint;
  expires: bigint;
  kind: number;
}

export interface ReleaseStruct {
  positionId: bigint;
  recipient: Address;
  nonce: bigint;
  expires: bigint;
}

function sigOf(d: { r: Hex | null; s: Hex | null; v: number | null }): Signature {
  if (d.r === null || d.s === null || d.v === null) throw new Error('signature incomplete');
  if (d.v !== 27 && d.v !== 28) throw new Error('v must be 27 or 28');
  return { v: d.v, r: d.r, s: d.s };
}

function addr(name: string, s: string): Address {
  if (!isAddress(s, { strict: false })) throw new Error(`${name} is not an address`);
  return getAddress(s);
}

export function settleStructOf(d: SettlementEvmView): SettleStruct {
  if (d.kind !== KIND_PRELIQ && d.kind !== KIND_SELF) throw new Error(`settle kind ${d.kind} is not PRELIQ (1) or SELF (2)`);
  return {
    positionId: uint('positionId', d.positionId, U64_MAX),
    quoteId: uint('quoteId', d.quoteId, U64_MAX),
    repayE6: uint('repayE6', d.repayE6, U256_MAX),
    seizeRaw: uint('seizeRaw', d.seizeRaw, U256_MAX),
    recipient: addr('recipient', d.recipient),
    nonce: uint('nonce', d.nonce, U64_MAX),
    expires: uint('expires', d.expires, U64_MAX),
    kind: d.kind,
  };
}

export function releaseStructOf(d: ReleaseEvmView): ReleaseStruct {
  return {
    positionId: uint('positionId', d.positionId, U64_MAX),
    recipient: addr('recipient', d.recipient),
    nonce: uint('nonce', d.nonce, U64_MAX),
    expires: uint('expires', d.expires, U64_MAX),
  };
}

export const domainOf = (vault: Address) =>
  ({ name: 'NectarVault', version: '1', chainId: BASE_SEPOLIA_EVM_CHAIN_ID, verifyingContract: vault }) as const;

export function settleDigest(vault: Address, m: SettleStruct): Hex {
  return hashTypedData({ domain: domainOf(vault), types: EIP712_TYPES, primaryType: 'Settle', message: m });
}

export function releaseDigest(vault: Address, m: ReleaseStruct): Hex {
  return hashTypedData({ domain: domainOf(vault), types: EIP712_TYPES, primaryType: 'Release', message: m });
}

/** `settle(Settle, uint8 v, bytes32 r, bytes32 s)` calldata. */
export function settleCalldata(m: SettleStruct, sig: Signature): Hex {
  return encodeFunctionData({ abi: VAULT_ABI, functionName: 'settle', args: [m, sig.v, sig.r, sig.s] });
}

/** `release(Release, uint8 v, bytes32 r, bytes32 s)` calldata. */
export function releaseCalldata(m: ReleaseStruct, sig: Signature): Hex {
  return encodeFunctionData({ abi: VAULT_ABI, functionName: 'release', args: [m, sig.v, sig.r, sig.s] });
}

/** ERC-8021 builder-code suffix (H19): appended verbatim when injected, else calldata unchanged. */
export function withBuilderSuffix(data: Hex, suffix: Hex | null): Hex {
  return suffix === null ? data : concat([data, suffix]);
}

export async function recoverSigner(digest: Hex, sig: Signature): Promise<Address> {
  return await recoverAddress({ hash: digest, signature: concat([sig.r, sig.s, toHex(sig.v, { size: 1 })]) });
}

// ------------------------------------------------------------------ EVM port (viem; mocked in tests)

export interface VaultPosition {
  authority: Address;
  depositor: Address;
  amount: bigint;
  status: number;
}

export interface EvmReceipt {
  status: 'success' | 'reverted';
  blockNumber: bigint;
}

export type VaultEvent = 'PositionOpened' | 'PositionSettled' | 'PositionReleased';

export interface EvmPort {
  readonly signer: Address;
  chainId(): Promise<number>;
  blockNumber(): Promise<bigint>;
  position(vault: Address, id: bigint): Promise<VaultPosition>;
  nonceUsed(vault: Address, nonce: bigint): Promise<boolean>;
  /** Prepares and signs a tx to `to`; nothing is broadcast. */
  sign(to: Address, data: Hex): Promise<{ hash: Hex; raw: Hex }>;
  broadcast(raw: Hex): Promise<Hex>;
  receipt(hash: Hex): Promise<EvmReceipt | null>;
  /** Most recent tx that emitted `event` for `positionId` (and `nonce`, when given) within the lookback window. */
  findEventTx(vault: Address, event: VaultEvent, positionId: bigint, nonce: bigint | null): Promise<Hex | null>;
}

export class ViemEvmPort implements EvmPort {
  readonly signer: Address;
  private readonly pub;
  private readonly wallet;
  private readonly account: LocalAccount;
  private readonly lookback: bigint;
  private readonly chunk: bigint;

  constructor(rpcUrl: string, account: LocalAccount, opts: { lookbackBlocks?: number; logChunkBlocks?: number } = {}) {
    assertBaseSepoliaRpc(rpcUrl);
    this.account = account;
    this.signer = account.address;
    this.pub = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
    this.wallet = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });
    // sepolia.base.org (also behind an anvil fork) answers eth_getLogs only for ranges of ≤ 200 blocks (observed
    // 2026-11-10: "eth_getLogs is limited to a 200 range"), so scan in 200-block chunks over a bounded window.
    this.lookback = BigInt(opts.lookbackBlocks ?? 10_000);
    this.chunk = BigInt(opts.logChunkBlocks ?? 200);
  }

  async chainId(): Promise<number> {
    return await this.pub.getChainId();
  }

  async blockNumber(): Promise<bigint> {
    return await this.pub.getBlockNumber();
  }

  async position(vault: Address, id: bigint): Promise<VaultPosition> {
    const [authority, depositor, amount, status] = await this.pub.readContract({ address: vault, abi: VAULT_ABI, functionName: 'positions', args: [id] });
    return { authority, depositor, amount, status };
  }

  async nonceUsed(vault: Address, nonce: bigint): Promise<boolean> {
    return await this.pub.readContract({ address: vault, abi: VAULT_ABI, functionName: 'nonceUsed', args: [nonce] });
  }

  async sign(to: Address, data: Hex): Promise<{ hash: Hex; raw: Hex }> {
    const req = await this.wallet.prepareTransactionRequest({ account: this.account, chain: baseSepolia, to, data });
    const raw = await this.wallet.signTransaction(req);
    return { hash: keccak256(raw), raw };
  }

  async broadcast(raw: Hex): Promise<Hex> {
    return await this.pub.sendRawTransaction({ serializedTransaction: raw });
  }

  async receipt(hash: Hex): Promise<EvmReceipt | null> {
    try {
      const r = await this.pub.getTransactionReceipt({ hash });
      return { status: r.status, blockNumber: r.blockNumber };
    } catch (e) {
      if (e instanceof TransactionReceiptNotFoundError) return null;
      throw e;
    }
  }

  async findEventTx(vault: Address, event: VaultEvent, positionId: bigint, nonce: bigint | null): Promise<Hex | null> {
    const latest = await this.pub.getBlockNumber();
    const floor = latest > this.lookback ? latest - this.lookback : 0n;
    for (let to = latest; to >= floor; ) {
      const from = to - this.chunk + 1n > floor ? to - this.chunk + 1n : floor;
      const logs = await this.pub.getContractEvents({ address: vault, abi: VAULT_ABI, eventName: event, args: { positionId }, fromBlock: from, toBlock: to });
      for (let i = logs.length - 1; i >= 0; i--) {
        const l = logs[i];
        if (l === undefined) continue;
        const a = l.args as { nonce?: bigint };
        if (nonce === null || a.nonce === nonce) return l.transactionHash;
      }
      if (from === floor) break;
      to = from - 1n;
    }
    return null;
  }
}

// ------------------------------------------------------------------ the relay

interface RemoteView {
  chain_id?: string;
  vault_program?: string;
  status?: string;
  authority?: string | null;
  reserved_units?: string;
}
interface PositionLike {
  position_id?: string;
  id?: string;
  status?: string;
  units?: string;
  remote?: RemoteView | null;
}

export interface BaseRelayOptions {
  pageSize: number;
  maxPages?: number;
  /** BASE_VAULT_ADDRESS: when set, every position's pinned vault and the signed verifyingContract must equal it. */
  expectedVault?: Address | null;
  /** BASE_KEEPER_ATTEST=1 (local fork): `keeper_attest_deposit` instead of `confirm_remote_deposit`. */
  keeperAttest?: boolean;
  /** ERC-8021 suffix bytes (H19); null = none. */
  builderSuffix?: Hex | null;
  builderSuffixState?: BuilderSuffixState;
  backoff?: BackoffOptions;
  receiptPollMs?: number;
  receiptTimeoutMs?: number;
  /** a stored tx with no receipt after this long is forgotten and the leg re-evaluated */
  pendingTxTimeoutMs?: number;
  depositCooldownMs?: number;
  nowMs?: () => number;
  rand?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export type BuilderSuffixState = 'none' | 'appended' | 'unverified_not_appended';

export interface BaseRelayStatus {
  enabled: boolean;
  chainId: number | null;
  signer: string;
  attestMode: boolean;
  builderSuffix: BuilderSuffixState;
  lastBlockSeen: string | null;
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

export interface BaseRelayReport {
  settled: string[];
  released: string[];
  deposits: string[];
  skipped: Array<{ id: string; reason: string }>;
  failed: Array<{ id: string; error: string }>;
}

type Op = 'settle' | 'release' | 'deposit';
type Outcome = { kind: 'none' } | { kind: 'skip'; reason: string } | { kind: 'done'; txHash: Hex };

/** True iff the position is pinned to the Base spoke. */
export function isBasePosition(p: { remote?: { chain_id?: unknown } | null }): boolean {
  return p.remote?.chain_id === BASE_CHAIN_ID;
}

export class BaseRelay {
  readonly status: BaseRelayStatus;
  private readonly inFlight = new Set<string>();
  private readonly opts: Required<Omit<BaseRelayOptions, 'expectedVault' | 'builderSuffix'>> & Pick<BaseRelayOptions, 'expectedVault' | 'builderSuffix'>;
  private chainChecked = false;

  private readonly near: CoreReader;
  private readonly writer: KeeperWriter;
  private readonly evm: EvmPort;
  private readonly db: KeeperDb;
  private readonly log: Logger;

  constructor(near: CoreReader, writer: KeeperWriter, evm: EvmPort, db: KeeperDb, log: Logger, opts: BaseRelayOptions) {
    this.near = near;
    this.writer = writer;
    this.evm = evm;
    this.db = db;
    this.log = log;
    this.opts = {
      maxPages: 200,
      keeperAttest: false,
      builderSuffixState: opts.builderSuffix != null ? 'appended' : 'none',
      backoff: DEFAULT_BACKOFF,
      receiptPollMs: 2_000,
      receiptTimeoutMs: 120_000,
      pendingTxTimeoutMs: 600_000,
      depositCooldownMs: 60_000,
      nowMs: Date.now,
      rand: Math.random,
      sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
      ...opts,
    };
    this.status = {
      enabled: true,
      chainId: null,
      signer: evm.signer,
      attestMode: this.opts.keeperAttest,
      builderSuffix: this.opts.builderSuffixState,
      lastBlockSeen: null,
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

  /** Chain id on the wire must be 84532 (8453 and anything else refused). Called at startup and before the first tick. */
  async assertChain(): Promise<void> {
    const id = await this.evm.chainId();
    this.status.chainId = id;
    assertBaseSepoliaChainId(id);
    this.chainChecked = true;
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

  async tick(): Promise<BaseRelayReport> {
    const report: BaseRelayReport = { settled: [], released: [], deposits: [], skipped: [], failed: [] };
    try {
      if (!this.chainChecked) await this.assertChain();
      this.status.lastBlockSeen = String(await this.evm.blockNumber());
      const base = (await this.listPositions()).filter(isBasePosition);
      const settling = base.filter((p) => p.status === 'Settling' || p.remote?.status === 'Settling');
      const releasing = base.filter((p) => p.remote?.status === 'Releasing');
      const awaiting = base.filter((p) => p.remote?.status === 'AwaitingDeposit');
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
      this.log.error('base_relay_tick_failed', { error: errMsg(e).slice(0, 300) });
    }
    this.status.lastTickAt = this.opts.nowMs();
    return report;
  }

  private vaultOf(p: PositionLike): Address {
    const v = p.remote?.vault_program;
    if (!str(v) || !isAddress(v, { strict: false })) throw new Error('position remote.vault_program is not a 0x address');
    const a = getAddress(v);
    if (this.opts.expectedVault != null && this.opts.expectedVault !== a) throw new Error('remote.vault_program != BASE_VAULT_ADDRESS');
    return a;
  }

  /** Returns true when the item is a pending remote leg (counted for /healthz). */
  private async item(op: Op, p: PositionLike, report: BaseRelayReport): Promise<boolean> {
    const id = p.position_id ?? p.id;
    if (!str(id) || !/^(0|[1-9][0-9]*)$/.test(id)) return false;
    const key = `base:${op}:${id}`;
    if (this.inFlight.has(key)) return true;
    const now = this.opts.nowMs();
    const retry = this.db.retry(key);
    if (retry !== null && retry.next_attempt_at > now) {
      report.skipped.push({ id, reason: 'backoff' });
      return true;
    }
    this.inFlight.add(key);
    try {
      const vault = this.vaultOf(p);
      if (op === 'deposit') {
        await this.deposit(id, p, vault, report, key);
        return true;
      }
      const outcome = op === 'settle' ? await this.settle(id, p, vault) : await this.release(id, p, vault);
      if (outcome.kind === 'none') return false;
      if (outcome.kind === 'skip') {
        report.skipped.push({ id, reason: outcome.reason });
        this.log.warn('base_relay_skipped', { op, position_id: id, reason: outcome.reason });
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
      this.log.warn('base_relay_failed', { op, position_id: id, retry_in_ms: delay, error: errMsg(e).slice(0, 300) });
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

  /** The signed view must name this chain, this vault and this position. */
  private checkCommon(id: string, vault: Address, d: { chainId: number; verifyingContract: string; positionId: string }): void {
    if (d.chainId !== BASE_SEPOLIA_EVM_CHAIN_ID) throw new Error(`signed chainId ${d.chainId} != 84532`);
    if (addr('verifyingContract', d.verifyingContract) !== vault) throw new Error('signed verifyingContract != position vault');
    if (d.positionId !== id) throw new Error('signed positionId != position id');
  }

  private async settle(id: string, p: PositionLike, vault: Address): Promise<Outcome> {
    const { value } = await this.near.view('get_pending_settlement_evm', { position_id: id });
    const d = asSettleView(value);
    if (d === null || d.status !== 'Signed' || d.r === null) return { kind: 'none' };
    this.checkCommon(id, vault, d);
    const m = settleStructOf(d);
    const sig = sigOf(d);
    if (settleDigest(vault, m).toLowerCase() !== d.digest.toLowerCase()) throw new Error('rebuilt Settle digest != signed digest');
    return await this.relayLeg('settle', id, p, vault, m.nonce, m.expires, d.digest, sig, settleCalldata(m, sig));
  }

  private async release(id: string, p: PositionLike, vault: Address): Promise<Outcome> {
    const { value } = await this.near.view('get_pending_release_evm', { position_id: id });
    const d = asReleaseView(value);
    if (d === null || d.status !== 'Signed' || d.r === null) return { kind: 'none' };
    this.checkCommon(id, vault, d);
    const m = releaseStructOf(d);
    const sig = sigOf(d);
    if (releaseDigest(vault, m).toLowerCase() !== d.digest.toLowerCase()) throw new Error('rebuilt Release digest != signed digest');
    return await this.relayLeg('release', id, p, vault, m.nonce, m.expires, d.digest, sig, releaseCalldata(m, sig));
  }

  /**
   * Idempotent core. Order: (1) a tx we signed before (stored hash) → by receipt; (2) the vault nonce is used → the leg
   * landed (maybe before a crash, maybe by another relayer) → relay the tx that emitted the event; (3) the vault position
   * is not open → skip. Otherwise verify the signer and expiry, sign, record the hash, broadcast, wait, relay.
   */
  private async relayLeg(op: 'settle' | 'release', id: string, p: PositionLike, vault: Address, nonce: bigint, expires: bigint, digest: Hex, sig: Signature, calldata: Hex): Promise<Outcome> {
    const txKey = `base:${op}:${id}:${nonce}`;
    const stored = this.db.evmTx(txKey);
    if (stored !== null) {
      const hash = stored.tx_hash as Hex;
      const rc = await this.evm.receipt(hash);
      if (rc?.status === 'success') {
        this.log.info('base_leg_already_landed', { op, position_id: id, evm_tx_hash: hash });
        await this.relayToNear(op, id, hash);
        this.db.clearEvmTx(txKey);
        return { kind: 'done', txHash: hash };
      }
      if (rc === null && this.opts.nowMs() - stored.sent_at < this.opts.pendingTxTimeoutMs) return { kind: 'skip', reason: 'tx_pending' };
      this.db.clearEvmTx(txKey); // reverted or dropped: re-evaluate from chain state
    }
    if (await this.evm.nonceUsed(vault, nonce)) {
      const hash = await this.evm.findEventTx(vault, op === 'settle' ? 'PositionSettled' : 'PositionReleased', BigInt(id), nonce);
      if (hash === null) return { kind: 'skip', reason: 'nonce_used_tx_not_found' };
      this.log.info('base_leg_already_landed', { op, position_id: id, evm_tx_hash: hash });
      await this.relayToNear(op, id, hash);
      return { kind: 'done', txHash: hash };
    }
    const pos = await this.evm.position(vault, BigInt(id));
    if (pos.status !== VAULT_STATUS_OPEN) return { kind: 'skip', reason: 'vault_position_not_open' };
    const signer = await recoverSigner(digest, sig);
    if (signer !== getAddress(pos.authority)) return { kind: 'skip', reason: 'signer_not_vault_authority' };
    const nearAuth = p.remote?.authority;
    if (str(nearAuth) && (!isAddress(nearAuth, { strict: false }) || getAddress(nearAuth) !== signer)) return { kind: 'skip', reason: 'authority_mismatch' };
    if (BigInt(Math.floor(this.opts.nowMs() / 1000)) >= expires) return { kind: 'skip', reason: 'signature_expired' };

    const { hash, raw } = await this.evm.sign(vault, withBuilderSuffix(calldata, this.opts.builderSuffix ?? null));
    this.db.setEvmTx(txKey, hash, this.opts.nowMs());
    this.log.info('base_tx_sending', { op, position_id: id, evm_tx_hash: hash });
    await this.evm.broadcast(raw);
    const rc = await this.waitReceipt(hash);
    if (rc.status !== 'success') {
      this.db.clearEvmTx(txKey);
      throw new Error(`base tx reverted: ${hash}`);
    }
    this.log.info('base_tx_confirmed', { op, position_id: id, evm_tx_hash: hash, block: String(rc.blockNumber) });
    await this.relayToNear(op, id, hash);
    this.db.clearEvmTx(txKey);
    return { kind: 'done', txHash: hash };
  }

  private async waitReceipt(hash: Hex): Promise<EvmReceipt> {
    const deadline = this.opts.nowMs() + this.opts.receiptTimeoutMs;
    for (;;) {
      const rc = await this.evm.receipt(hash);
      if (rc !== null) return rc;
      if (this.opts.nowMs() >= deadline) throw new Error(`no receipt for ${hash} yet (kept; next tick re-checks)`);
      await this.opts.sleep(this.opts.receiptPollMs);
    }
  }

  /** Method names unchanged (§D): the 0x tx hash goes in `solana_tx_sig`; the contract validates it by domain. */
  private async relayToNear(op: 'settle' | 'release', id: string, txHash: Hex): Promise<void> {
    const method = op === 'settle' ? 'relay_settlement_result' : 'relay_release_result';
    const res = await this.writer.call(method, { position_id: id, solana_tx_sig: txHash });
    if (!res.ok) throw new Error(`NEAR ${method} failed: ${(res.failure ?? 'unknown').slice(0, 200)}`);
    this.log.info('base_leg_relayed', { op, position_id: id, method, tx_hash: res.txHash, evm_tx_hash: txHash });
  }

  private async deposit(id: string, p: PositionLike, vault: Address, report: BaseRelayReport, key: string): Promise<void> {
    const reserved = p.remote?.reserved_units ?? p.units;
    const nearAuth = p.remote?.authority;
    if (!str(reserved) || !str(nearAuth)) return; // authority still pending on NEAR
    const pos = await this.evm.position(vault, BigInt(id));
    if (pos.status === VAULT_STATUS_NONE) return; // not deposited yet
    if (pos.status !== VAULT_STATUS_OPEN || pos.amount < BigInt(reserved)) {
      report.skipped.push({ id, reason: 'deposit_below_reserved' });
      return;
    }
    if (!isAddress(nearAuth, { strict: false }) || getAddress(nearAuth) !== getAddress(pos.authority)) {
      report.skipped.push({ id, reason: 'authority_mismatch' });
      return;
    }
    if (this.opts.keeperAttest) {
      // Local fork (D-026): OutLayer's vault_read cannot reach localhost, so the keeper attests what it read. Labelled.
      let opened: Hex | null = null;
      try {
        opened = await this.evm.findEventTx(vault, 'PositionOpened', BigInt(id), null);
      } catch (e) {
        this.log.warn('base_open_tx_lookup_failed', { position_id: id, error: errMsg(e).slice(0, 200) }); // tx_ref falls back to the slot
      }
      const txRef = opened ?? `${vault}:positions:${id}`;
      const res = await this.writer.call('keeper_attest_deposit', { position_id: id, tx_ref: txRef, depositor: getAddress(pos.depositor) });
      if (!res.ok) throw new Error(`keeper_attest_deposit failed: ${(res.failure ?? '').slice(0, 200)}`);
      this.log.info('remote_deposit_keeper_attested', { position_id: id, tx_hash: res.txHash, evm_tx_hash: opened, source: 'keeper-attest (local fork)' });
    } else {
      const res = await this.writer.call('confirm_remote_deposit', { position_id: id });
      if (!res.ok) throw new Error(`confirm_remote_deposit failed: ${(res.failure ?? '').slice(0, 200)}`);
      this.log.info('remote_deposit_confirm_requested', { position_id: id, tx_hash: res.txHash, chain: BASE_CHAIN_ID });
    }
    // OutLayer answers asynchronously, and an attestation lands at once: either way, do not call again until the cooldown passes.
    this.db.setRetry(key, 0, this.opts.nowMs() + this.opts.depositCooldownMs);
    this.status.depositsConfirmed++;
    report.deposits.push(id);
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
