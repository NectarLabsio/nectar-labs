// x402 unit tests (WO-25 Part 2): the real resource server + the real @x402/near exact facilitator, with a
// mocked FacilitatorNearSigner (no relayer, no chain) and a mocked NEAR JSON-RPC for the payer's signer
// (view_access_key + block). Covers 402 -> pay -> 200, wrong network refused, missing key path errors.

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { FacilitatorNearSigner } from '@fastnear/x402/facilitator';
import { createLocalNearSigner } from '@fastnear/x402/node';
import { encodePaymentRequiredHeader } from '@x402/core/http';
import { decodeSignedDelegateB64, parseFtTransferArgs } from '@x402/near';
import { KeyPair } from 'near-api-js';
import { PaymentRefused, payForResource } from '../src/agent.ts';
import { ConfigError, NETWORK, PRICE_AMOUNT, assertTestnet, loadConfig } from '../src/config.ts';
import { KeyFileError, loadFullAccessKey, loadSharedSecret } from '../src/keys.ts';
import { buildFacilitator, createFacilitatorHttp, createPaidServer, facilitatorEndpoint, requirementsMismatch, routes } from '../src/server.ts';

const ASSET = 'usdc-mock.nectar.testnet';
const PAY_TO = 'nectar.testnet';
const RELAYER = 'x402-relayer.nectar.testnet';
const PAYER = 'agent1.nectar.testnet';
const CSV = 'symbol,block_height\nNVDAx,7\n';
const cfg = { network: NETWORK, amount: PRICE_AMOUNT, asset: ASSET, payTo: PAY_TO } as const;

const payerKey = KeyPair.fromRandom('ed25519');
const payerSecret = payerKey.toString() as `ed25519:${string}`;

const listen = async (s: Server): Promise<string> => {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
};

/** Mock NEAR RPC: answers the two calls the payer's signer makes (view_access_key, block). */
function mockRpc(): Server {
  return createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString()));
    req.on('end', () => {
      const m = JSON.parse(raw) as { id: unknown; method: string; params: Record<string, unknown> };
      const hash = '11111111111111111111111111111111';
      const result =
        m.method === 'query'
          ? { nonce: 41, permission: 'FullAccess', block_height: 1000, block_hash: hash }
          : { author: 'x', header: { height: 1000, hash, timestamp: 0, timestamp_nanosec: '0' }, chunks: [] };
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }));
    });
  });
}

class MockChain implements FacilitatorNearSigner {
  submitted: string[] = [];
  balance = 1_000_000n;
  getRelayerIds(): readonly string[] {
    return [RELAYER];
  }
  async getCurrentBlockHeight(): Promise<bigint> {
    return 1000n;
  }
  async viewAccount(): Promise<{ codeHash: string }> {
    return { codeHash: 'CodeHash1111111111111111111111111111111111' };
  }
  async viewAccessKey(): Promise<{ nonce: bigint; permissionKind: 'FullAccess' }> {
    return { nonce: 41n, permissionKind: 'FullAccess' };
  }
  async ftBalanceOf(): Promise<bigint> {
    return this.balance;
  }
  async storageBalanceOf(): Promise<{ supported: true; registered: boolean }> {
    return { supported: true, registered: true };
  }
  async submitSignedDelegateAction(i: { signedDelegateAction: string }): Promise<{ transaction: string; innerReceipt: { kind: 'success'; value: string } }> {
    this.submitted.push(i.signedDelegateAction);
    return { transaction: 'MockTx111', innerReceipt: { kind: 'success', value: '' } };
  }
}

