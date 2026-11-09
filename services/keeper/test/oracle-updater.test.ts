// Oracle updater: recorded/synthetic fixtures only — no live Hermes call, no transaction.
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { KeyPair } from 'near-api-js';
import { createLogger } from '../src/log.ts';
import {
  OracleUpdater, createOracleUpdater, hermesUrl, loadUpdaterConfig, parseHermesUpdate, parseYocto, redact,
  type HttpGet, type PythChain, type UpdaterConfig,
} from '../src/oracle-updater.ts';

const here = dirname(fileURLToPath(import.meta.url));
const HERMES = readFileSync(resolve(here, 'fixtures/hermes-latest-SYNTHETIC.json'), 'utf8');
const ID = 'ab'.repeat(32);
const API_KEY = 'pyth-test-key-NOT-REAL-1234';
// Throwaway key generated per run so the signer can be constructed; never funded, never used to sign.
const THROWAWAY = KeyPair.fromRandom('ed25519');
const dir = mkdtempSync(join(tmpdir(), 'oracle-updater-'));
after(() => rmSync(dir, { recursive: true, force: true }));

function file(name: string, body: string, mode = 0o600): string {
  const p = join(dir, name);
  writeFileSync(p, body);
  chmodSync(p, mode);
  return p;
}

const BASE_ENV = (): NodeJS.ProcessEnv => ({
  PYTH_API_KEY_PATH: file('pyth.key', API_KEY + '\n'),
  ORACLE_UPDATER_ACCOUNT_ID: 'updater.example.testnet',
  ORACLE_UPDATER_KEY_PATH: file('updater.json', JSON.stringify({ account_id: 'updater.example.testnet', public_key: THROWAWAY.getPublicKey().toString(), private_key: THROWAWAY.toString() })),
  ORACLE_UPDATER_FEED_IDS: `0x${ID}`,
  KEEPER_ACCOUNT_ID: 'keeper.example.testnet',
});

function cfg(over: Partial<UpdaterConfig> = {}): UpdaterConfig {
  const s = loadUpdaterConfig(BASE_ENV());
  assert.ok(s.enabled);
  return { ...s.cfg, ...over };
}

class FakeChain implements PythChain {
  views: Array<{ method: string; args: Record<string, unknown> }> = [];
  updates: Array<{ args: Record<string, string>; deposit: bigint }> = [];
  fee: unknown = '1';
  ok = true;
  async view(method: string, args: Record<string, unknown>): Promise<unknown> {
    this.views.push({ method, args });
    return this.fee;
  }
  async updatePriceFeeds(args: Record<string, string>, deposit: bigint): Promise<{ txHash: string; ok: boolean; failure: string | null }> {
    this.updates.push({ args, deposit });
    return { txHash: 'TX1', ok: this.ok, failure: this.ok ? null : '{"Failure":"x"}' };
  }
}

function capture(): { lines: string[]; log: ReturnType<typeof createLogger> } {
  const lines: string[] = [];
  return { lines, log: createLogger('oracle-updater', (l) => lines.push(l)) };
}

describe('oracle updater config (gating)', () => {
  it('is disabled without PYTH_API_KEY_PATH', () => {
    const env = BASE_ENV();
    delete env.PYTH_API_KEY_PATH;
    const s = loadUpdaterConfig(env);
    assert.equal(s.enabled, false);
    assert.match(!s.enabled ? s.reason : '', /PYTH_API_KEY_PATH/);
  });
  it('is disabled without the updater account or key path, or with TODO placeholders', () => {
    for (const k of ['ORACLE_UPDATER_ACCOUNT_ID', 'ORACLE_UPDATER_KEY_PATH']) {
      const env = { ...BASE_ENV(), [k]: 'TODO-H13' };
      const s = loadUpdaterConfig(env);
      assert.equal(s.enabled, false);
      assert.match(!s.enabled ? s.reason : '', new RegExp(k));
    }
  });
  it('is disabled without feed ids, with a malformed id, or when reusing the keeper account', () => {
    assert.equal(loadUpdaterConfig({ ...BASE_ENV(), ORACLE_UPDATER_FEED_IDS: 'TODO-G5' }).enabled, false);
    assert.equal(loadUpdaterConfig({ ...BASE_ENV(), ORACLE_UPDATER_FEED_IDS: 'abc' }).enabled, false);
    assert.equal(loadUpdaterConfig({ ...BASE_ENV(), ORACLE_UPDATER_ACCOUNT_ID: 'keeper.example.testnet' }).enabled, false);
  });
  it('enabled config has the documented defaults and normalised ids', () => {
    const c = cfg();
    assert.equal(c.pythContractId, 'pyth-oracle.testnet');
    assert.equal(c.feeView, 'get_update_fee_estimate');
    assert.equal(c.authHeader, 'Authorization');
    assert.equal(c.authScheme, 'Bearer');
    assert.deepEqual(c.feedIds, [ID]);
    assert.equal(hermesUrl(c), `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${ID}&encoding=hex`);
  });
  it('createOracleUpdater refuses a world-readable API key file', { skip: process.platform === 'win32' }, () => {
    const env = { ...BASE_ENV(), PYTH_API_KEY_PATH: file('open.key', API_KEY, 0o644) };
    const r = createOracleUpdater(env, createLogger('t', () => {}));
    assert.ok('disabled' in r);
    assert.match(r.disabled, /too open/);
    assert.ok(!r.disabled.includes(API_KEY));
  });
  it('createOracleUpdater builds an updater when everything is present (no network)', () => {
    const r = createOracleUpdater(BASE_ENV(), createLogger('t', () => {}));
    assert.ok('updater' in r);
  });
});

