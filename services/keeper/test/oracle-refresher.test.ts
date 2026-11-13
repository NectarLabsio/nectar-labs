// Owner-price refresher (WO-63): mocked RPC only — no network, no transaction. Throwaway keys are generated per run, never funded.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { KeyPair } from 'near-api-js';
import { createLogger } from '../src/log.ts';
import { TESTNET_RPC_FALLBACKS } from '../src/near-rpc.ts';
import {
  NearRefresherChain, OwnerPriceRefresher, REFRESH_DEPOSIT, REFRESH_GAS, createOracleRefresher, decide, keyState, loadOrGenerateKey,
  loadRefresherConfig, parseExitCapacity, refreshCall,
  type Clock, type ExitCapacity, type KeyPermission, type RefreshTx, type RefresherChain, type RefresherConfig,
} from '../src/oracle-refresher.ts';

const here = dirname(fileURLToPath(import.meta.url));
const MAIN = resolve(here, '../src/oracle-refresher-main.ts');
const REPO_CONFIG = resolve(here, '../../../packages/config/config.yaml');
const OWNER = 'owner.example.testnet';
const CORE = 'core.example.testnet';
const dir = mkdtempSync(join(tmpdir(), 'oracle-refresher-'));
after(() => rmSync(dir, { recursive: true, force: true }));

function file(name: string, body: string, mode = 0o600): string {
  const p = join(dir, name);
  writeFileSync(p, body);
  chmodSync(p, mode);
  return p;
}

const yaml = (runUntil = '2026-11-18T23:59:00Z'): string => `accounts:
  owner: ${OWNER}
  core: ${CORE}
collateral:
  nvdax:
    symbol: NVDAx
ops:
  oracle_refresher:
    run_until: "${runUntil}"
    tick_s: 60
    session_max_age_s: 600
    closed_max_age_s: 43200
    allowance_near: "0.5"
`;
const CONFIG = file('config.yaml', yaml());

function keyFile(name: string, accountId: string | null, kp = KeyPair.fromRandom('ed25519')): string {
  const o: Record<string, string> = { public_key: kp.getPublicKey().toString(), private_key: kp.toString() };
  if (accountId !== null) o.account_id = accountId;
  return file(name, JSON.stringify(o));
}

const T0 = Date.parse('2026-11-16T15:00:00Z');
function cfg(over: Partial<RefresherConfig> = {}): RefresherConfig {
  return { ...loadRefresherConfig({ NECTAR_CONFIG_PATH: CONFIG, ORACLE_REFRESHER_KEY_PATH: join(dir, 'unused.json') }), ...over };
}

function capture(): { lines: string[]; json: () => Array<Record<string, unknown>>; log: ReturnType<typeof createLogger> } {
  const lines: string[] = [];
  return { lines, json: () => lines.map((l) => JSON.parse(l) as Record<string, unknown>), log: createLogger('oracle-refresher', (l) => lines.push(l)) };
}

const READY: KeyPermission = { FunctionCall: { allowance: '500000000000000000000000', receiver_id: CORE, method_names: ['update_owner_price'] } };

function ec(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    q_usd_e6: '0', session_open: false, session_reason: 'outside_hours', oracle_source: 'Owner',
    oracle_price_usd_e6: '135000000', oracle_age_s: '100', oracle_fresh: true, ...over,
  };
}

class FakeChain implements RefresherChain {
  perm: KeyPermission | null = READY;
  view: unknown = ec();
  viewError: Error | null = null;
  tx: Omit<RefreshTx, 'txHash'> = { ok: true, failure: null, returned: true };
  keyChecks = 0;
  views: string[] = [];
  updates: Array<{ symbol: string; price: string }> = [];
  async accessKey(accountId: string, publicKey: string): Promise<KeyPermission | null> {
    assert.equal(accountId, OWNER);
    assert.match(publicKey, /^ed25519:/);
    this.keyChecks++;
    return this.perm;
  }
  async exitCapacity(symbol: string): Promise<unknown> {
    this.views.push(symbol);
    if (this.viewError !== null) throw this.viewError;
    return this.view;
  }
  async updateOwnerPrice(symbol: string, price: string): Promise<RefreshTx> {
    this.updates.push({ symbol, price });
    return { txHash: `TX${this.updates.length}`, ...this.tx };
  }
  rpc(): string | null {
    return 'test.rpc.fastnear.com';
  }
}

