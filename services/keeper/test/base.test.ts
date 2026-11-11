// WO-29b Base relay: calldata byte-exactness (evm/test/eip712_vectors.json + cast-generated fixture), Foundry keystore
// decryption (keystore generated here), chain-id refusal, and relay idempotency against a mocked EVM RPC.

import assert from 'node:assert/strict';
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';
import { concat, encodeAbiParameters, encodeEventTopics, getAddress, keccak256, toHex, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { KeeperMethod } from '../src/abi.ts';
import {
  BaseRelay,
  ChainRefusedError,
  VAULT_ABI,
  VAULT_STATUS_NONE,
  VAULT_STATUS_OPEN,
  ViemEvmPort,
  assertAccountName,
  assertBaseSepoliaChainId,
  assertBaseSepoliaRpc,
  decryptKeystoreV3,
  isBasePosition,
  loadFoundryKeystore,
  rawKeyEnvVars,
  recoverSigner,
  releaseCalldata,
  releaseDigest,
  releaseStructOf,
  settleCalldata,
  settleDigest,
  settleStructOf,
  slotKeyOf,
  withBuilderSuffix,
  type EventQuery,
  type EvmPort,
  type EvmReceipt,
  type ReleaseEvmView,
  type SettlementEvmView,
  type VaultEvent,
  type VaultPosition,
} from '../src/base.ts';
import type { Allowance, CoreReader, KeeperCallArgs, KeeperWriter, TxResult, ViewResult } from '../src/chain.ts';
import { loadBaseConfig } from '../src/config.ts';
import { KeeperDb } from '../src/db.ts';
import { createLogger } from '../src/log.ts';
import { healthBody } from '../src/server.ts';

type Vec = Record<string, string>;
interface Vectors {
  domain: { verifyingContract: string; chainId: string };
  signer: string;
  settle: Record<string, Vec>;
  release: Record<string, Vec>;
}
const VECTORS = JSON.parse(readFileSync(new URL('../../../evm/test/eip712_vectors.json', import.meta.url), 'utf8')) as Vectors;
const CALLDATA = JSON.parse(readFileSync(new URL('./fixtures/base_calldata.json', import.meta.url), 'utf8')) as {
  depositor: Address;
  selectors: Record<string, string>;
  settle: Record<string, string>;
  release: Record<string, string>;
};
const VAULT = getAddress(VECTORS.domain.verifyingContract);
const SIGNER = getAddress(VECTORS.signer);
const DEPOSITOR = getAddress(CALLDATA.depositor);

function settleView(v: Vec, over: Partial<SettlementEvmView> = {}): SettlementEvmView {
  return {
    digest: v.digest as Hex, r: v.r as Hex, s: v.s as Hex, v: Number(v.v),
    positionId: v.positionId as string, quoteId: v.quoteId as string, repayE6: v.repayE6 as string, seizeRaw: v.seizeRaw as string,
    recipient: v.recipient as string, nonce: v.nonce as string, expires: v.expires as string, kind: Number(v.kind),
    status: 'Signed', chainId: 84532, verifyingContract: VAULT, txHash: null, ...over,
  };
}
function releaseView(v: Vec, over: Partial<ReleaseEvmView> = {}): ReleaseEvmView {
  return {
    digest: v.digest as Hex, r: v.r as Hex, s: v.s as Hex, v: Number(v.v),
    positionId: v.positionId as string, recipient: v.recipient as string, nonce: v.nonce as string, expires: v.expires as string,
    status: 'Signed', chainId: 84532, verifyingContract: VAULT, txHash: null, ...over,
  };
}
const sigOf = (v: Vec) => ({ v: Number(v.v), r: v.r as Hex, s: v.s as Hex });

// ------------------------------------------------------------------ calldata

describe('base: calldata byte-exactness (eip712_vectors.json, cast calldata)', () => {
  for (const [name, v] of Object.entries(VECTORS.settle)) {
    it(`settle ${name}: selector, encoding, digest and signer`, async () => {
      const m = settleStructOf(settleView(v));
      const data = settleCalldata(m, DEPOSITOR, sigOf(v));
      assert.equal(data.slice(0, 10), CALLDATA.selectors.settle);
      assert.equal(data, CALLDATA.settle[name]);
      // Independent of both encoders: the 8 static struct words equal EIP-712 encodeData minus its type hash.
      assert.equal(data.slice(10, 10 + 64 * 8), (v.encodeData as string).slice(2 + 64));
      assert.equal(data.length, 2 + 8 + 64 * 12);
      assert.equal(settleDigest(VAULT, m), v.digest);
      assert.equal(await recoverSigner(v.digest as Hex, sigOf(v)), SIGNER);
    });
  }
  for (const [name, v] of Object.entries(VECTORS.release)) {
    it(`release ${name}: selector, encoding, digest and signer`, async () => {
      const m = releaseStructOf(releaseView(v));
      const data = releaseCalldata(m, m.recipient, sigOf(v));
      assert.equal(data.slice(0, 10), CALLDATA.selectors.release);
      assert.equal(data, CALLDATA.release[name]);
      assert.equal(data.slice(10, 10 + 64 * 4), (v.encodeData as string).slice(2 + 64));
      assert.equal(releaseDigest(VAULT, m), v.digest);
      assert.equal(await recoverSigner(v.digest as Hex, sigOf(v)), SIGNER);
    });
  }
  it('ERC-8021 suffix: appended verbatim only when injected', () => {
    const v = VECTORS.settle.preliq_pos7 as Vec;
    const data = settleCalldata(settleStructOf(settleView(v)), DEPOSITOR, sigOf(v));
    assert.equal(withBuilderSuffix(data, null), data);
    assert.equal(withBuilderSuffix(data, '0xdeadbeef'), `${data}deadbeef`);
  });
  it('rejects bad kind, non-canonical numbers, u64 overflow and bad v', () => {
    const v = VECTORS.settle.preliq_pos7 as Vec;
    assert.throws(() => settleStructOf(settleView(v, { kind: 0 })), /kind/);
    assert.throws(() => settleStructOf(settleView(v, { nonce: '01' })), /canonical/);
    assert.throws(() => settleStructOf(settleView(v, { expires: '18446744073709551616' })), /range/);
    assert.throws(() => settleStructOf(settleView(v, { recipient: '0x12' })), /address/);
  });
  it('slotKey = keccak256(abi.encode(id, depositor)) (§E), from the raw 64-byte encoding', () => {
    const raw = `0x${(7).toString(16).padStart(64, '0')}${DEPOSITOR.slice(2).toLowerCase().padStart(64, '0')}` as Hex;
    assert.equal(slotKeyOf(7n, DEPOSITOR), keccak256(raw));
    assert.notEqual(slotKeyOf(7n, DEPOSITOR), slotKeyOf(7n, SIGNER));
  });
});

// ------------------------------------------------------------------ keystore

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Writes a Web3 Secret Storage v3 keystore like `cast wallet new <dir> <name>` (scrypt n small for test speed). */
function writeKeystore(dir: string, name: string, sk: Uint8Array, password: string, n = 1024): void {
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const dk = scryptSync(Buffer.from(password, 'utf8'), salt, 32, { N: n, r: 8, p: 1 });
  const c = createCipheriv('aes-128-ctr', dk.subarray(0, 16), iv);
  const ct = Buffer.concat([c.update(sk), c.final()]);
  const mac = keccak256(concat([dk.subarray(16, 32), ct]));
  const json = {
    crypto: {
      cipher: 'aes-128-ctr', cipherparams: { iv: iv.toString('hex') }, ciphertext: ct.toString('hex'), kdf: 'scrypt',
      kdfparams: { dklen: 32, n, p: 1, r: 8, salt: salt.toString('hex') }, mac: mac.slice(2),
    },
    id: '00000000-0000-4000-8000-000000000000',
    version: 3,
  };
  writeFileSync(join(dir, name), JSON.stringify(json));
}

describe('base: Foundry keystore (generated in the test)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nectar-ks-'));
  dirs.push(dir);
  const sk = Uint8Array.from(randomBytes(32));
  const expected = privateKeyToAccount(toHex(sk)).address;
  writeKeystore(dir, 'keeper', sk, 'correct horse');
  const pw = join(dir, 'pw');
  writeFileSync(pw, 'correct horse\n');
  chmodSync(pw, 0o600);

  it('decrypts to the same key and address; the password file newline is stripped', () => {
    const json = JSON.parse(readFileSync(join(dir, 'keeper'), 'utf8')) as unknown;
    assert.deepEqual(decryptKeystoreV3(json, 'correct horse'), sk);
    assert.equal(loadFoundryKeystore(dir, 'keeper', pw).address, expected);
  });
  it('wrong password → MAC mismatch; tampered ciphertext → MAC mismatch', () => {
    const json = JSON.parse(readFileSync(join(dir, 'keeper'), 'utf8')) as { crypto: { ciphertext: string } };
    assert.throws(() => decryptKeystoreV3(json, 'wrong'), /MAC mismatch/);
    const t = structuredClone(json);
    t.crypto.ciphertext = (t.crypto.ciphertext[0] === '0' ? '1' : '0') + t.crypto.ciphertext.slice(1);
    assert.throws(() => decryptKeystoreV3(t, 'correct horse'), /MAC mismatch/);
  });
  it('refuses a group-readable password file, path-like account names, non-v3 / non-scrypt files', () => {
    const loose = join(dir, 'pw-loose');
    writeFileSync(loose, 'correct horse');
    chmodSync(loose, 0o644);
    assert.throws(() => loadFoundryKeystore(dir, 'keeper', loose), /too open/);
    assert.throws(() => assertAccountName('../keeper'), /plain keystore file name/);
    assert.throws(() => assertAccountName('.hidden'), /plain keystore file name/);
    assert.throws(() => loadFoundryKeystore(dir, 'missing', pw), /not found/);
    const json = JSON.parse(readFileSync(join(dir, 'keeper'), 'utf8')) as { version: number; crypto: { kdf: string } };
    assert.throws(() => decryptKeystoreV3({ ...json, version: 1 }, 'x'), /version/);
    assert.throws(() => decryptKeystoreV3({ ...json, crypto: { ...json.crypto, kdf: 'pbkdf2' } }, 'x'), /scrypt/);
  });
  it('a mismatching address field is refused', () => {
    const json = JSON.parse(readFileSync(join(dir, 'keeper'), 'utf8')) as Record<string, unknown>;
    writeFileSync(join(dir, 'bad-addr'), JSON.stringify({ ...json, address: '0000000000000000000000000000000000000001' }));
    assert.throws(() => loadFoundryKeystore(dir, 'bad-addr', pw), /does not match/);
  });
  it('raw key env vars are detected; config needs the keystore triple, never a key', () => {
    assert.deepEqual(rawKeyEnvVars({ BASE_PRIVATE_KEY: '0xabc', ETH_PRIVATEKEY: '', MNEMONIC: 'a b', PATH: '/bin' }), ['BASE_PRIVATE_KEY', 'MNEMONIC']);
    assert.equal(loadBaseConfig({}), null);
    assert.throws(() => loadBaseConfig({ BASE_RPC_URL: 'http://127.0.0.1:8545' }), /BASE_ACCOUNT, BASE_PASSWORD_FILE/);
    const c = loadBaseConfig({ BASE_RPC_URL: 'http://127.0.0.1:8545', BASE_ACCOUNT: 'k', BASE_PASSWORD_FILE: '/p', BASE_KEEPER_ATTEST: '1' });
    assert.equal(c?.keeperAttest, true);
    assert.equal(c?.builderCode, null);
    assert.match(c?.vaultAddress ?? '', /^0x[0-9a-fA-F]{40}$/); // SR-31: pinned from config.yaml base.vault by default
    assert.equal(c?.outlayerVaultRead, false);
    assert.equal(loadBaseConfig({ BASE_RPC_URL: 'x', BASE_ACCOUNT: 'k', BASE_PASSWORD_FILE: '/p', BASE_VAULT_ADDRESS: '0x0000000000000000000000000000000000000BAD' })?.vaultAddress, '0x0000000000000000000000000000000000000BAD');
    assert.throws(() => loadBaseConfig({ BASE_RPC_URL: 'x', BASE_ACCOUNT: 'k', BASE_PASSWORD_FILE: '/p', NECTAR_CONFIG_PATH: '/nonexistent.yaml' }), /not pinned/);
    assert.throws(() => loadBaseConfig({ BASE_RPC_URL: 'x', BASE_ACCOUNT: 'k', BASE_PASSWORD_FILE: '/p', BASE_KEEPER_ATTEST: 'yes' }), /0 or 1/);
  });
});

