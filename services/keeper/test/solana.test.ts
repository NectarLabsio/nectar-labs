// Solana relay (WO-16 Part 2): byte-exact instruction data and account order against solana/deploy.md, using the
// recorded v1 preimage + signature (contracts/nectar-core/tests/preimage_vectors.json, the solana/client vectors),
// and a mocked RPC for idempotency and the SR-2 / SR-11 / SR-12 / SR-31 failure scenarios. No devnet sends.

import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import {
  AccountRole,
  address,
  generateKeyPairSigner,
  getAddressDecoder,
  getAddressEncoder,
  getBase58Decoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Address,
  type Blockhash,
  type KeyPairSigner,
} from '@solana/kit';
import { ED25519_PROGRAM_ADDRESS, INSTRUCTIONS_SYSVAR_ADDRESS, ed25519InstructionData, hexToBytes } from '../../../solana/client/ed25519.ts';
import { KIND_LEGACY, KIND_PRELIQ, KIND_SELF, releasePreimage, settlePreimage, utf8 } from '../../../solana/client/preimage.ts';
import { findProgramAddress, keyBytes, positionAddress, u64le as clientU64le } from '../../../solana/client/pda.ts';
import { ACCOUNT_DISCRIMINATOR, NONCE_RECORD_V2, POSITION_V2, releaseInstruction, settleInstruction, vaultIds } from '../../../solana/client/vault.ts';
import type { KeeperMethod } from '../src/abi.ts';
import { cappedCooldownMs } from '../src/backoff.ts';
import type { Allowance, CoreReader, KeeperCallArgs, KeeperWriter, TxResult, ViewResult } from '../src/chain.ts';
import { assertSolanaPinned, loadConfig } from '../src/config.ts';
import { KeeperDb } from '../src/db.ts';
import { createLogger } from '../src/log.ts';
import { flattenYaml } from '../src/repo-config.ts';
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  KitSolanaPort,
  NONCE_RECORD_DISCRIMINATOR,
  NONCE_RECORD_LEN,
  OP_RELEASE,
  OP_SETTLE,
  POSITION_DISCRIMINATOR,
  POSITION_LAYOUT,
  POSITION_STATUS_RELEASED,
  POSITION_STATUS_SETTLED,
  RELEASE_ACCOUNT_ORDER,
  RELEASE_DISCRIMINATOR,
  SETTLE_ACCOUNT_ORDER,
  SYSTEM_PROGRAM_ADDRESS,
  SolanaRelay,
  VAULT_DISCRIMINATOR,
  assertDevnetRpc,
  claimPda,
  isSolanaPosition,
  associatedTokenAddress,
  buildReleaseInstructions,
  buildSettleInstructions,
  ed25519AuthorityBytes,
  noncePda,
  parseNonceRecord,
  parsePositionAccount,
  parseReleasePreimage,
  parseSettlePreimage,
  positionPda,
  releaseAccounts,
  releaseIxData,
  settleAccounts,
  settleIxData,
  vaultPda,
  vaultTokensPda,
  type RelayOptions,
  type SigEntry,
  type SigState,
  type SolAccount,
  type SolTx,
  type SolanaPort,
  type VaultContext,
} from '../src/solana.ts';

interface Vector {
  vault_program: string;
  position_id: string;
  quote_id: string;
  repay_e6: string;
  seize_units: string;
  recipient: string;
  nonce: string;
  expires: string;
  preimage: string;
  signature_hex: string;
}
const VECTORS = JSON.parse(readFileSync(new URL('../../../contracts/nectar-core/tests/preimage_vectors.json', import.meta.url), 'utf8')) as {
  test_key_seed_hex: string;
  test_public_key_base58: string;
  vectors: Vector[];
};
const RAW = VECTORS.vectors[0] as Vector;
// The recorded vector's program id (Nectar1Vau1t111…) is a string placeholder that decodes to 33 bytes, so it is not
// a Solana address. Use the vault's declare_id! (solana lib.rs) and re-sign with the vector key, which is shown below to
// reproduce the recorded signature byte for byte.
const PROGRAM_ID = 'GdCVqcg24RJkwNWZ2kgEaQRVhsXxEupvBSZSJy39xkrm';
const PROGRAM = address(PROGRAM_ID);
const AUTH = Uint8Array.from(getAddressEncoder().encode(address(VECTORS.test_public_key_base58)) as unknown as ArrayLike<number>);
const TOKEN_PROGRAM = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const MINT = address('So11111111111111111111111111111111111111112');
const DEPOSITOR = address('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin');
const addrBytes = (a: Address): number[] => Array.from(getAddressEncoder().encode(a) as unknown as ArrayLike<number>);

const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
const priv = createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(VECTORS.test_key_seed_hex, 'hex')]), format: 'der', type: 'pkcs8' });
const signMsg = (m: string): string => Buffer.from(sign(null, Buffer.from(m, 'utf8'), priv)).toString('hex');
const V: Vector = { ...RAW, vault_program: PROGRAM_ID, preimage: RAW.preimage.replace(`program=${RAW.vault_program}`, `program=${PROGRAM_ID}`) };
V.signature_hex = signMsg(V.preimage);
const SIG = hexToBytes(V.signature_hex);

function le64(n: bigint): number[] {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return [...b];
}
function lei64(n: bigint): number[] {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n);
  return [...b];
}

async function vaultCtx(): Promise<VaultContext> {
  const vault = await vaultPda(PROGRAM, MINT);
  return { program: PROGRAM, vault, mint: MINT, vaultTokens: await vaultTokensPda(PROGRAM, vault), tokenProgram: TOKEN_PROGRAM };
}

function positionData(vault: Address, id: bigint, amount: bigint, status = 1, authority = AUTH, depositor: Address = DEPOSITOR): Uint8Array {
  const d = new Uint8Array(131);
  const v = new DataView(d.buffer);
  d.set(POSITION_DISCRIMINATOR, 0);
  d[8] = 2;
  d.set(authority, 9);
  d.set(addrBytes(depositor), 41);
  v.setBigUint64(73, amount, true);
  d[81] = status;
  d.set(addrBytes(vault), 82);
  v.setBigUint64(114, id, true);
  d[122] = 255;
  return d;
}

interface RecordFields {
  version: number;
  vault: Address;
  authority: Uint8Array;
  nonce: bigint;
  positionId: bigint;
  op: number;
  kind: number;
}

/** §E NonceRecord v2, field by field. */
function nonceRecordData(f: RecordFields): Uint8Array {
  const d = new Uint8Array(91);
  const v = new DataView(d.buffer);
  d.set(NONCE_RECORD_DISCRIMINATOR, 0);
  d[8] = f.version;
  d.set(addrBytes(f.vault), 9);
  d.set(f.authority, 41);
  v.setBigUint64(73, f.nonce, true);
  v.setBigUint64(81, f.positionId, true);
  d[89] = f.op;
  d[90] = f.kind;
  return d;
}

function vaultData(symbol: string, mint: Address): Uint8Array {
  const s = utf8(symbol);
  const d = new Uint8Array(8 + 1 + 4 + s.length + 32 + 32 + 2);
  d.set(VAULT_DISCRIMINATOR, 0);
  d[8] = 1;
  new DataView(d.buffer).setUint32(9, s.length, true);
  d.set(s, 13);
  d.set(addrBytes(mint), 13 + s.length);
  return d;
}

describe('solana: preimage transcription', () => {
  it('the vector key reproduces the recorded v1 signature; the recorded program id is not a Solana address', () => {
    assert.equal(signMsg(RAW.preimage), RAW.signature_hex);
    assert.throws(() => parseSettlePreimage(RAW.preimage));
  });
  it('parses the recorded v1 vector (kind 0) and round-trips', () => {
    const f = parseSettlePreimage(V.preimage);
    assert.equal(f.kind, KIND_LEGACY);
    assert.equal(f.program, V.vault_program);
    assert.equal(String(f.positionId), V.position_id);
    assert.equal(String(f.repayE6), V.repay_e6);
    assert.equal(String(f.seizeUnits), V.seize_units);
    assert.equal(f.recipient, V.recipient);
    assert.equal(String(f.expires), V.expires);
    assert.equal(settlePreimage(f), V.preimage);
  });
  it('kind from the suffix: PRELIQ = 1, SELF = 2', () => {
    assert.equal(parseSettlePreimage(`${V.preimage}|kind=PRELIQ`).kind, KIND_PRELIQ);
    assert.equal(parseSettlePreimage(`${V.preimage}|kind=SELF`).kind, KIND_SELF);
    assert.throws(() => parseSettlePreimage(`${V.preimage}|kind=OTHER`));
  });
  it('rejects non-canonical numbers and u64 overflow', () => {
    assert.throws(() => parseSettlePreimage(V.preimage.replace('|pos=0|', '|pos=00|')), /round-trip/);
    assert.throws(() => parseSettlePreimage(V.preimage.replace('|nonce=0|', '|nonce=18446744073709551616|')), /u64/);
  });
  it('parses a release message', () => {
    const m = releasePreimage({ program: V.vault_program, positionId: 7n, recipient: DEPOSITOR, nonce: 9n, expires: 1700003600n });
    const f = parseReleasePreimage(m);
    assert.equal(f.positionId, 7n);
    assert.equal(f.recipient, DEPOSITOR);
    assert.throws(() => parseReleasePreimage(m.replace('NECTAR_RELEASE_V1', 'NECTAR_RELEASE_V2')));
  });
});

