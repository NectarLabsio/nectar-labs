// WO-35k: NEAR RPC fallback (near-rpc.ts). A 429 on the first endpoint → the second serves; contract errors never rotate.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { Provider } from 'near-api-js';
import { TESTNET_RPC_FALLBACKS, classifyRpcError, endpointHost, fallbackRpc, nearRpcUrls } from '../src/near-rpc.ts';

/** near-api-js 7.4.0 ProviderError shape for HTTP 429 (index.js fetchJsonRpc: `new ProviderError(text, { cause: 429 })`). */
class ProviderError extends Error {
  constructor(message: string, status: number) {
    super(message, { cause: status });
  }
}

type Behaviour = (method: string) => unknown;

function fakes(behaviours: Record<string, Behaviour>, calls: string[]): (url: string) => Provider {
  return (url) =>
    ({
      callFunctionRaw: async () => {
        calls.push(url);
        const b = behaviours[url];
        const out = b ? b('callFunctionRaw') : { result: [], block_height: 1 };
        if (out instanceof Error) throw out;
        return out;
      },
    }) as unknown as Provider;
}

const URLS: string[] = [...TESTNET_RPC_FALLBACKS];
const [U0, U1, U2, U3] = TESTNET_RPC_FALLBACKS;
const noSleep = async (): Promise<void> => undefined;

