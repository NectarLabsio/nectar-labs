// Solana relay (WO-16 Part 2): byte-exact instruction data and account order against solana/deploy.md, using the
// recorded v1 preimage + signature (contracts/nectar-core/tests/preimage_vectors.json, the solana/client vectors),
// and a mocked RPC for idempotency. No devnet sends.

import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
import type { KeeperMethod } from '../src/abi.ts';
import type { Allowance, CoreReader, KeeperCallArgs, KeeperWriter, TxResult, ViewResult } from '../src/chain.ts';
import { KeeperDb } from '../src/db.ts';
import { createLogger } from '../src/log.ts';
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  POSITION_DISCRIMINATOR,
  SYSTEM_PROGRAM_ADDRESS,
  SolanaRelay,
  VAULT_DISCRIMINATOR,
  assertDevnetRpc,
  associatedTokenAddress,
  buildReleaseInstructions,
  buildSettleInstructions,
  ed25519AuthorityBytes,
  noncePda,
  parsePositionAccount,
  parseReleasePreimage,
  parseSettlePreimage,
  positionPda,
  releaseIxData,
  settleIxData,
  vaultPda,
  vaultTokensPda,
  type SigState,
  type SolAccount,
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

function positionData(vault: Address, id: bigint, amount: bigint, status = 1, authority = AUTH, depositor = DEPOSITOR): Uint8Array {
  const d = new Uint8Array(123);
  const v = new DataView(d.buffer);
  d.set(POSITION_DISCRIMINATOR, 0);
  d[8] = 1;
  d.set(authority, 9);
  d.set(addrBytes(depositor), 41);
  v.setBigUint64(73, amount, true);
  d[81] = status;
  d.set(addrBytes(vault), 82);
  v.setBigUint64(114, id, true);
  d[122] = 255;
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
  it('[ed25519 verify, settle]: recorded signature verifies; 14 accounts in order with roles', async () => {
    const v = await vaultCtx();
    const payer = address('11111111111111111111111111111112');
    const pos = await positionPda(PROGRAM, v.vault, 0n);
    const [ed, settle] = await buildSettleInstructions(v, payer, pos, DEPOSITOR, AUTH, V.preimage, SIG);
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
      { address: DEPOSITOR, role: W },
      { address: await associatedTokenAddress(DEPOSITOR, TOKEN_PROGRAM, MINT), role: W },
      { address: recipient, role: R },
      { address: await associatedTokenAddress(recipient, TOKEN_PROGRAM, MINT), role: W },
      { address: await noncePda(PROGRAM, v.vault, 0n), role: W },
      { address: INSTRUCTIONS_SYSVAR_ADDRESS, role: R },
      { address: TOKEN_PROGRAM, role: R },
      { address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS, role: R },
      { address: SYSTEM_PROGRAM_ADDRESS, role: R },
    ]);
    assert.deepEqual(settle.data, settleIxData(parseSettlePreimage(V.preimage)));
  });
  it('[ed25519 verify, release]: 12 accounts (no recipient pair); recipient must be the depositor', async () => {
    const v = await vaultCtx();
    const payer = address('11111111111111111111111111111112');
    const pos = await positionPda(PROGRAM, v.vault, 7n);
    const m = releasePreimage({ program: V.vault_program, positionId: 7n, recipient: DEPOSITOR, nonce: 9n, expires: 1700003600n });
    const [, rel] = await buildReleaseInstructions(v, payer, pos, DEPOSITOR, AUTH, m, hexToBytes(signMsg(m)));
    assert.ok(rel !== undefined);
    assert.equal(rel.accounts?.length, 12);
    assert.deepEqual(rel.accounts?.map((a) => a.address).slice(7), [await noncePda(PROGRAM, v.vault, 9n), INSTRUCTIONS_SYSVAR_ADDRESS, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ADDRESS, SYSTEM_PROGRAM_ADDRESS]);
    await assert.rejects(buildReleaseInstructions(v, payer, pos, address(V.recipient), AUTH, m, SIG), /depositor/);
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
    assert.deepEqual(ed25519AuthorityBytes(`ed25519:${VECTORS.test_public_key_base58}`), AUTH);
    assert.equal(ed25519AuthorityBytes('secp256k1:abc'), null);
    assert.throws(() => assertDevnetRpc('https://api.mainnet-beta.solana.com'));
  });
});

