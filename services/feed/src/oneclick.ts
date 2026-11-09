// 1Click depth sampler (F-060..F-064, C-014). DRY QUOTES ONLY (Q-007): the client can reach exactly two
// read-only endpoints (`GET /v0/tokens`, `POST /v0/quote`) and refuses to send any quote body whose
// `dry` is not literally `true`. No deposit, submit, status or intent path exists in this module.
// Every quote response is checked with the SDK's `verifyQuoteSignature` (F-062); one false result drops
// the whole 3-size set (counted in meta `oneclick_dropped`). Verified sets keep the full responses so G6
// can re-verify offline. Asset route status (NVDAx: F-063) is read from the token list on every tick
// ("no_route" when absent), never hard-coded.
//
// Price impact (G6 fix): per pair, three dry quotes at 0.5x / 1x / 2x of the notional. The token-list
// price only sizes amountIn; the measurement uses base units only:
//   rate_e6          = amountOut * 10^dec_in * 1e6 / (amountIn * 10^dec_out)        (BigInt, floor)
//   impact_bps       = floor((rate(0.5x) - rate(n)) * 1e4 / rate(0.5x)), clamped at 0
//   worst_impact_bps = same, with rate(n) computed from minAmountOut (slippage floor)
// amountInUsd / amountOutUsd are never read (amountOutUsd mirrors the input value, C-014).

import { verifyQuoteSignature, type OneClickQuoteResponse } from '@defuse-protocol/one-click-sdk-typescript';
import type { FeedDb, OneClickPairSample, OneClickSetRow } from './db.ts';
import { errMsg, type Logger } from './log.ts';

export const ONECLICK_BASE = 'https://1click.chaindefuser.com';
const ALLOWED = new Set(['GET /v0/tokens', 'POST /v0/quote']);

export interface OneClickToken {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price: number;
}

/** `chain:SYMBOL`, e.g. `near:wNEAR`. */
export interface TokenRef {
  blockchain: string;
  symbol: string;
}

export interface DryQuoteRequest {
  dry: true;
  swapType: 'EXACT_INPUT';
  slippageTolerance: number;
  originAsset: string;
  depositType: 'INTENTS';
  destinationAsset: string;
  amount: string;
  refundTo: string;
  refundType: 'INTENTS';
  recipient: string;
  recipientType: 'INTENTS';
  deadline: string;
}

export interface PairConfig {
  /** e.g. `wnear-usdc` */
  id: string;
  from: TokenRef;
  to: TokenRef;
}

export interface SamplerConfig {
  /** Collateral symbols the Feed shows; a symbol is routable only if the token list has a match. */
  assets: Array<{ symbol: string; match: RegExp }>;
  /** Routable reference pairs sampled at three sizes (default near:wNEAR -> near:USDC). */
  refPairs: PairConfig[];
  /** 1x notional, USD e6 (from ONECLICK_NOTIONAL_USD, default 1000). */
  notionalUsdE6: bigint;
  /** Recipient/refund account used inside dry quotes (nothing is ever deposited). */
  dryAccount: string;
  slippageBps: number;
  intervalMs: number;
}

/** Size multipliers (numerator, denominator); the first one is the impact reference. */
export const SIZES: ReadonlyArray<readonly [bigint, bigint]> = [[1n, 2n], [1n, 1n], [2n, 1n]];

export type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; json(): Promise<unknown> }>;
export type Verifier = (resp: OneClickQuoteResponse) => boolean;

export function parseTokenRef(s: string): TokenRef {
  const i = s.indexOf(':');
  if (i <= 0 || i === s.length - 1) throw new Error(`bad token ref "${s}" (want chain:SYMBOL)`);
  return { blockchain: s.slice(0, i), symbol: s.slice(i + 1) };
}

export const pairId = (from: TokenRef, to: TokenRef): string => `${from.symbol}-${to.symbol}`.toLowerCase();

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `NVDAx` -> /NVDA/i (xStocks-style trailing `x` dropped) so any listing of the underlying counts as a route. */
export function assetMatcher(symbol: string): RegExp {
  const base = /^[A-Z0-9]+x$/.test(symbol) ? symbol.slice(0, -1) : symbol;
  return new RegExp(escapeRe(base), 'i');
}