const KEY = { accountId: OWNER, publicKey: KeyPair.fromRandom('ed25519').getPublicKey().toString() };

function fakeClock(start = T0): Clock & { t: number; sleeps: number[] } {
  const c = {
    t: start,
    sleeps: [] as number[],
    now: () => c.t,
    sleep: async (ms: number) => {
      c.sleeps.push(ms);
      c.t += ms;
    },
    random: () => 0.5,
  };
  return c;
}

function refresher(chain: RefresherChain, over: Partial<RefresherConfig> = {}, clock = fakeClock()): { r: OwnerPriceRefresher; cap: ReturnType<typeof capture> } {
  const cap = capture();
  return { r: new OwnerPriceRefresher(cfg(over), KEY, chain, cap.log, clock), cap };
}

describe('oracle refresher config', () => {
  it('reads accounts.owner/core and ops.oracle_refresher from config.yaml, and the near-rpc.ts fallback list', () => {
    const c = cfg();
    assert.equal(c.ownerAccountId, OWNER);
    assert.equal(c.coreAccountId, CORE);
    assert.equal(c.symbol, 'NVDAx');
    assert.deepEqual([c.tickMs, c.sessionMaxAgeS, c.closedMaxAgeS], [60_000, 600, 43_200]);
    assert.equal(c.runUntilMs, Date.parse('2026-11-18T23:59:00Z'));
    assert.deepEqual(c.rpcUrls, [...TESTNET_RPC_FALLBACKS]);
    assert.equal(c.generate, false);
  });
  it('parses the real packages/config/config.yaml (owner nectar.testnet, core nectar-core-v2)', () => {
    const c = loadRefresherConfig({ NECTAR_CONFIG_PATH: REPO_CONFIG, ORACLE_REFRESHER_KEY_PATH: '/x.json' });
    assert.equal(c.ownerAccountId, 'nectar.testnet');
    assert.equal(c.coreAccountId, 'nectar-core-v2.nectar.testnet');
    assert.deepEqual([c.tickMs, c.sessionMaxAgeS, c.closedMaxAgeS], [15_000, 60, 21_600]);
  });
  it('refuses a missing key path, bad GENERATE, a zoneless run_until or a session threshold ≥ 900 s', () => {
    assert.throws(() => loadRefresherConfig({ NECTAR_CONFIG_PATH: CONFIG }), /ORACLE_REFRESHER_KEY_PATH is unset/);
    assert.throws(() => loadRefresherConfig({ NECTAR_CONFIG_PATH: CONFIG, ORACLE_REFRESHER_KEY_PATH: '/x', ORACLE_REFRESHER_GENERATE: 'yes' }), /GENERATE/);
    const zoneless = file('zoneless.yaml', yaml('2026-11-18T23:59:00'));
    assert.throws(() => loadRefresherConfig({ NECTAR_CONFIG_PATH: zoneless, ORACLE_REFRESHER_KEY_PATH: '/x' }), /run_until/);
    const slow = file('slow.yaml', yaml().replace('session_max_age_s: 600', 'session_max_age_s: 900'));
    assert.throws(() => loadRefresherConfig({ NECTAR_CONFIG_PATH: slow, ORACLE_REFRESHER_KEY_PATH: '/x' }), /session_max_age_s/);
  });
});

