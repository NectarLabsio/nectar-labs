// Records one live DRY 1Click quote (reference pair) + the token list as test fixtures, and prints
// the SDK signature check. Read-only HTTP; `dry: true` is enforced by OneClickClient (Q-007).
// Usage: node --disable-warning=ExperimentalWarning scripts/record-oneclick-fixture.ts [outDir]

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyQuoteSignature } from '@defuse-protocol/one-click-sdk-typescript';
import { OneClickClient, buildDryQuote, defaultSamplerConfig } from '../src/oneclick.ts';

const out = resolve(process.argv[2] ?? 'test/fixtures');
mkdirSync(out, { recursive: true });
const cfg = defaultSamplerConfig(process.env);
if (cfg.refPair === null) throw new Error('ONECLICK_REF_PAIR=none');
const c = new OneClickClient();
const toks = await c.tokens();
const pick = (chain: string, sym: string) => {
  const t = toks.find((x) => x.blockchain === chain && x.symbol === sym);
  if (t === undefined) throw new Error(`token ${chain}:${sym} not listed`);
  return t;
};
const o = pick(cfg.refPair.from.blockchain, cfg.refPair.from.symbol);
const d = pick(cfg.refPair.to.blockchain, cfg.refPair.to.symbol);
const r = await c.dryQuote(buildDryQuote(o, d, cfg, Date.now()));
const ok = verifyQuoteSignature(r);
writeFileSync(resolve(out, 'oneclick-quote-ref.json'), JSON.stringify(r, null, 2) + '\n');
writeFileSync(resolve(out, 'oneclick-tokens.json'), JSON.stringify(toks.filter((t) => ['near', 'hood'].includes(t.blockchain)), null, 2) + '\n');
console.log(JSON.stringify({ verified: ok, correlationId: r.correlationId, amountInUsd: r.quote.amountInUsd, amountOutUsd: r.quote.amountOutUsd, tokens: toks.length, nvda: toks.filter((t) => /NVDA/i.test(t.symbol)).length }));