describe('x402 paid export (mocked facilitator chain + mocked RPC)', () => {
  let rpc: Server;
  let rpcUrl = '';
  before(async () => {
    rpc = mockRpc();
    rpcUrl = await listen(rpc);
  });
  after(() => rpc.close());

  async function paidServer(chain: MockChain, upstreamOk = true): Promise<{ url: string; srv: Server; logs: string[]; upstreamCalls: () => number }> {
    const logs: string[] = [];
    let calls = 0;
    const srv = await createPaidServer({
      cfg,
      facilitator: buildFacilitator(chain),
      upstream: async () => {
        calls++;
        return upstreamOk ? { ok: true, status: 200, body: CSV } : { ok: false, status: 503, body: '' };
      },
      log: (msg, f) => logs.push(JSON.stringify({ msg, ...f })),
    });
    return { url: `${await listen(srv)}/api/feed/export.csv`, srv, logs, upstreamCalls: () => calls };
  }

  it('402 challenge names usdc-mock, 10000, near:testnet, treasury', async () => {
    const { url, srv } = await paidServer(new MockChain());
    try {
      const r = await fetch(url);
      assert.equal(r.status, 402);
      assert.ok(r.headers.get('PAYMENT-REQUIRED'));
      assert.equal((await fetch(url.replace('export.csv', 'other'))).status, 404);
    } finally {
      srv.close();
    }
  });

  it('402 -> NEP-366 SignedDelegate payment -> 200 with the CSV', async () => {
    const chain = new MockChain();
    const { url, srv, logs } = await paidServer(chain);
    try {
      const signer = createLocalNearSigner({ accountId: PAYER, secretKey: payerSecret, rpcUrls: { [NETWORK]: rpcUrl } });
      const r = await payForResource(url, signer);
      assert.deepEqual(r.challenge, { status: 402, network: NETWORK, asset: ASSET, amount: '10000', payTo: PAY_TO });
      assert.equal(r.status, 200);
      assert.equal(r.body, CSV);
      assert.equal(r.transaction, 'MockTx111');
      assert.equal(chain.submitted.length, 1);
      const d = decodeSignedDelegateB64(chain.submitted[0] ?? '');
      assert.ok(d.verifySignature());
      assert.equal(d.delegate.senderId, PAYER);
      assert.equal(d.delegate.receiverId, ASSET);
      assert.equal(d.delegate.nonce, 42n);
      assert.equal(d.delegate.functionCall?.methodName, 'ft_transfer');
      assert.equal(d.delegate.functionCall?.deposit, 1n);
      assert.deepEqual(parseFtTransferArgs(d.delegate.functionCall?.args ?? new Uint8Array()), { receiver_id: PAY_TO, amount: '10000' });
      assert.ok(!logs.join('\n').includes(payerSecret.slice(8)), 'no key material in logs');
    } finally {
      srv.close();
    }
  });

  it('insufficient balance is refused by the facilitator (no settlement)', async () => {
    const chain = new MockChain();
    chain.balance = 9_999n;
    const { url, srv } = await paidServer(chain);
    try {
      const r = await payForResource(url, createLocalNearSigner({ accountId: PAYER, secretKey: payerSecret, rpcUrls: { [NETWORK]: rpcUrl } }));
      assert.equal(r.status, 402);
      assert.equal(chain.submitted.length, 0);
    } finally {
      srv.close();
    }
  });

  it('feed down -> 502 and the payment is not settled', async () => {
    const chain = new MockChain();
    const { url, srv, upstreamCalls } = await paidServer(chain, false);
    try {
      const r = await payForResource(url, createLocalNearSigner({ accountId: PAYER, secretKey: payerSecret, rpcUrls: { [NETWORK]: rpcUrl } }));
      assert.equal(r.status, 502);
      assert.equal(upstreamCalls(), 1);
      assert.equal(chain.submitted.length, 0);
    } finally {
      srv.close();
    }
  });
});

