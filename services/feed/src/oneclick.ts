// 1Click depth sampler (F-060..F-064). DRY QUOTES ONLY (Q-007): the client can reach exactly two
// read-only endpoints (`GET /v0/tokens`, `POST /v0/quote`) and refuses to send any quote body whose
// `dry` is not literally `true`. No deposit, submit, status or intent path exists in this module.
// Every quote response is checked with the SDK's `verifyQuoteSignature` (F-062); a false result drops
// the sample (counted in meta `oneclick_dropped`). Verified samples keep the full response so G6 can
// re-verify offline. NVDAx has no 1Click route (F-063): a "no_route" row is written and no quote is sent.

import { verifyQuoteSignature, type OneClickQuoteResponse } from '@defuse-protocol/one-click-sdk-typescript';
import type { FeedDb, OneClickSampleRow } from './db.ts';
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

export interface SamplerConfig {
  /** Collateral symbols the Feed shows; a symbol is routable only if the token list has a match. */
  assets: Array<{ symbol: string; match: RegExp }>;
  /** Routable reference pair so G6 can show a verified signed quote (default near:wNEAR -> near:USDC). */
  refPair: { from: TokenRef; to: TokenRef } | null;
  /** Notional per sample, USD e6. */
  notionalUsdE6: bigint;
  /** Recipient/refund account used inside dry quotes (nothing is ever deposited). */
  dryAccount: string;
  slippageBps: number;
  intervalMs: number;
}

export type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; json(): Promise<unknown> }>;
export type Verifier = (resp: OneClickQuoteResponse) => boolean;

export function parseTokenRef(s: string): TokenRef {
  const i = s.indexOf(':');
  if (i <= 0 || i === s.length - 1) throw new Error(`bad token ref "${s}" (want chain:SYMBOL)`);
  return { blockchain: s.slice(0, i), symbol: s.slice(i + 1) };
}

export function defaultSamplerConfig(env: Record<string, string | undefined> = {}): SamplerConfig {
  const pair = env.ONECLICK_REF_PAIR ?? 'near:wNEAR->near:USDC';
  const [from, to] = pair.split('->');
  return {
    assets: [{ symbol: 'NVDAx', match: /NVDA/i }],
    refPair: pair === 'none' || from === undefined || to === undefined ? null : { from: parseTokenRef(from), to: parseTokenRef(to) },
    notionalUsdE6: BigInt(env.ONECLICK_NOTIONAL_USD_E6 ?? '1000000000'),
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

/** Base units of a token worth `usdE6` at `priceUsd` (token list price). */
export function unitsForUsd(usdE6: bigint, priceUsd: number, decimals: number): bigint {
  const p = toE6(priceUsd);
  if (p === 0n) throw new Error('token price is zero');
  return (usdE6 * 10n ** BigInt(decimals)) / p;
}

export function buildDryQuote(origin: OneClickToken, dest: OneClickToken, cfg: SamplerConfig, now: number): DryQuoteRequest {
  return {
    dry: true,
    swapType: 'EXACT_INPUT',
    slippageTolerance: cfg.slippageBps,
    originAsset: origin.assetId,
    depositType: 'INTENTS',
    destinationAsset: dest.assetId,
    amount: unitsForUsd(cfg.notionalUsdE6, origin.price, origin.decimals).toString(),
    refundTo: cfg.dryAccount,
    refundType: 'INTENTS',
    recipient: cfg.dryAccount,
    recipientType: 'INTENTS',
    deadline: new Date(now + 10 * 60_000).toISOString(),
  };
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

export type SampleRow = OneClickSampleRow;

export interface TickResult {
  stored: SampleRow[];
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

  /** Verifies and stores one response; returns the row or null when dropped. */
  accept(symbol: string, pair: string, resp: OneClickQuoteResponse, now: number): SampleRow | null {
    if (!this.verify(resp)) {
      this.db.bumpMeta('oneclick_dropped');
      this.log.warn('oneclick_sample_dropped', { reason: 'signature', pair, correlation_id: resp.correlationId ?? null });
      return null;
    }
    const inE6 = toE6(resp.quote.amountInUsd);
    const outE6 = toE6(resp.quote.amountOutUsd);
    const gap = inE6 === 0n ? null : Number(((inE6 - outE6) * 10_000n) / inE6);
    const row: SampleRow = {
      symbol, pair, status: 'verified', amount_in_usd_e6: inE6.toString(), amount_out_usd_e6: outE6.toString(),
      amount_out_formatted: typeof resp.quote.amountOutFormatted === 'string' ? resp.quote.amountOutFormatted : null, gap_bps: gap,
      correlation_id: resp.correlationId, quote_timestamp: resp.timestamp, observed_at: now,
    };
    this.db.addOneClickSample(row, JSON.stringify(resp));
    return row;
  }

  async tick(now: number = Date.now()): Promise<TickResult> {
    const out: TickResult = { stored: [], dropped: 0 };
    const tokens = await this.client.tokens();
    const usdc = findToken(tokens, { blockchain: 'near', symbol: 'USDC' });
    const sample = async (symbol: string, origin: OneClickToken, dest: OneClickToken): Promise<void> => {
      const pair = `${origin.blockchain}:${origin.symbol}->${dest.blockchain}:${dest.symbol}`;
      const resp = await this.client.dryQuote(buildDryQuote(origin, dest, this.cfg, now));
      const row = this.accept(symbol, pair, resp, now);
      if (row === null) out.dropped++;
      else out.stored.push(row);
    };
    for (const a of this.cfg.assets) {
      const t = tokens.find((x) => a.match.test(x.symbol));
      if (t === undefined || usdc === undefined) {
        const row: SampleRow = { symbol: a.symbol, pair: `${a.symbol}->near:USDC`, status: 'no_route', amount_in_usd_e6: null, amount_out_usd_e6: null, amount_out_formatted: null, gap_bps: null, correlation_id: null, quote_timestamp: null, observed_at: now };
        this.db.addOneClickSample(row, null);
        out.stored.push(row);
        continue;
      }
      await sample(a.symbol, t, usdc);
    }
    if (this.cfg.refPair !== null) {
      const o = findToken(tokens, this.cfg.refPair.from);
      const d = findToken(tokens, this.cfg.refPair.to);
      if (o === undefined || d === undefined) this.log.warn('oneclick_ref_pair_missing', { from: this.cfg.refPair.from.symbol, to: this.cfg.refPair.to.symbol });
      else await sample(`ref:${o.symbol}`, o, d);
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
        this.log.info('oneclick_tick', { stored: r.stored.length, dropped: r.dropped, verified: r.stored.filter((s) => s.status === 'verified').length });
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