// ------------------------------------------------------------------ chain refusal

describe('base: chain-id refusal', () => {
  it('84532 only; 8453 and anything else refused; mainnet RPC hosts refused', () => {
    assert.doesNotThrow(() => assertBaseSepoliaChainId(84532));
    assert.throws(() => assertBaseSepoliaChainId(8453), ChainRefusedError);
    assert.throws(() => assertBaseSepoliaChainId(1), ChainRefusedError);
    assert.throws(() => assertBaseSepoliaChainId(31337), /84532/);
    assert.doesNotThrow(() => assertBaseSepoliaRpc('http://127.0.0.1:8545'));
    assert.doesNotThrow(() => assertBaseSepoliaRpc('https://sepolia.base.org'));
    assert.throws(() => assertBaseSepoliaRpc('https://mainnet.base.org'), ChainRefusedError);
    assert.throws(() => assertBaseSepoliaRpc('https://base-mainnet.example.com/v2/x'), ChainRefusedError);
    assert.throws(() => assertBaseSepoliaRpc('ws://127.0.0.1:8545'), /http/);
  });
  it('a relay whose RPC reports 8453 never reads NEAR, signs or relays', async () => {
    const { relay, near, evm } = setup();
    evm.chain = 8453;
    near.positions.push(basePosition('7', 'Settling'));
    const r = await relay.tick();
    assert.equal(relay.status.lastTickOk, false);
    assert.match(relay.status.lastError ?? '', /8453/);
    assert.deepEqual(r.settled, []);
    assert.equal(evm.signed.length, 0);
    assert.equal(near.views.length, 0);
    assert.equal(near.calls.length, 0);
  });
});