describe('solana: instruction bytes and account order (solana/deploy.md)', () => {
  it('settle data is discriminator + borsh args, byte for byte', () => {
    const f = parseSettlePreimage(`${V.preimage}|kind=PRELIQ`);
    const expected = [
      175, 42, 185, 87, 144, 131, 102, 212,
      ...le64(BigInt(V.position_id)), ...le64(BigInt(V.quote_id)), ...le64(BigInt(V.repay_e6)), ...le64(BigInt(V.seize_units)),
      ...addrBytes(address(V.recipient)), ...le64(BigInt(V.nonce)), ...lei64(BigInt(V.expires)), 1,
    ];
    assert.deepEqual([...settleIxData(f)], expected);
    assert.equal(expected.length, 89);
  });
  it('release data is discriminator + position_id u64 + nonce u64 + expires i64', () => {
    assert.deepEqual([...releaseIxData(7n, 9n, 1700003600n)], [253, 249, 15, 206, 28, 127, 193, 241, ...le64(7n), ...le64(9n), ...lei64(1700003600n)]);
  });
  it('[ed25519 verify, settle]: recorded signature verifies; v2 accounts in order with roles', async () => {
    const v = await vaultCtx();
    const payer = address('11111111111111111111111111111112');
    const pos = await positionPda(PROGRAM, v.vault, 0n, DEPOSITOR);
    const [ed, settle] = await buildSettleInstructions(v, payer, pos, AUTH, V.preimage, SIG);
    assert.ok(ed !== undefined && settle !== undefined);
    assert.equal(ed.programAddress, ED25519_PROGRAM_ADDRESS);
    assert.deepEqual(ed.data, ed25519InstructionData(AUTH, SIG, utf8(V.preimage)));
    const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(AUTH)]);
    assert.ok(verify(null, Buffer.from(V.preimage), createPublicKey({ key: spki, format: 'der', type: 'spki' }), Buffer.from(SIG)));
    assert.equal(settle.programAddress, PROGRAM);
    const recipient = address(V.recipient);
    const W = AccountRole.WRITABLE;
    const R = AccountRole.READONLY;
    assert.deepEqual(settle.accounts, [
      { address: payer, role: AccountRole.WRITABLE_SIGNER },
      { address: v.vault, role: R },
      { address: MINT, role: R },
      { address: v.vaultTokens, role: W },
      { address: pos, role: W },
      { address: recipient, role: R },
      { address: await associatedTokenAddress(recipient, TOKEN_PROGRAM, MINT), role: W },
      { address: await claimPda(PROGRAM, v.vault, recipient), role: W },
      { address: await noncePda(PROGRAM, pos, AUTH, 0n), role: W },
      { address: INSTRUCTIONS_SYSVAR_ADDRESS, role: R },
      { address: TOKEN_PROGRAM, role: R },
      { address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS, role: R },
      { address: SYSTEM_PROGRAM_ADDRESS, role: R },
    ]);
    assert.deepEqual(settle.data, settleIxData(parseSettlePreimage(V.preimage)));
  });
  it('[ed25519 verify, release]: v2 accounts move no tokens; recipient must be the depositor', async () => {
    const v = await vaultCtx();
    const payer = address('11111111111111111111111111111112');
    const pos = await positionPda(PROGRAM, v.vault, 7n, DEPOSITOR);
    const m = releasePreimage({ program: V.vault_program, positionId: 7n, recipient: DEPOSITOR, nonce: 9n, expires: 1700003600n });
    const [, rel] = await buildReleaseInstructions(v, payer, pos, DEPOSITOR, AUTH, m, hexToBytes(signMsg(m)));
    assert.ok(rel !== undefined);
    assert.deepEqual(rel.accounts?.map((a) => a.address), [payer, v.vault, pos, await noncePda(PROGRAM, pos, AUTH, 9n), INSTRUCTIONS_SYSVAR_ADDRESS, SYSTEM_PROGRAM_ADDRESS]);
    await assert.rejects(buildReleaseInstructions(v, payer, pos, address(V.recipient), AUTH, m, SIG), /depositor/);
  });
  it('§E seeds: the position PDA depends on the depositor, the nonce PDA on the slot and the authority', async () => {
    const v = await vaultCtx();
    const a = await positionPda(PROGRAM, v.vault, 1n, DEPOSITOR);
    const b = await positionPda(PROGRAM, v.vault, 1n, address(V.recipient));
    assert.notEqual(a, b);
    assert.notEqual(await noncePda(PROGRAM, a, AUTH, 1n), await noncePda(PROGRAM, b, AUTH, 1n));
    assert.notEqual(await noncePda(PROGRAM, a, AUTH, 1n), await noncePda(PROGRAM, a, new Uint8Array(32).fill(7), 1n));
  });
  it('§E seeds: the nonce PDA is exactly [b"nonce", position, authority, nonce_le]', async () => {
    const v = await vaultCtx();
    const pos = await positionPda(PROGRAM, v.vault, 7n, DEPOSITOR);
    const literal = findProgramAddress([utf8('nonce'), keyBytes(pos), AUTH, clientU64le(9n)], PROGRAM_ID).address;
    assert.equal(await noncePda(PROGRAM, pos, AUTH, 9n), literal);
  });
  it('matches the vault client (solana/client, checked against the program): PDAs, layouts, settle and release', async () => {
    const v = await vaultCtx();
    const ids = vaultIds(PROGRAM_ID, MINT, TOKEN_PROGRAM);
    assert.equal(ids.vault, v.vault);
    assert.equal(ids.vaultTokens, v.vaultTokens);
    const payer = address('11111111111111111111111111111112');
    const pos = await positionPda(PROGRAM, v.vault, 7n, DEPOSITOR);
    assert.equal(pos, positionAddress(PROGRAM_ID, v.vault, 7n, DEPOSITOR));
    // The nonce account is pinned to §E's literal seeds above; WO-35s moves the client to the same seeds in parallel.
    const exceptNonce = <T>(accounts: readonly T[], order: typeof SETTLE_ACCOUNT_ORDER): T[] => accounts.filter((_a, i) => order[i]?.[0] !== 'nonceRecord');
    const f = parseSettlePreimage(V.preimage.replace('|pos=0|', '|pos=7|'));
    const settle = settleInstruction(ids, payer, DEPOSITOR, f);
    assert.deepEqual(exceptNonce(await settleAccounts(v, payer, pos, AUTH, f), SETTLE_ACCOUNT_ORDER), exceptNonce(settle.accounts, SETTLE_ACCOUNT_ORDER));
    assert.deepEqual(settleIxData(f), settle.data);
    const release = releaseInstruction(ids, payer, DEPOSITOR, { positionId: 7n, nonce: 9n, expires: 1700003600n });
    assert.deepEqual(exceptNonce(await releaseAccounts(v, payer, pos, AUTH, 9n), RELEASE_ACCOUNT_ORDER), exceptNonce(release.accounts, RELEASE_ACCOUNT_ORDER));
    assert.deepEqual(releaseIxData(7n, 9n, 1700003600n), release.data);
    assert.deepEqual([...NONCE_RECORD_DISCRIMINATOR], ACCOUNT_DISCRIMINATOR.NonceRecord);
    assert.equal(NONCE_RECORD_LEN, NONCE_RECORD_V2.len);
    for (const k of ['authority', 'depositor', 'amount', 'status', 'vault', 'positionId', 'bump', 'version', 'len'] as const) assert.equal(POSITION_LAYOUT[k], POSITION_V2[k], k);
  });
  it('NonceRecord v2: Anchor discriminator rule, 91 bytes, every field decoded', async () => {
    const v = await vaultCtx();
    const rule = (name: string): number[] => [...createHash('sha256').update(`account:${name}`).digest().subarray(0, 8)];
    assert.deepEqual(rule('NonceRecord'), [...NONCE_RECORD_DISCRIMINATOR]);
    assert.deepEqual(rule('Position'), [...POSITION_DISCRIMINATOR]);
    assert.equal(NONCE_RECORD_LEN, 91);
    const f = { version: 2, vault: v.vault, authority: AUTH, nonce: 9n, positionId: 7n, op: OP_RELEASE, kind: 0 };
    assert.deepEqual(parseNonceRecord(nonceRecordData(f)), f);
    assert.throws(() => parseNonceRecord(new Uint8Array(90)), /91/);
    assert.throws(() => parseNonceRecord(new Uint8Array(91)), /not a nectar_vault NonceRecord/);
  });
  it('Position account offsets (deploy.md) and NEAR authority decoding', async () => {
    const v = await vaultCtx();
    const p = parsePositionAccount(positionData(v.vault, 42n, 1_000n));
    assert.equal(p.positionId, 42n);
    assert.equal(p.amount, 1_000n);
    assert.equal(p.depositor, DEPOSITOR);
    assert.equal(p.vault, v.vault);
    assert.deepEqual(p.authority, AUTH);
    assert.throws(() => parsePositionAccount(new Uint8Array(122)));
    assert.throws(() => parsePositionAccount(new Uint8Array(123)), /131/); // a v1 account
    const v1 = positionData(v.vault, 42n, 1_000n);
    v1[8] = 1;
    assert.throws(() => parsePositionAccount(v1), /layout version/);
    assert.deepEqual(ed25519AuthorityBytes(`ed25519:${VECTORS.test_public_key_base58}`), AUTH);
    assert.equal(ed25519AuthorityBytes('secp256k1:abc'), null);
    assert.throws(() => assertDevnetRpc('https://api.mainnet-beta.solana.com'));
  });
});

// ------------------------------------------------------------------ mocked RPC