describe('oracle updater run (fixture)', () => {
  it('parses the Hermes hex update', () => {
    assert.deepEqual(parseHermesUpdate(HERMES), ['504e41550100000003b801000000040d00aabbccddeeff00112233445566778899']);
    assert.throws(() => parseHermesUpdate('{"binary":{"encoding":"base64","data":["AA=="]}}'));
    assert.throws(() => parseHermesUpdate('unauthorized'));
  });
  it('fetches with the configured auth header, reads the fee view, pushes with fee as deposit', async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const http: HttpGet = async (url, headers) => (seen.push({ url, headers }), { status: 200, body: HERMES });
    const chain = new FakeChain();
    chain.fee = '7';
    const { lines, log } = capture();
    const r = await new OracleUpdater(cfg(), API_KEY, http, chain, log).runOnce();
    assert.deepEqual(r, { pushed: 1, txHashes: ['TX1'] });
    assert.equal(seen[0]?.headers.Authorization, `Bearer ${API_KEY}`);
    assert.deepEqual(chain.views[0], { method: 'get_update_fee_estimate', args: { data: '504e41550100000003b801000000040d00aabbccddeeff00112233445566778899' } });
    assert.equal(chain.updates[0]?.deposit, 7n);
    assert.ok(lines.every((l) => !l.includes(API_KEY)));
  });
  it('honours a custom header and raw scheme', async () => {
    let h: Record<string, string> = {};
    const http: HttpGet = async (_u, headers) => ((h = headers), { status: 200, body: HERMES });
    await new OracleUpdater(cfg({ authHeader: 'x-api-key', authScheme: '' }), API_KEY, http, new FakeChain(), createLogger('t', () => {})).runOnce();
    assert.equal(h['x-api-key'], API_KEY);
    assert.equal(h.Authorization, undefined);
  });
  it('401 → logged failure with status, no push, key never logged, backoff grows', async () => {
    const http: HttpGet = async () => ({ status: 401, body: `unauthorized ${API_KEY}` });
    const chain = new FakeChain();
    const { lines, log } = capture();
    const u = new OracleUpdater(cfg(), API_KEY, http, chain, log);
    assert.equal(await u.tick(), null);
    assert.equal(chain.updates.length, 0);
    assert.ok(lines.some((l) => l.includes('oracle_update_failed') && l.includes('"http_status":401')));
    assert.ok(lines.every((l) => !l.includes(API_KEY)));
    assert.ok(u.nextDelayMs() > cfg().intervalMs);
  });
  it('non-200 bodies echoing the key are redacted', async () => {
    const http: HttpGet = async () => ({ status: 500, body: `boom ${API_KEY}` });
    const { lines, log } = capture();
    await new OracleUpdater(cfg(), API_KEY, http, new FakeChain(), log).tick();
    assert.ok(lines.some((l) => l.includes('[redacted]')));
    assert.ok(lines.every((l) => !l.includes(API_KEY)));
  });
  it('refuses a fee above the cap and a non-U128 fee', async () => {
    const http: HttpGet = async () => ({ status: 200, body: HERMES });
    const chain = new FakeChain();
    chain.fee = '1000';
    await assert.rejects(new OracleUpdater(cfg({ maxFeeYocto: 999n }), API_KEY, http, chain, createLogger('t', () => {})).runOnce(), /exceeds/);
    assert.equal(chain.updates.length, 0);
    assert.throws(() => parseYocto(null));
    assert.throws(() => parseYocto('-1'));
    assert.equal(parseYocto('340282366920938463463374607431768211455'), 2n ** 128n - 1n);
  });
  it('a failed update_price_feeds surfaces as an error', async () => {
    const http: HttpGet = async () => ({ status: 200, body: HERMES });
    const chain = new FakeChain();
    chain.ok = false;
    await assert.rejects(new OracleUpdater(cfg(), API_KEY, http, chain, createLogger('t', () => {})).runOnce(), /update_price_feeds failed/);
  });
  it('redact ignores tiny secrets', () => {
    assert.equal(redact('abc', 'a'), 'abc');
    assert.equal(redact('xsecretx', 'secret'), 'x[redacted]x');
  });
});