export function defaultSamplerConfig(env: Record<string, string | undefined> = {}): SamplerConfig {
  const pairs = env.ONECLICK_REF_PAIR ?? 'near:wNEAR->near:USDC';
  const refPairs: PairConfig[] = [];
  if (pairs !== 'none') {
    for (const p of pairs.split(',').map((x) => x.trim()).filter((x) => x !== '')) {
      const [from, to, extra] = p.split('->');
      if (from === undefined || to === undefined || extra !== undefined) throw new Error(`bad ONECLICK_REF_PAIR entry "${p}" (want chain:SYM->chain:SYM)`);
      const f = parseTokenRef(from);
      const t = parseTokenRef(to);
      refPairs.push({ id: pairId(f, t), from: f, to: t });
    }
  }
  const assets = (env.ONECLICK_ASSETS ?? 'NVDAx').split(',').map((x) => x.trim()).filter((x) => x !== '');
  return {
    assets: assets.map((symbol) => ({ symbol, match: assetMatcher(symbol) })),
    refPairs,
    notionalUsdE6: toE6(env.ONECLICK_NOTIONAL_USD ?? '1000'),
    dryAccount: env.ONECLICK_DRY_ACCOUNT ?? 'nectar-feed-dry.near',
    slippageBps: Number(env.ONECLICK_SLIPPAGE_BPS ?? 100),
    intervalMs: Number(env.ONECLICK_INTERVAL_MS ?? 300_000),
  };
}

/** Decimal string (or JSON number) -> integer e6, floor. No floats in the arithmetic. */
export function toE6(v: string | number): bigint {
  let s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(12)) : v.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`not a non-negative decimal: ${String(v)}`);
  const [int, frac = ''] = s.split('.');
  s = (int ?? '0') + (frac + '000000').slice(0, 6);
  return BigInt(s);
}

/** Base units of a token worth `usdE6` at `priceUsd` (token list price). Sizing only, never a measurement. */
export function unitsForUsd(usdE6: bigint, priceUsd: number, decimals: number): bigint {
  const p = toE6(priceUsd);
  if (p === 0n) throw new Error('token price is zero');
  return (usdE6 * 10n ** BigInt(decimals)) / p;
}

/** rate_e6 = amountOut·10^decIn·1e6 / (amountIn·10^decOut): destination whole units per origin whole unit, e6, floor. */
export function rateE6(amountIn: bigint, amountOut: bigint, decIn: number, decOut: number): bigint {
  if (amountIn <= 0n) throw new Error('amountIn must be positive');
  return (amountOut * 10n ** BigInt(decIn) * 1_000_000n) / (amountIn * 10n ** BigInt(decOut));
}

/** floor((ref − rate)·1e4 / ref); 0 when the larger size is not worse. */
export function impactBps(refRateE6: bigint, rate: bigint): number {
  if (refRateE6 <= 0n || rate >= refRateE6) return 0;
  return Number(((refRateE6 - rate) * 10_000n) / refRateE6);
}

/** Notional (USD e6) for each of SIZES. */
export const sizeNotionals = (notionalUsdE6: bigint): bigint[] => SIZES.map(([n, d]) => (notionalUsdE6 * n) / d);

export function buildDryQuote(origin: OneClickToken, dest: OneClickToken, cfg: SamplerConfig, now: number, usdE6: bigint = cfg.notionalUsdE6): DryQuoteRequest {
  return {
    dry: true,
    swapType: 'EXACT_INPUT',
    slippageTolerance: cfg.slippageBps,
    originAsset: origin.assetId,
    depositType: 'INTENTS',
    destinationAsset: dest.assetId,
    amount: unitsForUsd(usdE6, origin.price, origin.decimals).toString(),
    refundTo: cfg.dryAccount,
    refundType: 'INTENTS',
    recipient: cfg.dryAccount,
    recipientType: 'INTENTS',
    deadline: new Date(now + 10 * 60_000).toISOString(),
  };
}

/**
 * Pure: verified responses for SIZES (0.5x, 1x, 2x) -> samples with rate / impact from base units.
 * Throws when a response does not echo its request (dry, swap type, assets, amount).
 */
