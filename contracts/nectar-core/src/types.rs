//! Stored records (borsh, versioned) and JSON inputs/views (interface-p0.md; v2 deltas: interface-v7.md §A).

use near_sdk::json_types::{I64, U64, U128};
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
    pub verified_dex_depth_usd_e6: U128,
    #[serde(default)]
    pub remote_chain: Option<RemoteChain>,
    /// v2 (A3): None keeps the stored kind (Underlying for a new symbol).
    #[serde(default)]
    pub price_kind: Option<PriceKind>,
}

/// v2 (A3, PRD §4.6): how the oracle price relates to one token.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum PriceKind {
    /// Price of the underlying share: V = units·M/1e18·price/10^d.
    #[default]
    Underlying,
    /// Price of one token (already includes M): M is treated as 1e18.
    TokenIncludesMultiplier,
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
    pub oracle_price_usd_e6: U128,
    pub oracle_updated_ns: U64,
    pub verified_dex_depth_usd_e6: U128,
    pub active_committed_q_usd_e6: U128,
    pub acc_fee_per_dollar_e18: U128,
    pub remote_chain: Option<RemoteChain>,
    // ---- v2 (interface-v7.md A1-A3)
    /// A1: sum of open debt in this asset (+ borrow, - repay, - debt repaid at settlement).
    pub total_debt_usd_e6: U128,
    /// A3: corporate-action multiplier, WAD.
    pub multiplier_e18: U128,
    pub multiplier_updated_ns: U64,
    pub price_kind: PriceKind,
    pub ca_pending: bool,
    pub ca_effective_ns: U64,
    pub ca_multiplier_e18: U128,
    /// A2: owner force-close (can never open a session).
    pub forced_closed: bool,
    /// Reserved (PRD §4.7 weekend reference price); present, unused in P0.
    pub weekend_ref_price_e6: U128,
    pub weekend_ref_updated_ns: U64,
    // ---- v2 (WO-23a, PRD §4.9, §4.10, §6.11)
    /// §4.9 Shield fees and the curator's event window.
    pub shield: ShieldParams,
    /// §4.10 Profit-Lock: USDC that opted-in quotes may fill per UTC day (0 = self-settlement off).
    pub max_voluntary_fill_usd_e6_per_day: U128,
    pub voluntary_filled_today_e6: U128,
    /// UTC day (`block_ns / 86400 s`) of `voluntary_filled_today_e6`.
    pub voluntary_day: u32,
    /// OutLayer multiplier job read a change outside the `set_multiplier` bound: the owner should announce it.
    pub ca_suggested_multiplier_e18: U128,
    pub ca_suggested_ns: U64,
    // ---- v2 (WO-23b, PRD §4.8): Nectar Reserve. R_c = usdc_e6 - notice_usdc_e6 (replaces the owner-set value).
    pub reserve: ReservePool,
}

/// §4.8 one pooled buyer per asset. Shares are minted against R_c; seized units and fees are distributed per
/// active share through O(1) indices (`*_debt` per Note, rounded up, so late depositors get nothing earlier).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct ReservePool {
    /// Active shares (shares in notice have left the pool).
    pub shares: U128,
    /// USDC held for the Reserve: active (R_c) plus the frozen value of shares in notice.
    pub usdc_e6: U128,
    /// USDC of shares in notice (out of R_c at once; paid by `complete_reserve_exit`).
    pub notice_usdc_e6: U128,
    /// Seized collateral units held for Reserve Notes (paid at exit).
    pub units: U128,
    /// Fill discount; 0 = Reserve disabled (no deposits, no fills). Above every live quote ceiling.
    pub discount_bps: u16,
    pub acc_fee_per_share_e18: U128,
    pub acc_units_per_share_e18: U128,
    /// Exit notice; 0 = `RESERVE_NOTICE_NS` (7 days). Owner `set_reserve_params(.., notice_ns)`, >= 60 s.
    pub notice_ns: U64,
    /// Reserve fee accruals per UTC day, newest last, at most `RESERVE_FEE_DAYS` entries (realised APR).
    pub fee_days: Vec<ReserveFeeDay>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ReserveFeeDay {
    pub day: u32,
    pub fees_usd_e6: U128,
}