describe('oracle refresher decision branches', () => {
  const p = parseExitCapacity;
  const c = { sessionMaxAgeS: 600, closedMaxAgeS: 43_200 };
  const d = (over: Record<string, unknown>): ReturnType<typeof decide> => decide(p(ec(over)), c);
  it('session open: fresh below 600 s, refresh at 600 s', () => {
    assert.deepEqual(d({ session_open: true, session_reason: 'open', oracle_age_s: '599' }), { action: 'fresh', inSession: true, thresholdS: 600 });
    assert.deepEqual(d({ session_open: true, session_reason: 'open', oracle_age_s: '600' }), { action: 'refresh', inSession: true, thresholdS: 600 });
  });
  it('stale_price counts as in-session (refresh at ≥ 600 s although session_open is false)', () => {
    assert.deepEqual(d({ session_open: false, session_reason: 'stale_price', oracle_age_s: '901' }), { action: 'refresh', inSession: true, thresholdS: 600 });
  });
  it('closed (outside_hours, no_calendar, forced_closed): fresh below 43,200 s, refresh at 43,200 s', () => {
    for (const reason of ['outside_hours', 'no_calendar', 'forced_closed']) {
      assert.deepEqual(d({ session_reason: reason, oracle_age_s: '43199' }), { action: 'fresh', inSession: false, thresholdS: 43_200 }, reason);
      assert.deepEqual(d({ session_reason: reason, oracle_age_s: '43200' }), { action: 'refresh', inSession: false, thresholdS: 43_200 }, reason);
    }
  });
  it('skips when the source is Pyth (enum object) and when there is no price yet', () => {
    const pyth = { Pyth: { account: 'pyth-oracle.testnet', price_identifier: 'ab'.repeat(32) } };
    assert.equal(d({ oracle_source: pyth, oracle_age_s: '999999' }).action, 'skip_not_owner');
    assert.equal(p(ec({ oracle_source: pyth })).oracleSource, 'Pyth');
    assert.equal(d({ oracle_price_usd_e6: '0', oracle_age_s: '999999' }).action, 'skip_no_price');
  });
  it('rejects malformed views (number price, missing session fields)', () => {
    assert.throws(() => p(ec({ oracle_price_usd_e6: 135000000 })), /U128/);
    assert.throws(() => p(ec({ session_open: undefined })), /session_open/);
    assert.throws(() => p(null), /no object/);
  });
});

describe('oracle refresher tick', () => {
  it('re-asserts exactly the on-chain price (verbatim U128 string, also above 2^53) and logs decision, age, tx hash, rpc', async () => {
    const chain = new FakeChain();
    const price = '9007199254740993';
    chain.view = ec({ oracle_price_usd_e6: price, oracle_age_s: '43200' });
    const { r, cap } = refresher(chain);
    assert.equal(await r.tick(), 'refreshed');
    assert.deepEqual(chain.updates, [{ symbol: 'NVDAx', price }]);
    const line = cap.json().at(-1) ?? {};
    assert.equal(line.event, 'refreshed');
    assert.equal(line.decision, 'refreshed');
    assert.equal(line.price_usd_e6, price);
    assert.equal(line.age_s, 43200);
    assert.equal(line.tx_hash, 'TX1');
    assert.equal(line.rpc, 'test.rpc.fastnear.com');
    assert.equal(line.allowance_yocto, '500000000000000000000000');
  });
  it('fresh price: one view, no transaction', async () => {
    const chain = new FakeChain();
    const { r, cap } = refresher(chain);
    assert.equal(await r.tick(), 'fresh');
    assert.equal(chain.updates.length, 0);
    assert.equal(cap.json().at(-1)?.decision, 'fresh');
  });
  it('skips when oracle_source is Pyth, however old the price', async () => {
    const chain = new FakeChain();
    chain.view = ec({ oracle_source: { Pyth: { account: 'pyth-oracle.testnet', price_identifier: 'ab'.repeat(32) } }, oracle_age_s: '200000' });
    const { r, cap } = refresher(chain);
    assert.equal(await r.tick(), 'skip_not_owner');
    assert.equal(chain.updates.length, 0);
    assert.equal(cap.json().at(-1)?.oracle_source, 'Pyth');
  });
  it('a failed or rejected tx is an error (backoff), never a retry with another price', async () => {
    const chain = new FakeChain();
    chain.view = ec({ oracle_age_s: '50000' });
    chain.tx = { ok: true, failure: null, returned: false };
    const { r, cap } = refresher(chain);
    assert.equal(await r.tick(), 'error');
    assert.match(String(cap.json().at(-1)?.error), /oracle_rejected/);
    chain.tx = { ok: false, failure: '{"Failure":{"ActionError":{}}}', returned: undefined };
    assert.equal(await r.tick(), 'error');
    assert.deepEqual(chain.updates.map((u) => u.price), ['135000000', '135000000']);
  });
  it('RPC errors back off exponentially and reset after a good tick', async () => {
    const chain = new FakeChain();
    chain.viewError = new Error('fetch failed');
    const { r } = refresher(chain);
    assert.equal(r.nextDelayMs(), 60_000);
    await r.tick();
    const d1 = r.nextDelayMs();
    await r.tick();
    const d2 = r.nextDelayMs();
    assert.ok(d1 >= 60_000 && d2 > d1, `${d1} ${d2}`);
    for (let i = 0; i < 10; i++) await r.tick();
    assert.ok(r.nextDelayMs() <= 300_000);
    chain.viewError = null;
    await r.tick();
    assert.equal(r.nextDelayMs(), 60_000);
  });
});