export function impactSamples(origin: OneClickToken, dest: OneClickToken, notionals: bigint[], reqs: DryQuoteRequest[], resps: OneClickQuoteResponse[]): OneClickPairSample[] {
  const rows = resps.map((r, i) => {
    const req = reqs[i];
    const q = r.quoteRequest as { dry?: unknown; swapType?: unknown; originAsset?: unknown; destinationAsset?: unknown; amount?: unknown };
    if (req === undefined || q.dry !== true || q.swapType !== 'EXACT_INPUT' || q.originAsset !== req.originAsset || q.destinationAsset !== req.destinationAsset || q.amount !== req.amount)
      throw new Error(`quote ${i} does not match its dry request`);
    const amountIn = BigInt(r.quote.amountIn);
    const amountOut = BigInt(r.quote.amountOut);
    const minOut = BigInt(r.quote.minAmountOut);
    return { r, amountIn, amountOut, minOut, rate: rateE6(amountIn, amountOut, origin.decimals, dest.decimals), worst: rateE6(amountIn, minOut, origin.decimals, dest.decimals) };
  });
  const ref = rows[0]?.rate ?? 0n;
  return rows.map((x, i) => ({
    notional_usd: Number((notionals[i] ?? 0n) / 1_000_000n),
    amount_in: x.amountIn.toString(),
    amount_out: x.amountOut.toString(),
    min_amount_out: x.minOut.toString(),
    rate_e6: x.rate.toString(),
    impact_bps: impactBps(ref, x.rate),
    worst_impact_bps: impactBps(ref, x.worst),
    correlation_id: x.r.correlationId,
  }));
}

export class OneClickClient {
  private readonly fetcher: Fetcher;
  private readonly base: string;
  private readonly bearer: string | null;