/// A Reserve Note `r-<collateral>-<n>` (owner = Note owner; a transfer rewrites it).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReserveNote {
    pub note_id: String,
    pub collateral: String,
    pub owner: AccountId,
    pub deposited_usd_e6: U128,
    /// Active shares; 0 once the exit is initiated.
    pub shares: U128,
    pub unit_debt: U128,
    pub fee_debt: U128,
    pub claimable_units: U128,
    pub claimable_fees_usd_e6: U128,
    /// Set by `initiate_reserve_exit`.
    pub unlock_ns: Option<U64>,
    pub exit_shares: U128,
    pub exit_usdc_e6: U128,
    /// Everything paid by `complete_reserve_exit` (a failed transfer restores and clears it).
    pub exited: bool,
    pub created_ns: U64,
}

#[near(serializers = [borsh])]
pub enum VReserveNote {
    V1(ReserveNote),
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ReserveView {
    pub symbol: String,
    /// R_c: USDC of active shares (counts toward Q_c + R_c + D_c).
    pub r_usd_e6: U128,
    pub shares: U128,
    pub usdc_e6: U128,
    pub notice_usdc_e6: U128,
    pub units: U128,
    pub discount_bps: u16,
    pub acc_fee_per_share_e18: U128,
    pub acc_units_per_share_e18: U128,
    /// USDC value of 1e6 shares (= 1 share-dollar at the first deposit).
    pub share_price_e6: U128,
    pub min_deposit_usd_e6: U128,
    pub notice_period_ns: U64,
    /// Reserve fee accruals over the trailing 7 UTC days (incl. today).
    pub fees_7d_usd_e6: U128,
    /// Realised trailing 7-day APR: fees_7d * 365 / 7 / R_c in bps. Historical, never a promised rate.
    pub realised_apr_7d_bps: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ReserveNoteView {
    pub note: ReserveNote,
    /// USDC value of the active shares now (exit_usdc_e6 once in notice).
    pub value_usd_e6: U128,
    /// claimable + accrued since the last checkpoint.
    pub claimable_units: U128,
    pub claimable_fees_usd_e6: U128,
    pub can_complete: bool,
    pub transfer_locked: bool,
}

/// §4.9 per-asset Shield pricing (owner `set_shield_params`). `event_window_end_ns = 0`: no event window open.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShieldParams {
    pub weekend_fee_bps: u16,
    pub event_fee_bps: u16,
    pub event_window_end_ns: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShieldKind {
    Weekend,
    Event,
}

/// `shield` field of `LockCollateralAndBorrow` / `reserve_remote_position`.
#[near(serializers = [json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShieldInput {
    pub kind: ShieldKind,
    pub window_end_ns: U64,
}

/// §4.9 a Shield recorded on its position: sized at weekend parameters, `fee_bps` replaced the limit premium.
/// Until `window_end_ns` only committed buyers may settle it (no DEX route exists in P0).
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Shield {
    pub kind: ShieldKind,
    pub window_end_ns: U64,
    pub fee_bps: u16,
    pub opened_ns: U64,
}

/// v2 is a fresh deploy (`nectar-core-v2`, PRD §6.11): discriminant 0 holds the v2 layout.
#[near(serializers = [borsh])]
pub enum VCollateral {
    V2(CollateralConfig),
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
    /// v2 (§4.10): the quote also fills Profit-Lock self-settlements.
    pub accepts_voluntary_fills: bool,
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
    /// v2 (A3): multiplier at open, display only (limits use the current M).
    pub entry_multiplier_e18: U128,
    /// v2 (§B): collateral held in a remote vault (Solana); None = NEAR-held (settles on NEAR only).
    pub remote: Option<RemoteInfo>,
    /// v2 (§4.9): Shield preset; `premium_usd_e6` then holds the Shield fee.
    pub shield: Option<Shield>,
}

/// v2 (§B, PRD §9B) remote lifecycle: AwaitingDeposit -> Open -> (Settling | Releasing) -> Closed; AwaitingDeposit -> Expired.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RemoteStatus {
    AwaitingDeposit,
    Open,
    Settling,
    Releasing,
    Closed,
    Expired,
}

