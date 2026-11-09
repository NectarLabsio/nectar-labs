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
