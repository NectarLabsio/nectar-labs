//! Stored records (borsh, versioned) and JSON inputs/views (interface-p0.md).

use near_sdk::json_types::{U64, U128};
use near_sdk::{AccountId, near};

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemoteChain {
    pub chain_id: String,
    pub vault_program: String,
    pub mpc_domain_id: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FeeSplit {
    pub buyers_bps: u16,
    pub lenders_bps: u16,
    pub treasury_bps: u16,
}

/// `upsert_collateral` input: the `collateral.<asset>` block of packages/config/config.yaml (D-009).
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct CollateralInput {
    pub symbol: String,
    pub token: AccountId,
    pub decimals: u8,
    pub price_feed_id: String,
    pub base_ltv_bps: u16,
    pub max_nectar_ltv_bps: u16,
    pub base_haircut_bps: u16,
    pub weekend_haircut_bps: u16,
    pub limit_premium_bps: u16,
    pub pre_liq_min_bps: u16,
    pub pre_liq_max_bps: u16,
    pub market_session_open: bool,
    pub verified_dex_depth_usd_e6: U128,
    pub nectar_reserve_usd_e6: U128,
    #[serde(default)]
    pub remote_chain: Option<RemoteChain>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CollateralConfig {
    pub symbol: String,
    pub token: AccountId,
    pub decimals: u8,
    pub price_feed_id: String,
    pub base_ltv_bps: u16,
    pub max_nectar_ltv_bps: u16,
    pub base_haircut_bps: u16,
    pub weekend_haircut_bps: u16,
    pub limit_premium_bps: u16,
    pub pre_liq_min_bps: u16,
    pub pre_liq_max_bps: u16,
    pub market_session_open: bool,
    pub oracle_price_usd_e6: U128,
    pub oracle_updated_ns: U64,
    pub verified_dex_depth_usd_e6: U128,
    pub nectar_reserve_usd_e6: U128,
    pub active_committed_q_usd_e6: U128,
    pub acc_fee_per_dollar_e18: U128,
    pub remote_chain: Option<RemoteChain>,
}

#[near(serializers = [borsh])]
pub enum VCollateral {
    V1(CollateralConfig),
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Quote {
    pub quote_id: U64,
    pub buyer: AccountId,
    pub collateral: String,
    pub committed_usd_e6: U128,
    pub remaining_usd_e6: U128,
    pub max_discount_bps: u16,
    pub notice_period_ns: U64,
    pub unlock_ns: Option<U64>,
    pub buyer_remote_recipient: Option<String>,
    pub secrets_profile: Option<String>,
    // MasterChef reward debt, denominated in USD e6 (µUSDC) despite the `_e18` suffix:
    // `ceil(weight_usd_e6 * acc_fee_per_usd_e18 / 1e18)` at the last checkpoint, where weight is
    // `remaining_usd_e6` (0 while exiting). Only the index it is multiplied by is e18-scaled.
    // Name kept for ABI/borsh compatibility with the deployed contract.
    // (Plain comment, not `///`: a doc comment enters the embedded ABI and changes the wasm hash.)
    pub fee_debt_e18: U128,
    pub claimable_fees_usd_e6: U128,
    pub created_ns: U64,
}

impl Quote {
    pub fn exiting(&self) -> bool {
        self.unlock_ns.is_some()
    }
    /// Fee-index weight: remaining escrow while active, 0 once exit has started.
    pub fn weight(&self) -> u128 {
        if self.exiting() { 0 } else { self.remaining_usd_e6.0 }
    }
}

#[near(serializers = [borsh])]
pub enum VQuote {
    V1(Quote),
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PositionStatus {
    Open,
    Settling,
    Closed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Position {
    pub position_id: U64,
    pub borrower: AccountId,
    pub collateral: String,
    pub units: U128,
    pub debt_usd_e6: U128,
    pub premium_usd_e6: U128,
    pub pre_liq_ltv_bps: u16,
    pub opened_ns: U64,
    pub remote_path: Option<String>,
    pub nonce: U64,
    pub status: PositionStatus,
}

#[near(serializers = [borsh])]
pub enum VPosition {
    V1(Position),
}

/// `ft_on_transfer` msg (serde externally tagged).
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub enum TokenMsg {
    SupplyLendingLiquidity,
    FundPappusQuote {
        collateral: String,
        max_discount_bps: u16,
        notice_period_ns: U64,
        #[serde(default)]
        buyer_remote_recipient: Option<String>,
        #[serde(default)]
        secrets_profile: Option<String>,
    },
    TopUpQuote {
        quote_id: U64,
    },
    LockCollateralAndBorrow {
        collateral: String,
        borrow_usd_e6: U128,
        pre_liq_ltv_bps: u16,
        #[serde(default)]
        remote_path: Option<String>,
    },
    Repay {
        position_id: U64,
    },
}

/// What a contract-initiated `ft_transfer` was for; drives the rollback in `on_payout`.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Payout {
    BorrowProceeds { position_id: U64 },
    CollateralRelease { position_id: U64 },
    SettlementBuyer { position_id: U64, quote_id: U64 },
    SettlementKeeper { position_id: U64 },
    QuoteWithdrawal { quote_id: U64, principal_usd_e6: U128, fees_usd_e6: U128 },
    Fees { quote_id: U64 },
}

// ---------- views ----------

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ConfigView {
    pub contract_version: String,
    pub owner: AccountId,
    pub usdc_token: AccountId,
    pub keeper: AccountId,
    pub keeper_fee_bps: u16,
    pub fee_split: FeeSplit,
    pub paused: bool,
    pub min_notice_period_ns: U64,
    pub min_quote_usd_e6: U128,
    pub max_age_ns_session: U64,
    pub max_age_ns_closed: U64,
    pub band_bps: u16,
    pub gas_reserve_yocto: U128,
    pub next_quote_id: U64,
    pub next_position_id: U64,
    pub max_quotes_per_asset: u32,
    pub max_quotes_per_settlement: u32,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ExitCapacityView {
    pub q_usd_e6: U128,
    pub r_usd_e6: U128,
    /// Effective D_c (0 when the session is closed).
    pub d_usd_e6: U128,
    pub haircut_bps: u16,
    pub session_open: bool,
    pub oracle_price_usd_e6: U128,
    pub oracle_age_s: U64,
    pub oracle_fresh: bool,
    /// LTV ceiling per whole unit: max_nectar_ltv_bps * price / 1e4 (None before the first price).
    pub b_c_usd_per_unit_e6: Option<U128>,
    /// max_nectar_ltv_bps while exit capacity > 0, else 0.
    pub limit_bps_effective: u16,
    /// (1e4 - h_c)(Q_c + R_c + D_c)/1e4 — the second term of B_c (additive field).
    pub capacity_usd_e6: U128,
    /// P1 (interface-p1.md): price source for this symbol.
    pub oracle_source: OracleSource,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct HealthView {
    pub value_usd_e6: U128,
    pub debt_usd_e6: U128,
    pub ltv_bps: u32,
    pub pre_liq_ltv_bps: u16,
    pub oracle_fresh: bool,
    pub triggerable: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct PoolView {
    pub available_usd_e6: U128,
    pub utilised_usd_e6: U128,
    pub treasury_usd_e6: U128,
    pub lenders_fees_usd_e6: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct PreviewBorrowView {
    pub b_c_usd_e6: U128,
    pub static_limit_usd_e6: U128,
    pub premium_usd_e6: U128,
    pub ok: bool,
    pub reason: Option<String>,
}

// ---------------------------------------------------------------- P1 (interface-p1.md, state V1)

/// Price source per symbol. `Owner` = P0 owner oracle. `Pyth` is stored for WO-10b.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub enum OracleSource {
    #[default]
    Owner,
    Pyth { account: AccountId, price_identifier: String },
}

/// OutLayer quoter settings (F-047). Empty `project_id`/`version_key` = P0 static pricing.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QuoterConfig {
    pub outlayer_account: AccountId,
    pub project_id: String,
    pub version_key: String,
    pub deposit_yocto: u128,
    pub gas_tgas: u64,
    pub max_instructions: u64,
    pub max_memory_mb: u32,
    pub max_execution_seconds: u32,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QuoterConfigView {
    pub enabled: bool,
    pub outlayer_account: AccountId,
    pub project_id: String,
    pub version_key: String,
    pub deposit_yocto: U128,
    pub gas_tgas: u64,
    pub max_instructions: U64,
    pub max_memory_mb: u32,
    pub max_execution_seconds: u32,
    pub max_conf_bps: u16,
}