class FakeSol implements SolanaPort {
  accounts = new Map<string, SolAccount>();
  sent: string[] = [];
  sigsFor = new Map<string, string[]>();
  txs = new Map<string, SolTx>();
  onSend: ((wire: string) => void) | null = null;
  async getAccount(a: Address): Promise<SolAccount | null> {
    return this.accounts.get(a) ?? null;
  }
  async latestBlockhash(): Promise<{ blockhash: Blockhash; lastValidBlockHeight: bigint }> {
    return { blockhash: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi' as Blockhash, lastValidBlockHeight: 100n };
  }
  async blockHeight(): Promise<bigint> {
    return 50n;
  }
  async sendBase64(wire: string): Promise<string> {
    this.sent.push(wire);
    this.onSend?.(wire);
    return 'sig';
  }
  async status(): Promise<SigState> {
    return { kind: 'confirmed' };
  }
  pages: Array<{ a: Address; before: string | null }> = [];
  txFetches: string[] = [];
  /** throws once the page count reaches this, as a rate-limited RPC does */
  failPageAt: number | null = null;
  async signaturesPage(a: Address, before: string | null, limit: number): Promise<SigEntry[]> {
    if (this.failPageAt !== null && this.pages.length === this.failPageAt) {
      this.failPageAt = null;
      throw new Error('429 Too Many Requests');
    }
    this.pages.push({ a, before });
    const all = this.sigsFor.get(a) ?? [];
    const start = before === null ? 0 : all.indexOf(before) + 1;
    return all.slice(start, start + limit).map((signature) => ({ signature, ok: true }));
  }
  async transaction(sig: string): Promise<SolTx | null> {
    this.txFetches.push(sig);
    return this.txs.get(sig) ?? null;
  }
}

class FakeNear implements CoreReader, KeeperWriter {
  positions: unknown[] = [];
  pending = new Map<string, unknown>();
  releases = new Map<string, unknown>();
  version: string | null = null;
  missingMethods = new Set<string>();
  calls: Array<{ method: KeeperMethod; args: KeeperCallArgs }> = [];
  views: Array<{ method: string; id: string }> = [];
  primaryChain: { chain_id: string; vault_program: string; mpc_domain_id: number } | null = null;
  committed: string | null = null;
  failCalls = false;
  async view(method: string, args: Record<string, unknown>): Promise<ViewResult> {
    const id = String(args.position_id);
    this.views.push({ method, id });
    switch (method) {
      case 'get_position':
        return { value: { remote: { committed_depositor: this.committed } }, blockHeight: 1 };
      case 'contract_version':
        if (this.version === null) throw new Error('MethodNotFound');
        return { value: this.version, blockHeight: 1 };
      case 'list_positions':
        return { value: this.positions.slice(Number(args.from_index), Number(args.from_index) + Number(args.limit)), blockHeight: 1 };
      case 'get_collateral':
        return { value: { symbol: 'NVDAx', remote_chain: this.primaryChain ?? { chain_id: 'solana-devnet', vault_program: V.vault_program, mpc_domain_id: 1 } }, blockHeight: 1 };
      case 'get_pending_settlement':
        return { value: this.pending.get(id) ?? null, blockHeight: 1 };
      case 'get_pending_release':
        if (this.version === null) throw new Error('MethodNotFound');
        return { value: this.releases.get(id) ?? null, blockHeight: 1 };
      default:
        throw new Error(`unexpected view ${method}`);
    }
  }
  async keyAllowance(): Promise<Allowance> {
    return { kind: 'unlimited' };
  }
  async call(method: KeeperMethod, args: KeeperCallArgs): Promise<TxResult> {
    this.calls.push({ method, args });
    if (this.failCalls) return { txHash: 'x', ok: false, failure: 'Smart contract panicked: confirm cooldown', logs: [] };
    if (this.missingMethods.has(method)) return { txHash: 'x', ok: false, failure: '{"MethodResolveError":"MethodNotFound"}', logs: [] };
    const d = this.pending.get(args.position_id) as { status: string } | undefined;
    if (method === 'relay_settlement_result' && d !== undefined) d.status = 'Relayed';
    return { txHash: `near${this.calls.length}`, ok: true, failure: null, logs: [] };
  }
}

const NOW = 1_700_000_000_000;
const quiet = createLogger('test', () => {});
const NEAR_AUTH = `ed25519:${VECTORS.test_public_key_base58}`;
const PINNED = { pageSize: 50, mint: MINT, expectedProgram: PROGRAM };
const solanaRemote = (status: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  chain_id: 'solana-devnet', vault_program: PROGRAM_ID, status, authority: NEAR_AUTH, committed_depositor: DEPOSITOR, ...extra,
});
const slot = (v: VaultContext, id: bigint): Promise<Address> => positionPda(PROGRAM, v.vault, id, DEPOSITOR);

async function setup(extra: Partial<RelayOptions> = {}): Promise<{ sol: FakeSol; near: FakeNear; relay: SolanaRelay; v: VaultContext; payer: KeyPairSigner; db: KeeperDb; now: { ms: number } }> {
  const now = { ms: NOW };
  const sol = new FakeSol();
  const near = new FakeNear();
  const v = await vaultCtx();
  sol.accounts.set(MINT, { owner: TOKEN_PROGRAM, data: new Uint8Array(82) });
  sol.accounts.set(v.vault, { owner: PROGRAM, data: vaultData('NVDAx', MINT) });
  const payer = await generateKeyPairSigner();
  const db = new KeeperDb(':memory:');
  const relay = new SolanaRelay(near, near, sol, payer, db, quiet, { ...PINNED, nowMs: () => now.ms, rand: () => 0.5, sleep: async () => {}, ...extra });
  return { sol, near, relay, v, payer, db, now };
}

function settlingPosition(near: FakeNear, preimage: string, sigHex: string): void {
  const f = parseSettlePreimage(preimage);
  near.positions.push({ position_id: String(f.positionId), status: 'Settling', collateral: 'NVDAx', units: '100000000', remote: solanaRemote('Settling') });
  near.pending.set(String(f.positionId), {
    position_id: String(f.positionId), quote_id: String(f.quoteId), nonce: String(f.nonce), expires: String(f.expires), preimage,
    signature_hex: sigHex, repay_usd_e6: String(f.repayE6), seize_units: String(f.seizeUnits), keeper_units: '0', recipient: f.recipient,
    status: 'Signed', solana_tx_sig: null,
  });
}

