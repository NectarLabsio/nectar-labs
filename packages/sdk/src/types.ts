// Types for the nectar-core P0 ABI. Source of truth: docs/work/interface-p0.md (orchestrator, 2026-11-10).
// Encoding: u128 amounts and u64 ids/timestamps are JSON strings; bps are numbers (u16).
// Struct fields not spelled out in interface-p0.md follow PRD §6.2 and are marked "PRD §6.2 (confirm at G1)".

/** u128 as a decimal JSON string. */
export type U128 = string;
/** u64 as a decimal JSON string. */
export type U64 = string;
/** Basis points, 10_000 denominator. */
export type Bps = number;
export type AccountId = string;

export type PositionStatus = "Open" | "Settling" | "Closed";

/** `upsert_collateral(symbol, config)` input = config.yaml `collateral.nvdax` fields. */
export interface CollateralInput {
  symbol: string;
  token: AccountId;
  decimals: number;
  price_feed_id: string;
  base_ltv_bps: Bps;
  max_nectar_ltv_bps: Bps;
  base_haircut_bps: Bps;
  weekend_haircut_bps: Bps;
  limit_premium_bps: Bps;
  pre_liq_min_bps: Bps;
  pre_liq_max_bps: Bps;
  market_session_open: boolean;
  verified_dex_depth_usd_e6: U128;
  nectar_reserve_usd_e6: U128;
}

/** `get_collateral(symbol)` / `list_collaterals` item. Extra state fields: PRD §6.2 (confirm at G1). */
export interface CollateralView extends CollateralInput {
  oracle_price_usd_e6?: U128;
  oracle_updated_ns?: U64;
  active_committed_q_usd_e6?: U128;
  acc_fee_per_dollar_e18?: U128;
}

/** `get_exit_capacity(symbol)`. */
export interface ExitCapacity {
  q_usd_e6: U128;
  r_usd_e6: U128;
  d_usd_e6: U128;
  haircut_bps: Bps;
  session_open: boolean;
  oracle_price_usd_e6: U128;
  oracle_age_s: U64 | number;
  oracle_fresh: boolean;
  b_c_usd_per_unit_e6?: U128 | null;
  limit_bps_effective: Bps;
}

/** `get_quote(quote_id)` / `list_quotes`. Fields: PRD §6.2 (confirm at G1). */
export interface QuoteView {
  id: U64;
  buyer: AccountId;
  collateral: string;
  committed_usd_e6: U128;
  remaining_usd_e6: U128;
  max_discount_bps: Bps;
  notice_period_ns: U64;
  unlock_ns: U64 | null;
  buyer_remote_recipient: string | null;
  claimable_fees_usd_e6?: U128;
  fee_debt_e18?: U128;
}

/** `get_position(position_id)` / `list_positions`. Fields: PRD §6.2 + interface-p0 `status` (confirm at G1). */
export interface PositionView {
  id: U64;
  borrower: AccountId;
  collateral: string;
  units: U128;
  debt_usd_e6: U128;
  pre_liq_ltv_bps: Bps;
  opened_ns: U64;
  status: PositionStatus;
}

/** `get_health(position_id)`. */
export interface HealthView {
  value_usd_e6: U128;
  debt_usd_e6: U128;
  ltv_bps: Bps;
  pre_liq_ltv_bps: Bps;
  oracle_fresh: boolean;
  triggerable: boolean;
}

/** `get_pool()`. */
export interface PoolView {
  available_usd_e6: U128;
  utilised_usd_e6: U128;
  treasury_usd_e6: U128;
  lenders_fees_usd_e6: U128;
}

/** `preview_borrow(symbol, units, borrow_usd_e6)`. */
export interface BorrowPreview {
  b_c_usd_e6: U128;
  static_limit_usd_e6: U128;
  premium_usd_e6: U128;
  ok: boolean;
  reason: string | null;
}

export interface FeeSplit {
  buyers_bps: Bps;
  lenders_bps: Bps;
  treasury_bps: Bps;
}

/** `get_config()`. Field set is not fixed by interface-p0.md; everything beyond `owner` is optional (confirm at G1). */
export interface CoreConfigView {
  owner: AccountId;
  usdc_token?: AccountId;
  keeper?: AccountId;
  paused?: boolean;
  fee_split?: FeeSplit;
  min_notice_period_ns?: U64;
  min_quote_usd_e6?: U128;
  max_age_ns_session?: U64;
  max_age_ns_closed?: U64;
  band_bps?: Bps;
  [extra: string]: unknown;
}

// ---------------------------------------------------------------- ft_on_transfer msg (externally tagged enum)

export interface FundPappusQuoteArgs {
  collateral: string;
  max_discount_bps: Bps;
  notice_period_ns: U64;
  buyer_remote_recipient: string | null;
}
export interface TopUpQuoteArgs { quote_id: U64 }
export interface LockCollateralAndBorrowArgs {
  collateral: string;
  borrow_usd_e6: U128;
  pre_liq_ltv_bps: Bps;
}
export interface RepayArgs { position_id: U64 }

export type FtOnTransferMsg =
  | "SupplyLendingLiquidity"
  | { FundPappusQuote: FundPappusQuoteArgs }
  | { TopUpQuote: TopUpQuoteArgs }
  | { LockCollateralAndBorrow: LockCollateralAndBorrowArgs }
  | { Repay: RepayArgs };

// ---------------------------------------------------------------- events (NEP-297, standard "nectar", version "1.0.0")

export interface NectarEventMap {
  quote_funded: { quote_id: U64; buyer: AccountId; collateral: string; amount_usd_e6: U128; max_discount_bps: Bps };
  quote_topped_up: { quote_id: U64; amount_usd_e6: U128 };
  quote_exiting: { quote_id: U64; unlock_ns: U64 };
  quote_withdrawn: { quote_id: U64; principal_usd_e6: U128; fees_usd_e6: U128 };
  fees_claimed: { quote_id: U64; amount_usd_e6: U128 };
  liquidity_supplied: { account: AccountId; amount_usd_e6: U128 };
  position_opened: { position_id: U64; borrower: AccountId; collateral: string; units: U128; debt_usd_e6: U128; premium_usd_e6: U128 };
  repaid: { position_id: U64; amount_usd_e6: U128; remaining_debt_usd_e6: U128 };
  preliq_triggered: { position_id: U64; keeper: AccountId };
  settled_near: { position_id: U64; quote_id: U64; disc_bps: Bps; repay_usd_e6: U128; seize_units: U128; buyer: AccountId };
  oracle_updated: { symbol: string; price_usd_e6: U128 };
  oracle_rejected: { symbol: string; price_usd_e6: U128; last_usd_e6: U128 };
  collateral_upserted: { symbol: string };
  paused: Record<string, never>;
  unpaused: Record<string, never>;
}
export type NectarEventName = keyof NectarEventMap;
export type NectarEvent = {
  [K in NectarEventName]: { standard: "nectar"; version: string; event: K; data: [NectarEventMap[K]] };
}[NectarEventName];
