import type { RemoteView } from "./remote";
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

/** `get_collateral(symbol)` / `list_collaterals` item. Extra state fields: PRD §6.2 (confirm at G1).
 * v2 (interface-v7 §A2/A3) removes `market_session_open` and adds the weekend-guard and multiplier fields. */
export interface CollateralView extends Omit<CollateralInput, "market_session_open"> {
  /** v1 only (owner flag); absent on v2. */
  market_session_open?: boolean;
  oracle_price_usd_e6?: U128;
  oracle_updated_ns?: U64;
  active_committed_q_usd_e6?: U128;
  acc_fee_per_dollar_e18?: U128;
  // v2 (interface-v7 §A1–A3)
  total_debt_usd_e6?: U128;
  forced_closed?: boolean;
  multiplier_e18?: U128;
  multiplier_updated_ns?: U64;
  price_kind?: PriceKind;
  ca_pending?: boolean;
  ca_effective_ns?: U64;
  ca_multiplier_e18?: U128;
  weekend_ref_price_e6?: U128;
  weekend_ref_updated_ns?: U64;
}

// ---------------------------------------------------------------- v2 (interface-v7.md §A)

/** `contract_version()` on v2 starts with "2." ("2.0.0-v7"); v1 answers "nectar-core 0.1.0 …". */
export type ContractGeneration = "v1" | "v2";
/** interface-v7 §A2, precedence after "no_calendar": outside_hours → stale_price → forced_closed. */
export type SessionReason = "open" | "no_calendar" | "outside_hours" | "stale_price" | "forced_closed";
/** interface-v7 §A3. */
export type PriceKind = "Underlying" | "TokenIncludesMultiplier";
/** `[open_ns, close_ns)` NYSE session window, U64 strings. */
export type SessionWindow = [U64, U64];
/** `get_remote_config()` (interface-v7 §B, WO-21): keeper-attestation flag and the OutLayer `vault_read` pin. */
export interface RemoteConfigView {
  allow_keeper_deposit_attestation: boolean;
  vault_read_project_id: string | null;
  vault_read_version_key: string | null;
  vault_read_deposit_yocto: U128 | null;
  vault_read_gas_tgas: number | null;
  reservation_expiry_s: number;
}
/** `set_vault_read_config` arguments (owner; contract: 1..=128-char strings, deposit > 0, gas 10..=100 Tgas). */
export interface VaultReadConfigInput {
  project_id: string;
  version_key: string;
  deposit_yocto: U128;
  gas_tgas: number;
}
/** `pay_to` on LockCollateralAndBorrow (interface-v7 §A4). */
export interface PayTo {
  receiver_id: AccountId;
  memo?: string | null;
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
  /** P1 (docs/work/interface-p1.md): absent on the P0 deployment, which is owner-oracle only. */
  oracle_source?: OracleSource | null;
  /** P1, optional: confidence of the last accepted Pyth price, in bps of price. */
  oracle_conf_bps?: Bps | null;
  /** (1 − h)(Q + R + D) in USD e6; present on the live v1 deployment and on v2. */
  capacity_usd_e6?: U128;
  // v2 additions (interface-v7 §A6); absent on v1.
  session_reason?: SessionReason;
  total_debt_usd_e6?: U128;
  aggregate_capacity_usd_e6?: U128;
  aggregate_headroom_usd_e6?: U128;
  multiplier_e18?: U128;
  price_kind?: PriceKind;
  ca_pending?: boolean;
  ca_effective_ns?: U64;
  forced_closed?: boolean;
}

/** `get_exit_capacity` on v2: every §A6 addition present. */
export type ExitCapacityV2 = ExitCapacity &
  Required<Pick<ExitCapacity, "session_reason" | "total_debt_usd_e6" | "aggregate_capacity_usd_e6" | "aggregate_headroom_usd_e6" | "multiplier_e18" | "price_kind" | "ca_pending" | "ca_effective_ns" | "forced_closed">>;

// ---------------------------------------------------------------- P1 views and owner inputs (interface-p1.md, D-013, D-014)

/** `set_oracle_source(symbol, source)` / `get_oracle_source(symbol)`: unit variant `"Owner"` or `{ Pyth: {...} }`. */
export type OracleSource = "Owner" | { Pyth: { account: AccountId; price_identifier: string } };

/** `set_quoter_config(...)` args. */
export interface QuoterConfigInput {
  deposit_yocto: U128;
  gas_tgas: number;
  max_instructions: U64;
  max_memory_mb: number;
  max_execution_seconds: number;
}
/** `get_quoter_config()`: config plus pin (empty strings = P0 static pricing). Field set confirmed at G4. */
export interface QuoterConfigView extends Partial<QuoterConfigInput> {
  project_id?: string;
  version_key?: string;
  max_conf_bps?: Bps;
  [extra: string]: unknown;
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
  /** v2, display only (interface-v7 §A3). */
  entry_multiplier_e18?: U128;
  /** v2 remote collateral (interface-v7 §B); absent or null for NEAR-held positions. */
  remote?: RemoteView | null;
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

/** `preview_borrow(symbol, units, borrow_usd_e6[, referrer])`. v2 adds the fee stack and aggregate fields (interface-v7 §A6). */
export interface BorrowPreview {
  b_c_usd_e6: U128;
  static_limit_usd_e6: U128;
  premium_usd_e6: U128;
  ok: boolean;
  /** v2 adds "aggregate_limit" | "ca_pending" | "referrer_is_borrower". */
  reason: string | null;
  origination_fee_usd_e6?: U128;
  referrer_share_usd_e6?: U128;
  total_fees_usd_e6?: U128;
  net_proceeds_usd_e6?: U128;
  aggregate_headroom_usd_e6?: U128;
  multiplier_e18?: U128;
  session_open?: boolean;
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
  /** v2 only (interface-v7 §A4). Omitted from the JSON when absent, so the v1 msg stays byte-identical. */
  pay_to?: PayTo | null;
  /** v2 only (interface-v7 §A5). Omitted from the JSON when absent. */
  referrer?: AccountId | null;
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
  // v2 (standard "nectar", version "2.0.0"; interface-v7 §A6). Only referrer_paid has its fields fixed by the interface; the rest: confirm at G1b.
  referrer_paid: { referrer: AccountId; position_id: U64; amount_usd_e6: U128 };
  pay_to_failed: { position_id?: U64; borrower?: AccountId; receiver_id?: AccountId; amount_usd_e6?: U128 };
  claimable_withdrawn: { account_id?: AccountId; amount_usd_e6?: U128 };
  multiplier_updated: { symbol: string; multiplier_e18?: U128 };
  corporate_action_announced: { symbol: string; multiplier_e18?: U128; effective_ns?: U64 };
  session_forced_closed: { symbol: string; closed?: boolean };
}
export type NectarEventName = keyof NectarEventMap;
export type NectarEvent = {
  [K in NectarEventName]: { standard: "nectar"; version: string; event: K; data: [NectarEventMap[K]] };
}[NectarEventName];