// ------------------------------------------------------------------ relay with a mocked RPC

class FakeEvm implements EvmPort {
  readonly signer: Address = '0x000000000000000000000000000000000000bEEF';
  chain = 84532;
  positions = new Map<string, VaultPosition>();
  usedNonces = new Set<string>();
  queries: Array<{ event: VaultEvent; q: EventQuery }> = [];
  floorAsked: bigint[] = [];
  events = new Map<string, Hex>();
  receipts = new Map<Hex, EvmReceipt>();
  signed: Array<{ to: Address; data: Hex; hash: Hex }> = [];
  broadcasts: Hex[] = [];
  /** what the next broadcast's receipt says; null = never mined */
  nextReceipt: EvmReceipt['status'] | null = 'success';
  async chainId(): Promise<number> {
    return this.chain;
  }
  async blockNumber(): Promise<bigint> {
    return 100n;
  }
  async position(_vault: Address, id: bigint, depositor: Address): Promise<VaultPosition> {
    return this.positions.get(`${id}:${depositor}`) ?? { authority: '0x0000000000000000000000000000000000000000', depositor: '0x0000000000000000000000000000000000000000', amount: 0n, status: VAULT_STATUS_NONE };
  }
  async nonceUsed(_vault: Address, slotKey: Hex, nonce: bigint): Promise<boolean> {
    return this.usedNonces.has(`${slotKey}:${nonce}`);
  }
  async blockAtOrBefore(unixSeconds: bigint): Promise<bigint> {
    this.floorAsked.push(unixSeconds);
    return 42n;
  }
  async sign(to: Address, data: Hex): Promise<{ hash: Hex; raw: Hex }> {
    const hash = keccak256(concat([data, toHex(this.signed.length, { size: 4 })]));
    this.signed.push({ to, data, hash });
    return { hash, raw: hash };
  }
  async broadcast(raw: Hex): Promise<Hex> {
    this.broadcasts.push(raw);
    if (this.nextReceipt !== null) this.receipts.set(raw, { status: this.nextReceipt, blockNumber: 101n });
    return raw;
  }
  async receipt(hash: Hex): Promise<EvmReceipt | null> {
    return this.receipts.get(hash) ?? null;
  }
  async findEventTx(_vault: Address, event: VaultEvent, q: EventQuery): Promise<Hex | null> {
    this.queries.push({ event, q });
    return this.events.get(`${event}:${q.positionId}:${q.nonce ?? ''}`) ?? null;
  }
}