  constructor(fetcher: Fetcher = globalThis.fetch as unknown as Fetcher, base: string = ONECLICK_BASE, bearer: string | null = null) {
    this.fetcher = fetcher;
    this.base = base;
    this.bearer = bearer;
  }

  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    if (!ALLOWED.has(`${method} ${path}`)) throw new Error(`1Click path refused: ${method} ${path} (dry-only client, Q-007)`);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.bearer !== null) headers.authorization = `Bearer ${this.bearer}`;
    const res = await this.fetcher(this.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    const json = await res.json().catch(() => null);
    if (res.status < 200 || res.status >= 300) throw new Error(`1Click ${path} HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
    return json;
  }

  async tokens(): Promise<OneClickToken[]> {
    const v = await this.call('GET', '/v0/tokens');
    if (!Array.isArray(v)) throw new Error('1Click /v0/tokens: not an array');
    return v as OneClickToken[];
  }

  async dryQuote(req: DryQuoteRequest): Promise<OneClickQuoteResponse> {
    // Runtime guard as well as the type: a non-dry body never leaves this process.
    if ((req as { dry: unknown }).dry !== true) throw new Error('refusing non-dry 1Click quote (Q-007)');
    return (await this.call('POST', '/v0/quote', req)) as OneClickQuoteResponse;
  }
}

export interface TickResult {
  sets: OneClickSetRow[];
  assets: Array<{ symbol: string; status: 'no_route' | 'route' }>;
  dropped: number;
}

const findToken = (list: OneClickToken[], r: TokenRef): OneClickToken | undefined =>
  list.find((t) => t.blockchain.toLowerCase() === r.blockchain.toLowerCase() && t.symbol.toLowerCase() === r.symbol.toLowerCase());

export class OneClickSampler {
  private readonly db: FeedDb;
  private readonly client: OneClickClient;
  private readonly cfg: SamplerConfig;
  private readonly log: Logger;
  private readonly verify: Verifier;

  constructor(db: FeedDb, client: OneClickClient, cfg: SamplerConfig, log: Logger, verify: Verifier = (r) => verifyQuoteSignature(r)) {
    this.db = db;
    this.client = client;
    this.cfg = cfg;
    this.log = log;
    this.verify = verify;
  }

  /** Three dry quotes; each must verify and echo its request, or the whole set is dropped (null). */
  async samplePair(id: string, origin: OneClickToken, dest: OneClickToken, now: number): Promise<OneClickSetRow | null> {
    const notionals = sizeNotionals(this.cfg.notionalUsdE6);
    const reqs = notionals.map((n) => buildDryQuote(origin, dest, this.cfg, now, n));
    const resps: OneClickQuoteResponse[] = [];
    for (const req of reqs) resps.push(await this.client.dryQuote(req));
    let reason = resps.some((r) => !this.verify(r)) ? 'signature' : '';
    let samples: OneClickPairSample[] | null = null;
    if (reason === '') {
      try {
        samples = impactSamples(origin, dest, notionals, reqs, resps);
      } catch (e) {
        reason = errMsg(e);
      }
    }
    if (samples === null) {
      this.db.bumpMeta('oneclick_dropped');
      this.log.warn('oneclick_set_dropped', { reason, pair: id, correlation_ids: resps.map((r) => r.correlationId ?? '').join(',') });
      return null;
    }
    const row: OneClickSetRow = { pair_id: id, origin: origin.assetId, destination: dest.assetId, observed_at: now, samples };
    this.db.addOneClickSet(row, JSON.stringify(resps));
    return row;
  }

  async tick(now: number = Date.now()): Promise<TickResult> {
    const out: TickResult = { sets: [], assets: [], dropped: 0 };
    const tokens = await this.client.tokens();
    const usdc = findToken(tokens, { blockchain: 'near', symbol: 'USDC' });
    // A failing pair (HTTP error, no quote) is counted as dropped; the other pairs still sample.
    const run = async (id: string, o: OneClickToken, d: OneClickToken): Promise<void> => {
      const s = await this.samplePair(id, o, d, now).catch((e: unknown) => {
        this.log.warn('oneclick_pair_failed', { pair: id, error: errMsg(e) });
        return null;
      });
      if (s === null) out.dropped++;
      else out.sets.push(s);
    };
    for (const a of this.cfg.assets) {
      const t = tokens.find((x) => a.match.test(x.symbol));
      const status = t === undefined ? 'no_route' : 'route';
      this.db.setOneClickAsset(a.symbol, status, now);
      out.assets.push({ symbol: a.symbol, status });
      if (t !== undefined && usdc !== undefined && t.assetId !== usdc.assetId) await run(`${a.symbol.toLowerCase()}-usdc`, t, usdc);
    }
    for (const p of this.cfg.refPairs) {
      const o = findToken(tokens, p.from);
      const d = findToken(tokens, p.to);
      if (o === undefined || d === undefined) this.log.warn('oneclick_ref_pair_missing', { pair: p.id });
      else await run(p.id, o, d);
    }
    this.db.setMeta('oneclick_last_tick_at', String(now));
    return out;
  }

  /** Loop with exponential backoff on error (5 s .. interval). */
  async run(signal: AbortSignal): Promise<void> {
    let backoff = 5_000;
    while (!signal.aborted) {
      let wait = this.cfg.intervalMs;
      try {
        const r = await this.tick();
        backoff = 5_000;
        this.log.info('oneclick_tick', { sets: r.sets.length, dropped: r.dropped, no_route: r.assets.filter((a) => a.status === 'no_route').length });
      } catch (e) {
        this.log.warn('oneclick_tick_failed', { error: errMsg(e), retry_ms: backoff });
        wait = backoff;
        backoff = Math.min(backoff * 2, this.cfg.intervalMs);
      }
      await new Promise<void>((res) => {
        const t = setTimeout(res, wait);
        signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
      });
    }
  }
}

/** Replays recorded responses keyed by request `amount` (FEED_FIXTURES=1 and tests). Same two paths only, no network. */
export function fixtureFetcher(tokens: OneClickToken[], quotes: OneClickQuoteResponse[]): Fetcher {
  const byAmount = new Map(quotes.map((q) => [String((q.quoteRequest as { amount?: unknown }).amount), q]));
  return async (url, init) => {
    if (url.endsWith('/v0/tokens') && init.method === 'GET') return { status: 200, json: async () => tokens };
    if (url.endsWith('/v0/quote') && init.method === 'POST') {
      const amount = String((JSON.parse(init.body ?? '{}') as { amount?: unknown }).amount);
      const q = byAmount.get(amount);
      return q === undefined ? { status: 404, json: async () => ({ message: `no fixture for amount ${amount}` }) } : { status: 200, json: async () => q };
    }
    return { status: 404, json: async () => ({}) };
  };
}
