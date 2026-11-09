// Types and helpers for the Feed REST API (services/feed/openapi.yaml). Fields marked P1 stay optional until WO-11 ships them.
import type { Bps, ExitCapacity, OracleSource, U128, U64 } from "./types";

export interface FeedAsset extends ExitCapacity {
  symbol: string;
  block_height: number;
  observed_at?: string;
}
export interface FeedAssets {
  as_of_block: number | null;
  as_of: string;
  assets: FeedAsset[];
}

export interface FeedSettlement {
  position_id: U64;
  quote_id: U64 | null;
  disc_bps: Bps | null;
  repay_usd_e6: U128 | null;
  seize_units: U128 | null;
  status: string | null;
  block_height: number | null;
  tx_hash: string | null;
  source: "event" | "view";
  observed_at: string;
  /** P1: quoter outcome when the feed indexed `quoter_result` / `quoter_fallback`. */
  quoter?: "result" | "fallback" | null;
  /** P1: OutLayer execution URL, only when the feed API provides one (C-013: URL scheme unverified, never built client-side). */
  outlayer_execution_url?: string | null;
  /** P1: keeper that called `trigger_preliquidation`, when indexed. */
  keeper?: string | null;
}
export interface FeedSettlements {
  as_of_block: number | null;
  as_of: string;
  items: FeedSettlement[];
}

/** One dry 1Click sample (GET /api/oneclick, WO-11c §3). Amounts are base-unit strings; rate_e6 = out/in in whole tokens × 1e6. */
export interface FeedOneClickSample {
  notional_usd: number;
  amount_in: string;
  amount_out: string;
  min_amount_out: string;
  rate_e6: string;
  /** 1 − rate(n)/rate(0.5×) from amountOut, floored at 0. */
  impact_bps: Bps;
  /** Same, from minAmountOut (worst case the solver may deliver). */
  worst_impact_bps: Bps;
}
export interface FeedOneClickPair {
  id: string;
  origin: string;
  destination: string;
  /** Every sample in the set passed verifyQuoteSignature (the feed drops the set otherwise). */
  verified: boolean;
  correlation_id?: string | null;
  samples: FeedOneClickSample[];
}
export interface FeedOneClickAsset {
  symbol: string;
  /** Sampled from the 1Click token list; "no_route" when the asset is absent. */
  status: string;
}
export interface FeedOneClick {
  as_of: string;
  pairs: FeedOneClickPair[];
  assets: FeedOneClickAsset[];
}

/** Route status for a symbol from the sampled token list, or null when the feed did not report it (never assumed). */
export function oneClickRouteStatus(d: FeedOneClick | null | undefined, symbol: string): string | null {
  return d?.assets.find((a) => a.symbol === symbol)?.status ?? null;
}

/** rate_e6 string → decimal string with up to 6 fraction digits, no float. */
export function formatRateE6(rateE6: string): string {
  let v: bigint;
  try {
    v = BigInt(rateE6);
  } catch {
    return "—";
  }
  const neg = v < 0n;
  if (neg) v = -v;
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${neg ? "−" : ""}${whole.toString()}${frac ? `.${frac}` : ""}`;
}

export interface FeedHealth {
  ok: boolean;
  last_block_seen: number | null;
  last_poll_at: string | null;
  last_error: string | null;
  source: string;
  events_indexed: number;
}

/** "Pyth" for `{ Pyth: ... }`, otherwise "Owner" (the P0 deployment has no `oracle_source` and is owner-oracle only). */
export function oracleSourceLabel(s: OracleSource | null | undefined): "Owner" | "Pyth" {
  return s && typeof s === "object" && "Pyth" in s ? "Pyth" : "Owner";
}

/** Exit gap = collateral value at stake − (Q + R + D), floored at 0 (PRD glossary). D counts only while the session is open. */
export function exitGapUsdE6(atStakeUsdE6: bigint, c: Pick<ExitCapacity, "q_usd_e6" | "r_usd_e6" | "d_usd_e6" | "session_open">): bigint {
  const cover = BigInt(c.q_usd_e6) + BigInt(c.r_usd_e6) + (c.session_open ? BigInt(c.d_usd_e6) : 0n);
  return atStakeUsdE6 > cover ? atStakeUsdE6 - cover : 0n;
}

/** Only https URLs survive; anything else coming from the feed is dropped. */
export function safeHttpsUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const x = new URL(u);
    return x.protocol === "https:" ? x.toString() : null;
  } catch {
    return null;
  }
}