describe('oracle refresher key permission (amendment)', () => {
  it('waits (no view, no tx) while the access key does not exist, then proceeds', async () => {
    const chain = new FakeChain();
    chain.perm = null;
    chain.view = ec({ oracle_age_s: '50000' });
    const { r, cap } = refresher(chain);
    assert.equal(await r.tick(), 'waiting_for_key');
    assert.equal(await r.tick(), 'waiting_for_key');
    assert.deepEqual([chain.views.length, chain.updates.length, r.nextDelayMs()], [0, 0, 60_000]);
    const w = cap.json().at(-1) ?? {};
    assert.equal(w.event, 'waiting_for_key');
    assert.equal(w.public_key, KEY.publicKey);
    chain.perm = READY;
    assert.equal(await r.tick(), 'refreshed');
  });
  it('refuses FullAccess, another method, extra methods, all methods and another receiver — logs and skips, never throws', async () => {
    const fc = (receiver_id: string, method_names: string[]): KeyPermission => ({ FunctionCall: { allowance: null, receiver_id, method_names } });
    const bad: KeyPermission[] = [
      'FullAccess', fc(CORE, ['set_oracle_params']), fc(CORE, ['update_owner_price', 'propose_price']), fc(CORE, []),
      fc('nectar-core.nectar.testnet', ['update_owner_price']),
    ];
    for (const perm of bad) {
      const chain = new FakeChain();
      chain.perm = perm;
      chain.view = ec({ oracle_age_s: '50000' });
      const { r, cap } = refresher(chain);
      assert.equal(await r.tick(), 'key_refused', JSON.stringify(perm));
      assert.deepEqual([chain.views.length, chain.updates.length, r.consecutiveErrors], [0, 0, 0]);
      const line = cap.json().at(-1) ?? {};
      assert.equal(line.event, 'key_refused');
      assert.equal(line.level, 'warn');
    }
    assert.match(keyState('FullAccess', CORE).kind === 'refused' ? (keyState('FullAccess', CORE) as { reason: string }).reason : '', /FullAccess/);
    assert.deepEqual(keyState(READY, CORE), { kind: 'ready', allowance: '500000000000000000000000' });
    assert.deepEqual(keyState({ FunctionCall: { receiver_id: CORE, method_names: ['update_owner_price'] } }, CORE), { kind: 'ready', allowance: 'unlimited' });
  });
  it('a refused key keeps the loop alive until run_until (no crash loop)', async () => {
    const chain = new FakeChain();
    chain.perm = 'FullAccess';
    const clock = fakeClock(Date.parse('2026-11-18T23:55:00Z'));
    const { r } = refresher(chain, {}, clock);
    assert.equal(await r.run(new AbortController().signal), 'run_until');
    assert.equal(chain.keyChecks, 4);
    assert.equal(chain.updates.length, 0);
  });
});

describe('oracle refresher run_until', () => {
  it('ticks every tick_s and stops cleanly at run_until (last sleep clipped to run_until)', async () => {
    const chain = new FakeChain();
    const clock = fakeClock(Date.parse('2026-11-18T23:57:30Z'));
    const { r, cap } = refresher(chain, {}, clock);
    assert.equal(await r.run(new AbortController().signal), 'run_until');
    // ticks at 23:57:30 and 23:58:30; the second sleep is clipped to 30 s; no tick at 23:59:00
    assert.equal(chain.views.length, 2);
    assert.deepEqual(clock.sleeps, [60_000, 30_000]);
    assert.equal(clock.t, Date.parse('2026-11-18T23:59:00Z'));
    const last = cap.json().at(-1) ?? {};
    assert.deepEqual([last.event, last.reason], ['stopped', 'run_until']);
  });
  it('past run_until: no tick at all; createOracleRefresher returns stopped before touching the key', async () => {
    const chain = new FakeChain();
    const { r } = refresher(chain, {}, fakeClock(Date.parse('2026-11-19T00:00:00Z')));
    assert.equal(await r.run(new AbortController().signal), 'run_until');
    assert.equal(chain.keyChecks, 0);
    const keyPath = join(dir, 'never-created.json');
    const res = createOracleRefresher({ NECTAR_CONFIG_PATH: CONFIG, ORACLE_REFRESHER_KEY_PATH: keyPath, ORACLE_REFRESHER_GENERATE: '1' }, capture().log, fakeClock(Date.parse('2026-11-19T00:00:00Z')));
    assert.ok('stopped' in res);
    assert.equal(existsSync(keyPath), false);
  });
  it('an abort signal ends the loop', async () => {
    const ac = new AbortController();
    ac.abort();
    const { r } = refresher(new FakeChain());
    assert.equal(await r.run(ac.signal), 'aborted');
  });
});