describe('solana: relay with a mocked RPC', () => {
  it('settle: sends [ed25519, settle] once, relays the tx sig; a second tick sends nothing', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n) });
    const r1 = await relay.tick();
    assert.deepEqual(r1.settled, ['0'], JSON.stringify(r1));
    assert.equal(sol.sent.length, 1);
    const tx = getTransactionDecoder().decode(Buffer.from(sol.sent[0] as string, 'base64'));
    const msg = getCompiledTransactionMessageDecoder().decode(tx.messageBytes) as unknown as { instructions: Array<{ programAddressIndex: number }>; staticAccounts: Address[] };
    assert.equal(msg.instructions.length, 2);
    assert.equal(msg.staticAccounts[msg.instructions[0]?.programAddressIndex ?? -1], ED25519_PROGRAM_ADDRESS);
    assert.equal(msg.staticAccounts[msg.instructions[1]?.programAddressIndex ?? -1], PROGRAM);
    assert.ok(sol.sent[0] !== undefined && Buffer.from(sol.sent[0], 'base64').length <= 1232);
    const relayCall = near.calls.find((c) => c.method === 'relay_settlement_result');
    const sigB58 = getBase58Decoder().decode(tx.signatures[Object.keys(tx.signatures)[0] as Address] as unknown as Uint8Array);
    assert.equal(relayCall?.args.solana_tx_sig, sigB58);
    const r2 = await relay.tick();
    assert.equal(sol.sent.length, 1);
    assert.deepEqual(r2.settled, []);
  });
  it('restart after a landed tx: a valid record and its tx → no send, relays that tx', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    await landSettle(sol, v, 'LandedSig111');
    const r = await relay.tick();
    assert.equal(sol.sent.length, 0);
    assert.deepEqual(r.settled, ['0'], JSON.stringify(r));
    assert.deepEqual(near.calls, [{ method: 'relay_settlement_result', args: { position_id: '0', solana_tx_sig: 'LandedSig111' } }]);
  });
  it('position PDA closed (without our nonce) or signature expired → skip with backoff, nothing sent', async () => {
    const { sol, near, relay, v, db } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    const r = await relay.tick();
    assert.deepEqual(r.skipped, [{ id: '0', reason: 'position_pda_missing' }]);
    assert.ok((db.retry('sol:settle:0')?.next_attempt_at ?? 0) > NOW);
    const late = new SolanaRelay(near, near, sol, await generateKeyPairSigner(), new KeeperDb(':memory:'), quiet, { ...PINNED, nowMs: () => 1_800_000_000_000, sleep: async () => {} });
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n) });
    assert.deepEqual((await late.tick()).skipped, [{ id: '0', reason: 'signature_expired' }]);
    assert.equal(sol.sent.length, 0);
    assert.equal(near.calls.length, 0);
  });
  it('a tampered preimage (fields != pending) is refused before any send', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    (near.pending.get('0') as { recipient: string }).recipient = DEPOSITOR;
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n) });
    const r = await relay.tick();
    assert.equal(r.failed.length, 1);
    assert.equal(sol.sent.length, 0);
  });
  it('v1 (no contract_version): releases and deposits are not attempted', async () => {
    const { sol, near, relay } = await setup();
    near.positions.push({ position_id: '5', status: 'Open', collateral: 'NVDAx', units: '1', remote: { status: 'Releasing' } });
    near.positions.push({ position_id: '6', status: 'Open', collateral: 'NVDAx', units: '1', remote: { status: 'AwaitingDeposit' } });
    await relay.tick();
    assert.equal(relay.status.v2, false);
    assert.equal(sol.sent.length, 0);
    assert.equal(near.calls.length, 0);
  });
  it('v2 release: sends [ed25519, release]; falls back to relay_settlement_result if relay_release_result is missing', async () => {
    const { sol, near, relay, v } = await setup();
    near.version = '2.0.0-v7';
    near.missingMethods.add('relay_release_result');
    const m = releasePreimage({ program: V.vault_program, positionId: 7n, recipient: DEPOSITOR, nonce: 9n, expires: 1700003600n });
    near.positions.push({ position_id: '7', status: 'Open', collateral: 'NVDAx', units: '1', remote: solanaRemote('Releasing') });
    near.releases.set('7', { message: m, signature_hex: signMsg(m), nonce: '9', expires: '1700003600' });
    sol.accounts.set(await slot(v, 7n), { owner: PROGRAM, data: positionData(v.vault, 7n, 5n) });
    const r = await relay.tick();
    assert.deepEqual(r.released, ['7'], JSON.stringify(r));
    assert.equal(sol.sent.length, 1);
    assert.deepEqual(near.calls.map((c) => c.method), ['relay_release_result', 'relay_settlement_result']);
  });
  it('v2 deposit watcher: confirm_remote_deposit only when amount >= reserved and authority matches; then cooldown', async () => {
    const { sol, near, relay, v } = await setup();
    near.version = '2.0.0-v7';
    awaiting(near, '8', '1000');
    await relay.tick(); // no PDA yet
    assert.equal(near.calls.length, 0);
    sol.accounts.set(await slot(v, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 1000n) });
    assert.deepEqual((await relay.tick()).deposits, ['8']);
    assert.deepEqual(near.calls, [{ method: 'confirm_remote_deposit', args: { position_id: '8' } }]);
    await relay.tick(); // cooldown
    assert.equal(near.calls.length, 1);
    assert.equal(sol.sent.length, 0);
  });
  it('chain gate (WO-29b): Base positions next to Solana ones are skipped before any pending view or parse', async () => {
    const { sol, near, relay, v } = await setup();
    near.version = '2.1.0-v7';
    settlingPosition(near, V.preimage, V.signature_hex); // Solana position 0
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n) });
    const base = { chain_id: 'base-sepolia', vault_program: '0x4E65637461725661756c74426173650000000001', authority: '0xbcb6eAB973570cB1e5C16195696b8BdDb4c7D8f7' };
    near.positions.push({ position_id: '20', status: 'Settling', collateral: 'NVDAx', units: '1', remote: { ...base, status: 'Settling' } });
    near.positions.push({ position_id: '21', status: 'Open', collateral: 'NVDAx', units: '1', remote: { ...base, status: 'Releasing' } });
    near.positions.push({ position_id: '22', status: 'Open', collateral: 'NVDAx', units: '1', remote: { ...base, status: 'AwaitingDeposit' } });
    // What a Base pending settlement looks like to the old view: an EIP-712 digest where a NECTAR_SETTLE_V1 preimage would be.
    near.pending.set('20', { position_id: '20', quote_id: '1', nonce: '1', expires: '9999999999', preimage: `0x${'ab'.repeat(32)}`, signature_hex: '00'.repeat(65), recipient: base.authority, status: 'Signed', solana_tx_sig: null });
    near.releases.set('21', { message: `0x${'cd'.repeat(32)}`, signature_hex: '00'.repeat(65), nonce: '2', expires: '9999999999', status: 'Signed' });
    const r = await relay.tick();
    assert.deepEqual(r.settled, ['0'], JSON.stringify(r));
    assert.deepEqual(r.failed, []);
    assert.deepEqual(r.skipped, []);
    assert.equal(sol.sent.length, 1);
    assert.equal(relay.status.pendingSettlements, 1);
    assert.equal(relay.status.pendingReleases, 0);
    const baseViews = near.views.filter((x) => ['20', '21', '22'].includes(x.id));
    assert.deepEqual(baseViews, []);
    assert.deepEqual(near.calls.map((c) => c.method), ['relay_settlement_result']);
  });
  it('chain gate: a Solana-pinned v2 position uses its pinned vault; a non-Solana primary chain is skipped', async () => {
    assert.equal(isSolanaPosition({ remote: { chain_id: 'solana-devnet' } }), true);
    assert.equal(isSolanaPosition({ remote: null }), true);
    assert.equal(isSolanaPosition({}), true);
    assert.equal(isSolanaPosition({ remote: { chain_id: 'base-sepolia' } }), false);
    assert.equal(isSolanaPosition({ remote: { chain_id: 'solana-mainnet' } }), false);
    const { near, relay } = await setup();
    near.version = '2.1.0-v7';
    near.primaryChain = { chain_id: 'base-sepolia', vault_program: '0x4E65637461725661756c74426173650000000001', mpc_domain_id: 0 };
    near.positions.push({ position_id: '30', status: 'Settling', collateral: 'NVDAx', units: '1' }); // no remote: falls back to the primary
    const r = await relay.tick();
    assert.deepEqual(r, { settled: [], released: [], deposits: [], skipped: [], failed: [] });
    assert.equal(near.views.some((x) => x.method === 'get_pending_settlement'), false);
  });
  it('the Vault account decodes (mint after the symbol)', async () => {
    const { v } = await setup();
    assert.equal(getAddressDecoder().decode(vaultData('NVDAx', MINT).subarray(18, 50)), MINT);
    assert.equal(v.vault, await vaultPda(PROGRAM, MINT));
  });
});

const ATTACKER = address('Vote111111111111111111111111111111111111111');

/** A settle that really landed: a valid record, a non-open position and the tx that ran the instruction. */
async function landSettle(sol: FakeSol, v: VaultContext, sig: string): Promise<Address> {
  const f = parseSettlePreimage(V.preimage);
  const nonceAddr = await noncePda(PROGRAM, await slot(v, f.positionId), AUTH, f.nonce);
  sol.accounts.set(nonceAddr, { owner: PROGRAM, data: nonceRecordData({ version: 2, vault: v.vault, authority: AUTH, nonce: f.nonce, positionId: f.positionId, op: OP_SETTLE, kind: f.kind }) });
  sol.sigsFor.set(nonceAddr, [sig]);
  sol.txs.set(sig, { succeeded: true, instructions: [{ program: PROGRAM, accounts: await settleTxAccounts(v, await slot(v, f.positionId)), data: settleIxData(f) }] });
  return nonceAddr;
}

const settleTxAccounts = async (v: VaultContext, position: Address): Promise<Address[]> =>
  (await settleAccounts(v, ATTACKER, position, AUTH, parseSettlePreimage(V.preimage))).map((a) => a.address);

function awaiting(near: FakeNear, id: string, reserved: string, extra: Record<string, unknown> = {}): void {
  // SR-11: an AwaitingDeposit position has top-level units 0 on the real contract (remote.rs).
  near.positions.push({ position_id: id, status: 'Open', collateral: 'NVDAx', units: '0', remote: solanaRemote('AwaitingDeposit', { reserved_units: reserved, ...extra }) });
}