class FakeNear implements CoreReader, KeeperWriter {
  positions: unknown[] = [];
  settlements = new Map<string, SettlementEvmView>();
  releases = new Map<string, ReleaseEvmView>();
  views: Array<{ method: string; id: string }> = [];
  calls: Array<{ method: KeeperMethod; args: KeeperCallArgs }> = [];
  committed: string | null = null;
  async view(method: string, args: Record<string, unknown>): Promise<ViewResult> {
    const id = String(args.position_id);
    this.views.push({ method, id });
    switch (method) {
      case 'get_position':
        return { value: { remote: { committed_depositor: this.committed } }, blockHeight: 1 };
      case 'list_positions':
        return { value: this.positions.slice(Number(args.from_index), Number(args.from_index) + Number(args.limit)), blockHeight: 1 };
      case 'get_pending_settlement_evm':
        return { value: this.settlements.get(id) ?? null, blockHeight: 1 };
      case 'get_pending_release_evm':
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
    if (method === 'relay_settlement_result') {
      const d = this.settlements.get(args.position_id);
      if (d !== undefined) d.status = 'Relayed';
    }
    if (method === 'relay_release_result') {
      const d = this.releases.get(args.position_id);
      if (d !== undefined) d.status = 'Relayed';
    }
    return { txHash: `near${this.calls.length}`, ok: true, failure: null, logs: [] };
  }
}

const NOW = 1_700_000_000_000; // before every vector's expiry
const quiet = createLogger('test', () => {});

function setup(opts: { keeperAttest?: boolean; outlayerVaultRead?: boolean; builderSuffix?: Hex | null } = {}): { relay: BaseRelay; near: FakeNear; evm: FakeEvm; db: KeeperDb; now: { ms: number } } {
  const near = new FakeNear();
  const evm = new FakeEvm();
  const db = new KeeperDb(':memory:');
  const now = { ms: NOW };
  const relay = new BaseRelay(near, near, evm, db, quiet, {
    pageSize: 50, nowMs: () => now.ms, rand: () => 0.5, sleep: async () => {}, expectedVault: VAULT, keeperAttest: opts.keeperAttest ?? false,
    outlayerVaultRead: opts.outlayerVaultRead ?? false, builderSuffix: opts.builderSuffix ?? null,
  });
  return { relay, near, evm, db, now };
}

function basePosition(id: string, remoteStatus: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    position_id: id, status: remoteStatus === 'Settling' ? 'Settling' : 'Open', collateral: 'NVDAx', units: '1000',
    remote: { chain_id: 'base-sepolia', vault_program: VAULT, domain_id: 0, status: remoteStatus, authority: SIGNER, reserved_units: '1000', committed_depositor: DEPOSITOR, ...extra },
  };
}

function openVault(evm: FakeEvm, id: bigint, amount = 1000n, status = VAULT_STATUS_OPEN, authority: Address = SIGNER, depositor: Address = DEPOSITOR): void {
  evm.positions.set(`${id}:${depositor}`, { authority, depositor, amount, status });
}

