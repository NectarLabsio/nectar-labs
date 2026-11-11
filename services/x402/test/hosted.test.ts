// WO-34k x402 hosted mode: env-held key refusal (FullAccess / unreadable), no key echo, PORT, CORS, /health.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { ConfigError, loadConfig } from '../src/config.ts';
import { FullAccessRefused, assertEnvKeyNotFullAccess, healthReply, parseEnvKey, type AccessKeyViewer } from '../src/hosted.ts';
import { createPaidServer } from '../src/server.ts';

// Syntactically valid, never-funded placeholders (base58 alphabet); not a real key.
const SK = `ed25519:${'3'.repeat(88)}`;
const PK = `ed25519:${'4'.repeat(44)}`;
const ACCOUNT = 'x402-relayer.nectar.testnet';
const json = (o: Record<string, unknown>): string => JSON.stringify(o);
const good = json({ account_id: ACCOUNT, public_key: PK, private_key: SK });

describe('X402_RELAYER_KEY_JSON', () => {
  it('parses a near-cli credentials JSON', () => {
    const k = parseEnvKey(good, ACCOUNT);
    assert.equal(k.publicKey, PK);
    assert.equal(k.accountId, ACCOUNT);
  });

  it('errors never carry the key material', () => {
    const bad = [
      '{not json ' + SK,
      json({ account_id: ACCOUNT, private_key: SK }),
      json({ account_id: ACCOUNT, public_key: PK, private_key: 'secp256k1:' + SK.slice(8) }),
      json({ account_id: 'other.testnet', public_key: PK, private_key: SK }),
    ];
    for (const raw of bad) {
      assert.throws(
        () => parseEnvKey(raw, ACCOUNT),
        (e: unknown) => e instanceof Error && !e.message.includes(SK.slice(8, 30)) && /X402_RELAYER_KEY_JSON/.test(e.message),
      );
    }
  });

  it('refuses a FullAccess key and an unreadable permission (fail closed); accepts a function-call key', async () => {
    const k = parseEnvKey(good, ACCOUNT);
    const seen: string[] = [];
    const view = (p: 'FullAccess' | 'FunctionCall'): AccessKeyViewer => async (a, pk) => (seen.push(`${a} ${pk}`), p);
    await assert.rejects(assertEnvKeyNotFullAccess(k, view('FullAccess')), (e: unknown) => e instanceof FullAccessRefused && !e.message.includes(SK.slice(8, 30)));
    await assert.rejects(assertEnvKeyNotFullAccess(k, async () => Promise.reject(new Error('rpc down'))), /refusing to start/);
    await assertEnvKeyNotFullAccess(k, view('FunctionCall'));
    assert.deepEqual(seen, [`${ACCOUNT} ${PK}`, `${ACCOUNT} ${PK}`], 'checked the key it was given');
  });

  it('config: env key excludes the file path and the HTTP facilitator; never stored in config', () => {
    const c = loadConfig({ X402_RELAYER_KEY_JSON: good });
    assert.equal(c.relayerKeyFromEnv, true);
    assert.ok(!JSON.stringify(c).includes(SK.slice(8, 30)));
    assert.throws(() => loadConfig({ X402_RELAYER_KEY_JSON: good, X402_RELAYER_KEY_PATH: '/k.json' }), ConfigError);
    assert.throws(() => loadConfig({ X402_RELAYER_KEY_JSON: good, X402_FACILITATOR_PORT: '9', X402_FACILITATOR_SECRET_PATH: '/s' }), ConfigError);
  });
});

describe('x402 hosted listener', () => {
  it('X402_PORT wins, then PORT, then 8790', () => {
    assert.equal(loadConfig({}).port, 8790);
    assert.equal(loadConfig({ PORT: '7001' }).port, 7001);
    assert.equal(loadConfig({ PORT: '7001', X402_PORT: '8791' }).port, 8791);
    assert.throws(() => loadConfig({ PORT: 'x' }), ConfigError);
    assert.equal(loadConfig({}).corsOrigins, null);
  });

  it('serves /health without secrets and applies the CORS allowlist', async () => {
    const cfg = { network: 'near:testnet' as const, amount: '10000', asset: 'usdc-mock.nectar.testnet', payTo: 'nectar.testnet' };
    const facilitator = {
      verify: async () => ({ isValid: false, invalidReason: 'x' }),
      settle: async () => ({ success: false, errorReason: 'x', transaction: '', network: cfg.network }),
      getSupported: async () => ({ kinds: [{ x402Version: 2, scheme: 'exact', network: cfg.network }], extensions: [], signers: {} }),
    };
    const srv = await createPaidServer({
      cfg,
      facilitator: facilitator as unknown as Parameters<typeof createPaidServer>[0]['facilitator'],
      upstream: async () => ({ ok: true, status: 200, body: 'a\n' }),
      log: () => {},
      cors: { origins: new Set(['https://app.example']), legacyWildcard: false, methods: 'GET, OPTIONS' },
      health: () => healthReply({ ...cfg, facilitator: 'remote', relayerAccountId: null, version: '0.1.0', feedStatus: async () => 200 }),
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      const h = await fetch(`${base}/health`, { headers: { origin: 'https://app.example' } });
      assert.equal(h.status, 200);
      assert.equal(h.headers.get('access-control-allow-origin'), 'https://app.example');
      const body = (await h.json()) as Record<string, unknown>;
      assert.equal(body.facilitator, 'remote');
      assert.ok(!JSON.stringify(body).match(/ed25519:|secret|key/i), 'no key material or key fields');
      const pre = await fetch(`${base}/api/feed/export.csv`, { method: 'OPTIONS', headers: { origin: 'https://app.example', 'access-control-request-method': 'GET' } });
      assert.equal(pre.status, 204);
      const refused = await fetch(`${base}/api/feed/export.csv`, { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
      assert.equal(refused.status, 403);
      assert.equal(refused.headers.get('access-control-allow-origin'), null);
      assert.equal((await fetch(`${base}/api/feed/export.csv`)).status, 402, 'paid route unchanged');
    } finally {
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });

  it('/health is 503 when the Feed upstream is down', async () => {
    const r = await healthReply({ network: 'near:testnet', asset: 'a', amount: '1', payTo: 'p', facilitator: 'in-process', relayerAccountId: ACCOUNT, version: '0', feedStatus: async () => null });
    assert.equal(r.status, 503);
    assert.equal(r.body.feed_upstream, 'unreachable');
  });
});