/// Remote collateral record of one position. Chain, vault, domain and path are pinned at reserve time.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemoteInfo {
    pub chain_id: String,
    pub vault_program: String,
    pub domain_id: u32,
    /// `<chain_id>/pos/<position_id>` (MPC derivation path).
    pub path: String,
    /// `ed25519:<base58>` (domain 1) or `0x<40 hex>` (domain 0), from `derived_public_key` (F-338, F-339).
    pub authority: Option<String>,
    pub status: RemoteStatus,
    pub reserved_units: U128,
    /// Units in the vault: the reserved units until a deposit is proven, then the proven units.
    pub units: U128,
    pub borrow_usd_e6: U128,
    /// Net proceeds paid at confirmation (0 until the loan is paid).
    pub paid_usd_e6: U128,
    /// Reservation time (block ns).
    pub reserved_ns: U64,
    pub pay_to: Option<PayTo>,
    pub referrer: Option<AccountId>,
    /// Reservation deadline (block ns).
    pub expires_ns: U64,
    /// Vault depositor (Solana base58) once a deposit is proven.
    pub depositor: Option<String>,
    /// "outlayer" | "keeper"
    pub source: Option<String>,
    /// OutLayer `slot_or_block` or the keeper's `tx_ref`.
    pub deposit_ref: Option<String>,
    /// An OutLayer `vault_read` is in flight.
    pub confirming: bool,
    pub last_confirm_ns: U64,
    /// WO-23a: reservation deposit held (yocto); refunded to the borrower on confirm, refused loan, failed
    /// authority or expiry, then 0.
    pub deposit_yocto: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReleaseStatus {
    AwaitingSignature,
    Signed,
    SignFailed,
    Relayed,
}

/// `NECTAR_RELEASE_V1` signed for one remote position (interface-v7 §B).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingRelease {
    pub position_id: U64,
    pub message: String,
    pub signature_hex: Option<String>,
    pub nonce: U64,
    /// unix seconds
    pub expires: U64,
    pub recipient: String,
    pub status: ReleaseStatus,
    pub solana_tx_sig: Option<String>,
}

#[near(serializers = [borsh])]
pub enum VRelease {
    V1(PendingRelease),
}

/// OutLayer `vault_read` job (WO-24) pin. Stored under its own raw key.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VaultReadConfig {
    pub project_id: String,
    pub version_key: String,
    pub deposit_yocto: u128,
    pub gas_tgas: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemoteConfigView {
    pub allow_keeper_deposit_attestation: bool,
    pub vault_read_project_id: Option<String>,
    pub vault_read_version_key: Option<String>,
    pub vault_read_deposit_yocto: Option<U128>,
    pub vault_read_gas_tgas: Option<u64>,
    pub reservation_expiry_s: u64,
    /// WO-23a: deposit `reserve_remote_position` requires (refunded).
    pub reserve_deposit_yocto: U128,
}

#[near(serializers = [borsh])]
pub enum VPosition {
    V2(Position),
}