describe('oracle refresher transaction (no deposit, 30 Tgas, update_owner_price only)', () => {
  it('refreshCall is the only call shape: deposit 0, gas 30 Tgas, core, exact args', () => {
    assert.equal(REFRESH_DEPOSIT, 0n);
    assert.equal(REFRESH_GAS, 30_000_000_000_000n);
    assert.deepEqual(refreshCall(CORE, 'NVDAx', '135000000'), {
      contractId: CORE, methodName: 'update_owner_price', args: { symbol: 'NVDAx', price_usd_e6: '135000000' },
      deposit: 0n, gas: 30_000_000_000_000n, waitUntil: 'EXECUTED_OPTIMISTIC',
    });
  });
  it('NearRefresherChain sends exactly that through the signer (mocked RPC) and decodes the bool result', async () => {
    const sent: unknown[] = [];
    const outcome = (status: unknown): unknown => ({ status, transaction_outcome: { id: 'HASH1' }, receipts_outcome: [{ outcome: { status: { SuccessValue: '' } } }] });
    let status: unknown = { SuccessValue: Buffer.from('true').toString('base64') };
    const caller = { callFunctionRaw: async (p: unknown) => (sent.push(p), outcome(status)) } as unknown as ConstructorParameters<typeof NearRefresherChain>[1];
    const viewArgs: unknown[] = [];
    const provider = {
      callFunctionRaw: async (p: unknown) => (viewArgs.push(p), { result: [...Buffer.from(JSON.stringify(ec()))], block_height: 1 }),
      viewAccessKey: async () => ({ permission: READY }),
    } as unknown as ConstructorParameters<typeof NearRefresherChain>[0];
    const chain = new NearRefresherChain(provider, caller, CORE, () => 'rpc.testnet.fastnear.com');
    assert.deepEqual(await chain.updateOwnerPrice('NVDAx', '135000000'), { txHash: 'HASH1', ok: true, failure: null, returned: true });
    assert.deepEqual(sent, [refreshCall(CORE, 'NVDAx', '135000000')]);
    assert.equal((sent[0] as { deposit: bigint }).deposit, 0n);
    status = { Failure: { ActionError: { kind: 'x' } } };
    const failed = await chain.updateOwnerPrice('NVDAx', '135000000');
    assert.equal(failed.ok, false);
    assert.deepEqual(parseExitCapacity(await chain.exitCapacity('NVDAx')), parseExitCapacity(ec()) satisfies ExitCapacity);
    assert.deepEqual(viewArgs, [{ contractId: CORE, method: 'get_exit_capacity', args: { symbol: 'NVDAx' }, blockQuery: { finality: 'final' } }]);
    assert.deepEqual(await chain.accessKey(OWNER, KEY.publicKey), READY);
    assert.equal(chain.rpc(), 'rpc.testnet.fastnear.com');
  });
  it('accessKey maps AccessKeyDoesNotExistError to null and rethrows anything else', async () => {
    const { AccessKeyDoesNotExistError } = await import('near-api-js/rpc-errors');
    let err: Error = new AccessKeyDoesNotExistError(KeyPair.fromRandom('ed25519').getPublicKey(), 'h', 1);
    const provider = { viewAccessKey: async () => { throw err; } } as unknown as ConstructorParameters<typeof NearRefresherChain>[0];
    const chain = new NearRefresherChain(provider, {} as ConstructorParameters<typeof NearRefresherChain>[1], CORE);
    assert.equal(await chain.accessKey(OWNER, KEY.publicKey), null);
    err = new Error('fetch failed');
    await assert.rejects(chain.accessKey(OWNER, KEY.publicKey), /fetch failed/);
  });
});

