import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { verifyQuoteSignature, type OneClickQuoteResponse } from '@defuse-protocol/one-click-sdk-typescript';
import { FeedDb } from '../src/db.ts';
import { createLogger } from '../src/log.ts';
import { OneClickClient, OneClickSampler, buildDryQuote, defaultSamplerConfig, toE6, unitsForUsd, type DryQuoteRequest, type Fetcher, type OneClickToken } from '../src/oneclick.ts';

const here = dirname(fileURLToPath(import.meta.url));
const quiet = createLogger('feed', () => {});
const fx = <T>(name: string): T => JSON.parse(readFileSync(resolve(here, 'fixtures', name), 'utf8')) as T;
const QUOTE = fx<OneClickQuoteResponse>('oneclick-quote-ref.json');
const TOKENS = fx<OneClickToken[]>('oneclick-tokens.json');

interface Call { method: string; url: string; body: unknown }
function fakeFetch(quote: unknown, calls: Call[]): Fetcher {
  return async (url, init) => {
    calls.push({ method: init.method, url, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const json = url.endsWith('/v0/tokens') ? TOKENS : quote;
    return { status: 200, json: async () => json };
  };
}

describe('1Click recorded fixture (F-062)', () => {
  it('the recorded live dry quote verifies with the SDK manager key', () => {
    assert.equal(QUOTE.quoteRequest.dry, true);
    assert.equal(verifyQuoteSignature(QUOTE), true);
  });
  it('any tampering breaks the signature', () => {
    const t = structuredClone(QUOTE);
    t.quote.amountOut = (BigInt(t.quote.amountOut) + 1n).toString();
    assert.equal(verifyQuoteSignature(t), false);
  });
  it('the token list has no NVDA route (F-063)', () => {
    assert.equal(TOKENS.filter((t) => /NVDA/i.test(t.symbol)).length, 0);
  });
});

describe('1Click helpers', () => {
  it('toE6 parses decimal strings without floats', () => {
    assert.equal(toE6('1000.000000000000'), 1_000_000_000n);
    assert.equal(toE6('0.9994729'), 999_472n);
    assert.equal(toE6('12'), 12_000_000n);
    assert.equal(toE6(3.61), 3_610_000n);
    assert.throws(() => toE6('-1'));
  });
  it('unitsForUsd sizes the notional in base units', () => {
    assert.equal(unitsForUsd(1_000_000_000n, 1, 6), 1_000_000_000n);
    assert.equal(unitsForUsd(1_000_000_000n, 4, 24), 250n * 10n ** 24n);
  });
  it('buildDryQuote always sets dry:true and INTENTS rails', () => {
    const [o, d] = [TOKENS.find((t) => t.symbol === 'wNEAR')!, TOKENS.find((t) => t.symbol === 'USDC' && t.blockchain === 'near')!];
    const q = buildDryQuote(o, d, defaultSamplerConfig({}), 0);
    assert.equal(q.dry, true);
    assert.equal(q.depositType, 'INTENTS');
    assert.equal(q.deadline, new Date(600_000).toISOString());
  });
});

describe('1Click client is dry-only (Q-007)', () => {
  it('refuses a non-dry body before any network call', async () => {
    const calls: Call[] = [];
    const c = new OneClickClient(fakeFetch(QUOTE, calls));
    const bad = { ...buildDryQuote(TOKENS[0]!, TOKENS[1]!, defaultSamplerConfig({}), 0), dry: false } as unknown as DryQuoteRequest;
    await assert.rejects(c.dryQuote(bad), /non-dry/);
    assert.equal(calls.length, 0);
  });
});

describe('1Click sampler', () => {
  it('NVDAx: stores "no_route" without sending a quote; ref pair: stores the verified sample', async () => {
    const db = new FeedDb(':memory:');
    const calls: Call[] = [];
    const s = new OneClickSampler(db, new OneClickClient(fakeFetch(QUOTE, calls)), defaultSamplerConfig({}), quiet);
    const r = await s.tick(1_700_000_000_000);
    assert.equal(r.dropped, 0);
    const quotes = calls.filter((c) => c.url.endsWith('/v0/quote'));
    assert.equal(quotes.length, 1, 'only the reference pair is quoted');
    assert.equal((quotes[0]!.body as { dry: boolean }).dry, true);
    assert.ok(calls.every((c) => /\/v0\/(tokens|quote)$/.test(c.url)));
    const nv = db.oneClickSamples('NVDAx', 5);
    assert.equal(nv.length, 1);
    assert.equal(nv[0]!.status, 'no_route');
    const ref = db.oneClickSamples('ref:wNEAR', 5);
    assert.equal(ref[0]!.status, 'verified');
    assert.equal(ref[0]!.amount_in_usd_e6, toE6(QUOTE.quote.amountInUsd).toString());
    assert.equal(ref[0]!.amount_out_formatted, QUOTE.quote.amountOutFormatted);
    assert.equal(verifyQuoteSignature(JSON.parse(ref[0]!.response!) as OneClickQuoteResponse), true, 'stored response re-verifies offline (G6)');
    await s.tick(1_700_000_300_000); // same correlation id -> idempotent
    assert.equal(db.oneClickSamples('ref:wNEAR', 5).length, 1);
  });
  it('drops a sample whose signature does not verify', async () => {
    const db = new FeedDb(':memory:');
    const forged = structuredClone(QUOTE);
    forged.quote.amountOutUsd = '999999.0';
    const s = new OneClickSampler(db, new OneClickClient(fakeFetch(forged, [])), defaultSamplerConfig({}), quiet);
    const r = await s.tick(1);
    assert.equal(r.dropped, 1);
    assert.equal(db.oneClickSamples('ref:wNEAR', 5).length, 0);
    assert.equal(db.meta('oneclick_dropped'), '1');
  });
});

describe('1Click live (NECTAR_IT=1; read-only, dry only)', { skip: process.env.NECTAR_IT !== '1' }, () => {
  it('fetches tokens and gets a verified dry quote for the reference pair', async () => {
    const db = new FeedDb(':memory:');
    const r = await new OneClickSampler(db, new OneClickClient(), defaultSamplerConfig(process.env), quiet).tick();
    assert.equal(r.dropped, 0);
    assert.ok(r.stored.some((x) => x.status === 'verified'));
    assert.ok(r.stored.some((x) => x.symbol === 'NVDAx' && x.status === 'no_route'));
  });
});