describe('base: relay with a mocked RPC', () => {
  const S7 = VECTORS.settle.preliq_pos7 as Vec;
  const R7 = VECTORS.release.pos7 as Vec;

  it('settle: signs settle calldata to the vault once, relays the 0x hash; a second tick sends nothing', async () => {
    const { relay, near, evm, db } = setup();
    near.positions.push(basePosition('7', 'Settling'));
    near.settlements.set('7', settleView(S7));
    openVault(evm, 7n);
    const r1 = await relay.tick();
    assert.deepEqual(r1.settled, ['7'], JSON.stringify(r1));
    assert.equal(evm.signed.length, 1);
    assert.equal(evm.signed[0]?.to, VAULT);
    assert.equal(evm.signed[0]?.data, CALLDATA.settle.preliq_pos7);
    assert.deepEqual(near.calls, [{ method: 'relay_settlement_result', args: { position_id: '7', solana_tx_sig: evm.signed[0]?.hash } }]);
    assert.equal(db.evmTx('base:settle:7:1'), null);
    const r2 = await relay.tick();
    assert.deepEqual(r2.settled, []);
    assert.equal(evm.signed.length, 1);
    assert.equal(near.calls.length, 1);
  });
  it('builder suffix (when injected) ends the calldata', async () => {
    const { relay, near, evm } = setup({ builderSuffix: '0x8021' });
    near.positions.push(basePosition('7', 'Settling'));
    near.settlements.set('7', settleView(S7));
    openVault(evm, 7n);
    await relay.tick();
    assert.equal(evm.signed[0]?.data, `${CALLDATA.settle.preliq_pos7}8021`);
    assert.equal(relay.status.builderSuffix, 'appended');
  });
  it('restart after broadcast: the stored hash is relayed by receipt, nothing re-signed', async () => {
    const { relay, near, evm, db } = setup();
    near.positions.push(basePosition('7', 'Settling'));
    near.settlements.set('7', settleView(S7));
    openVault(evm, 7n);
    const h = `0x${'11'.repeat(32)}` as Hex;
    db.setEvmTx('base:settle:7:1', h, NOW - 1000);
    evm.receipts.set(h, { status: 'success', blockNumber: 99n });
    evm.usedNonces.add(`${slotKeyOf(7n, DEPOSITOR)}:1`);
    const r = await relay.tick();
    assert.deepEqual(r.settled, ['7']);
    assert.equal(evm.signed.length, 0);
    assert.deepEqual(near.calls.map((c) => c.args.solana_tx_sig), [h]);
  });
  it('stored hash without a receipt: wait (tx_pending), then after the timeout re-evaluate from chain state', async () => {
    const { relay, near, evm, db, now } = setup();
    near.positions.push(basePosition('7', 'Settling'));
    near.settlements.set('7', settleView(S7));
    openVault(evm, 7n);
    db.setEvmTx('base:settle:7:1', `0x${'22'.repeat(32)}`, NOW - 1000);
    assert.deepEqual((await relay.tick()).skipped, [{ id: '7', reason: 'tx_pending' }]);
    assert.equal(evm.signed.length, 0);
    now.ms = NOW + 3_600_000;
    assert.deepEqual((await relay.tick()).settled, ['7']);
    assert.equal(evm.signed.length, 1);
  });
  it('nonce already used (landed elsewhere / before a crash): relays the event tx, nothing signed', async () => {
    const { relay, near, evm } = setup();
    near.positions.push(basePosition('7', 'Settling'));
    near.settlements.set('7', settleView(S7));
    openVault(evm, 7n, 1000n, 2);
    evm.usedNonces.add(`${slotKeyOf(7n, DEPOSITOR)}:1`);
    const h = `0x${'33'.repeat(32)}` as Hex;
    evm.events.set('PositionSettled:7:1', h);
    assert.deepEqual((await relay.tick()).settled, ['7']);
    assert.equal(evm.signed.length, 0);
    assert.equal(near.calls[0]?.args.solana_tx_sig, h);
  });
  it('vault position closed (nonce unused), expired signature, wrong vault authority → skip with backoff, nothing signed', async () => {
    const { relay, near, evm, now } = setup();
    near.positions.push(basePosition('7', 'Settling'));
    near.settlements.set('7', settleView(S7));
    openVault(evm, 7n, 1000n, 3);
    assert.deepEqual((await relay.tick()).skipped, [{ id: '7', reason: 'vault_position_not_open' }]);
    assert.deepEqual((await relay.tick()).skipped, [{ id: '7', reason: 'backoff' }]);
    now.ms += 3_600_000;
    openVault(evm, 7n, 1000n, VAULT_STATUS_OPEN, '0x0000000000000000000000000000000000000001');
    assert.deepEqual((await relay.tick()).skipped, [{ id: '7', reason: 'signer_not_vault_authority' }]);
    now.ms = Number(S7.expires) * 1000 + 7_200_000;
    openVault(evm, 7n);
    assert.deepEqual((await relay.tick()).skipped, [{ id: '7', reason: 'signature_expired' }]);
    assert.equal(evm.signed.length, 0);
    assert.equal(near.calls.length, 0);
  });
  it('a tampered view (field != signed digest), a foreign vault or chain, a bad v is refused before any signing', async () => {
    for (const over of [{ repayE6: '1250000001' }, { verifyingContract: '0x0000000000000000000000000000000000000002' }, { chainId: 8453 }, { v: 1 }]) {
      const { relay, near, evm } = setup();
      near.positions.push(basePosition('7', 'Settling'));
      near.settlements.set('7', settleView(S7, over));
      openVault(evm, 7n);
      const r = await relay.tick();
      assert.equal(r.failed.length, 1, JSON.stringify(over));
      assert.equal(evm.signed.length, 0);
      assert.equal(near.calls.length, 0);
    }
  });
  it('a reverted tx clears the stored hash and backs off', async () => {
    const { relay, near, evm, db } = setup();
    near.positions.push(basePosition('7', 'Settling'));
    near.settlements.set('7', settleView(S7));
    openVault(evm, 7n);
    evm.nextReceipt = 'reverted';
    const r = await relay.tick();
    assert.match(r.failed[0]?.error ?? '', /reverted/);
    assert.equal(db.evmTx('base:settle:7:1'), null);
    assert.equal(near.calls.length, 0);
  });
  it('release: release calldata, then relay_release_result with the 0x hash', async () => {
    const { relay, near, evm } = setup();
    const recipient = getAddress(R7.recipient as string);
    near.positions.push(basePosition('7', 'Releasing', { committed_depositor: recipient }));
    near.releases.set('7', releaseView(R7));
    openVault(evm, 7n, 1000n, VAULT_STATUS_OPEN, SIGNER, recipient);
    const r = await relay.tick();
    assert.deepEqual(r.released, ['7'], JSON.stringify(r));
    assert.equal(evm.signed[0]?.data, CALLDATA.release.pos7);
    assert.deepEqual(near.calls, [{ method: 'relay_release_result', args: { position_id: '7', solana_tx_sig: evm.signed[0]?.hash } }]);
  });
  it('only base-sepolia positions: Solana / NEAR-held positions are never looked at', async () => {
    const { relay, near, evm } = setup();
    near.positions.push({ position_id: '1', status: 'Settling', collateral: 'NVDAx', units: '1', remote: { chain_id: 'solana-devnet', status: 'Settling' } });
    near.positions.push({ position_id: '2', status: 'Settling', collateral: 'NVDAx', units: '1' });
    assert.equal(isBasePosition({ remote: { chain_id: 'base-sepolia' } }), true);
    assert.equal(isBasePosition({}), false);
    const r = await relay.tick();
    assert.deepEqual(r, { settled: [], released: [], deposits: [], skipped: [], failed: [] });
    assert.deepEqual(near.views.map((v) => v.method), ['list_positions']);
    assert.equal(evm.signed.length, 0);
  });
  it('deposit watcher (OutLayer read on): confirm_remote_deposit once amount >= reserved and authority matches; then cooldown', async () => {
    const { relay, near, evm } = setup({ outlayerVaultRead: true });
    near.positions.push(basePosition('8', 'AwaitingDeposit'));
    await relay.tick(); // vault position not opened yet
    assert.equal(near.calls.length, 0);
    openVault(evm, 8n, 999n);
    assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason: 'deposit_below_reserved' }]);
    openVault(evm, 8n, 1000n, VAULT_STATUS_OPEN, '0x0000000000000000000000000000000000000001');
    assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason: 'authority_mismatch' }]);
    openVault(evm, 8n, 1000n);
    assert.deepEqual((await relay.tick()).deposits, ['8']);
    assert.deepEqual(near.calls, [{ method: 'confirm_remote_deposit', args: { position_id: '8' } }]);
    await relay.tick();
    assert.equal(near.calls.length, 1);
  });
  it('SR-8: a squatter slot under another depositor is invisible to the deposit watcher', async () => {
    const { relay, near, evm } = setup({ outlayerVaultRead: true });
    near.positions.push(basePosition('8', 'AwaitingDeposit'));
    openVault(evm, 8n, 1000n, VAULT_STATUS_OPEN, SIGNER, '0x0000000000000000000000000000000000000BAD');
    assert.deepEqual(await relay.tick(), { settled: [], released: [], deposits: [], skipped: [], failed: [] });
    assert.equal(near.calls.length, 0);
  });
  it('SR-28: without attestation or an OutLayer read, a deposit is reported unsupported and never confirmed', async () => {
    const lines: string[] = [];
    const near = new FakeNear();
    const evm = new FakeEvm();
    const now = { ms: NOW };
    const relay = new BaseRelay(near, near, evm, new KeeperDb(':memory:'), createLogger('test', (l) => lines.push(l)), { pageSize: 50, nowMs: () => now.ms, rand: () => 0.5, sleep: async () => {}, expectedVault: VAULT });
    assert.equal(relay.status.depositConfirm, 'unsupported');
    near.positions.push(basePosition('8', 'AwaitingDeposit'));
    openVault(evm, 8n, 1000n);
    assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason: 'deposit_confirm_unsupported' }]);
    assert.equal(near.calls.length, 0);
    assert.equal(lines.filter((l) => l.includes('base_deposit_confirm_unsupported')).length, 1);
    assert.match(lines.find((l) => l.includes('base_deposit_confirm_unsupported')) ?? '', /BASE_KEEPER_ATTEST=1/);
    now.ms += 60_000; // no loop: the next report is an hour away
    assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason: 'backoff' }]);
    assert.equal(lines.filter((l) => l.includes('base_deposit_confirm_unsupported')).length, 1);
    assert.equal(near.calls.length, 0);
  });
  it('SR-11: an unchanged deposit is confirmed a bounded number of times; a changed amount re-arms it', async () => {
    const { relay, near, evm, now } = setup({ outlayerVaultRead: true });
    near.positions.push(basePosition('8', 'AwaitingDeposit'));
    openVault(evm, 8n, 1000n);
    for (let i = 0; i < 3; i++) {
      assert.deepEqual((await relay.tick()).deposits, ['8']);
      now.ms += 3_600_000;
    }
    assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason: 'confirm_rejected_unchanged' }]);
    assert.equal(near.calls.length, 3);
    openVault(evm, 8n, 1001n);
    assert.deepEqual((await relay.tick()).deposits, ['8']);
    assert.equal(near.calls.length, 4);
  });
  it('a check in flight, a proven deposit or an expired reservation is not confirmed', async () => {
    for (const [extra, reason] of [[{ confirming: true }, 'confirm_in_flight'], [{ depositor: DEPOSITOR }, 'deposit_already_proven'], [{ expires_ns: String(BigInt(NOW) * 1_000_000n) }, 'reservation_expired']] as const) {
      const { relay, near, evm } = setup({ outlayerVaultRead: true });
      near.positions.push(basePosition('8', 'AwaitingDeposit', extra));
      openVault(evm, 8n, 1000n);
      assert.deepEqual((await relay.tick()).skipped, [{ id: '8', reason }]);
      assert.equal(near.calls.length, 0);
    }
  });
  it('SR-29: a used nonce scans logs from the reservation block, however long the keeper was down', async () => {
    const { relay, near, evm } = setup();
    const reservedS = 1_690_000_000n; // far outside any fixed lookback
    near.positions.push(basePosition('7', 'Settling', { reserved_ns: String(reservedS * 1_000_000_000n) }));
    near.settlements.set('7', settleView(S7));
    evm.usedNonces.add(`${slotKeyOf(7n, DEPOSITOR)}:1`);
    const h = `0x${'55'.repeat(32)}` as Hex;
    evm.events.set('PositionSettled:7:1', h);
    assert.deepEqual((await relay.tick()).settled, ['7']);
    assert.deepEqual(evm.floorAsked, [reservedS - 300n]);
    assert.equal(evm.queries[0]?.q.fromBlock, 42n);
    assert.equal(near.calls[0]?.args.solana_tx_sig, h);
  });
  it('SR-29: a used nonce with no log yet is retried after backoff, not dropped', async () => {
    const { relay, near, evm, now } = setup();
    near.positions.push(basePosition('7', 'Settling', { reserved_ns: '1690000000000000000' }));
    near.settlements.set('7', settleView(S7));
    evm.usedNonces.add(`${slotKeyOf(7n, DEPOSITOR)}:1`);
    assert.deepEqual((await relay.tick()).skipped, [{ id: '7', reason: 'nonce_used_tx_not_found' }]);
    evm.events.set('PositionSettled:7:1', `0x${'66'.repeat(32)}`);
    now.ms += 3_600_000;
    assert.deepEqual((await relay.tick()).settled, ['7']);
  });
  it('SR-1: a nonce burned on another slot does not count as landed', async () => {
    const { relay, near, evm } = setup();
    near.positions.push(basePosition('7', 'Settling'));
    near.settlements.set('7', settleView(S7));
    openVault(evm, 7n);
    evm.usedNonces.add(`${slotKeyOf(7n, getAddress('0x0000000000000000000000000000000000000bad'))}:1`);
    assert.deepEqual((await relay.tick()).settled, ['7']);
    assert.equal(evm.signed.length, 1);
  });
  it('a landed-leg lookup is bound to the committed depositor', async () => {
    const { relay, near, evm } = setup();
    near.positions.push(basePosition('7', 'Settling'));
    near.settlements.set('7', settleView(S7));
    evm.usedNonces.add(`${slotKeyOf(7n, DEPOSITOR)}:1`);
    evm.events.set('PositionSettled:7:1', `0x${'77'.repeat(32)}`);
    assert.deepEqual((await relay.tick()).settled, ['7']);
    assert.equal(evm.queries[0]?.q.depositor, DEPOSITOR);
  });
  it('SR-31: a position naming a vault other than the pinned one is refused before any signing', async () => {
    const { relay, near, evm } = setup();
    const other = '0x0000000000000000000000000000000000000BAD';
    near.positions.push(basePosition('7', 'Settling', { vault_program: other }));
    near.settlements.set('7', settleView(S7, { verifyingContract: other }));
    openVault(evm, 7n);
    const r = await relay.tick();
    assert.match(r.failed[0]?.error ?? '', /pinned Base vault/);
    assert.equal(evm.signed.length, 0);
    assert.equal(near.calls.length, 0);
  });
  it('a missing committed depositor is read from get_position; none at all skips', async () => {
    const { relay, near, evm } = setup();
    near.positions.push(basePosition('7', 'Settling', { committed_depositor: undefined }));
    near.settlements.set('7', settleView(S7));
    openVault(evm, 7n);
    near.committed = DEPOSITOR;
    assert.deepEqual((await relay.tick()).settled, ['7']);
    const second = setup();
    second.near.positions.push(basePosition('7', 'Settling', { committed_depositor: undefined }));
    second.near.settlements.set('7', settleView(S7));
    assert.deepEqual((await second.relay.tick()).skipped, [{ id: '7', reason: 'depositor_unknown' }]);
  });
  it('BASE_KEEPER_ATTEST=1: keeper_attest_deposit(position_id, tx_ref, depositor) instead', async () => {
    const { relay, near, evm } = setup({ keeperAttest: true });
    near.positions.push(basePosition('9', 'AwaitingDeposit'));
    openVault(evm, 9n, 1000n);
    const opened = `0x${'44'.repeat(32)}` as Hex;
    evm.events.set('PositionOpened:9:', opened);
    assert.deepEqual((await relay.tick()).deposits, ['9']);
    assert.deepEqual(near.calls, [{ method: 'keeper_attest_deposit', args: { position_id: '9', tx_ref: opened, depositor: DEPOSITOR } }]);
    assert.equal(evm.queries[0]?.q.depositor, DEPOSITOR);
    assert.equal(relay.status.attestMode, true);
    assert.equal(relay.status.depositConfirm, 'keeper_attest');
  });
  it('/healthz carries the base section', () => {
    const { relay } = setup();
    const s = { lastBlockSeen: 1, lastTickAt: NOW, lastTickOk: true, consecutiveErrors: 0, lastError: null, allowance: { kind: 'unlimited' as const }, openPositions: 0, pendingSettlements: 0, triggersSent: 0, startedAt: NOW };
    const b = healthBody(s, 10_000, NOW, null, relay.status);
    assert.equal(b.base?.signer, '0x000000000000000000000000000000000000bEEF');
    assert.equal(b.base?.builder_suffix, 'none');
    assert.equal(healthBody(s, 10_000, NOW).base, null);
  });
});