describe('oracle refresher key file', () => {
  it('refuses a key whose account_id is not config accounts.owner, a key without account_id, and a public/private mismatch', () => {
    const base = { ownerAccountId: OWNER, generate: false };
    assert.throws(() => loadOrGenerateKey({ ...base, keyPath: keyFile('other.json', 'keeper-v2.nectar.testnet') }, capture().log), /account_id keeper-v2\.nectar\.testnet != config accounts\.owner/);
    assert.throws(() => loadOrGenerateKey({ ...base, keyPath: keyFile('noacct.json', null) }, capture().log), /no account_id/);
    const a = KeyPair.fromRandom('ed25519');
    const b = KeyPair.fromRandom('ed25519');
    const mixed = file('mixed.json', JSON.stringify({ account_id: OWNER, public_key: b.getPublicKey().toString(), private_key: a.toString() }));
    assert.throws(() => loadOrGenerateKey({ ...base, keyPath: mixed }, capture().log), /does not match/);
    const open = keyFile('open.json', OWNER);
    chmodSync(open, 0o644);
    assert.throws(() => loadOrGenerateKey({ ...base, keyPath: open }, capture().log), /too open/);
    assert.throws(() => loadOrGenerateKey({ ...base, keyPath: join(dir, 'absent.json') }, capture().log), /not found.*GENERATE/);
  });
  it('GENERATE=1 with no file: writes {account_id, public_key, private_key} 0600 in a new 0700 dir and logs only the public key, once', () => {
    const keyPath = join(dir, 'vol', 'keys', 'oracle-refresher.json');
    const cap = capture();
    const k = loadOrGenerateKey({ keyPath, generate: true, ownerAccountId: OWNER }, cap.log);
    assert.equal(statSync(keyPath).mode & 0o777, 0o600);
    assert.equal(statSync(dirname(keyPath)).mode & 0o777, 0o700);
    const onDisk = JSON.parse(readFileSync(keyPath, 'utf8')) as Record<string, string>;
    assert.deepEqual(Object.keys(onDisk).sort(), ['account_id', 'private_key', 'public_key']);
    assert.equal(onDisk.account_id, OWNER);
    assert.equal(KeyPair.fromString(onDisk.private_key as `ed25519:${string}`).getPublicKey().toString(), onDisk.public_key);
    assert.deepEqual([k.accountId, k.publicKey], [OWNER, onDisk.public_key]);
    const lines = cap.json();
    assert.equal(lines.length, 1);
    assert.deepEqual([lines[0]?.event, lines[0]?.public_key], ['key_generated', onDisk.public_key]);
    const secretBody = (onDisk.private_key as string).slice('ed25519:'.length);
    assert.ok(!cap.lines.join('\n').includes(secretBody), 'private key leaked into logs');
    // Restart: the existing key is reused, nothing regenerated or logged.
    const cap2 = capture();
    assert.equal(loadOrGenerateKey({ keyPath, generate: true, ownerAccountId: OWNER }, cap2.log).publicKey, onDisk.public_key);
    assert.equal(cap2.lines.length, 0);
  });
});

describe('oracle refresher entrypoint (exit codes, no network)', () => {
  const run = (env: Record<string, string>): { status: number | null; out: string } => {
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', MAIN], { env: { PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8', timeout: 30_000 });
    return { status: r.status, out: r.stdout + r.stderr };
  };
  it('exits 1 on a key/owner mismatch and on a missing key without GENERATE, without key material in the output', () => {
    const kp = KeyPair.fromRandom('ed25519');
    const mismatch = run({ NECTAR_CONFIG_PATH: CONFIG, ORACLE_REFRESHER_KEY_PATH: keyFile('main-other.json', 'someone.testnet', kp) });
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.out, /"event":"key_error"/);
    assert.ok(!mismatch.out.includes(kp.toString().slice(8)));
    const absent = run({ NECTAR_CONFIG_PATH: CONFIG, ORACLE_REFRESHER_KEY_PATH: join(dir, 'main-absent.json') });
    assert.equal(absent.status, 1);
    const noConfig = run({ NECTAR_CONFIG_PATH: join(dir, 'nope.yaml'), ORACLE_REFRESHER_KEY_PATH: join(dir, 'x.json') });
    assert.equal(noConfig.status, 1);
    assert.match(noConfig.out, /"event":"config_error"/);
  });
  it('exits 0 after run_until without generating a key', () => {
    const keyPath = join(dir, 'main-past', 'k.json');
    const past = run({ NECTAR_CONFIG_PATH: file('past.yaml', yaml('2020-01-01T00:00:00Z')), ORACLE_REFRESHER_KEY_PATH: keyPath, ORACLE_REFRESHER_GENERATE: '1' });
    assert.equal(past.status, 0);
    assert.match(past.out, /"event":"stopped","reason":"run_until"/);
    assert.equal(existsSync(keyPath), false);
  });
});
