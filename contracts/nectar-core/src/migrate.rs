//! State upgrade P0 -> V1 (interface-p1.md "Upgrade"). `NectarV0` is the exact borsh layout of the P0
//! contract state (tag p0-green, wasm sha256 6bd1ec51...); field order must never change.
//! Collections keep their storage prefixes, so only the root struct is rewritten.

use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{AccountId, env, near, require};

use crate::types::*;
// Child module: may read the root's private items (StorageKey, struct fields, defaults).
use crate::{DEFAULT_MAX_CONF_BPS, Nectar, NectarExt, STATE_VERSION, STATE_VERSION_KEY, StorageKey, default_quoter};

#[near(serializers = [borsh])]
pub(crate) struct NectarV0 {
    pub owner: AccountId,
    pub paused: bool,
    pub usdc_token: AccountId,
    pub keeper: AccountId,
    pub keeper_fee_bps: u16,
    pub fee_split: FeeSplit,
    pub min_notice_period_ns: u64,
    pub min_quote_usd_e6: u128,
    pub max_age_ns_session: u64,
    pub max_age_ns_closed: u64,
    pub band_bps: u16,
    pub available_usd_e6: u128,
    pub utilised_usd_e6: u128,
    pub treasury_usd_e6: u128,
    pub lenders_fees_usd_e6: u128,
    pub gas_reserve_yocto: u128,
    pub next_quote_id: u64,
    pub next_position_id: u64,
    pub collaterals: IterableMap<String, VCollateral>,
    pub token_to_symbol: LookupMap<AccountId, String>,
    pub quotes: LookupMap<u64, VQuote>,
    pub quotes_by_collateral: LookupMap<String, Vec<u64>>,
    pub positions: LookupMap<u64, VPosition>,
    pub lender_supplied: LookupMap<AccountId, u128>,
    pub pending_prices: LookupMap<String, (u128, u64)>,
    pub owed_collateral: LookupMap<String, u128>,
}

#[near]
impl Nectar {
    /// Reads the P0 layout and writes V1 with the new fields defaulted (quoter disabled, owner oracle).
    /// Callable once, by the contract account itself (deploy + init-call batch) or the stored owner.
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        require!(env::storage_read(STATE_VERSION_KEY).is_none(), "already migrated");
        let old: NectarV0 = env::state_read().unwrap_or_else(|| env::panic_str("no P0 state"));
        let caller = env::predecessor_account_id();
        require!(caller == env::current_account_id() || caller == old.owner, "owner only");
        env::storage_write(STATE_VERSION_KEY, &[STATE_VERSION]);
        crate::events::emit(
            "migrated",
            near_sdk::serde_json::json!({ "from": "p0", "to": STATE_VERSION, "by": caller }),
        );
        Nectar {
            owner: old.owner,
            paused: old.paused,
            usdc_token: old.usdc_token,
            keeper: old.keeper,
            keeper_fee_bps: old.keeper_fee_bps,
            fee_split: old.fee_split,
            min_notice_period_ns: old.min_notice_period_ns,
            min_quote_usd_e6: old.min_quote_usd_e6,
            max_age_ns_session: old.max_age_ns_session,
            max_age_ns_closed: old.max_age_ns_closed,
            band_bps: old.band_bps,
            available_usd_e6: old.available_usd_e6,
            utilised_usd_e6: old.utilised_usd_e6,
            treasury_usd_e6: old.treasury_usd_e6,
            lenders_fees_usd_e6: old.lenders_fees_usd_e6,
            gas_reserve_yocto: old.gas_reserve_yocto,
            next_quote_id: old.next_quote_id,
            next_position_id: old.next_position_id,
            collaterals: old.collaterals,
            token_to_symbol: old.token_to_symbol,
            quotes: old.quotes,
            quotes_by_collateral: old.quotes_by_collateral,
            positions: old.positions,
            lender_supplied: old.lender_supplied,
            pending_prices: old.pending_prices,
            owed_collateral: old.owed_collateral,
            quoter: default_quoter(),
            vol_bps: LookupMap::new(StorageKey::VolBps),
            oracle_sources: LookupMap::new(StorageKey::OracleSources),
            max_conf_bps: DEFAULT_MAX_CONF_BPS,
        }
    }

    /// Layout version: 0 = P0 (never observable on a V1 wasm), 1 = V1.
    pub fn get_state_version(&self) -> u8 {
        env::storage_read(STATE_VERSION_KEY).and_then(|v| v.first().copied()).unwrap_or(0)
    }
}