// ------------------------------------------------------------------ the real viem port against a local JSON-RPC stub

describe('base: ViemEvmPort against a local JSON-RPC stub', () => {
  const OTHER: Address = getAddress('0x0000000000000000000000000000000000000bad');
  const account = privateKeyToAccount(toHex(Uint8Array.from(randomBytes(32))));
  const S7 = VECTORS.settle.preliq_pos7 as Vec;
  const honest = `0x${'aa'.repeat(32)}` as Hex;
  const squatter = `0x${'bb'.repeat(32)}` as Hex;

  async function withRpc(answer: (method: string, params: unknown[]) => unknown, run: (port: ViemEvmPort) => Promise<void>, opts: { logChunkBlocks?: number; lookbackBlocks?: number } = {}): Promise<void> {
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
      await run(new ViemEvmPort(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, account, opts));
    } finally {
      server.close();
    }
  }
  const settledLog = (hash: Hex, block: number) => ({
    address: VAULT, blockHash: `0x${'cc'.repeat(32)}`, blockNumber: toHex(block), logIndex: '0x0', removed: false, transactionHash: hash, transactionIndex: '0x0',
    topics: encodeEventTopics({ abi: VAULT_ABI, eventName: 'PositionSettled', args: { positionId: 7n, quoteId: 12n, recipient: SIGNER } }),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint64' }, { type: 'uint8' }], [1n, 1n, 0n, 1n, 1]),
  });
  const txOf = (hash: Hex, depositor: Address) => ({
    hash, blockHash: `0x${'cc'.repeat(32)}`, blockNumber: '0x5', transactionIndex: '0x0', from: SIGNER, to: VAULT, value: '0x0', gas: '0x5208', gasPrice: '0x1', nonce: '0x0', type: '0x0',
    input: settleCalldata(settleStructOf(settleView(S7)), depositor, sigOf(S7)), v: '0x1b', r: S7.r, s: S7.s,
  });

  it('findEventTx: a newer event from a squatter slot with the same (id, nonce) is passed over', async () => {
    await withRpc((m, params) => {
      if (m === 'eth_blockNumber') return '0x64';
      if (m === 'eth_getLogs') return [settledLog(honest, 5), settledLog(squatter, 6)];
      if (m === 'eth_getTransactionByHash') return params[0] === honest ? txOf(honest, DEPOSITOR) : txOf(squatter, OTHER);
      throw new Error(`unexpected ${m}`);
    }, async (port) => {
      assert.equal(await port.findEventTx(VAULT, 'PositionSettled', { positionId: 7n, nonce: 1n, depositor: DEPOSITOR, fromBlock: 0n }), honest);
      assert.equal(await port.findEventTx(VAULT, 'PositionSettled', { positionId: 7n, nonce: 1n, depositor: SIGNER, fromBlock: 0n }), null);
    });
  });
  it('findEventTx: scans from the given block through every chunk, beyond the lookback window', async () => {
    const ranges: Array<[string, string]> = [];
    await withRpc((m, params) => {
      if (m === 'eth_blockNumber') return toHex(1000);
      if (m === 'eth_getLogs') {
        const f = params[0] as { fromBlock: string; toBlock: string };
        ranges.push([f.fromBlock, f.toBlock]);
        return [];
      }
      throw new Error(`unexpected ${m}`);
    }, async (port) => {
      assert.equal(await port.findEventTx(VAULT, 'PositionSettled', { positionId: 7n, nonce: 1n, depositor: null, fromBlock: 100n }), null);
    }, { lookbackBlocks: 10, logChunkBlocks: 200 });
    assert.equal(ranges.length, 5);
    assert.deepEqual(ranges[0], [toHex(801), toHex(1000)]);
    assert.deepEqual(ranges[4], [toHex(100), toHex(200)]);
  });
  it('blockAtOrBefore: binary search over block timestamps', async () => {
    const block = (n: number) => ({
      number: toHex(n), hash: `0x${'dd'.repeat(32)}`, parentHash: `0x${'ee'.repeat(32)}`, timestamp: toHex(1000 + n * 2), nonce: '0x0000000000000000', logsBloom: `0x${'00'.repeat(256)}`, miner: SIGNER,
      difficulty: '0x0', gasLimit: '0x1', gasUsed: '0x0', extraData: '0x', size: '0x1', stateRoot: `0x${'00'.repeat(32)}`, receiptsRoot: `0x${'00'.repeat(32)}`, transactionsRoot: `0x${'00'.repeat(32)}`, sha3Uncles: `0x${'00'.repeat(32)}`, mixHash: `0x${'00'.repeat(32)}`, transactions: [], uncles: [],
    });
    await withRpc((m, params) => {
      if (m === 'eth_blockNumber') return toHex(5000);
      if (m === 'eth_getBlockByNumber') return block(Number(params[0]));
      throw new Error(`unexpected ${m}`);
    }, async (port) => {
      assert.equal(await port.blockAtOrBefore(1000n + 2n * 1234n), 1234n);
      assert.equal(await port.blockAtOrBefore(1000n + 2n * 1234n + 1n), 1234n);
      assert.equal(await port.blockAtOrBefore(999_999n), 5000n);
    });
  });
});
