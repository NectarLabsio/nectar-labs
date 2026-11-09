// Records three live DRY 1Click quotes (reference pair at 0.5x / 1x / 2x of ONECLICK_NOTIONAL_USD) + the
// token list from the same snapshot as test fixtures (FEED_FIXTURES=1 replays them), and prints the SDK
// signature check plus the base-unit impact. Read-only HTTP; `dry: true` is enforced by OneClickClient
// (Q-007). `oneclick-quote-ref.json` (G6 evidence, 2026-11-09) is left untouched.
// Usage: node --disable-warning=ExperimentalWarning scripts/record-oneclick-fixture.ts [outDir]

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyQuoteSignature } from '@defuse-protocol/one-click-sdk-typescript';
import type { ImpactFixture } from '../src/fixtures.ts';
import { OneClickClient, buildDryQuote, defaultSamplerConfig, impactSamples, sizeNotionals } from '../src/oneclick.ts';

const out = resolve(process.argv[2] ?? 'test/fixtures');
mkdirSync(out, { recursive: true });
const cfg = defaultSamplerConfig(process.env);
const pair = cfg.refPairs[0];
if (pair === undefined) throw new Error('ONECLICK_REF_PAIR=none');
const c = new OneClickClient();
const toks = await c.tokens();
const pick = (chain: string, sym: string) => {
  const t = toks.find((x) => x.blockchain === chain && x.symbol === sym);
  if (t === undefined) throw new Error(`token ${chain}:${sym} not listed`);
  return t;
};
const o = pick(pair.from.blockchain, pair.from.symbol);
const d = pick(pair.to.blockchain, pair.to.symbol);
const now = Date.now();
const notionals = sizeNotionals(cfg.notionalUsdE6);
const reqs = notionals.map((n) => buildDryQuote(o, d, cfg, now, n));
const quotes = [];
for (const r of reqs) quotes.push(await c.dryQuote(r));
const verified = quotes.map((q) => verifyQuoteSignature(q));
if (verified.includes(false)) throw new Error(`signature check failed: ${JSON.stringify(verified)} (nothing written)`);
const samples = impactSamples(o, d, notionals, reqs, quotes);
const fx: ImpactFixture = {
  recorded_at: new Date(now).toISOString(),
  notional_usd: (Number(cfg.notionalUsdE6 / 10_000n) / 100).toString(),
  ref_pair: `${pair.from.blockchain}:${pair.from.symbol}->${pair.to.blockchain}:${pair.to.symbol}`,
  quotes,
};
writeFileSync(resolve(out, 'oneclick-impact.json'), JSON.stringify(fx, null, 2) + '\n');
writeFileSync(resolve(out, 'oneclick-tokens.json'), JSON.stringify(toks.filter((t) => ['near', 'hood'].includes(t.blockchain)), null, 2) + '\n');
console.log(JSON.stringify({ verified, pair: pair.id, samples, tokens: toks.length, nvda: toks.filter((t) => /NVDA/i.test(t.symbol)).length }));