/// v2 (A4): where net borrow proceeds go instead of the borrower.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PayTo {
    pub receiver_id: AccountId,
    #[serde(default)]
    pub memo: Option<String>,
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
        /// v2 (§4.10): opt into Profit-Lock fills (default false).
        #[serde(default)]
        accepts_voluntary_fills: bool,
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
        #[serde(default)]
        pay_to: Option<PayTo>,
        #[serde(default)]
        referrer: Option<AccountId>,
        /// v2 (§4.9): Shield preset.
        #[serde(default)]
        shield: Option<ShieldInput>,
    },
    Repay {
        position_id: U64,
    },
    /// v2 (WO-23b, §4.8): USDC only, >= 10,000,000 e6; mints Reserve Note `r-<collateral>-<n>`.
    JoinNectarReserve {
        collateral: String,
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
    /// v2 (WO-23b): `complete_reserve_exit` USDC (share value + fees); failure restores the Note's exit claim.
    ReserveExit { note_id: String, principal_usd_e6: U128, fees_usd_e6: U128 },
    /// v2 (WO-23b): `complete_reserve_exit` collateral units; failure restores the Note's claimable units.
    ReserveUnits { note_id: String },
    /// v2 (A4): net proceeds sent to `pay_to.receiver_id`; failure credits `claimable_usdc[borrower]`.
    PayTo { position_id: U64, borrower: AccountId },
    /// v2 (A4): `withdraw_claimable`; failure restores the claimable balance.
    Claimable,
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
    /// v2 (A5)
    pub origination_fee_bps: u16,
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
    // ---- v2 additions (interface-v7.md A6)
    /// "open" | "no_calendar" | "outside_hours" | "stale_price" | "forced_closed"
    pub session_reason: String,
    pub total_debt_usd_e6: U128,
    /// (1e4 - h)(Q + R + D)/1e4 (= capacity_usd_e6).
    pub aggregate_capacity_usd_e6: U128,
    /// aggregate capacity - total debt (floored at 0).
    pub aggregate_headroom_usd_e6: U128,
    pub multiplier_e18: U128,
    pub price_kind: PriceKind,
    pub ca_pending: bool,
    pub ca_effective_ns: U64,
    pub forced_closed: bool,
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
    /// v2: min(LTV cap, aggregate headroom).
    pub b_c_usd_e6: U128,
    pub static_limit_usd_e6: U128,
    pub premium_usd_e6: U128,
    pub ok: bool,
    pub reason: Option<String>,
    // ---- v2 additions (interface-v7.md A6)
    pub origination_fee_usd_e6: U128,
    pub referrer_share_usd_e6: U128,
    /// premium + origination
    pub total_fees_usd_e6: U128,
    /// borrow - premium - origination (0 if negative)
    pub net_proceeds_usd_e6: U128,
    pub aggregate_headroom_usd_e6: U128,
    pub multiplier_e18: U128,
    pub session_open: bool,
    /// WO-23a: Shield fee when a `shield` was given (then `premium_usd_e6` = this fee and limits use weekend
    /// parameters); 0 otherwise.
    pub shield_fee_usd_e6: U128,
}

// ---------------------------------------------------------------- P1 (interface-p1.md, state V1)

/// Price source per symbol. `Owner` = P0 owner oracle. `Pyth` = read `get_price` in `trigger_preliquidation` (WO-10b).
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
    /// WO-10b: OutLayer secrets profile passed as `secrets_ref` (F-047); None = not sent.
    pub secrets_ref: Option<SecretsRef>,
}

/// OutLayer `secrets_ref` (F-047): profile 1-64 bytes `[A-Za-z0-9_-]`. Stored under its own raw storage
/// key (`QUOTER_SECRETS_REF_KEY`), not in the V1 root struct, so adding it needs no migrate.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SecretsRef {
    pub profile: String,
    pub account_id: AccountId,
}

/// Pyth NEAR receiver `Price` (pyth-crosschain ec40e5f `target_chains/near/receiver/src/state.rs:101`):
/// value = `price * 10^expo`, `conf` in the same units, `publish_time` unix seconds. `get_price` returns
/// `Option<Price>` (lib.rs:460), JSON `null` when missing or older than the receiver's stale threshold.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PythPrice {
    pub price: I64,
    pub conf: U64,
    pub expo: i32,
    pub publish_time: i64,
}

// ---------------------------------------------------------------- P2 (interface-p2.md, D-016)