describe('near-rpc fallback (WO-35k)', () => {
  it('a 429 on the first endpoint → the second serves; the switch is logged by host only', async () => {
    const calls: string[] = [];
    const logs: Array<[string, string, Record<string, string | number>]> = [];
    const ok = { result: Array.from(new TextEncoder().encode('"1.0.0"')), block_height: 277369501 };
    const near = fallbackRpc({
      urls: URLS,
      makeProvider: fakes({ [U0]: () => new ProviderError('Too Many Requests', 429), [U1]: () => ok }, calls),
      sleep: noSleep,
      random: () => 0.5,
      log: (level, msg, f) => logs.push([level, msg, f]),
    });
    const r = await near.provider.callFunctionRaw({ contractId: 'core.testnet', method: 'contract_version', args: {}, blockQuery: { finality: 'final' } });
    assert.equal(r.block_height, 277369501);
    assert.deepEqual(calls, [U0, U1]);
    assert.deepEqual(logs[0], ['warn', 'rpc_failover', { endpoint: 'test.rpc.fastnear.com', reason: 'throttled', method: 'callFunctionRaw', cooldown_ms: 250 }]);
    assert.deepEqual(logs[1], ['info', 'rpc_endpoint', { endpoint: 'rpc.testnet.fastnear.com', previous: 'none', method: 'callFunctionRaw' }]);
    const st = near.status();
    assert.equal(st.last_served, 'rpc.testnet.fastnear.com');
    assert.equal(st.failovers, 1);
    assert.deepEqual(st.cooling, ['test.rpc.fastnear.com']);
    assert.deepEqual(st.endpoints, ['test.rpc.fastnear.com', 'rpc.testnet.fastnear.com', 'near-testnet.drpc.org', 'testnet-rpc.intea.rs']);
  });

  it('both FastNEAR hosts throttled / 503 → dRPC serves; then a cooled endpoint is skipped on the next call', async () => {
    const calls: string[] = [];
    const ok = { result: [], block_height: 5 };
    let t = 1_000;
    const near = fallbackRpc({
      urls: URLS,
      makeProvider: fakes({ [U0]: () => new ProviderError('rate', 429), [U1]: () => new ProviderError('unavailable', 503), [U2]: () => ok }, calls),
      sleep: noSleep,
      random: () => 0.5,
      now: () => t,
    });
    await near.provider.callFunctionRaw({ contractId: 'c', method: 'm', args: {}, blockQuery: { finality: 'final' } });
    assert.deepEqual(calls, [U0, U1, U2]);
    calls.length = 0;
    t += 100; // both FastNEAR hosts still cooling (250 ms)
    await near.provider.callFunctionRaw({ contractId: 'c', method: 'm', args: {}, blockQuery: { finality: 'final' } });
    assert.deepEqual(calls, [U2]);
    calls.length = 0;
    t += 1_000; // cooldown over: FastNEAR is asked first again (no stickiness)
    await near.provider.callFunctionRaw({ contractId: 'c', method: 'm', args: {}, blockQuery: { finality: 'final' } });
    assert.equal(calls[0], U0);
  });

  it('a contract error is final: no rotation, no cooldown', async () => {
    const calls: string[] = [];
    const near = fallbackRpc({ urls: URLS, makeProvider: fakes({ [U0]: () => new Error('Smart contract panicked: unknown position') }, calls), sleep: noSleep });
    await assert.rejects(near.provider.callFunctionRaw({ contractId: 'c', method: 'm', args: {}, blockQuery: { finality: 'final' } }), /panicked/);
    assert.deepEqual(calls, [U0]);
    assert.equal(near.status().failovers, 0);
  });

  it('a hung endpoint times out and the next one serves', async () => {
    const calls: string[] = [];
    const near = fallbackRpc({
      urls: URLS.slice(0, 2),
      timeoutMs: 20,
      sleep: noSleep,
      makeProvider: (url) =>
        ({
          callFunctionRaw: () => {
            calls.push(url);
            return url === U0 ? new Promise(() => undefined) : Promise.resolve({ result: [], block_height: 9 });
          },
        }) as unknown as Provider,
    });
    const r = await near.provider.callFunctionRaw({ contractId: 'c', method: 'm', args: {}, blockQuery: { finality: 'final' } });
    assert.equal(r.block_height, 9);
    assert.deepEqual(calls, [U0, U1]);
  });

  it('every endpoint failing rethrows the last transport error after the passes', async () => {
    const calls: string[] = [];
    const all = Object.fromEntries(URLS.map((u) => [u, () => new ProviderError('busy', 429)]));
    const near = fallbackRpc({ urls: URLS, attempts: 2, makeProvider: fakes(all, calls), sleep: noSleep });
    await assert.rejects(near.provider.callFunctionRaw({ contractId: 'c', method: 'm', args: {}, blockQuery: { finality: 'final' } }), /busy/);
    assert.equal(calls.length, 8);
  });

  it('classifies transport errors and leaves request errors alone', () => {
    assert.equal(classifyRpcError(new ProviderError('x', 429)), 'throttled');
    assert.equal(classifyRpcError(new ProviderError('x', 502)), 'server');
    assert.equal(classifyRpcError(new ProviderError('x', 408)), 'timeout');
    assert.equal(classifyRpcError(new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') })), 'network');
    assert.equal(classifyRpcError(Object.assign(new Error('Exceeded 1 attempts'), { type: 'RetriesExceeded' })), 'server');
    assert.equal(classifyRpcError(new Error('wasm execution failed: MethodNotFound')), null);
    assert.equal(classifyRpcError(new Error('Smart contract panicked: 429 units')), null);
    assert.equal(classifyRpcError('nope'), null);
  });

  it('endpoint order: NEAR_RPC_URL first then the fallbacks; loopback / NEAR_RPC_FALLBACK=off stay alone; NEAR_RPC_URLS exact', () => {
    assert.deepEqual(nearRpcUrls({}), URLS);
    assert.deepEqual(nearRpcUrls({ NEAR_RPC_URL: 'https://test.rpc.fastnear.com/' }), URLS);
    assert.deepEqual(nearRpcUrls({ NEAR_RPC_URL: 'https://near-testnet.drpc.org' }), [U2, U0, U1, U3]);
    assert.deepEqual(nearRpcUrls({ NEAR_RPC_URL: 'http://127.0.0.1:3030' }), ['http://127.0.0.1:3030']);
    assert.deepEqual(nearRpcUrls({ NEAR_RPC_URL: 'https://x.example', NEAR_RPC_FALLBACK: 'off' }), ['https://x.example']);
    assert.deepEqual(nearRpcUrls({ NEAR_RPC_URLS: 'https://a.example, https://b.example,https://a.example' }), ['https://a.example', 'https://b.example']);
    assert.equal(endpointHost('https://rpc.example/v1/SECRETKEY?apikey=1'), 'rpc.example');
  });

  it('mirrors packages/sdk TESTNET_RPC_FALLBACKS, and the Feed copy is byte-identical', () => {
    const sdk = readFileSync(new URL('../../../packages/sdk/src/rpc.ts', import.meta.url), 'utf8');
    const line = /export const TESTNET_RPC_FALLBACKS = \[([^\]]+)\]/.exec(sdk);
    assert.ok(line);
    const sdkList = [...(line[1] as string).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(sdkList, URLS);
    const mine = readFileSync(new URL('../src/near-rpc.ts', import.meta.url), 'utf8');
    const feed = readFileSync(new URL('../../feed/src/near-rpc.ts', import.meta.url), 'utf8');
    assert.equal(feed, mine);
  });
});