describe('SR-2: a nonce PDA is proof only when the vault wrote it', () => {
  it('a system-owned account at the nonce PDA is not accepted: the leg is sent, the attacker signature is never relayed', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n) });
    const nonceAddr = await noncePda(PROGRAM, await slot(v, 0n), AUTH, 0n);
    sol.accounts.set(nonceAddr, { owner: SYSTEM_PROGRAM_ADDRESS, data: new Uint8Array(0) }); // a plain 890,880-lamport transfer
    sol.sigsFor.set(nonceAddr, ['AttackerTransferSig']);
    sol.txs.set('AttackerTransferSig', { succeeded: true, instructions: [{ program: SYSTEM_PROGRAM_ADDRESS, accounts: [ATTACKER, nonceAddr], data: new Uint8Array(12) }] });
    const r = await relay.tick();
    assert.deepEqual(r.settled, ['0'], JSON.stringify(r));
    assert.equal(sol.sent.length, 1);
    assert.equal(near.calls.length, 1);
    assert.notEqual(near.calls[0]?.args.solana_tx_sig, 'AttackerTransferSig');
  });
  it('a system-owned nonce PDA with no position to settle relays nothing', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    const nonceAddr = await noncePda(PROGRAM, await slot(v, 0n), AUTH, 0n);
    sol.accounts.set(nonceAddr, { owner: SYSTEM_PROGRAM_ADDRESS, data: new Uint8Array(0) });
    sol.sigsFor.set(nonceAddr, ['AttackerTransferSig']);
    assert.deepEqual((await relay.tick()).skipped, [{ id: '0', reason: 'position_pda_missing' }]);
    assert.equal(near.calls.length, 0);
  });
  const f0 = parseSettlePreimage(V.preimage);
  const bad: Array<[string, (v: VaultContext) => Uint8Array, RegExp]> = [
    ['short data', () => new Uint8Array(60), /91/],
    ['wrong discriminator', () => new Uint8Array(91), /NonceRecord/],
    ['version 1', (v) => nonceRecordData({ version: 1, vault: v.vault, authority: AUTH, nonce: f0.nonce, positionId: f0.positionId, op: OP_SETTLE, kind: f0.kind }), /version/],
    ['another vault', () => nonceRecordData({ version: 2, vault: ATTACKER, authority: AUTH, nonce: f0.nonce, positionId: f0.positionId, op: OP_SETTLE, kind: f0.kind }), /vault/],
    ['another authority', (v) => nonceRecordData({ version: 2, vault: v.vault, authority: new Uint8Array(32).fill(7), nonce: f0.nonce, positionId: f0.positionId, op: OP_SETTLE, kind: f0.kind }), /authority/],
    ['another nonce', (v) => nonceRecordData({ version: 2, vault: v.vault, authority: AUTH, nonce: f0.nonce + 1n, positionId: f0.positionId, op: OP_SETTLE, kind: f0.kind }), /nonce mismatch/],
    ['another position', (v) => nonceRecordData({ version: 2, vault: v.vault, authority: AUTH, nonce: f0.nonce, positionId: f0.positionId + 1n, op: OP_SETTLE, kind: f0.kind }), /position/],
    ['the other op', (v) => nonceRecordData({ version: 2, vault: v.vault, authority: AUTH, nonce: f0.nonce, positionId: f0.positionId, op: OP_RELEASE, kind: f0.kind }), /op mismatch/],
    ['another kind', (v) => nonceRecordData({ version: 2, vault: v.vault, authority: AUTH, nonce: f0.nonce, positionId: f0.positionId, op: OP_SETTLE, kind: 2 }), /kind/],
  ];
  for (const [name, data, why] of bad) {
    it(`a program-owned record with ${name} is refused: nothing sent, nothing relayed`, async () => {
      const { sol, near, relay, v } = await setup();
      settlingPosition(near, V.preimage, V.signature_hex);
      const nonceAddr = await landSettle(sol, v, 'Sig');
      sol.accounts.set(nonceAddr, { owner: PROGRAM, data: data(v) });
      const r = await relay.tick();
      assert.match(r.failed[0]?.error ?? '', why);
      assert.equal(sol.sent.length, 0);
      assert.equal(near.calls.length, 0);
    });
  }
  it('N2a: a valid record is proof whatever the slot shows now: reopened, withdrawn, or any status', async () => {
    for (const status of [1, POSITION_STATUS_SETTLED, POSITION_STATUS_RELEASED, null]) {
      const { sol, near, relay, v } = await setup();
      settlingPosition(near, V.preimage, V.signature_hex);
      await landSettle(sol, v, 'Sig');
      if (status !== null) sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n, status) });
      assert.deepEqual((await relay.tick()).settled, ['0'], String(status));
      assert.equal(sol.sent.length, 0);
      assert.deepEqual(near.calls.map((c) => c.args.solana_tx_sig), ['Sig']);
    }
  });
  it('N2d: a landing tx with trailing instruction bytes (Anchor ignores them) is the landing tx', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    await landSettle(sol, v, 'Trailing');
    const data = Uint8Array.from([...settleIxData(parseSettlePreimage(V.preimage)), 0xde, 0xad]);
    sol.txs.set('Trailing', { succeeded: true, instructions: [{ program: PROGRAM, accounts: await settleTxAccounts(v, await slot(v, 0n)), data }] });
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.deepEqual(near.calls.map((c) => c.args.solana_tx_sig), ['Trailing']);
  });
  it('N2b: padding appended after the landing does not hide it: pages to the oldest and reads that first', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    const nonceAddr = await landSettle(sol, v, 'RealSig');
    sol.sigsFor.set(nonceAddr, [...Array.from({ length: 2_500 }, (_x, i) => `Pad${i}`), 'RealSig']);
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.deepEqual(near.calls.map((c) => c.args.solana_tx_sig), ['RealSig']);
    assert.equal(sol.pages.length, 3);
    assert.deepEqual(sol.txFetches, ['RealSig']);
  });
  it('N2b: a rate-limited listing resumes from its cursor on the next attempt', async () => {
    const { sol, near, relay, v, now } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    const nonceAddr = await landSettle(sol, v, 'RealSig');
    sol.sigsFor.set(nonceAddr, [...Array.from({ length: 1_500 }, (_x, i) => `Pad${i}`), 'RealSig']);
    sol.failPageAt = 1;
    assert.match((await relay.tick()).failed[0]?.error ?? '', /429/);
    assert.equal(near.calls.length, 0);
    now.ms += 3_600_000;
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.deepEqual(sol.pages.map((x) => x.before), [null, 'Pad999']);
  });
  it('N2b: the per-tick budget stops the search and the next tick continues it, nothing relayed meanwhile', async () => {
    const { sol, near, relay, v, now } = await setup({ landedTxsPerTick: 2 });
    settlingPosition(near, V.preimage, V.signature_hex);
    const nonceAddr = await landSettle(sol, v, 'RealSig');
    sol.sigsFor.set(nonceAddr, ['RealSig', 'Pre3', 'Pre2', 'Pre1']); // pre-funding transfers, older than the landing
    assert.deepEqual((await relay.tick()).skipped, [{ id: '0', reason: 'landed_scan_in_progress' }]);
    assert.equal(near.calls.length, 0);
    now.ms += 3_600_000;
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.deepEqual(sol.txFetches, ['Pre1', 'Pre2', 'Pre3', 'RealSig']);
  });
  it('N2b: a finished nonce walk is not repeated while the slot fallback is still running', async () => {
    const { sol, near, relay, v, now } = await setup({ landedTxsPerTick: 1 });
    settlingPosition(near, V.preimage, V.signature_hex);
    const nonceAddr = await landSettle(sol, v, 'RealSig');
    sol.sigsFor.set(nonceAddr, ['Pad']);
    sol.sigsFor.set(await slot(v, 0n), ['RealSig', 'OpenSig']);
    assert.deepEqual((await relay.tick()).skipped, [{ id: '0', reason: 'landed_scan_in_progress' }]);
    now.ms += 3_600_000;
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.deepEqual(sol.txFetches, ['Pad', 'OpenSig', 'RealSig']);
    assert.equal(sol.pages.length, 2);
  });
  it('N2b: a search that finds nothing starts over next time, so a landing indexed later is seen', async () => {
    const { sol, near, relay, v, now } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    const nonceAddr = await landSettle(sol, v, 'RealSig');
    sol.sigsFor.set(nonceAddr, []);
    assert.deepEqual((await relay.tick()).skipped, [{ id: '0', reason: 'nonce_used_tx_not_found' }]);
    sol.sigsFor.set(nonceAddr, ['RealSig']);
    now.ms += 3_600_000;
    assert.deepEqual((await relay.tick()).settled, ['0']);
  });
  it('N2b: when the nonce history does not show the landing, the slot history does', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    const nonceAddr = await landSettle(sol, v, 'RealSig');
    sol.sigsFor.set(nonceAddr, ['Pad']);
    sol.sigsFor.set(await slot(v, 0n), ['RealSig']);
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.deepEqual(near.calls.map((c) => c.args.solana_tx_sig), ['RealSig']);
  });
  it('a valid record on a Settled position (not yet withdrawn) relays the landed tx', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    await landSettle(sol, v, 'Sig');
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n, POSITION_STATUS_SETTLED) });
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.equal(near.calls[0]?.args.solana_tx_sig, 'Sig');
  });
  it('a landed release (status Released) relays the tx that ran it', async () => {
    const { sol, near, relay, v } = await setup();
    near.version = '2.2.0-v7';
    const m = releasePreimage({ program: V.vault_program, positionId: 7n, recipient: DEPOSITOR, nonce: 9n, expires: 1700003600n });
    near.positions.push({ position_id: '7', status: 'Open', collateral: 'NVDAx', units: '1', remote: solanaRemote('Releasing') });
    near.releases.set('7', { message: m, signature_hex: signMsg(m), nonce: '9', expires: '1700003600' });
    const pos = await slot(v, 7n);
    const nonceAddr = await noncePda(PROGRAM, pos, AUTH, 9n);
    sol.accounts.set(pos, { owner: PROGRAM, data: positionData(v.vault, 7n, 5n, POSITION_STATUS_RELEASED) });
    sol.accounts.set(nonceAddr, { owner: PROGRAM, data: nonceRecordData({ version: 2, vault: v.vault, authority: AUTH, nonce: 9n, positionId: 7n, op: OP_RELEASE, kind: 0 }) });
    sol.sigsFor.set(nonceAddr, ['RelSig']);
    sol.txs.set('RelSig', { succeeded: true, instructions: [{ program: PROGRAM, accounts: (await releaseAccounts(v, ATTACKER, pos, AUTH, 9n)).map((a) => a.address), data: releaseIxData(7n, 9n, 1700003600n) }] });
    assert.deepEqual((await relay.tick()).released, ['7']);
    assert.equal(sol.sent.length, 0);
    assert.deepEqual(near.calls.map((c) => c.args.solana_tx_sig), ['RelSig']);
  });
  it('a position already Settled or Released with no record for this nonce is not sent or relayed', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n, POSITION_STATUS_SETTLED) });
    assert.deepEqual((await relay.tick()).skipped, [{ id: '0', reason: 'position_pda_not_open' }]);
    assert.equal(sol.sent.length, 0);
    assert.equal(near.calls.length, 0);
  });
  it('a tx on another slot that lists the committed slot as trailing accounts is not the landing tx', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    const nonceAddr = await landSettle(sol, v, 'RealSig');
    const f = parseSettlePreimage(V.preimage);
    const honest = await slot(v, 0n);
    const squat = await positionPda(PROGRAM, v.vault, 0n, ATTACKER);
    sol.sigsFor.set(nonceAddr, ['Squatter', 'RealSig']);
    sol.txs.set('Squatter', { succeeded: true, instructions: [{ program: PROGRAM, accounts: [...(await settleTxAccounts(v, squat)), honest, nonceAddr], data: settleIxData(f) }] });
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.deepEqual(near.calls.map((c) => c.args.solana_tx_sig), ['RealSig']);
  });
  it('a squatter settling its own slot with the public signature leaves the committed slot unlanded: the leg is sent', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    const f = parseSettlePreimage(V.preimage);
    const squat = await positionPda(PROGRAM, v.vault, 0n, ATTACKER);
    sol.accounts.set(squat, { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n, POSITION_STATUS_SETTLED, AUTH, ATTACKER) });
    sol.accounts.set(await noncePda(PROGRAM, squat, AUTH, f.nonce), { owner: PROGRAM, data: nonceRecordData({ version: 2, vault: v.vault, authority: AUTH, nonce: f.nonce, positionId: f.positionId, op: OP_SETTLE, kind: f.kind }) });
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n) });
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.equal(sol.sent.length, 1);
  });
  it('only a tx that ran this vault instruction on this slot is relayed, wherever it sits among padding transfers', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    const nonceAddr = await landSettle(sol, v, 'RealSig');
    const f = parseSettlePreimage(V.preimage);
    sol.sigsFor.set(nonceAddr, ['Transfer', 'RealSig', 'OtherIx', 'WrongProgram', 'Failed', 'Unknown', 'OldTransfer']);
    const accounts = await settleTxAccounts(v, await slot(v, 0n));
    sol.txs.set('Transfer', { succeeded: true, instructions: [{ program: SYSTEM_PROGRAM_ADDRESS, accounts: [ATTACKER, nonceAddr], data: new Uint8Array(12) }] });
    sol.txs.set('OtherIx', { succeeded: true, instructions: [{ program: PROGRAM, accounts, data: RELEASE_DISCRIMINATOR }] });
    sol.txs.set('WrongProgram', { succeeded: true, instructions: [{ program: ATTACKER, accounts, data: settleIxData(f) }] });
    sol.txs.set('Failed', { succeeded: false, instructions: [{ program: PROGRAM, accounts, data: settleIxData(f) }] });
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.deepEqual(near.calls.map((c) => c.args.solana_tx_sig), ['RealSig']);
  });
  it('a valid record with only a transfer in its history → skip with backoff, nothing relayed', async () => {
    const { sol, near, relay, v, db } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    const nonceAddr = await landSettle(sol, v, 'Sig');
    sol.sigsFor.set(nonceAddr, ['Transfer']);
    sol.txs.set('Transfer', { succeeded: true, instructions: [{ program: SYSTEM_PROGRAM_ADDRESS, accounts: [ATTACKER, nonceAddr], data: new Uint8Array(12) }] });
    assert.deepEqual((await relay.tick()).skipped, [{ id: '0', reason: 'nonce_used_tx_not_found' }]);
    assert.ok((db.retry('sol:settle:0')?.next_attempt_at ?? 0) > NOW);
    assert.equal(near.calls.length, 0);
  });
  it('SR-1: a nonce burned on another slot is a different PDA and does not block the leg', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n) });
    sol.accounts.set(await noncePda(PROGRAM, await positionPda(PROGRAM, v.vault, 0n, ATTACKER), AUTH, 0n), { owner: PROGRAM, data: new Uint8Array(91) });
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.equal(sol.sent.length, 1);
  });
  it('N1: a nonce burned on this slot under another key is a different PDA: the leg is sent under NEAR\'s authority', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    const pos = await slot(v, 0n);
    const att = new Uint8Array(32).fill(7);
    sol.accounts.set(pos, { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n) });
    sol.accounts.set(await noncePda(PROGRAM, pos, att, 0n), { owner: PROGRAM, data: nonceRecordData({ version: 2, vault: v.vault, authority: att, nonce: 0n, positionId: 0n, op: OP_RELEASE, kind: 0 }) });
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.equal(sol.sent.length, 1);
  });
  it('a release whose recipient is not the committed depositor is refused before any send', async () => {
    const { sol, near, relay, v } = await setup();
    near.version = '2.2.0-v7';
    const m = releasePreimage({ program: V.vault_program, positionId: 7n, recipient: V.recipient, nonce: 9n, expires: 1700003600n });
    near.positions.push({ position_id: '7', status: 'Open', collateral: 'NVDAx', units: '1', remote: solanaRemote('Releasing') });
    near.releases.set('7', { message: m, signature_hex: signMsg(m), nonce: '9', expires: '1700003600' });
    sol.accounts.set(await slot(v, 7n), { owner: PROGRAM, data: positionData(v.vault, 7n, 5n) });
    assert.match((await relay.tick()).failed[0]?.error ?? '', /committed depositor/);
    assert.equal(sol.sent.length, 0);
  });
  it('unknown authority or depositor skips; the depositor falls back to get_position', async () => {
    const { sol, near, relay, v, now } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    const p = near.positions[0] as { remote: Record<string, unknown> };
    p.remote.committed_depositor = undefined;
    assert.deepEqual((await relay.tick()).skipped, [{ id: '0', reason: 'depositor_unknown' }]);
    now.ms += 60_000; // the signature stays valid for an hour
    near.committed = DEPOSITOR;
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n) });
    p.remote.authority = undefined;
    assert.deepEqual((await relay.tick()).skipped, [{ id: '0', reason: 'authority_unknown' }]);
    now.ms += 60_000;
    p.remote.authority = NEAR_AUTH;
    assert.deepEqual((await relay.tick()).settled, ['0']);
  });
});