describe('HTTP facilitator (SR-32)', () => {
  const SECRET = 'test-only-shared-secret-0123456789abcdef';
  const OTHER_TOKEN = 'attacker-token.testnet';
  const ATTACKER = 'attacker.testnet';
  let rpc: Server;
  let rpcUrl = '';
  before(async () => {
    rpc = mockRpc();
    rpcUrl = await listen(rpc);
  });
  after(() => rpc.close());

  const payer = (): ReturnType<typeof createLocalNearSigner> => createLocalNearSigner({ accountId: PAYER, secretKey: payerSecret, rpcUrls: { [NETWORK]: rpcUrl } });
  const post = (url: string, body: unknown, token: string | null = SECRET): Promise<Response> =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token === null ? {} : { authorization: `Bearer ${token}` }) }, body: JSON.stringify(body) });

  async function facilitatorHttp(chain: MockChain): Promise<{ url: string; srv: Server; logs: string[] }> {
    const logs: string[] = [];
    const srv = createFacilitatorHttp(buildFacilitator(chain), { cfg, secret: SECRET, log: (msg, f) => logs.push(JSON.stringify({ msg, ...f })) });
    return { url: await listen(srv), srv, logs };
  }

  /** A genuine payment on terms the attacker picked, captured from a facilitator that settles it. */
  async function strangerPayment(): Promise<{ body: { paymentPayload: unknown; paymentRequirements: unknown }; settledUnpinned: number }> {
    const chain = new MockChain();
    const inner = buildFacilitator(chain);
    let captured: { paymentPayload: unknown; paymentRequirements: unknown } | null = null;
    const srv = await createPaidServer({
      cfg: { network: NETWORK, amount: '1', asset: OTHER_TOKEN, payTo: ATTACKER },
      facilitator: {
        verify: (p, r) => ((captured = { paymentPayload: p, paymentRequirements: r }), inner.verify(p, r)),
        settle: (p, r) => inner.settle(p, r),
        getSupported: () => inner.getSupported(),
      },
      upstream: async () => ({ ok: true, status: 200, body: CSV }),
      log: () => undefined,
    });
    try {
      const r = await payForResource(`${await listen(srv)}/api/feed/export.csv`, payer());
      assert.equal(r.status, 200);
    } finally {
      srv.close();
    }
    assert.ok(captured !== null);
    return { body: captured, settledUnpinned: chain.submitted.length };
  }

  it('every endpoint answers 401 without the shared secret and nothing settles', async () => {
    const chain = new MockChain();
    const { url, srv, logs } = await facilitatorHttp(chain);
    const { body } = await strangerPayment();
    try {
      assert.equal((await fetch(`${url}/supported`)).status, 401);
      for (const path of ['/verify', '/settle']) {
        assert.equal((await post(url + path, body, null)).status, 401, path);
        assert.equal((await post(url + path, body, 'wrong-token')).status, 401, path);
      }
      assert.equal(chain.submitted.length, 0);
      assert.ok(logs.every((l) => l.includes('unauthorized')));
    } finally {
      srv.close();
    }
  });

  it('a stranger payment that settles unpinned is refused here, even with the secret', async () => {
    const chain = new MockChain();
    const { url, srv, logs } = await facilitatorHttp(chain);
    const { body, settledUnpinned } = await strangerPayment();
    try {
      assert.equal(settledUnpinned, 1, 'control: the payment is valid and an unpinned facilitator settles it');
      for (const path of ['/verify', '/settle']) {
        const r = await post(url + path, body);
        assert.equal(r.status, 403, path);
        assert.deepEqual(await r.json(), { error: 'requirements_not_allowed', field: 'asset' });
      }
      assert.equal(chain.submitted.length, 0);
      assert.ok(!logs.join('\n').includes(SECRET), 'no secret in logs');
    } finally {
      srv.close();
    }
  });

  it('pins each route term; missing requirements are refused', () => {
    const own = { scheme: 'exact', network: NETWORK, asset: ASSET, amount: PRICE_AMOUNT, payTo: PAY_TO, maxTimeoutSeconds: 120, extra: {} };
    assert.equal(requirementsMismatch(own, cfg), null);
    const changed = { scheme: 'upto', network: 'near:mainnet', asset: OTHER_TOKEN, amount: '1', payTo: ATTACKER, maxTimeoutSeconds: 86_400 };
    for (const [field, value] of Object.entries(changed)) assert.equal(requirementsMismatch({ ...own, [field]: value }, cfg), field);
    assert.equal(requirementsMismatch(undefined, cfg), 'scheme');
  });

  it('malformed body with the secret is a 400 and settles nothing', async () => {
    const chain = new MockChain();
    const { url, srv } = await facilitatorHttp(chain);
    try {
      const r = await fetch(`${url}/settle`, { method: 'POST', headers: { authorization: `Bearer ${SECRET}` }, body: 'not json' });
      assert.equal(r.status, 400);
      assert.equal(chain.submitted.length, 0);
    } finally {
      srv.close();
    }
  });

  it('our own paid route settles through the HTTP facilitator with the secret', async () => {
    const chain = new MockChain();
    const { url, srv } = await facilitatorHttp(chain);
    const paid = await createPaidServer({ cfg, facilitator: facilitatorEndpoint(url, SECRET), upstream: async () => ({ ok: true, status: 200, body: CSV }), log: () => undefined });
    try {
      const r = await payForResource(`${await listen(paid)}/api/feed/export.csv`, payer());
      assert.equal(r.status, 200);
      assert.equal(r.body, CSV);
      assert.equal(chain.submitted.length, 1);
    } finally {
      paid.close();
      srv.close();
    }
  });

  it('a resource server without the secret cannot start against it', async () => {
    const { url, srv } = await facilitatorHttp(new MockChain());
    try {
      await assert.rejects(createPaidServer({ cfg, facilitator: facilitatorEndpoint(url, null), upstream: async () => ({ ok: true, status: 200, body: CSV }), log: () => undefined }));
    } finally {
      srv.close();
    }
  });

  it('config: in-process by default; the listener needs a secret and ignores X402_HOST', () => {
    const d = loadConfig({});
    assert.deepEqual([d.facilitatorUrl, d.facilitatorPort, d.facilitatorSecretPath], [null, null, null]);
    assert.equal(loadConfig({ X402_FACILITATOR_PORT: 'off' }).facilitatorPort, null);
    assert.throws(() => loadConfig({ X402_FACILITATOR_PORT: '8791' }), (e: unknown) => e instanceof ConfigError && /X402_FACILITATOR_SECRET_PATH/.test(e.message));
    assert.throws(() => loadConfig({ X402_FACILITATOR_PORT: 'abc', X402_FACILITATOR_SECRET_PATH: '/s' }), ConfigError);
    const on = { X402_FACILITATOR_PORT: '8791', X402_FACILITATOR_SECRET_PATH: '/s', X402_HOST: '0.0.0.0' };
    const c = loadConfig(on);
    assert.deepEqual([c.host, c.facilitatorHost, c.facilitatorPort], ['0.0.0.0', '127.0.0.1', 8791]);
    assert.equal(loadConfig({ ...on, X402_FACILITATOR_HOST: '10.0.0.5' }).facilitatorHost, '10.0.0.5');
    assert.equal(loadConfig({ X402_FACILITATOR_PORT: '8791', X402_FACILITATOR_URL: 'https://f.example' }).facilitatorPort, null);
  });

  it('shared secret: 0600 file only, long enough, errors carry no contents', () => {
    const env = 'X402_FACILITATOR_SECRET_PATH';
    assert.throws(() => loadSharedSecret(undefined, env), (e: unknown) => e instanceof KeyFileError && /X402_FACILITATOR_SECRET_PATH is not set/.test(e.message));
    const p = join(mkdtempSync(join(tmpdir(), 'x402-secret-')), 'secret');
    writeFileSync(p, `${SECRET}\n`);
    chmodSync(p, 0o600);
    assert.equal(loadSharedSecret(p, env), SECRET);
    chmodSync(p, 0o644);
    assert.throws(() => loadSharedSecret(p, env), /too open/);
    chmodSync(p, 0o600);
    writeFileSync(p, 'short-secret');
    assert.throws(() => loadSharedSecret(p, env), (e: unknown) => e instanceof KeyFileError && !e.message.includes('short-secret'));
  });
});