// ------------------------------------------------------------------ mocked RPC

class FakeSol implements SolanaPort {
  accounts = new Map<string, SolAccount>();
  sent: string[] = [];
  sigsFor = new Map<string, string>();
  onSend: ((wire: string) => void) | null = null;
  async getAccount(a: Address): Promise<SolAccount | null> {
    return this.accounts.get(a) ?? null;
  }
  async programAccounts(program: Address, disc: Uint8Array): Promise<Array<{ address: Address; data: Uint8Array }>> {
    return [...this.accounts.entries()]
      .filter(([, x]) => x.owner === program && disc.every((b, i) => x.data[i] === b))
      .map(([k, x]) => ({ address: address(k), data: x.data }));
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
  async oldestSignatureFor(a: Address): Promise<string | null> {
    return this.sigsFor.get(a) ?? null;
  }
}

class FakeNear implements CoreReader, KeeperWriter {
  positions: unknown[] = [];
  pending = new Map<string, unknown>();
  releases = new Map<string, unknown>();
  version: string | null = null;
  missingMethods = new Set<string>();
  calls: Array<{ method: KeeperMethod; args: KeeperCallArgs }> = [];
  async view(method: string, args: Record<string, unknown>): Promise<ViewResult> {
    const id = String(args.position_id);
    switch (method) {
      case 'contract_version':
        if (this.version === null) throw new Error('MethodNotFound');
        return { value: this.version, blockHeight: 1 };
      case 'list_positions':
        return { value: this.positions.slice(Number(args.from_index), Number(args.from_index) + Number(args.limit)), blockHeight: 1 };
      case 'get_collateral':
        return { value: { symbol: 'NVDAx', remote_chain: { chain_id: 'solana-devnet', vault_program: V.vault_program, mpc_domain_id: 1 } }, blockHeight: 1 };
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
    if (this.missingMethods.has(method)) return { txHash: 'x', ok: false, failure: '{"MethodResolveError":"MethodNotFound"}', logs: [] };
    const d = this.pending.get(args.position_id) as { status: string } | undefined;
    if (method === 'relay_settlement_result' && d !== undefined) d.status = 'Relayed';
    return { txHash: `near${this.calls.length}`, ok: true, failure: null, logs: [] };
  }
}

const NOW = 1_700_000_000_000;
const quiet = createLogger('test', () => {});

async function setup(): Promise<{ sol: FakeSol; near: FakeNear; relay: SolanaRelay; v: VaultContext; payer: KeyPairSigner; db: KeeperDb }> {
  const sol = new FakeSol();
  const near = new FakeNear();
  const v = await vaultCtx();
  sol.accounts.set(MINT, { owner: TOKEN_PROGRAM, data: new Uint8Array(82) });
  sol.accounts.set(v.vault, { owner: PROGRAM, data: vaultData('NVDAx', MINT) });
  const payer = await generateKeyPairSigner();
  const db = new KeeperDb(':memory:');
  const relay = new SolanaRelay(near, near, sol, payer, db, quiet, { pageSize: 50, nowMs: () => NOW, rand: () => 0.5, sleep: async () => {} });
  return { sol, near, relay, v, payer, db };
}

function settlingPosition(near: FakeNear, preimage: string, sigHex: string): void {
  const f = parseSettlePreimage(preimage);
  near.positions.push({ position_id: String(f.positionId), status: 'Settling', collateral: 'NVDAx', units: '100000000' });
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
    sol.accounts.set(await positionPda(PROGRAM, v.vault, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n) });
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
  it('restart after a landed tx: nonce PDA exists → no send, relays the tx that created it', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    const nonceAddr = await noncePda(PROGRAM, v.vault, 0n);
    sol.accounts.set(nonceAddr, { owner: PROGRAM, data: new Uint8Array(60) });
    sol.sigsFor.set(nonceAddr, 'LandedSig111');
    const r = await relay.tick();
    assert.equal(sol.sent.length, 0);
    assert.deepEqual(r.settled, ['0']);
    assert.deepEqual(near.calls, [{ method: 'relay_settlement_result', args: { position_id: '0', solana_tx_sig: 'LandedSig111' } }]);
  });
  it('position PDA closed (without our nonce) or signature expired → skip with backoff, nothing sent', async () => {
    const { sol, near, relay, v, db } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    const r = await relay.tick();
    assert.deepEqual(r.skipped, [{ id: '0', reason: 'position_pda_missing' }]);
    assert.ok((db.retry('sol:settle:0')?.next_attempt_at ?? 0) > NOW);
    const late = new SolanaRelay(near, near, sol, await generateKeyPairSigner(), new KeeperDb(':memory:'), quiet, { pageSize: 50, nowMs: () => 1_800_000_000_000, sleep: async () => {} });
    sol.accounts.set(await positionPda(PROGRAM, v.vault, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n) });
    assert.deepEqual((await late.tick()).skipped, [{ id: '0', reason: 'signature_expired' }]);
    assert.equal(sol.sent.length, 0);
    assert.equal(near.calls.length, 0);
  });
  it('a tampered preimage (fields != pending) is refused before any send', async () => {
    const { sol, near, relay, v } = await setup();
    settlingPosition(near, V.preimage, V.signature_hex);
    (near.pending.get('0') as { recipient: string }).recipient = DEPOSITOR;
    sol.accounts.set(await positionPda(PROGRAM, v.vault, 0n), { owner: PROGRAM, data: positionData(v.vault, 0n, 100_000_000n) });
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
    near.positions.push({ position_id: '7', status: 'Open', collateral: 'NVDAx', units: '1', remote: { status: 'Releasing', authority: `ed25519:${VECTORS.test_public_key_base58}` } });
    near.releases.set('7', { message: m, signature_hex: signMsg(m), nonce: '9', expires: '1700003600' });
    sol.accounts.set(await positionPda(PROGRAM, v.vault, 7n), { owner: PROGRAM, data: positionData(v.vault, 7n, 5n) });
    const r = await relay.tick();
    assert.deepEqual(r.released, ['7'], JSON.stringify(r));
    assert.equal(sol.sent.length, 1);
    assert.deepEqual(near.calls.map((c) => c.method), ['relay_release_result', 'relay_settlement_result']);
  });
  it('v2 deposit watcher: confirm_remote_deposit only when amount >= reserved and authority matches; then cooldown', async () => {
    const { sol, near, relay, v } = await setup();
    near.version = '2.0.0-v7';
    const auth = `ed25519:${VECTORS.test_public_key_base58}`;
    near.positions.push({ position_id: '8', status: 'Open', collateral: 'NVDAx', units: '1000', remote: { status: 'AwaitingDeposit', authority: auth } });
    await relay.tick(); // no PDA yet
    assert.equal(near.calls.length, 0);
    sol.accounts.set(await positionPda(PROGRAM, v.vault, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 999n) });
    assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason: 'deposit_below_reserved' }]);
    sol.accounts.set(await positionPda(PROGRAM, v.vault, 8n), { owner: PROGRAM, data: positionData(v.vault, 8n, 1000n) });
    assert.deepEqual((await relay.tick()).deposits, ['8']);
    assert.deepEqual(near.calls, [{ method: 'confirm_remote_deposit', args: { position_id: '8' } }]);
    await relay.tick(); // cooldown
    assert.equal(near.calls.length, 1);
    assert.equal(sol.sent.length, 0);
  });
  it('vault discovery decodes the Vault account (mint after the symbol)', async () => {
    const { v } = await setup();
    assert.equal(getAddressDecoder().decode(vaultData('NVDAx', MINT).subarray(18, 50)), MINT);
    assert.equal(v.vault, await vaultPda(PROGRAM, MINT));
  });
});