describe('N3: an older nonce of this leg landed before a re-sign', () => {
  const OLD = 77n;
  /** A settle that landed under an older nonce on the committed slot, signed by `authority`. */
  async function landOlder(sol: FakeSol, v: VaultContext, sig: string, authority = AUTH): Promise<Address> {
    const f = parseSettlePreimage(V.preimage);
    const pos = await slot(v, 0n);
    const old = await noncePda(PROGRAM, pos, authority, OLD);
    sol.accounts.set(old, { owner: PROGRAM, data: nonceRecordData({ version: 2, vault: v.vault, authority, nonce: OLD, positionId: 0n, op: OP_SETTLE, kind: f.kind }) });
    const accounts = (await settleAccounts(v, ATTACKER, pos, authority, { ...f, nonce: OLD })).map((a) => a.address);
    sol.txs.set(sig, { succeeded: true, instructions: [{ program: PROGRAM, accounts, data: settleIxData({ ...f, nonce: OLD }) }] });
    sol.sigsFor.set(pos, [sig, 'OpenSig']);
    return old;
  }
  it('settled slot, no record for the current nonce: relays the older tx, sends nothing', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    await landOlder(sol, v, 'OlderSig');
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n, POSITION_STATUS_SETTLED) });
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.equal(sol.sent.length, 0);
    assert.deepEqual(near.calls, [{ method: 'relay_settlement_result', args: { position_id: '0', solana_tx_sig: 'OlderSig' } }]);
  });
  it('withdrawn slot (account gone): the older tx is still found through the slot history', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    await landOlder(sol, v, 'OlderSig');
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.deepEqual(near.calls.map((c) => c.args.solana_tx_sig), ['OlderSig']);
  });
  it('a release that landed under an older nonce is relayed as the release', async () => {
    const { sol, near, relay, v } = await setup();
    near.version = '2.2.0-v7';
    const m = releasePreimage({ program: V.vault_program, positionId: 7n, recipient: DEPOSITOR, nonce: 9n, expires: 1700003600n });
    near.positions.push({ position_id: '7', status: 'Open', collateral: 'NVDAx', units: '1', remote: solanaRemote('Releasing') });
    near.releases.set('7', { message: m, signature_hex: signMsg(m), nonce: '9', expires: '1700003600' });
    const pos = await slot(v, 7n);
    sol.accounts.set(pos, { owner: PROGRAM, data: positionData(v.vault, 7n, 5n, POSITION_STATUS_RELEASED) });
    sol.accounts.set(await noncePda(PROGRAM, pos, AUTH, 4n), { owner: PROGRAM, data: nonceRecordData({ version: 2, vault: v.vault, authority: AUTH, nonce: 4n, positionId: 7n, op: OP_RELEASE, kind: 0 }) });
    sol.sigsFor.set(pos, ['OldRel']);
    sol.txs.set('OldRel', { succeeded: true, instructions: [{ program: PROGRAM, accounts: (await releaseAccounts(v, ATTACKER, pos, AUTH, 4n)).map((a) => a.address), data: releaseIxData(7n, 4n, 1700000600n) }] });
    assert.deepEqual((await relay.tick()).released, ['7']);
    assert.deepEqual(near.calls.map((c) => c.args.solana_tx_sig), ['OldRel']);
  });
  it('a leg the depositor ran under its own key is never relayed as NEAR\'s', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    await landOlder(sol, v, 'AttackerSig', new Uint8Array(32).fill(7));
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n, POSITION_STATUS_SETTLED, new Uint8Array(32).fill(7)) });
    assert.deepEqual((await relay.tick()).skipped, [{ id: '0', reason: 'position_pda_not_open' }]);
    assert.equal(near.calls.length, 0);
  });
  const forgeries: Array<[string, (old: Address, sol: FakeSol, v: VaultContext) => void]> = [
    ['system-owned', (old, sol) => void sol.accounts.set(old, { owner: SYSTEM_PROGRAM_ADDRESS, data: new Uint8Array(0) })],
    ['absent', (old, sol) => void sol.accounts.delete(old)],
    ['the wrong op', (old, sol, v) => void sol.accounts.set(old, { owner: PROGRAM, data: nonceRecordData({ version: 2, vault: v.vault, authority: AUTH, nonce: OLD, positionId: 0n, op: OP_RELEASE, kind: 0 }) })],
    ['another position', (old, sol, v) => void sol.accounts.set(old, { owner: PROGRAM, data: nonceRecordData({ version: 2, vault: v.vault, authority: AUTH, nonce: OLD, positionId: 1n, op: OP_SETTLE, kind: 0 }) })],
    ['a nonce that does not derive this address', (old, sol, v) => void sol.accounts.set(old, { owner: PROGRAM, data: nonceRecordData({ version: 2, vault: v.vault, authority: AUTH, nonce: OLD + 1n, positionId: 0n, op: OP_SETTLE, kind: 0 }) })],
  ];
  for (const [name, forge] of forgeries) {
    it(`an older candidate record that is ${name} proves nothing`, async () => {
      const { sol, near, relay, v } = await setup();
      settlingPosition(near, V.preimage, V.signature_hex);
      const old = await landOlder(sol, v, 'Sig');
      forge(old, sol, v);
      sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n, POSITION_STATUS_SETTLED) });
      assert.deepEqual((await relay.tick()).skipped, [{ id: '0', reason: 'position_pda_not_open' }]);
      assert.equal(near.calls.length, 0);
    });
  }
  it('a slot left by the other op is not searched', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    await landOlder(sol, v, 'Sig');
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n, POSITION_STATUS_RELEASED) });
    assert.deepEqual((await relay.tick()).skipped, [{ id: '0', reason: 'position_pda_not_open' }]);
    assert.equal(sol.pages.length, 0);
    assert.equal(near.calls.length, 0);
  });
  it('an open slot is sent to, not searched', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n) });
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.equal(sol.pages.length, 0);
    assert.equal(sol.sent.length, 1);
  });
});