describe('wrong network refused', () => {
  it('config refuses mainnet hints and non-testnet network ids', () => {
    assert.throws(() => assertTestnet({ NEAR_NETWORK: 'mainnet' }), ConfigError);
    assert.throws(() => assertTestnet({ X402_RPC_URL: 'https://rpc.mainnet.near.org' }), ConfigError);
    assert.throws(() => assertTestnet({ X402_NETWORK: 'near:mainnet' }), ConfigError);
    assert.throws(() => assertTestnet({}, ['https://rpc.mainnet.fastnear.com']), ConfigError);
    assert.doesNotThrow(() => assertTestnet({ NEAR_NETWORK: 'testnet', X402_RPC_URL: 'https://rpc.testnet.fastnear.com' }));
    assert.throws(() => routes({ ...cfg, network: 'near:mainnet' as typeof NETWORK }));
  });

  it('the agent refuses a near:mainnet challenge before signing', async () => {
    const challenge = encodePaymentRequiredHeader({
      x402Version: 2,
      resource: { url: 'http://x/api/feed/export.csv', description: 'x', mimeType: 'text/csv' },
      accepts: [{ scheme: 'exact', network: 'near:mainnet', asset: ASSET, amount: '10000', payTo: PAY_TO, maxTimeoutSeconds: 120, extra: {} }],
    });
    const srv = createServer((_q, s) => s.writeHead(402, { 'PAYMENT-REQUIRED': challenge }).end('{}'));
    const url = await listen(srv);
    let signed = false;
    try {
      await assert.rejects(
        payForResource(url, { createSignedDelegateAction: async () => ((signed = true), 'x') }),
        (e: unknown) => e instanceof PaymentRefused && /near:mainnet/.test(e.message),
      );
      assert.equal(signed, false);
    } finally {
      srv.close();
    }
  });

  it('loadConfig: usdc-mock asset, 0.01 USDC, near:testnet from config.yaml', () => {
    const c = loadConfig({});
    assert.deepEqual([c.network, c.asset, c.amount, c.relayerAccountId], [NETWORK, ASSET, '10000', RELAYER]);
    assert.equal(c.payTo, PAY_TO);
  });
});