/// MPC signer settings (F-030, F-034). Stored under its own raw key (`p2::SIGNER_CONFIG_KEY`).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SignerConfig {
    pub account: AccountId,
    pub path: String,
    pub gas_tgas: u64,
    pub expiry_s: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PendingStatus {
    AwaitingSignature,
    Signed,
    SignFailed,
    Cancelled,
    Relayed,
}

/// One remote (Solana) leg of a settlement, keyed by position (at most one leg per settlement call).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingSettlement {
    pub position_id: U64,
    pub quote_id: U64,
    pub nonce: U64,
    /// unix seconds
    pub expires: U64,
    pub preimage: String,
    pub signature_hex: Option<String>,
    pub repay_usd_e6: U128,
    pub seize_units: U128,
    pub keeper_units: U128,
    pub recipient: String,
    pub status: PendingStatus,
    pub solana_tx_sig: Option<String>,
    /// 1 = PRELIQ, 2 = SELF (Profit-Lock).
    pub kind: u8,
    /// SELF: Profit-Lock fee the buyer paid on top of `repay_usd_e6` (treasury once signed); 0 for PRELIQ.
    pub fee_usd_e6: U128,
}

#[near(serializers = [borsh])]
pub enum VPending {
    V1(PendingSettlement),
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VaultAuthorityHint {
    pub signer_account: AccountId,
    pub predecessor: AccountId,
    pub path: String,
    pub domain_id: u32,
    /// What `on_authority` stored (None until the signer answered).
    pub authority: Option<String>,
}

/// A remote leg chosen inside `settle` (not stored as such).
#[derive(Clone, Debug)]
pub struct RemoteLeg {
    pub quote_id: u64,
    pub repay_usd_e6: u128,
    pub buyer_units: u128,
    pub keeper_units: u128,
    pub recipient: String,
    /// `chainsig::KIND_PRELIQ` | `chainsig::KIND_SELF`
    pub kind: u8,
    pub fee_usd_e6: u128,
}

// ---------------------------------------------------------------- WO-23a views

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShieldView {
    pub position_id: U64,
    pub kind: ShieldKind,
    pub window_end_ns: U64,
    pub fee_bps: u16,
    pub fee_usd_e6: U128,
    /// now < window_end_ns: only committed-buyer settlement (no DEX route).
    pub active: bool,
    pub committed_buyers_only: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SelfSettleLegView {
    pub quote_id: U64,
    pub disc_bps: u16,
    /// USDC the quote pays (debt share + fee share).
    pub fill_usd_e6: U128,
    pub units: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SelfSettlePreview {
    pub ok: bool,
    pub reason: Option<String>,
    pub debt_usd_e6: U128,
    pub fee_usd_e6: U128,
    /// debt + fee
    pub fill_usd_e6: U128,
    pub units_repaid: U128,
    pub units_kept: U128,
    pub legs: Vec<SelfSettleLegView>,
    pub remote: bool,
    pub daily_cap_usd_e6: U128,
    pub daily_used_usd_e6: U128,
}

/// §4.11 fee stack. Asset-specific rows are None without a symbol.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FeeStackView {
    pub limit_premium_bps: Option<u16>,
    pub shield_weekend_fee_bps: u16,
    pub shield_event_fee_bps: u16,
    pub origination_fee_bps: u16,
    pub referrer_share_bps: u16,
    pub profit_lock_fee_bps: u16,
    pub keeper_fee_bps: u16,
    pub fee_split: FeeSplit,
}

/// OutLayer job (calendar | multiplier) pin; same shape as the `vault_read` pin.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JobConfigView {
    pub job: String,
    pub project_id: String,
    pub version_key: String,
    pub deposit_yocto: U128,
    pub gas_tgas: u64,
    /// "job" (own pin) | "vault_read" (falls back to the vault_read pin)
    pub source: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct JobState {
    pub last_request_ns: U64,
    pub in_flight: bool,
}

/// Base Sepolia B20 token read by the `multiplier` job.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MultiplierSource {
    pub rpc_url: String,
    pub token: String,
}
