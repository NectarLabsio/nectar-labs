import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { verifyQuoteSignature, type OneClickQuoteResponse } from '@defuse-protocol/one-click-sdk-typescript';
import { route } from '../src/api.ts';
import { FeedDb, type OneClickReport } from '../src/db.ts';
import { seedOneClickFromFixtures, type ImpactFixture } from '../src/fixtures.ts';
import { createLogger } from '../src/log.ts';
import {
  OneClickClient, OneClickSampler, assetMatcher, buildDryQuote, defaultSamplerConfig, fixtureFetcher, impactBps, rateE6, sizeNotionals, toE6, unitsForUsd,
  type DryQuoteRequest, type Fetcher, type OneClickToken,
} from '../src/oneclick.ts';

const here = dirname(fileURLToPath(import.meta.url));
const quiet = createLogger('feed', () => {});
const fx = <T>(name: string): T => JSON.parse(readFileSync(resolve(here, 'fixtures', name), 'utf8')) as T;
const QUOTE = fx<OneClickQuoteResponse>('oneclick-quote-ref.json');
const TOKENS = fx<OneClickToken[]>('oneclick-tokens.json');
const IMPACT = fx<ImpactFixture>('oneclick-impact.json');
const fxCfg = () => defaultSamplerConfig({ ONECLICK_NOTIONAL_USD: IMPACT.notional_usd, ONECLICK_REF_PAIR: IMPACT.ref_pair });