describe('SR-8: depositor-bound slots', () => {
  it('a squatter slot for the same id under another depositor is never read', async () => {
    const { sol, near, relay, v } = await setup();
    near.version = '2.2.0-v7';
    awaiting(near, '8', '1000');
    sol.accounts.set(await positionPda(PROGRAM, v.vault, 8n, ATTACKER), { owner: PROGRAM, data: positionData(v.vault, 8n, 1000n, 1, AUTH, ATTACKER) });
    assert.deepEqual(await relay.tick(), { settled: [], released: [], deposits: [], skipped: [], failed: [] });
    assert.equal(near.calls.length, 0);
  });
  it('an account at the slot recording another depositor is refused', async () => {
    const { sol, near, relay, v } = await setup();
    near.version = '2.2.0-v7';
    awaiting(near, '8', '1000');
    sol.accounts.set(await slot(v, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 1000n, 1, AUTH, ATTACKER) });
    assert.match((await relay.tick()).failed[0]?.error ?? '', /fields do not match/);
    assert.equal(near.calls.length, 0);
  });
  it('a pre-funded (system-owned) slot counts as not deposited', async () => {
    const { sol, near, relay, v } = await setup();
    near.version = '2.2.0-v7';
    awaiting(near, '8', '1000');
    sol.accounts.set(await slot(v, 8n), { owner: SYSTEM_PROGRAM_ADDRESS, data: new Uint8Array(0) });
    assert.deepEqual(await relay.tick(), { settled: [], released: [], deposits: [], skipped: [], failed: [] });
    assert.equal(near.calls.length, 0);
  });
});

describe('SR-11: deposits below the reserved units do not trigger confirm', () => {
  it('top-level units are 0, the reserved amount binds: 1 unit against 1e12 reserved is never confirmed', async () => {
    const { sol, near, relay, v, now } = await setup();
    near.version = '2.2.0-v7';
    awaiting(near, '8', '1000000000000');
    sol.accounts.set(await slot(v, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 1n) });
    for (let i = 0; i < 5; i++) {
      assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason: 'deposit_below_reserved' }]);
      now.ms += 60_000;
    }
    assert.equal(near.calls.length, 0);
  });
  it('a Settled or Released slot is not an open deposit, however large its amount', async () => {
    for (const status of [POSITION_STATUS_SETTLED, POSITION_STATUS_RELEASED]) {
      const { sol, near, relay, v } = await setup();
      near.version = '2.2.0-v7';
      awaiting(near, '8', '1000');
      sol.accounts.set(await slot(v, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 5000n, status) });
      assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason: 'position_pda_not_open' }]);
      assert.equal(near.calls.length, 0);
    }
  });
  it('a position without reserved_units is not confirmed', async () => {
    const { sol, near, relay, v } = await setup();
    near.version = '2.2.0-v7';
    near.positions.push({ position_id: '8', status: 'Open', collateral: 'NVDAx', units: '1000', remote: solanaRemote('AwaitingDeposit') });
    sol.accounts.set(await slot(v, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 1000n) });
    assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason: 'reserved_units_unknown' }]);
    assert.equal(near.calls.length, 0);
  });
  it('N4: a rejected confirm is spaced out, never abandoned; a changed amount re-arms it', async () => {
    const { sol, near, relay, v, db, now } = await setup();
    near.version = '2.2.0-v7';
    awaiting(near, '8', '1000');
    sol.accounts.set(await slot(v, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 1000n) });
    for (let i = 0; i < 12; i++) {
      assert.deepEqual((await relay.tick()).deposits, ['8'], `attempt ${i}`);
      const wait = (db.retry('sol:deposit:8')?.next_attempt_at ?? 0) - now.ms;
      assert.equal(wait, Math.min(21_600_000, 60_000 * 2 ** i), `attempt ${i}`);
      assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason: 'backoff' }]);
      now.ms += wait;
    }
    assert.equal(near.calls.length, 12);
    sol.accounts.set(await slot(v, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 1001n) });
    assert.deepEqual((await relay.tick()).deposits, ['8']);
    assert.equal(db.retry('sol:deposit:8')?.next_attempt_at, now.ms + 60_000);
  });
  it('the cooldown doubles per unchanged attempt, and the count survives a restart', async () => {
    const { sol, near, relay, v, db, payer, now } = await setup();
    near.version = '2.2.0-v7';
    awaiting(near, '8', '1000');
    sol.accounts.set(await slot(v, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 1000n) });
    await relay.tick();
    assert.equal(db.retry('sol:deposit:8')?.next_attempt_at, NOW + 60_000);
    now.ms = NOW + 60_000;
    await relay.tick();
    assert.equal(db.retry('sol:deposit:8')?.next_attempt_at, NOW + 60_000 + 120_000);
    now.ms = NOW + 180_000;
    const restarted = new SolanaRelay(near, near, sol, payer, db, quiet, { ...PINNED, nowMs: () => now.ms, rand: () => 0.5, sleep: async () => {} });
    await restarted.tick();
    assert.equal(db.retry('sol:deposit:8')?.next_attempt_at, NOW + 180_000 + 240_000);
    assert.equal(near.calls.length, 3);
  });
  it('a failing confirm keeps the same doubling cooldown: the error backoff never shortens it', async () => {
    const { sol, near, relay, v, db, now } = await setup();
    near.version = '2.2.0-v7';
    near.failCalls = true;
    awaiting(near, '8', '1000');
    sol.accounts.set(await slot(v, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 1000n) });
    for (let i = 0; i < 4; i++) {
      assert.equal((await relay.tick()).failed.length, 1);
      assert.equal((db.retry('sol:deposit:8')?.next_attempt_at ?? 0) - now.ms, 60_000 * 2 ** i);
      assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason: 'backoff' }]);
      now.ms += 60_000 * 2 ** i;
    }
    assert.equal(near.calls.length, 4);
  });
  it('cappedCooldownMs: doubles from the base, stops at the cap, survives huge attempt counts', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map((n) => cappedCooldownMs(10, n, 50)), [10, 20, 40, 50, 50]);
    assert.equal(cappedCooldownMs(10, 100_000, 50), 50);
    assert.equal(cappedCooldownMs(10, 0, 50), 10);
  });
  const EXPIRED = { expires_ns: String(BigInt(NOW) * 1_000_000n) };
  it('N4: a full deposit that arrives after expiry is confirmed, so it can be released', async () => {
    const { sol, near, relay, v } = await setup();
    near.version = '2.2.0-v7';
    awaiting(near, '8', '1000', EXPIRED);
    sol.accounts.set(await slot(v, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 1000n) });
    assert.deepEqual((await relay.tick()).deposits, ['8']);
    assert.deepEqual(near.calls, [{ method: 'confirm_remote_deposit', args: { position_id: '8' } }]);
  });
  it('N4: a short deposit is confirmed once the reservation has expired, and not before', async () => {
    const { sol, near, relay, v, now } = await setup();
    near.version = '2.2.0-v7';
    awaiting(near, '8', '1000', { expires_ns: String(BigInt(NOW + 60_000) * 1_000_000n) });
    sol.accounts.set(await slot(v, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 1n) });
    assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason: 'deposit_below_reserved' }]);
    assert.equal(near.calls.length, 0);
    now.ms = NOW + 60_000;
    assert.deepEqual((await relay.tick()).deposits, ['8']);
    assert.equal(near.calls.length, 1);
  });
  it('N4: a position already marked Expired on NEAR is watched too (status Closed at the top level)', async () => {
    const { sol, near, relay, v } = await setup();
    near.version = '2.2.0-v7';
    near.positions.push({ position_id: '8', status: 'Closed', collateral: 'NVDAx', units: '0', remote: solanaRemote('Expired', { reserved_units: '1000', ...EXPIRED }) });
    sol.accounts.set(await slot(v, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 400n) });
    assert.deepEqual((await relay.tick()).deposits, ['8']);
    assert.equal(relay.status.awaitingDeposit, 0);
  });
  it('N4: an Expired position with a proven deposit is left alone', async () => {
    const { near, relay } = await setup();
    near.version = '2.2.0-v7';
    near.positions.push({ position_id: '8', status: 'Closed', collateral: 'NVDAx', units: '0', remote: solanaRemote('Expired', { reserved_units: '1000', depositor: DEPOSITOR }) });
    assert.deepEqual(await relay.tick(), { settled: [], released: [], deposits: [], skipped: [], failed: [] });
    assert.equal(near.calls.length, 0);
  });
  it('N4: an expired, still-empty slot costs no NEAR call and is polled slowly', async () => {
    const { near, relay, db } = await setup();
    near.version = '2.2.0-v7';
    awaiting(near, '8', '1000', EXPIRED);
    await relay.tick();
    assert.equal(near.calls.length, 0);
    assert.equal(db.retry('sol:deposit:8')?.next_attempt_at, NOW + 600_000);
    assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason: 'backoff' }]);
  });
  it('N4: an expired slot under another authority is still not confirmed', async () => {
    const { sol, near, relay, v } = await setup();
    near.version = '2.2.0-v7';
    awaiting(near, '8', '1000', EXPIRED);
    sol.accounts.set(await slot(v, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 1000n, 1, new Uint8Array(32).fill(7)) });
    assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason: 'authority_mismatch' }]);
    assert.equal(near.calls.length, 0);
  });
  for (const [extra, reason] of [
    [{ confirming: true }, 'confirm_in_flight'],
    [{ depositor: DEPOSITOR }, 'deposit_already_proven'],
  ] as const) {
    it(`${reason}: no confirm`, async () => {
      const { sol, near, relay, v } = await setup();
      near.version = '2.2.0-v7';
      awaiting(near, '8', '1000', extra);
      sol.accounts.set(await slot(v, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 1000n) });
      assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason }]);
      assert.equal(near.calls.length, 0);
    });
  }
});