describe('key paths', () => {
  it('missing key path is a clear error naming the env variable', () => {
    assert.throws(() => loadFullAccessKey(undefined, 'X402_RELAYER_KEY_PATH', RELAYER, 'X402_RELAYER_ACCOUNT_ID'), (e: unknown) => e instanceof KeyFileError && /X402_RELAYER_KEY_PATH is not set/.test(e.message));
    assert.throws(() => loadFullAccessKey('', 'AGENT1_KEY_PATH', PAYER, 'AGENT1_ACCOUNT_ID'), /AGENT1_KEY_PATH is not set/);
    assert.throws(() => loadFullAccessKey('/nonexistent/k.json', 'AGENT1_KEY_PATH', PAYER, 'AGENT1_ACCOUNT_ID'), /key file not found at AGENT1_KEY_PATH/);
  });

  it('loads a 0600 near-cli file, refuses a group-readable one and a mismatched account; errors carry no key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'x402-key-'));
    const p = join(dir, 'relayer.json');
    writeFileSync(p, JSON.stringify({ account_id: RELAYER, public_key: payerKey.getPublicKey().toString(), private_key: payerSecret }));
    chmodSync(p, 0o600);
    assert.equal(loadFullAccessKey(p, 'X402_RELAYER_KEY_PATH', RELAYER, 'X402_RELAYER_ACCOUNT_ID').secretKey, payerSecret);
    assert.throws(() => loadFullAccessKey(p, 'AGENT1_KEY_PATH', PAYER, 'AGENT1_ACCOUNT_ID'), (e: unknown) => e instanceof Error && !e.message.includes(payerSecret.slice(8)));
    chmodSync(p, 0o644);
    assert.throws(() => loadFullAccessKey(p, 'X402_RELAYER_KEY_PATH', RELAYER, 'X402_RELAYER_ACCOUNT_ID'), /too open/);
  });
});