interface Call { method: string; url: string; body: unknown }
function spy(inner: Fetcher, calls: Call[]): Fetcher {
  return async (url, init) => {
    calls.push({ method: init.method, url, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    return inner(url, init);
  };
}

describe('1Click recorded fixtures (F-062)', () => {
  it('the recorded live dry quotes verify with the SDK manager key', () => {
    assert.equal(QUOTE.quoteRequest.dry, true);
    assert.equal(verifyQuoteSignature(QUOTE), true);
    assert.equal(IMPACT.quotes.length, 3);
    for (const q of IMPACT.quotes) {
      assert.equal(q.quoteRequest.dry, true);
      assert.equal(verifyQuoteSignature(q), true);
    }
  });
  it('any tampering breaks the signature', () => {
    const t = structuredClone(QUOTE);
    t.quote.amountOut = (BigInt(t.quote.amountOut) + 1n).toString();
    assert.equal(verifyQuoteSignature(t), false);
  });
  it('the token list has no NVDA route (F-063)', () => {
    assert.equal(TOKENS.filter((t) => assetMatcher('NVDAx').test(t.symbol)).length, 0);
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
  it('sizes are 0.5x / 1x / 2x of ONECLICK_NOTIONAL_USD (default $1,000)', () => {
    assert.deepEqual(sizeNotionals(defaultSamplerConfig({}).notionalUsdE6), [500_000_000n, 1_000_000_000n, 2_000_000_000n]);
    assert.deepEqual(defaultSamplerConfig({ ONECLICK_REF_PAIR: 'near:wNEAR->near:USDC,near:ETH->near:USDC' }).refPairs.map((p) => p.id), ['wnear-usdc', 'eth-usdc']);
  });
});

describe('1Click impact math (base units, C-014)', () => {
  it('rate_e6 handles decimals 24 in / 6 out', () => {
    // 276.243093922651933701657458 wNEAR -> 1004.397702 USDC  => 3.635939... USDC/wNEAR
    assert.equal(rateE6(276_243_093_922_651_933_701_657_458n, 1_004_397_702n, 24, 6), 3_635_919n);
    assert.equal(rateE6(10n ** 24n, 3_620_000n, 24, 6), 3_620_000n);
  });
  it('rate_e6 handles decimals 6 in / 24 out (inverse direction)', () => {
    // 1000 USDC -> 276.2 wNEAR => 0.2762 wNEAR/USDC
    assert.equal(rateE6(1_000_000_000n, 276_200_000_000_000_000_000_000_000n, 6, 24), 276_200n);
    assert.equal(rateE6(1n, 1n, 6, 6), 1_000_000n);
    assert.throws(() => rateE6(0n, 1n, 6, 6));
  });
  it('impact_bps floors, is 0 for the reference and for better rates', () => {
    assert.equal(impactBps(3_620_000n, 3_620_000n), 0);
    assert.equal(impactBps(3_620_000n, 3_630_000n), 0);
    assert.equal(impactBps(1_000_000n, 990_000n), 100);
    assert.equal(impactBps(1_000_000n, 999_901n), 0); // 0.99 bps -> floor 0
    assert.equal(impactBps(1_000_000n, 998_999n), 10); // 10.01 bps -> floor 10
  });
});

describe('1Click client is dry-only (Q-007)', () => {
  it('refuses a non-dry body before any network call', async () => {
    const calls: Call[] = [];
    const c = new OneClickClient(spy(fixtureFetcher(TOKENS, IMPACT.quotes), calls));
    const bad = { ...buildDryQuote(TOKENS[0]!, TOKENS[1]!, defaultSamplerConfig({}), 0), dry: false } as unknown as DryQuoteRequest;
    await assert.rejects(c.dryQuote(bad), /non-dry/);
    assert.equal(calls.length, 0);
  });
});

describe('1Click sampler (3 sizes)', () => {
  it('NVDAx: no_route from the token list, no quote sent; ref pair: verified 3-size set from base units', async () => {
    const db = new FeedDb(':memory:');
    const calls: Call[] = [];
    const s = new OneClickSampler(db, new OneClickClient(spy(fixtureFetcher(TOKENS, IMPACT.quotes), calls)), fxCfg(), quiet);
    const r = await s.tick(1_700_000_000_000);
    assert.equal(r.dropped, 0);
    const quotes = calls.filter((c) => c.url.endsWith('/v0/quote'));
    assert.equal(quotes.length, 3, 'three sizes of the reference pair only');
    assert.ok(quotes.every((q) => (q.body as { dry: boolean }).dry === true));
    assert.ok(calls.every((c) => /\/v0\/(tokens|quote)$/.test(c.url)));
    assert.deepEqual(r.assets, [{ symbol: 'NVDAx', status: 'no_route' }]);
    const set = db.oneClickSets('wnear-usdc')[0]!;
    assert.deepEqual(set.samples.map((x) => x.notional_usd), [500, 1000, 2000]);
    const tok = (sym: string) => TOKENS.find((t) => t.blockchain === 'near' && t.symbol === sym)!;
    for (const [i, x] of set.samples.entries()) {
      const q = IMPACT.quotes[i]!.quote;
      assert.equal(x.amount_out, q.amountOut);
      assert.equal(x.min_amount_out, q.minAmountOut);
      assert.equal(x.rate_e6, rateE6(BigInt(q.amountIn), BigInt(q.amountOut), tok('wNEAR').decimals, tok('USDC').decimals).toString());
    }
    assert.equal(set.samples[0]!.impact_bps, 0);
    assert.ok(set.samples.every((x) => x.worst_impact_bps >= x.impact_bps));
    for (const q of JSON.parse(set.responses) as OneClickQuoteResponse[]) assert.equal(verifyQuoteSignature(q), true, 'stored responses re-verify offline (G6)');
    await s.tick(1_700_000_300_000); // same correlation ids -> idempotent
    assert.equal(db.oneClickSets('wnear-usdc', 5).length, 1);
  });
  it('NVDAx becomes "route" (and is sampled) as soon as the token list carries it', async () => {
    const db = new FeedDb(':memory:');
    const listed = [...TOKENS, { assetId: 'nep141:nvda.example', decimals: 8, blockchain: 'near', symbol: 'NVDAx', price: 180 }];
    const r = await new OneClickSampler(db, new OneClickClient(fixtureFetcher(listed, IMPACT.quotes)), fxCfg(), quiet).tick(1);
    assert.deepEqual(r.assets, [{ symbol: 'NVDAx', status: 'route' }]);
    assert.equal(r.dropped, 1, 'no recorded quote for nvdax-usdc -> 404 is not stored');
  });
  it('drops the whole set when one of the three signatures does not verify', async () => {
    const db = new FeedDb(':memory:');
    const forged = structuredClone(IMPACT.quotes);
    forged[2]!.quote.amountOut = (BigInt(forged[2]!.quote.amountOut) * 2n).toString();
    const r = await new OneClickSampler(db, new OneClickClient(fixtureFetcher(TOKENS, forged)), fxCfg(), quiet).tick(1);
    assert.equal(r.dropped, 1);
    assert.equal(db.oneClickSets('wnear-usdc').length, 0);
    assert.equal(db.meta('oneclick_dropped'), '1');
  });
  it('drops a set whose response does not echo the request (validly signed but for another amount)', async () => {
    const db = new FeedDb(':memory:');
    const swapped = [IMPACT.quotes[0]!, IMPACT.quotes[1]!, IMPACT.quotes[1]!];
    const f: Fetcher = async (url, init) => {
      if (url.endsWith('/v0/tokens')) return { status: 200, json: async () => TOKENS };
      const i = sizeNotionals(fxCfg().notionalUsdE6).findIndex((_, k) => IMPACT.quotes[k]!.quoteRequest.amount === (JSON.parse(init.body ?? '{}') as { amount: string }).amount);
      return { status: 200, json: async () => swapped[i] };
    };
    const r = await new OneClickSampler(db, new OneClickClient(f), fxCfg(), quiet).tick(1);
    assert.equal(r.dropped, 1);
  });
});

describe('FEED_FIXTURES=1: GET /api/oneclick from recorded fixtures', () => {
  it('serves the documented shape with verified pairs and NVDAx no_route', async () => {
    const db = new FeedDb(':memory:');
    const t = await seedOneClickFromFixtures(db, quiet);
    assert.equal(t.dropped, 0);
    const r = route(db, 'GET', '/api/oneclick');
    assert.equal(r.status, 200);
    const b = r.body as OneClickReport;
    assert.equal(b.as_of, IMPACT.recorded_at);
    assert.equal(b.pairs.length, 1);
    const p = b.pairs[0]!;
    assert.equal(p.id, 'wnear-usdc');
    assert.equal(p.verified, true);
    assert.equal(p.origin, IMPACT.quotes[0]!.quoteRequest.originAsset);
    assert.equal(p.correlation_id, IMPACT.quotes[1]!.correlationId);
    assert.deepEqual(Object.keys(p.samples[0]!).sort(), ['amount_in', 'amount_out', 'correlation_id', 'impact_bps', 'min_amount_out', 'notional_usd', 'rate_e6', 'worst_impact_bps']);
    assert.deepEqual(b.assets.map((a) => [a.symbol, a.status]), [['NVDAx', 'no_route']]);
    assert.ok(!JSON.stringify(b).includes('Usd'), 'no amountInUsd/amountOutUsd anywhere');
  });
});

describe('1Click live (NECTAR_IT=1; read-only, dry only)', { skip: process.env.NECTAR_IT !== '1' }, () => {
  it('three verified dry quotes for the reference pair; NVDAx no_route from the live token list', async () => {
    const db = new FeedDb(':memory:');
    const r = await new OneClickSampler(db, new OneClickClient(), defaultSamplerConfig(process.env), quiet).tick();
    assert.equal(r.dropped, 0);
    assert.equal(r.sets[0]?.samples.length, 3);
    assert.ok(r.assets.some((x) => x.symbol === 'NVDAx' && x.status === 'no_route'));
    console.log(JSON.stringify(db.oneClickReport(Date.now()).pairs.map((p) => ({ id: p.id, samples: p.samples.map((s) => [s.notional_usd, s.rate_e6, s.impact_bps, s.worst_impact_bps]) }))));
  });
});