describe('SR-12 / SR-31: program and mint are pinned', () => {
  it('SR-12: a look-alike vault under another mint changes nothing', async () => {
    const { sol, near, relay, v } = await setup();
    const fake = await vaultPda(PROGRAM, ATTACKER);
    sol.accounts.set(fake, { owner: PROGRAM, data: vaultData('NVDAx', ATTACKER) }); // permissionless init_vault, same symbol
    settlingPosition(near, V.preimage, V.signature_hex);
    sol.accounts.set(await slot(v, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n) });
    assert.deepEqual((await relay.tick()).settled, ['0']);
    assert.equal(sol.sent.length, 1);
  });
  it('a vault PDA that is missing, foreign-owned or for another mint or symbol is refused', async () => {
    const cases: Array<[string, (sol: FakeSol, v: VaultContext) => void, RegExp]> = [
      ['missing', (sol, v) => void sol.accounts.delete(v.vault), /not found/],
      ['foreign', (sol, v) => void sol.accounts.set(v.vault, { owner: ATTACKER, data: vaultData('NVDAx', MINT) }), /not owned/],
      ['mint', (sol, v) => void sol.accounts.set(v.vault, { owner: PROGRAM, data: vaultData('NVDAx', ATTACKER) }), /pinned mint/],
      ['symbol', (sol, v) => void sol.accounts.set(v.vault, { owner: PROGRAM, data: vaultData('OTHER', MINT) }), /symbol/],
    ];
    for (const [name, mutate, why] of cases) {
      const { sol, near, relay, v } = await setup();
      settlingPosition(near, V.preimage, V.signature_hex);
      mutate(sol, v);
      assert.match((await relay.tick()).failed[0]?.error ?? '', why, name);
      assert.equal(sol.sent.length, 0, name);
    }
  });
  it('SR-31: a lying RPC pointing at another program is refused before the fee payer signs (pinned position)', async () => {
    const { sol, near, relay } = await setup();
    const evil = ATTACKER as string;
    const preimage = V.preimage.replace(`program=${PROGRAM_ID}`, `program=${evil}`);
    settlingPosition(near, preimage, signMsg(preimage));
    (near.positions[0] as { remote: Record<string, unknown> }).remote.vault_program = evil;
    let hashes = 0;
    sol.latestBlockhash = async () => {
      hashes++;
      return { blockhash: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi' as Blockhash, lastValidBlockHeight: 100n };
    };
    const r = await relay.tick();
    assert.match(r.failed[0]?.error ?? '', /pinned vault program/);
    assert.equal(hashes, 0);
    assert.equal(sol.sent.length, 0);
    assert.equal(near.calls.length, 0);
  });
  it('SR-31: the same through the collateral primary remote_chain', async () => {
    const { sol, near, relay } = await setup();
    near.primaryChain = { chain_id: 'solana-devnet', vault_program: ATTACKER, mpc_domain_id: 1 };
    near.positions.push({ position_id: '30', status: 'Settling', collateral: 'NVDAx', units: '1' });
    assert.match((await relay.tick()).failed[0]?.error ?? '', /pinned vault program/);
    assert.equal(sol.sent.length, 0);
  });
  it('config: the relay defaults to config.yaml, env overrides, and an unpinned relay refuses to start', () => {
    const base = { CORE_ACCOUNT_ID: 'c.testnet', KEEPER_ACCOUNT_ID: 'k.testnet', KEEPER_KEY_PATH: '/k', KEEPER_SOLANA_KEYPAIR: '/s' };
    const c = loadConfig(base);
    const yaml = flattenYaml(readFileSync(new URL('../../../packages/config/config.yaml', import.meta.url), 'utf8'));
    assert.equal(c.vaultProgramId, yaml.get('solana.vault_program'));
    assert.equal(c.vaultMint, yaml.get('solana.mint'));
    assert.equal(loadConfig({ ...base, NECTAR_VAULT_PROGRAM_ID: PROGRAM_ID, NECTAR_VAULT_MINT: MINT }).vaultProgramId, PROGRAM_ID);
    assert.equal(loadConfig({ ...base, NECTAR_VAULT_PROGRAM_ID: 'TODO-G7' }).vaultProgramId, yaml.get('solana.vault_program')); // .env.example's placeholder
    assert.throws(() => loadConfig({ ...base, NECTAR_CONFIG_PATH: '/nonexistent.yaml' }), /program is not pinned/);
    assert.throws(() => loadConfig({ ...base, NECTAR_CONFIG_PATH: '/nonexistent.yaml', NECTAR_VAULT_PROGRAM_ID: PROGRAM_ID }), /mint is not pinned/);
    assert.equal(loadConfig({ CORE_ACCOUNT_ID: 'c.testnet', KEEPER_ACCOUNT_ID: 'k.testnet', KEEPER_KEY_PATH: '/k', NECTAR_CONFIG_PATH: '/nonexistent.yaml' }).solanaKeypairPath, null);
  });
  it('config: differing solana.program_id and solana.vault_program are refused', () => {
    const ids = { core: null, usdcMock: null, nvdaxMock: null, keeper: null, nvdaxToken: null, solanaMint: MINT, baseVault: null };
    assert.throws(() => assertSolanaPinned({ ...ids, solanaVaultProgram: PROGRAM_ID, solanaProgramId: ATTACKER }), /differ/);
    assert.doesNotThrow(() => assertSolanaPinned({ ...ids, solanaVaultProgram: PROGRAM_ID, solanaProgramId: PROGRAM_ID }));
  });
});

describe('KitSolanaPort against a local JSON-RPC stub', () => {
  async function withRpc(answer: (method: string, params: unknown[]) => unknown, run: (port: KitSolanaPort) => Promise<void>): Promise<void> {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        const q = JSON.parse(body) as { id: unknown; method: string; params: unknown[] };
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: q.id, result: answer(q.method, q.params) }));
      });
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    try {
      await run(new KitSolanaPort(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
    } finally {
      server.close();
    }
  }
  const b58 = (b: Uint8Array): string => getBase58Decoder().decode(b);
  const SIG58 = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';

  it('getTransaction: resolves loaded addresses and flattens inner instructions', async () => {
    const top = Uint8Array.from([1, 2, 3]);
    const inner = Uint8Array.from([4, 5]);
    await withRpc(() => ({
      slot: 1, blockTime: 1, version: 0,
      meta: {
        err: null, fee: 5000, logMessages: [], preBalances: [], postBalances: [], rewards: [], status: { Ok: null },
        loadedAddresses: { writable: [DEPOSITOR], readonly: [MINT] },
        innerInstructions: [{ index: 0, instructions: [{ programIdIndex: 1, accounts: [2, 3], data: b58(inner), stackHeight: 2 }] }],
      },
      transaction: { signatures: [SIG58], message: { accountKeys: [ATTACKER, PROGRAM], header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 1 }, recentBlockhash: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi', instructions: [{ programIdIndex: 1, accounts: [0, 2], data: b58(top) }], addressTableLookups: [] } },
    }), async (port) => {
      const tx = await port.transaction(SIG58);
      assert.equal(tx?.succeeded, true);
      assert.deepEqual(tx?.instructions, [
        { program: PROGRAM, accounts: [ATTACKER, DEPOSITOR], data: top },
        { program: PROGRAM, accounts: [DEPOSITOR, MINT], data: inner },
      ]);
    });
  });
  it('getTransaction: a failed or unknown tx is not a success', async () => {
    await withRpc(() => null, async (port) => assert.equal(await port.transaction(SIG58), null));
    await withRpc(() => ({
      slot: 1, blockTime: 1, version: 'legacy',
      meta: { err: { InstructionError: [0, 'Custom'] }, fee: 5000, logMessages: [], preBalances: [], postBalances: [], rewards: [], status: { Err: {} }, loadedAddresses: { writable: [], readonly: [] } },
      transaction: { signatures: [SIG58], message: { accountKeys: [ATTACKER], header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 }, recentBlockhash: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi', instructions: [] } },
    }), async (port) => assert.equal((await port.transaction(SIG58))?.succeeded, false));
  });
  it('getSignaturesForAddress: one page per call, the cursor is passed, failed txs are marked', async () => {
    const calls: Array<{ before?: string; limit?: number }> = [];
    const sigAt = (i: number): string => b58(new Uint8Array(64).fill(1 + (i % 200)).map((x, k) => (k < 2 ? (i >> (8 * k)) & 255 : x)));
    await withRpc((_m, params) => {
      const cfg = params[1] as { before?: string; limit: number };
      calls.push(cfg);
      return Array.from({ length: cfg.limit }, (_x, i) => ({ signature: sigAt(i), slot: 1, err: i === 0 ? { x: 1 } : null, memo: null, blockTime: 1, confirmationStatus: 'confirmed' }));
    }, async (port) => {
      const first = await port.signaturesPage(MINT, null, 3);
      assert.deepEqual(first, [{ signature: sigAt(0), ok: false }, { signature: sigAt(1), ok: true }, { signature: sigAt(2), ok: true }]);
      await port.signaturesPage(MINT, sigAt(2), 2);
      assert.equal(calls[0]?.before, undefined);
      assert.equal(calls[0]?.limit, 3);
      assert.equal(calls[1]?.before, sigAt(2));
      assert.equal(calls[1]?.limit, 2);
    });
  });
});
