//! nectar-core v2 (`2.0.0-v7`): Pappus funded quotes + Cramér borrowing limit on NEAR.
//! ABI: docs/work/interface-p0.md + interface-p1.md + interface-p2.md + interface-v7.md §A + §B (remote lifecycle,
//! src/remote.rs; NEAR-held collateral always settles on NEAR).
//! Spec: docs/PRD.md §4, §6, §8 (D-009 parameters), §4.2/4.6/4.7/4.11/6.11 (v7 P0 delta, D-017/D-018).
//! v2 is a fresh deploy with `new` (no migrate, PRD §6.11): the root layout is V2.
//!
//! Invariants:
//! - `ft_on_transfer` is the only inbound token path; the predecessor must be `usdc_token` or a
//!   configured collateral token (otherwise panic). Any failure inside a variant returns the full
//!   amount with no state change.
//! - Checks-Effects-Interactions: state is final before any `ft_transfer`; `on_payout` only rolls
//!   back on failure.
//! - Bounded: ≤ 64 live quotes per asset, ≤ 8 quotes per settlement, fee index is O(1).
//! - No floats; checked u128 arithmetic everywhere (`math.rs`).

pub mod chainsig;
pub mod events;
pub mod math;
pub mod types;
mod shields;
mod v7;
mod reserve;
pub mod notes;

#[cfg(feature = "p2")]
mod jobs;
#[cfg(feature = "p1")]
mod p1;
#[cfg(feature = "p2")]
mod p2;
#[cfg(feature = "p2")]
mod remote;
#[cfg(feature = "p2")]
pub mod evm;

#[cfg(test)]
mod tests;
#[cfg(all(test, feature = "p1"))]
mod tests_p1;
#[cfg(all(test, feature = "p2"))]
mod tests_p2;
#[cfg(all(test, feature = "p2"))]
mod tests_evm;
#[cfg(test)]
mod tests_v7;
#[cfg(all(test, feature = "p2"))]
mod tests_v7b;
#[cfg(all(test, feature = "p2"))]
mod tests_notes;
#[cfg(all(test, feature = "p2"))]
mod tests_reserve;
#[cfg(all(test, feature = "p2"))]
mod tests_v7c;

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, LazyOption, LookupMap, LookupSet, Vector};
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, assert_one_yocto, env,
    is_promise_success, near, require,
};

use crate::events::emit;
use crate::math::{BPS, LimitParams, MathResult};
use crate::types::*;

/// interface-v7.md A6.
pub const CONTRACT_VERSION: &str = "2.2.0-v7";
/// Raw storage key holding the state layout version. Written by `new` (v2 has no migrate).
pub const STATE_VERSION_KEY: &[u8] = b"__state_version";
pub const STATE_VERSION: u8 = 2;
/// A2: a price older than this closes the session (PRD §4.7).
pub const SESSION_MAX_PRICE_AGE_NS: u64 = 900 * 1_000_000_000;
/// A2: `set_session_calendar` bound.
pub const MAX_CALENDAR_WINDOWS: usize = 600;
/// A3: `announce_corporate_action` notice and the `set_multiplier` step.
pub const CA_MIN_NOTICE_NS: u64 = 3_600 * 1_000_000_000;
pub const MULTIPLIER_MAX_INCREASE_BPS: u16 = 500;
/// A5
pub const DEFAULT_ORIGINATION_FEE_BPS: u16 = 30;
pub const MAX_ORIGINATION_FEE_BPS: u16 = 100;
/// §4.11: half of the origination fee to a registered referrer.
pub const REFERRER_SHARE_BPS: u16 = 5_000;
/// WO-23a §4.9 Shields (testnet defaults; owner `set_shield_params`).
pub const DEFAULT_SHIELD_WEEKEND_FEE_BPS: u16 = 15;
pub const DEFAULT_SHIELD_EVENT_FEE_BPS: u16 = 25;
pub const MAX_SHIELD_FEE_BPS: u16 = 1_000;
/// Testnet minimum $5 (PROD $50).
pub const SHIELD_MIN_BORROW_USD_E6: u128 = 5_000_000;
pub const MAX_SHIELD_OPENS_PER_DAY: u8 = 5;
/// Friday 16:00 to Monday 09:30 New York time.
pub const SHIELD_WEEKEND_MAX_NS: u64 = 235_800 * 1_000_000_000;
pub const SHIELD_EVENT_MAX_NS: u64 = 259_200 * 1_000_000_000;
/// WO-23a §4.10 Profit-Lock fee on the debt repaid (treasury).
pub const PROFIT_LOCK_FEE_BPS: u16 = 50;
pub const DAY_NS: u64 = 86_400 * 1_000_000_000;
pub const MAX_QUOTES_PER_ASSET: usize = 64;
pub const MAX_QUOTES_PER_SETTLEMENT: usize = 8;
pub const MAX_PAGE: u32 = 100;
pub const MAX_STRING_LEN: usize = 128;

pub const GAS_FT_TRANSFER: Gas = Gas::from_tgas(5); // mock-ft ft_transfer burns ~1.6 Tgas (WO-10a sandbox GAS lines)
pub const GAS_ON_PAYOUT: Gas = Gas::from_tgas(5); // on_payout burns ~1.6 Tgas (success branch)
pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

// Defaults from packages/config/config.yaml (D-009).
const DEFAULT_KEEPER_FEE_BPS: u16 = 50;
const DEFAULT_MIN_NOTICE_NS: u64 = 604_800 * 1_000_000_000;
const DEFAULT_MIN_QUOTE_USD_E6: u128 = 100_000_000;
const DEFAULT_MAX_AGE_SESSION_NS: u64 = 120 * 1_000_000_000;
const DEFAULT_MAX_AGE_CLOSED_NS: u64 = 86_400 * 1_000_000_000;
const DEFAULT_BAND_BPS: u16 = 1500;

const ERR_OWNER: &str = "owner only";
const ERR_KEEPER: &str = "keeper only";
const ERR_PAUSED: &str = "paused";
const ERR_UNKNOWN_TOKEN: &str = "unknown token";
const ERR_NO_COLLATERAL: &str = "unknown collateral";
const ERR_NO_QUOTE: &str = "unknown quote";
const ERR_NO_POSITION: &str = "unknown position";
const ERR_BUYER: &str = "buyer only";
// v2 reason codes (interface-v7.md A6)
pub(crate) const ERR_AGGREGATE_LIMIT: &str = "aggregate_limit";
/// SR-5: a remote loan above the largest single quote that could settle it.
pub(crate) const ERR_REMOTE_SETTLE_CAP: &str = "remote_settle_capacity";
pub(crate) const ERR_CA_PENDING: &str = "ca_pending";
pub(crate) const ERR_REFERRER_IS_BORROWER: &str = "referrer_is_borrower";

/// Fee stack of one borrow (A5): net = borrow - premium - origination.
pub(crate) struct BorrowTerms {
    pub premium: u128,
    pub split: math::PremiumSplit,
    pub origination: u128,
    pub referrer_share: u128,
    pub net: u128,
}

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Collaterals,
    TokenToSymbol,
    Quotes,
    QuotesByCollateral,
    Positions,
    LenderSupplied,
    PendingPrices,
    OwedCollateral,
    // V1 (P1) — appended so P0 prefixes are unchanged.
    VolBps,
    OracleSources,
    // v2 (interface-v7.md A2, A4, A5)
    SessionCalendar,
    Referrers,
    ClaimableUsdc,
    // v2 WO-23a
    ShieldOpens,
    // v2 WO-22 Position Notes
    NoteIds,
    NoteIndex,
    NotesByOwner,
    NoteCount,
    NoteQuoteRefs,
    // v2 WO-23b Nectar Reserve
    ReserveNotes,
    ReserveRefs,
}

// Defaults for the V1 fields (packages/config/config.yaml outlayer.*, oracle.max_conf_bps; F-046).
const DEFAULT_OUTLAYER: &str = "outlayer.testnet";
const DEFAULT_QUOTER_DEPOSIT_YOCTO: u128 = 4_000_010_000_000_000_000_000; // F-046 estimate
const DEFAULT_QUOTER_GAS_TGAS: u64 = 80; // D-015: Pyth + quoter + 8 legs fits 300 Tgas
const DEFAULT_MAX_INSTRUCTIONS: u64 = 100_000_000;
const DEFAULT_MAX_MEMORY_MB: u32 = 128;
const DEFAULT_MAX_EXECUTION_SECONDS: u32 = 30;
const DEFAULT_MAX_CONF_BPS: u16 = 100;

pub(crate) fn default_quoter() -> QuoterConfig {
    QuoterConfig {
        outlayer_account: DEFAULT_OUTLAYER.parse().unwrap_or_else(|_| env::panic_str("outlayer id")),
        project_id: String::new(),
        version_key: String::new(),
        deposit_yocto: DEFAULT_QUOTER_DEPOSIT_YOCTO,
        gas_tgas: DEFAULT_QUOTER_GAS_TGAS,
        max_instructions: DEFAULT_MAX_INSTRUCTIONS,
        max_memory_mb: DEFAULT_MAX_MEMORY_MB,
        max_execution_seconds: DEFAULT_MAX_EXECUTION_SECONDS,
    }
}

fn ok<T>(r: MathResult<T>) -> T {
    r.unwrap_or_else(|e| env::panic_str(e))
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Nectar {
    owner: AccountId,
    paused: bool,
    usdc_token: AccountId,
    keeper: AccountId,
    keeper_fee_bps: u16,
    fee_split: FeeSplit,
    min_notice_period_ns: u64,
    min_quote_usd_e6: u128,
    max_age_ns_session: u64,
    max_age_ns_closed: u64,
    band_bps: u16,
    available_usd_e6: u128,
    utilised_usd_e6: u128,
    treasury_usd_e6: u128,
    lenders_fees_usd_e6: u128,
    gas_reserve_yocto: u128,
    next_quote_id: u64,
    next_position_id: u64,
    collaterals: IterableMap<String, VCollateral>,
    token_to_symbol: LookupMap<AccountId, String>,
    quotes: LookupMap<u64, VQuote>,
    quotes_by_collateral: LookupMap<String, Vec<u64>>,
    positions: LookupMap<u64, VPosition>,
    lender_supplied: LookupMap<AccountId, u128>,
    /// symbol -> (proposed price, proposed at ns)
    pending_prices: LookupMap<String, (u128, u64)>,
    /// "account|symbol" -> units whose ft_transfer failed (recorded, not lost)
    owed_collateral: LookupMap<String, u128>,
    // ---- P1
    quoter: QuoterConfig,
    vol_bps: LookupMap<String, u16>,
    oracle_sources: LookupMap<String, OracleSource>,
    max_conf_bps: u16,
    // ---- V2 (interface-v7.md §A). P1/P2 raw-key records (quoter secrets ref, `__p2_*`) stay raw keys.
    /// A2: sorted, non-overlapping NYSE windows `[open_ns, close_ns)`; one lazily loaded value.
    session_calendar: LazyOption<Vec<(u64, u64)>>,
    /// A5
    referrers: LookupSet<AccountId>,
    origination_fee_bps: u16,
    /// A4: USDC owed to an account (failed `pay_to`, referrer shares); paid by `withdraw_claimable`.
    claimable_usdc: LookupMap<AccountId, u128>,
    /// WO-23a §4.9: account -> (UTC day, Shield opens that day).
    shield_opens: LookupMap<AccountId, (u32, u8)>,
    /// WO-22 (PRD §6.11): NEP-171 Position Notes (src/notes.rs).
    notes: notes::Notes,
    /// WO-23b (PRD §4.8): Reserve Notes by global n (token id `r-<collateral>-<n>`).
    reserve_notes: LookupMap<u64, VReserveNote>,
    next_reserve_note_id: u64,
    /// symbol -> positions whose settlement may fill (or filled) from the Reserve; Reserve Notes stay put while one
    /// is pending (pruned lazily).
    reserve_refs: LookupMap<String, Vec<u64>>,
}

// ---------------------------------------------------------------- internal helpers
impl Nectar {
    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, ERR_OWNER);
    }
    fn assert_not_paused(&self) {
        require!(!self.paused, ERR_PAUSED);
    }
    fn coll(&self, symbol: &str) -> Option<CollateralConfig> {
        self.collaterals.get(symbol).map(|VCollateral::V2(c)| c.clone())
    }
    fn coll_or_panic(&self, symbol: &str) -> CollateralConfig {
        self.coll(symbol).unwrap_or_else(|| env::panic_str(ERR_NO_COLLATERAL))
    }
    fn put_coll(&mut self, c: CollateralConfig) {
        self.collaterals.insert(c.symbol.clone(), VCollateral::V2(c));
    }
    fn quote(&self, id: u64) -> Option<Quote> {
        self.quotes.get(&id).map(|VQuote::V1(q)| q.clone())
    }
    fn quote_or_panic(&self, id: u64) -> Quote {
        self.quote(id).unwrap_or_else(|| env::panic_str(ERR_NO_QUOTE))
    }
    fn put_quote(&mut self, q: Quote) {
        self.quotes.insert(q.quote_id.0, VQuote::V1(q));
    }
    fn position(&self, id: u64) -> Option<Position> {
        self.positions.get(&id).map(|VPosition::V2(p)| p.clone())
    }
    fn position_or_panic(&self, id: u64) -> Position {
        self.position(id).unwrap_or_else(|| env::panic_str(ERR_NO_POSITION))
    }
    fn put_position(&mut self, p: Position) {
        self.positions.insert(p.position_id.0, VPosition::V2(p));
    }
    fn live_ids(&self, symbol: &str) -> Vec<u64> {
        self.quotes_by_collateral.get(symbol).cloned().unwrap_or_default()
    }
    fn remove_live(&mut self, symbol: &str, id: u64) {
        let mut ids = self.live_ids(symbol);
        let before = ids.len();
        ids.retain(|x| *x != id);
        if ids.len() != before {
            self.quotes_by_collateral.insert(symbol.to_string(), ids);
        }
    }

    /// A2 (PRD §4.7), fails closed: `(open, reason)`. Precedence: no_calendar, outside_hours, stale_price,
    /// forced_closed. Nothing the owner sets can open a session outside a window or with a stale price.
    pub(crate) fn session_state(&self, c: &CollateralConfig) -> (bool, &'static str) {
        let windows = match self.session_calendar.get() {
            Some(w) if !w.is_empty() => w,
            _ => return (false, "no_calendar"),
        };
        let now = env::block_timestamp();
        if !math::in_session_window(windows, now) {
            return (false, "outside_hours");
        }
        if c.oracle_updated_ns.0 == 0 || now.saturating_sub(c.oracle_updated_ns.0) > SESSION_MAX_PRICE_AGE_NS {
            return (false, "stale_price");
        }
        if c.forced_closed {
            return (false, "forced_closed");
        }
        (true, "open")
    }
    pub(crate) fn session_open(&self, c: &CollateralConfig) -> bool {
        self.session_state(c).0
    }
    /// A3: M used in valuation (ignored for TokenIncludesMultiplier).
    pub(crate) fn eff_multiplier(c: &CollateralConfig) -> u128 {
        match c.price_kind {
            PriceKind::Underlying => c.multiplier_e18.0,
            PriceKind::TokenIncludesMultiplier => math::E18,
        }
    }
    /// A3: `V = units·M/1e18·price/10^d` of `units` raw token units.
    pub(crate) fn value_of(units: u128, c: &CollateralConfig) -> MathResult<u128> {
        math::value_m_usd_e6(units, Self::eff_multiplier(c), c.oracle_price_usd_e6.0, c.decimals)
    }

    pub(crate) fn max_age_ns(&self, c: &CollateralConfig) -> u64 {
        if self.session_open(c) { self.max_age_ns_session } else { self.max_age_ns_closed }
    }
    fn oracle_fresh(&self, c: &CollateralConfig) -> bool {
        if c.oracle_price_usd_e6.0 == 0 || c.oracle_updated_ns.0 == 0 {
            return false;
        }
        let now = env::block_timestamp();
        now.saturating_sub(c.oracle_updated_ns.0) <= self.max_age_ns(c)
    }
    fn limit_params(&self, c: &CollateralConfig) -> LimitParams {
        self.limit_params_for(c, false)
    }
    /// WO-23a §4.9: a Shield is sized as if the session were closed (h = weekend haircut, D_c = 0).
    pub(crate) fn limit_params_for(&self, c: &CollateralConfig, shield: bool) -> LimitParams {
        LimitParams {
            decimals: c.decimals,
            m_e18: Self::eff_multiplier(c),
            total_debt_usd_e6: c.total_debt_usd_e6.0,
            price_usd_e6: c.oracle_price_usd_e6.0,
            q_usd_e6: c.active_committed_q_usd_e6.0,
            r_usd_e6: Self::reserve_rc(c),
            d_usd_e6: c.verified_dex_depth_usd_e6.0,
            session_open: !shield && self.session_open(c),
            base_ltv_bps: c.base_ltv_bps,
            max_nectar_ltv_bps: c.max_nectar_ltv_bps,
            base_haircut_bps: c.base_haircut_bps,
            weekend_haircut_bps: c.weekend_haircut_bps,
        }
    }

    /// Move accrued index fees into `claimable` (O(1)).
    fn checkpoint_fees(q: &mut Quote, acc: u128) -> MathResult<()> {
        let pending = math::pending_fees(q.weight(), acc, q.fee_debt_e18.0)?;
        q.claimable_fees_usd_e6 = U128(math::add(q.claimable_fees_usd_e6.0, pending)?);
        Ok(())
    }
    fn reset_fee_debt(q: &mut Quote, acc: u128) -> MathResult<()> {
        q.fee_debt_e18 = U128(math::fee_debt(q.weight(), acc)?);
        Ok(())
    }

    fn refund(reason: &str, amount: u128) -> PromiseOrValue<U128> {
        env::log_str(&format!("refund: {reason}"));
        PromiseOrValue::Value(U128(amount))
    }

    /// `token.ft_transfer(receiver, amount)` with 1 yocto, then `on_payout` (rollback on failure).
    fn transfer(token: &AccountId, receiver: &AccountId, amount: u128, payout: Payout) -> Promise {
        Self::transfer_memo(token, receiver, amount, None, payout)
    }

    /// `transfer` with an optional NEP-141 `memo` (A4 `pay_to.memo`).
    pub(crate) fn transfer_memo(
        token: &AccountId,
        receiver: &AccountId,
        amount: u128,
        memo: Option<&str>,
        payout: Payout,
    ) -> Promise {
        let args = match memo {
            Some(m) => json!({ "receiver_id": receiver, "amount": U128(amount), "memo": m }),
            None => json!({ "receiver_id": receiver, "amount": U128(amount) }),
        }
        .to_string();

        let cb = json!({ "payout": payout, "account_id": receiver, "amount": U128(amount) }).to_string();
        Promise::new(token.clone())
            .function_call("ft_transfer", args.into_bytes(), ONE_YOCTO, GAS_FT_TRANSFER)
            .then(Promise::new(env::current_account_id()).function_call(
                "on_payout",
                cb.into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_ON_PAYOUT,
            ))
    }

    fn validate_string(s: &Option<String>) -> Result<(), &'static str> {
        match s {
            Some(v) if v.len() > MAX_STRING_LEN => Err("string too long"),
            _ => Ok(()),
        }
    }

    // ------------------------------------------------------------ ft_on_transfer variants
    // Each returns the unused amount. All checks happen before the first state write.

    fn on_supply(&mut self, sender: &AccountId, amount: u128) -> Result<u128, &'static str> {
        let available = math::add(self.available_usd_e6, amount)?;
        let supplied = math::add(self.lender_supplied.get(sender).copied().unwrap_or(0), amount)?;
        self.available_usd_e6 = available;
        self.lender_supplied.insert(sender.clone(), supplied);
        emit("liquidity_supplied", json!({ "account": sender, "amount_usd_e6": U128(amount) }));
        Ok(0)
    }

    #[allow(clippy::too_many_arguments)]
    fn on_fund_quote(
        &mut self,
        sender: &AccountId,
        amount: u128,
        collateral: String,
        max_discount_bps: u16,
        notice_period_ns: u64,
        buyer_remote_recipient: Option<String>,
        secrets_profile: Option<String>,
        accepts_voluntary_fills: bool,
    ) -> Result<u128, &'static str> {
        let mut c = self.coll(&collateral).ok_or(ERR_NO_COLLATERAL)?;
        if max_discount_bps as u128 >= BPS {
            return Err("max_discount_bps out of range");
        }
        // WO-23b: the Reserve fills after every quote, so its discount stays above every quote ceiling.
        if c.reserve.discount_bps > 0 && max_discount_bps >= c.reserve.discount_bps {
            return Err("max_discount_bps must be below the reserve discount");
        }
        if notice_period_ns < self.min_notice_period_ns {
            return Err("notice period below minimum");
        }
        if amount < self.min_quote_usd_e6 {
            return Err("quote below minimum");
        }
        Self::validate_string(&buyer_remote_recipient)?;
        // SR-7: only a recipient a vault can pay (32-byte on-curve Solana key or non-zero 0x address).
        if buyer_remote_recipient.as_deref().is_some_and(|r| !chainsig::valid_remote_recipient(r)) {
            return Err("bad recipient");
        }
        Self::validate_string(&secrets_profile)?;
        let mut ids = self.live_ids(&collateral);
        if ids.len() >= MAX_QUOTES_PER_ASSET {
            return Err("quote cap reached for asset");
        }
        let acc = c.acc_fee_per_dollar_e18.0;
        let id = self.next_quote_id;
        let next = id.checked_add(1).ok_or(math::ERR_OVERFLOW)?;
        let q_new = math::add(c.active_committed_q_usd_e6.0, amount)?;
        let quote = Quote {
            quote_id: U64(id),
            buyer: sender.clone(),
            collateral: collateral.clone(),
            committed_usd_e6: U128(amount),
            remaining_usd_e6: U128(amount),
            max_discount_bps,
            notice_period_ns: U64(notice_period_ns),
            unlock_ns: None,
            buyer_remote_recipient,
            secrets_profile,
            fee_debt_e18: U128(math::fee_debt(amount, acc)?),
            claimable_fees_usd_e6: U128(0),
            created_ns: U64(env::block_timestamp()),
            accepts_voluntary_fills,
        };
        // effects
        self.next_quote_id = next;
        c.active_committed_q_usd_e6 = U128(q_new);
        ids.push(id);
        self.quotes_by_collateral.insert(collateral.clone(), ids);
        self.put_quote(quote);
        self.put_coll(c);
        emit(
            "quote_funded",
            json!({ "quote_id": U64(id), "buyer": sender, "collateral": collateral,
                    "amount_usd_e6": U128(amount), "max_discount_bps": max_discount_bps,
                    "accepts_voluntary_fills": accepts_voluntary_fills }),
        );
        self.mint_note(notes::quote_note_id(id), sender);
        Ok(0)
    }

    fn on_top_up(&mut self, sender: &AccountId, amount: u128, quote_id: u64) -> Result<u128, &'static str> {
        let mut q = self.quote(quote_id).ok_or(ERR_NO_QUOTE)?;
        if &q.buyer != sender {
            return Err(ERR_BUYER);
        }
        if q.exiting() {
            return Err("quote is exiting");
        }
        let mut c = self.coll(&q.collateral).ok_or(ERR_NO_COLLATERAL)?;
        let mut ids = self.live_ids(&q.collateral);
        let relist = !ids.contains(&quote_id);
        if relist && ids.len() >= MAX_QUOTES_PER_ASSET {
            return Err("quote cap reached for asset");
        }
        let acc = c.acc_fee_per_dollar_e18.0;
        Self::checkpoint_fees(&mut q, acc)?;
        q.remaining_usd_e6 = U128(math::add(q.remaining_usd_e6.0, amount)?);
        q.committed_usd_e6 = U128(math::add(q.committed_usd_e6.0, amount)?);
        Self::reset_fee_debt(&mut q, acc)?;
        let q_new = math::add(c.active_committed_q_usd_e6.0, amount)?;
        // effects
        c.active_committed_q_usd_e6 = U128(q_new);
        if relist {
            ids.push(quote_id);
            self.quotes_by_collateral.insert(q.collateral.clone(), ids);
        }
        self.put_quote(q);
        self.put_coll(c);
        emit("quote_topped_up", json!({ "quote_id": U64(quote_id), "amount_usd_e6": U128(amount) }));
        Ok(0)
    }

    /// A1-A5: both limits, multiplier, `ca_pending`, `pay_to`, referrer + origination fee.
    #[allow(clippy::too_many_arguments)]
    fn on_lock_and_borrow(
        &mut self,
        sender: &AccountId,
        token_symbol: &str,
        units: u128,
        collateral: String,
        borrow: u128,
        pre_liq_ltv_bps: u16,
        remote_path: Option<String>,
        pay_to: Option<PayTo>,
        referrer: Option<AccountId>,
        shield: Option<ShieldInput>,
    ) -> Result<u128, &'static str> {
        if collateral != token_symbol {
            return Err("collateral does not match token");
        }
        if referrer.as_ref() == Some(sender) {
            return Err(ERR_REFERRER_IS_BORROWER);
        }
        let c = self.coll(&collateral).ok_or(ERR_NO_COLLATERAL)?;
        if c.ca_pending {
            return Err(ERR_CA_PENDING);
        }
        if !self.oracle_fresh(&c) {
            return Err("oracle stale");
        }
        if pre_liq_ltv_bps < c.pre_liq_min_bps || pre_liq_ltv_bps > c.pre_liq_max_bps {
            return Err("pre_liq_ltv_bps out of range");
        }
        if borrow == 0 {
            return Err("borrow is zero");
        }
        if remote_path.is_some() {
            // v2 (WO-21): NEAR-held collateral always settles on NEAR; remote collateral starts at reserve_remote_position.
            return Err("remote_path removed in v2: use reserve_remote_position");
        }
        Self::validate_string(&pay_to.as_ref().and_then(|p| p.memo.clone()))?;
        let referrer = referrer.filter(|r| self.referrers.contains(r)); // unregistered -> treasury
        let shield = match shield {
            Some(s) => Some(self.validate_shield(&c, &s, borrow, sender)?),
            None => None,
        };
        let t = self.check_borrow(&c, units, borrow, Some(pre_liq_ltv_bps), referrer.is_some(), shield.map(|s| s.fee_bps), None)?;
        let id = self.next_position_id;
        let next = id.checked_add(1).ok_or(math::ERR_OVERFLOW)?;
        let entry_m = c.multiplier_e18;
        // effects (book_borrow: all arithmetic before its first write)
        self.book_borrow(c, &t, borrow, &referrer)?;
        self.next_position_id = next;
        if let Some(s) = &shield {
            self.note_shield_open(sender);
            self.emit_shield_opened(id, sender, &collateral, s, t.premium, false);
        }
        self.put_position(Position {
            position_id: U64(id),
            borrower: sender.clone(),
            collateral: collateral.clone(),
            units: U128(units),
            debt_usd_e6: U128(borrow),
            premium_usd_e6: U128(t.premium),
            pre_liq_ltv_bps,
            opened_ns: U64(env::block_timestamp()),
            remote_path: None,
            nonce: U64(id),
            status: PositionStatus::Open,
            entry_multiplier_e18: entry_m,
            remote: None,
            shield,
        });
        self.emit_opened(id, sender, &collateral, units, borrow, &t, pay_to.as_ref(), &referrer, false);
        self.mint_note(notes::position_note_id(id), sender);
        // interaction
        self.pay_proceeds(id, sender, t.net, pay_to);
        Ok(0)
    }

    /// Pool, fee and aggregate-debt effects of an approved borrow (A1, A5), shared by LockCollateralAndBorrow
    /// and remote confirmation. All arithmetic first; `Err` = nothing written.
    pub(crate) fn book_borrow(
        &mut self,
        mut c: CollateralConfig,
        t: &BorrowTerms,
        borrow: u128,
        referrer: &Option<AccountId>,
    ) -> Result<(), &'static str> {
        let available = math::sub(self.available_usd_e6, borrow)?;
        let utilised = math::add(self.utilised_usd_e6, borrow)?;
        let treasury = math::add(
            math::add(self.treasury_usd_e6, t.split.treasury_usd_e6)?,
            math::sub(t.origination, t.referrer_share)?,
        )?;
        let lenders = math::add(self.lenders_fees_usd_e6, t.split.lenders_usd_e6)?;
        let acc = math::add(c.acc_fee_per_dollar_e18.0, t.split.acc_increment_e18)?;
        let total_debt = math::add(c.total_debt_usd_e6.0, borrow)?;
        let mut pool = c.reserve.clone();
        Self::reserve_accrue_fees(&mut pool, t.split.reserve_usd_e6, t.split.reserve_acc_increment_e18, env::block_timestamp())?;
        let ref_claim = match referrer {
            Some(r) if t.referrer_share > 0 => Some(math::add(self.claimable(r), t.referrer_share)?),
            _ => None,
        };
        // effects
        self.available_usd_e6 = available;
        self.utilised_usd_e6 = utilised;
        self.treasury_usd_e6 = treasury;
        self.lenders_fees_usd_e6 = lenders;
        c.acc_fee_per_dollar_e18 = U128(acc);
        c.total_debt_usd_e6 = U128(total_debt);
        c.reserve = pool;
        self.put_coll(c);
        if let (Some(r), Some(v)) = (referrer, ref_claim) {
            self.claimable_usdc.insert(r.clone(), v);
        }
        Ok(())
    }

    /// `position_opened` (+ `referrer_paid` when a registered referrer earned a share).
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn emit_opened(
        &self,
        id: u64,
        borrower: &AccountId,
        collateral: &str,
        units: u128,
        borrow: u128,
        t: &BorrowTerms,
        pay_to: Option<&PayTo>,
        referrer: &Option<AccountId>,
        remote: bool,
    ) {
        emit(
            "position_opened",
            json!({ "position_id": U64(id), "borrower": borrower, "collateral": collateral,
                    "units": U128(units), "debt_usd_e6": U128(borrow), "premium_usd_e6": U128(t.premium),
                    "origination_fee_usd_e6": U128(t.origination), "net_proceeds_usd_e6": U128(t.net),
                    "pay_to": pay_to.map(|p| &p.receiver_id), "referrer": referrer, "remote": remote }),
        );
        if let Some(r) = referrer {
            if t.referrer_share > 0 {
                emit(
                    "referrer_paid",
                    json!({ "referrer": r, "position_id": U64(id), "amount_usd_e6": U128(t.referrer_share) }),
                );
            }
        }
    }

    /// Net proceeds to the borrower, or to `pay_to.receiver_id` with its memo (A4).
    pub(crate) fn pay_proceeds(&self, id: u64, borrower: &AccountId, net: u128, pay_to: Option<PayTo>) {
        if net == 0 {
            return;
        }
        match pay_to {
            Some(p) => Self::transfer_memo(
                &self.usdc_token,
                &p.receiver_id,
                net,
                p.memo.as_deref(),
                Payout::PayTo { position_id: U64(id), borrower: borrower.clone() },
            )
            .detach(),
            None => Self::transfer(&self.usdc_token, borrower, net, Payout::BorrowProceeds { position_id: U64(id) }).detach(),
        }
    }

    pub(crate) fn claimable(&self, a: &AccountId) -> u128 {
        self.claimable_usdc.get(a).copied().unwrap_or(0)
    }

    /// Shared by `LockCollateralAndBorrow` and `preview_borrow`: the two-sided limit (A1), liquidity,
    /// pre-liq, then the fee stack (premium, origination, referrer share) and net proceeds.
    fn check_borrow(
        &self,
        c: &CollateralConfig,
        units: u128,
        borrow: u128,
        pre_liq_ltv_bps: Option<u16>,
        referrer_registered: bool,
        shield_fee_bps: Option<u16>,
        remote: Option<(u128, u128)>,
    ) -> Result<BorrowTerms, &'static str> {
        // WO-23a §4.9: a Shield is sized at weekend parameters and pays a flat fee instead of the premium.
        let mut lp = self.limit_params_for(c, shield_fee_bps.is_some());
        // SR-5 (WO-34a): a remote loan settles in ONE signed leg from ONE quote whose recipient fits its chain. Size it
        // against those quotes only (`remote` = (sum, largest) of fitting non-exiting remaining): no R_c, no D_c.
        if let Some((q_remote, _)) = remote {
            lp.q_usd_e6 = q_remote;
            lp.r_usd_e6 = 0;
            lp.d_usd_e6 = 0;
        }
        let l = math::limit(units, &lp)?;
        if borrow > l.ltv_cap_usd_e6 {
            return Err("borrow above B_c");
        }
        if math::add(c.total_debt_usd_e6.0, borrow)? > l.capacity_usd_e6 {
            return Err(ERR_AGGREGATE_LIMIT);
        }
        // SR-5: while remote settlement is single-leg, the (haircut-limited) borrow is capped at the largest fitting quote.
        if remote.is_some_and(|(_, largest)| borrow > largest) {
            return Err(ERR_REMOTE_SETTLE_CAP);
        }
        if borrow > self.available_usd_e6 {
            return Err("insufficient pool liquidity");
        }
        if let Some(pl) = pre_liq_ltv_bps {
            if math::triggerable(borrow, l.value_usd_e6, pl)? {
                return Err("borrow above pre_liq_ltv_bps");
            }
        }
        let premium = match shield_fee_bps {
            Some(bps) => math::shield_fee(borrow, bps)?,
            None => math::premium_usd_e6(borrow, l.static_limit_usd_e6, c.limit_premium_bps)?,
        };
        // WO-23b: the buyers' share is split Q_c : R_c between the quotes' and the Reserve's fee indices.
        let split = math::split_premium_qr(
            premium,
            self.fee_split.buyers_bps,
            self.fee_split.lenders_bps,
            c.active_committed_q_usd_e6.0,
            Self::reserve_rc(c),
            c.reserve.shares.0,
        )?;
        let origination = math::origination_fee(borrow, self.origination_fee_bps)?;
        let referrer_share = if referrer_registered { origination / 2 } else { 0 };
        let net = math::sub(math::sub(borrow, premium)?, origination).map_err(|_| "fees exceed borrow")?;
        Ok(BorrowTerms { premium, split, origination, referrer_share, net })
    }

    fn on_repay(&mut self, amount: u128, position_id: u64) -> Result<u128, &'static str> {
        let mut p = self.position(position_id).ok_or(ERR_NO_POSITION)?;
        if p.status != PositionStatus::Open {
            return Err("position not open");
        }
        let applied = amount.min(p.debt_usd_e6.0);
        if applied == 0 {
            return Err("nothing to repay");
        }
        let unused = math::sub(amount, applied)?;
        let debt = math::sub(p.debt_usd_e6.0, applied)?;
        let utilised = math::sub(self.utilised_usd_e6, applied)?;
        let available = math::add(self.available_usd_e6, applied)?;
        let mut c = self.coll(&p.collateral).ok_or(ERR_NO_COLLATERAL)?;
        let total_debt = math::sub(c.total_debt_usd_e6.0, applied)?;
        let token = c.token.clone();
        // effects
        self.utilised_usd_e6 = utilised;
        self.available_usd_e6 = available;
        c.total_debt_usd_e6 = U128(total_debt);
        self.put_coll(c);
        p.debt_usd_e6 = U128(debt);
        emit(
            "repaid",
            json!({ "position_id": U64(position_id), "amount_usd_e6": U128(applied), "remaining_debt_usd_e6": U128(debt) }),
        );
        // Remote collateral stays in the vault until `request_remote_release` (the position stays Open, debt 0).
        let release = if debt == 0 && p.remote.is_none() { self.close_position(&mut p) } else { 0 };
        let borrower = p.borrower.clone();
        self.put_position(p);
        if release > 0 {
            Self::transfer(&token, &borrower, release, Payout::CollateralRelease { position_id: U64(position_id) })
                .detach();
        }
        Ok(unused)
    }

    /// Marks the position closed and returns the units to release.
    fn close_position(&mut self, p: &mut Position) -> u128 {
        let units = p.units.0;
        p.units = U128(0);
        p.status = PositionStatus::Closed;
        units
    }

    pub(crate) fn is_triggerable(&self, p: &Position, c: &CollateralConfig) -> bool {
        let value = ok(Self::value_of(p.units.0, c));
        ok(math::triggerable(p.debt_usd_e6.0, value, p.pre_liq_ltv_bps))
    }

    /// SR-5 (WO-34a): settlement candidates for this position. A remote position (one signed leg, one quote) keeps only
    /// quotes whose recipient fits its chain and whose remaining closes it in one leg at their ceiling, filtered BEFORE
    /// the 8-candidate cut so cheap unfit quotes cannot crowd out a fitting one. NEAR-held: `select_quotes`. <= 64 reads.
    pub(crate) fn select_quotes_for(&self, p: &Position, c: &CollateralConfig) -> Vec<(u16, u64)> {
        #[cfg(feature = "p2")]
        if let Some(r) = &p.remote {
            return self.select_remote_quotes(p, r.domain_id, c);
        }
        let _ = c;
        self.select_quotes(&p.collateral)
    }

    /// SR-8: views show the remote depositor commitment (own raw key; `#[borsh(skip)]` field of `RemoteInfo`).
    fn with_commitment(&self, mut p: Position) -> Position {
        #[cfg(feature = "p2")]
        {
            let id = p.position_id.0;
            if let Some(r) = p.remote.as_mut() {
                r.committed_depositor = self.committed_depositor(id);
            }
        }
        p
    }

    /// <= 8 live quotes with capacity: ascending max_discount_bps, then oldest (lowest id). <= 64 reads.
    pub(crate) fn select_quotes(&self, symbol: &str) -> Vec<(u16, u64)> {
        let ids = self.live_ids(symbol);
        let mut cands: Vec<(u16, u64)> = Vec::with_capacity(ids.len());
        for id in ids.iter() {
            if let Some(q) = self.quote(*id) {
                if q.remaining_usd_e6.0 > 0 {
                    cands.push((q.max_discount_bps, *id));
                }
            }
        }
        cands.sort_unstable();
        cands.truncate(MAX_QUOTES_PER_SETTLEMENT);
        cands
    }

    /// Settlement legs at the given `(disc_bps, quote_id)` list (already ordered, <= 8).
    /// Checks first, then effects, then interactions; on `Err` nothing has been written.
    /// v2 (WO-21): NEAR-held collateral always settles on NEAR (every leg is an `ft_transfer`); a remote
    /// position settles through one signed `NECTAR_SETTLE_V1|..|kind=PRELIQ` leg (`settle_remote`).
    pub(crate) fn settle(
        &mut self,
        position_id: U64,
        mut p: Position,
        mut c: CollateralConfig,
        cands: &[(u16, u64)],
        keeper: &AccountId,
    ) -> Result<(), &'static str> {
        if p.remote.is_some() {
            return self.settle_remote(position_id, p, c, cands);
        }
        let price = c.oracle_price_usd_e6.0;
        let m = Self::eff_multiplier(&c);
        let acc = c.acc_fee_per_dollar_e18.0;
        let mut debt = p.debt_usd_e6.0;
        let mut units = p.units.0;
        let mut q_c = c.active_committed_q_usd_e6.0;
        let mut total_repay: u128 = 0;
        let mut keeper_units: u128 = 0;
        let mut buyer_transfers: Vec<(AccountId, u128, u64)> = Vec::new();
        let mut legs: Vec<(Quote, u16, u128, u128)> = Vec::new();
        for &(disc, qid) in cands.iter().take(MAX_QUOTES_PER_SETTLEMENT) {
            if debt == 0 || units == 0 {
                break;
            }
            let Some(mut q) = self.quote(qid) else { continue };
            if q.remaining_usd_e6.0 == 0 || q.collateral != p.collateral {
                continue;
            }
            let Some(leg) =
                math::settle_leg_m(debt, q.remaining_usd_e6.0, units, m, price, c.decimals, disc, self.keeper_fee_bps)?
            else {
                continue;
            };
            Self::checkpoint_fees(&mut q, acc)?;
            if !q.exiting() {
                q_c = math::sub(q_c, leg.repay_usd_e6)?;
            }
            q.remaining_usd_e6 = U128(math::sub(q.remaining_usd_e6.0, leg.repay_usd_e6)?);
            Self::reset_fee_debt(&mut q, acc)?;
            debt = math::sub(debt, leg.repay_usd_e6)?;
            units = math::sub(units, math::add(leg.buyer_units, leg.keeper_units)?)?;
            total_repay = math::add(total_repay, leg.repay_usd_e6)?;
            keeper_units = math::add(keeper_units, leg.keeper_units)?;
            // One ft_transfer per distinct buyer (bounds receipts to <= 8 + keeper + borrower).
            match buyer_transfers.iter_mut().find(|(b, _, _)| *b == q.buyer) {
                Some(entry) => entry.1 = math::add(entry.1, leg.buyer_units)?,
                None => buyer_transfers.push((q.buyer.clone(), leg.buyer_units, qid)),
            }
            legs.push((q, disc, leg.repay_usd_e6, leg.buyer_units));
        }
        // WO-23b (§4.8): then the Reserve at its discount, only once no live quote outside this call has capacity.
        // Seized units stay here (`reserve.units`) and accrue per active share; no transfer.
        let reserve_stage = debt > 0
            && units > 0
            && c.reserve.discount_bps > 0
            && self.reserve_stage_open(&p.collateral, cands);
        let mut reserve_fill: Option<(u128, u128)> = None;
        if reserve_stage {
            let rc = Self::reserve_rc(&c);
            let shares = c.reserve.shares.0;
            if rc > 0 && shares > 0 {
                if let Some(leg) = math::settle_leg_m(
                    debt,
                    rc,
                    units,
                    m,
                    price,
                    c.decimals,
                    c.reserve.discount_bps,
                    self.keeper_fee_bps,
                )? {
                    let inc = math::mul_div_floor(leg.buyer_units, math::E18, shares)?;
                    c.reserve.usdc_e6 = U128(math::sub(c.reserve.usdc_e6.0, leg.repay_usd_e6)?);
                    c.reserve.units = U128(math::add(c.reserve.units.0, leg.buyer_units)?);
                    c.reserve.acc_units_per_share_e18 = U128(math::add(c.reserve.acc_units_per_share_e18.0, inc)?);
                    debt = math::sub(debt, leg.repay_usd_e6)?;
                    units = math::sub(units, math::add(leg.buyer_units, leg.keeper_units)?)?;
                    total_repay = math::add(total_repay, leg.repay_usd_e6)?;
                    keeper_units = math::add(keeper_units, leg.keeper_units)?;
                    reserve_fill = Some((leg.repay_usd_e6, leg.buyer_units));
                }
            }
        }
        if total_repay == 0 {
            return Err("no quote capacity");
        }
        // A1: all debt repaid by this call leaves the aggregate.
        let total_debt = math::sub(c.total_debt_usd_e6.0, total_repay)?;
        let utilised = math::sub(self.utilised_usd_e6, total_repay)?;
        let available = math::add(self.available_usd_e6, total_repay)?;
        p.debt_usd_e6 = U128(debt);
        p.units = U128(units);
        let release = if debt == 0 {
            self.close_position(&mut p)
        } else if reserve_stage {
            // WO-23b: quotes and Reserve exhausted; the shortfall stays Settling for the owner (`cancel_settlement`).
            p.status = PositionStatus::Settling;
            0
        } else {
            p.status = PositionStatus::Open;
            0
        };
        let n_local = buyer_transfers.len() as u64 + u64::from(keeper_units > 0) + u64::from(release > 0);
        let reserve = math::sub(self.gas_reserve_yocto, u128::from(n_local)).map_err(|_| "gas reserve empty")?;

        // effects
        for (q, disc, repay, seize) in legs {
            emit(
                "settled_near",
                json!({ "position_id": position_id, "quote_id": q.quote_id, "disc_bps": disc,
                        "repay_usd_e6": U128(repay), "seize_units": U128(seize), "buyer": q.buyer }),
            );
            if q.remaining_usd_e6.0 == 0 {
                self.remove_live(&p.collateral, q.quote_id.0);
            }
            self.put_quote(q);
        }
        if let Some((repay, seize)) = reserve_fill {
            emit(
                "settled_reserve",
                json!({ "position_id": position_id, "collateral": p.collateral, "disc_bps": c.reserve.discount_bps,
                        "repay_usd_e6": U128(repay), "seize_units": U128(seize) }),
            );
        }
        if reserve_stage && p.status == PositionStatus::Settling {
            self.reserve_ref_add(&p.collateral, position_id.0);
        }
        self.utilised_usd_e6 = utilised;
        self.available_usd_e6 = available;
        self.gas_reserve_yocto = reserve;
        c.active_committed_q_usd_e6 = U128(q_c);
        c.total_debt_usd_e6 = U128(total_debt);
        let token = c.token.clone();

        let borrower = p.borrower.clone();
        self.put_coll(c);
        self.put_position(p);

        // interactions
        for (buyer, b, qid) in buyer_transfers {
            Self::transfer(&token, &buyer, b, Payout::SettlementBuyer { position_id, quote_id: U64(qid) }).detach();
        }
        if keeper_units > 0 {
            Self::transfer(&token, keeper, keeper_units, Payout::SettlementKeeper { position_id }).detach();
        }
        if release > 0 {
            Self::transfer(&token, &borrower, release, Payout::CollateralRelease { position_id }).detach();
        }
        Ok(())
    }

    // ---- P2 hooks: remote positions need feature `p2` (src/remote.rs implements them).
    #[cfg(not(feature = "p2"))]
    fn settle_remote(&mut self, _id: U64, _p: Position, _c: CollateralConfig, _cands: &[(u16, u64)]) -> Result<(), &'static str> {
        Err("p2 disabled")
    }
    /// Extra gas a settlement of this position needs downstream for the sign leg (0 without p2).
    #[cfg(not(feature = "p2"))]
    #[allow(dead_code)]
    pub(crate) fn remote_extra_gas(&self, _p: &Position) -> u64 {
        0
    }
    fn owed_key(account: &AccountId, symbol: &str) -> String {
        format!("{account}|{symbol}")
    }
    fn record_owed(&mut self, account: &AccountId, symbol: &str, units: u128) {
        let key = Self::owed_key(account, symbol);
        let v = ok(math::add(self.owed_collateral.get(&key).copied().unwrap_or(0), units));
        self.owed_collateral.insert(key, v);
    }
}

// ---------------------------------------------------------------- public ABI
#[near]
impl Nectar {
    #[init]
    pub fn new(owner: AccountId, usdc_token: AccountId, keeper: AccountId) -> Self {
        env::storage_write(STATE_VERSION_KEY, &[STATE_VERSION]);
        Self {
            owner,
            paused: false,
            usdc_token,
            keeper,
            keeper_fee_bps: DEFAULT_KEEPER_FEE_BPS,
            fee_split: FeeSplit { buyers_bps: 7000, lenders_bps: 2000, treasury_bps: 1000 },
            min_notice_period_ns: DEFAULT_MIN_NOTICE_NS,
            min_quote_usd_e6: DEFAULT_MIN_QUOTE_USD_E6,
            max_age_ns_session: DEFAULT_MAX_AGE_SESSION_NS,
            max_age_ns_closed: DEFAULT_MAX_AGE_CLOSED_NS,
            band_bps: DEFAULT_BAND_BPS,
            available_usd_e6: 0,
            utilised_usd_e6: 0,
            treasury_usd_e6: 0,
            lenders_fees_usd_e6: 0,
            gas_reserve_yocto: 0,
            next_quote_id: 0,
            next_position_id: 0,
            collaterals: IterableMap::new(StorageKey::Collaterals),
            token_to_symbol: LookupMap::new(StorageKey::TokenToSymbol),
            quotes: LookupMap::new(StorageKey::Quotes),
            quotes_by_collateral: LookupMap::new(StorageKey::QuotesByCollateral),
            positions: LookupMap::new(StorageKey::Positions),
            lender_supplied: LookupMap::new(StorageKey::LenderSupplied),
            pending_prices: LookupMap::new(StorageKey::PendingPrices),
            owed_collateral: LookupMap::new(StorageKey::OwedCollateral),
            quoter: default_quoter(),
            vol_bps: LookupMap::new(StorageKey::VolBps),
            oracle_sources: LookupMap::new(StorageKey::OracleSources),
            max_conf_bps: DEFAULT_MAX_CONF_BPS,
            session_calendar: LazyOption::new(StorageKey::SessionCalendar, None),
            referrers: LookupSet::new(StorageKey::Referrers),
            origination_fee_bps: DEFAULT_ORIGINATION_FEE_BPS,
            claimable_usdc: LookupMap::new(StorageKey::ClaimableUsdc),
            shield_opens: LookupMap::new(StorageKey::ShieldOpens),
            notes: notes::Notes {
                ids: Vector::new(StorageKey::NoteIds),
                index: LookupMap::new(StorageKey::NoteIndex),
                by_owner: LookupMap::new(StorageKey::NotesByOwner),
                count: LookupMap::new(StorageKey::NoteCount),
                quote_refs: LookupMap::new(StorageKey::NoteQuoteRefs),
            },
            reserve_notes: LookupMap::new(StorageKey::ReserveNotes),
            next_reserve_note_id: 0,
            reserve_refs: LookupMap::new(StorageKey::ReserveRefs),
        }
    }

    // ------------------------------------------------------------ NEP-141 receiver
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        let token_symbol: Option<String> = if token == self.usdc_token {
            None
        } else {
            Some(self.token_to_symbol.get(&token).cloned().unwrap_or_else(|| env::panic_str(ERR_UNKNOWN_TOKEN)))
        };
        let amount = amount.0;
        if self.paused {
            return Self::refund(ERR_PAUSED, amount);
        }
        if amount == 0 {
            return Self::refund("zero amount", amount);
        }
        let parsed: TokenMsg = match serde_json::from_str(&msg) {
            Ok(m) => m,
            Err(_) => return Self::refund("invalid msg", amount),
        };
        let res = match (parsed, token_symbol) {
            (TokenMsg::SupplyLendingLiquidity, None) => self.on_supply(&sender_id, amount),
            (
                TokenMsg::FundPappusQuote {
                    collateral,
                    max_discount_bps,
                    notice_period_ns,
                    buyer_remote_recipient,
                    secrets_profile,
                    accepts_voluntary_fills,
                },
                None,
            ) => self.on_fund_quote(
                &sender_id,
                amount,
                collateral,
                max_discount_bps,
                notice_period_ns.0,
                buyer_remote_recipient,
                secrets_profile,
                accepts_voluntary_fills,
            ),
            (TokenMsg::TopUpQuote { quote_id }, None) => self.on_top_up(&sender_id, amount, quote_id.0),
            (TokenMsg::Repay { position_id }, None) => self.on_repay(amount, position_id.0),
            (TokenMsg::JoinNectarReserve { collateral }, None) => self.on_join_reserve(&sender_id, amount, collateral),
            (
                TokenMsg::LockCollateralAndBorrow {
                    collateral,
                    borrow_usd_e6,
                    pre_liq_ltv_bps,
                    remote_path,
                    pay_to,
                    referrer,
                    shield,
                },
                Some(sym),
            ) => self.on_lock_and_borrow(
                &sender_id,
                &sym,
                amount,
                collateral,
                borrow_usd_e6.0,
                pre_liq_ltv_bps,
                remote_path,
                pay_to,
                referrer,
                shield,
            ),
            _ => Err("msg not valid for this token"),
        };
        match res {
            Ok(unused) => PromiseOrValue::Value(U128(unused)),
            Err(e) => Self::refund(e, amount),
        }
    }

    // ------------------------------------------------------------ owner admin
    pub fn upsert_collateral(&mut self, symbol: String, config: CollateralInput) {
        self.assert_owner();
        let i = config;
        require!(i.symbol == symbol, "symbol mismatch");
        require!(!symbol.is_empty() && symbol.len() <= 32, "bad symbol");
        require!(i.token != self.usdc_token, "collateral token cannot be usdc");
        require!(i.decimals <= 24, "decimals > 24");
        require!(i.price_feed_id.len() <= MAX_STRING_LEN, "price_feed_id too long");
        for b in [
            i.base_ltv_bps,
            i.max_nectar_ltv_bps,
            i.base_haircut_bps,
            i.weekend_haircut_bps,
            i.limit_premium_bps,
            i.pre_liq_min_bps,
            i.pre_liq_max_bps,
        ] {
            require!(b as u128 <= BPS, "bps > 10000");
        }
        require!(i.base_ltv_bps <= i.max_nectar_ltv_bps, "base_ltv > max_nectar_ltv");
        require!(i.pre_liq_min_bps <= i.pre_liq_max_bps, "pre_liq_min > pre_liq_max");
        if let Some(sym) = self.token_to_symbol.get(&i.token) {
            require!(sym == &symbol, "token already mapped to another symbol");
        }
        let c = match self.coll(&symbol) {
            Some(old) => {
                if old.token != i.token {
                    self.token_to_symbol.remove(&old.token);
                }
                if let Some(k) = i.price_kind {
                    require!(k == old.price_kind || old.total_debt_usd_e6.0 == 0, "price_kind change with open debt");
                }
                CollateralConfig {
                    symbol: symbol.clone(),
                    token: i.token.clone(),
                    decimals: i.decimals,
                    price_feed_id: i.price_feed_id,
                    base_ltv_bps: i.base_ltv_bps,
                    max_nectar_ltv_bps: i.max_nectar_ltv_bps,
                    base_haircut_bps: i.base_haircut_bps,
                    weekend_haircut_bps: i.weekend_haircut_bps,
                    limit_premium_bps: i.limit_premium_bps,
                    pre_liq_min_bps: i.pre_liq_min_bps,
                    pre_liq_max_bps: i.pre_liq_max_bps,
                    verified_dex_depth_usd_e6: i.verified_dex_depth_usd_e6,
                    remote_chain: i.remote_chain,
                    price_kind: i.price_kind.unwrap_or(old.price_kind),
                    ..old
                }
            }
            None => CollateralConfig {
                symbol: symbol.clone(),
                token: i.token.clone(),
                decimals: i.decimals,
                price_feed_id: i.price_feed_id,
                base_ltv_bps: i.base_ltv_bps,
                max_nectar_ltv_bps: i.max_nectar_ltv_bps,
                base_haircut_bps: i.base_haircut_bps,
                weekend_haircut_bps: i.weekend_haircut_bps,
                limit_premium_bps: i.limit_premium_bps,
                pre_liq_min_bps: i.pre_liq_min_bps,
                pre_liq_max_bps: i.pre_liq_max_bps,
                oracle_price_usd_e6: U128(0),
                oracle_updated_ns: U64(0),
                verified_dex_depth_usd_e6: i.verified_dex_depth_usd_e6,
                active_committed_q_usd_e6: U128(0),
                acc_fee_per_dollar_e18: U128(0),
                remote_chain: i.remote_chain,
                total_debt_usd_e6: U128(0),
                multiplier_e18: U128(math::E18),
                multiplier_updated_ns: U64(env::block_timestamp()),
                price_kind: i.price_kind.unwrap_or_default(),
                ca_pending: false,
                ca_effective_ns: U64(0),
                ca_multiplier_e18: U128(0),
                forced_closed: false,
                weekend_ref_price_e6: U128(0),
                weekend_ref_updated_ns: U64(0),
                shield: ShieldParams {
                    weekend_fee_bps: DEFAULT_SHIELD_WEEKEND_FEE_BPS,
                    event_fee_bps: DEFAULT_SHIELD_EVENT_FEE_BPS,
                    event_window_end_ns: U64(0),
                },
                max_voluntary_fill_usd_e6_per_day: U128(0),
                voluntary_filled_today_e6: U128(0),
                voluntary_day: 0,
                ca_suggested_multiplier_e18: U128(0),
                ca_suggested_ns: U64(0),
                reserve: ReservePool::default(),
            },
        };
        self.token_to_symbol.insert(i.token, symbol.clone());
        self.put_coll(c);
        emit("collateral_upserted", json!({ "symbol": symbol }));
    }

    pub fn set_keeper(&mut self, keeper: AccountId) {
        self.assert_owner();
        self.keeper = keeper;
    }

    pub fn set_fee_split(&mut self, buyers_bps: u16, lenders_bps: u16, treasury_bps: u16) {
        self.assert_owner();
        let sum = buyers_bps as u128 + lenders_bps as u128 + treasury_bps as u128;
        require!(sum == BPS, "fee split must sum to 10000");
        self.fee_split = FeeSplit { buyers_bps, lenders_bps, treasury_bps };
    }


    pub fn set_dex_depth(&mut self, symbol: String, depth_usd_e6: U128) {
        self.assert_owner();
        let mut c = self.coll_or_panic(&symbol);
        c.verified_dex_depth_usd_e6 = depth_usd_e6;
        self.put_coll(c);
    }

    pub fn set_quote_params(&mut self, min_notice_period_ns: U64, min_quote_usd_e6: U128) {
        self.assert_owner();
        self.min_notice_period_ns = min_notice_period_ns.0;
        self.min_quote_usd_e6 = min_quote_usd_e6.0;
    }

    pub fn set_oracle_params(&mut self, max_age_ns_session: U64, max_age_ns_closed: U64, band_bps: u16) {
        self.assert_owner();
        require!(max_age_ns_session.0 > 0 && max_age_ns_closed.0 > 0, "max age must be > 0");
        require!(band_bps as u128 <= BPS, "band_bps > 10000");
        self.max_age_ns_session = max_age_ns_session.0;
        self.max_age_ns_closed = max_age_ns_closed.0;
        self.band_bps = band_bps;
    }

    /// P0 owner oracle. Returns false (and emits `oracle_rejected`) when outside the band.
    pub fn update_owner_price(&mut self, symbol: String, price_usd_e6: U128) -> bool {
        self.assert_owner();
        require!(price_usd_e6.0 > 0, "price must be > 0");
        let mut c = self.coll_or_panic(&symbol);
        let last = c.oracle_price_usd_e6.0;
        if last > 0 {
            let diff = price_usd_e6.0.abs_diff(last);
            let lhs = ok(diff.checked_mul(BPS).ok_or(math::ERR_OVERFLOW));
            let rhs = ok(last.checked_mul(self.band_bps as u128).ok_or(math::ERR_OVERFLOW));
            if lhs > rhs {
                emit(
                    "oracle_rejected",
                    json!({ "symbol": symbol, "price_usd_e6": price_usd_e6, "last_usd_e6": U128(last) }),
                );
                return false;
            }
        }
        c.oracle_price_usd_e6 = price_usd_e6;
        c.oracle_updated_ns = U64(env::block_timestamp());
        self.put_coll(c);
        emit("oracle_updated", json!({ "symbol": symbol, "price_usd_e6": price_usd_e6 }));
        true
    }

    /// Step 1 of the band override.
    pub fn propose_price(&mut self, symbol: String, price_usd_e6: U128) {
        self.assert_owner();
        require!(price_usd_e6.0 > 0, "price must be > 0");
        self.coll_or_panic(&symbol);
        self.pending_prices.insert(symbol, (price_usd_e6.0, env::block_timestamp()));
    }

    /// Step 2 of the band override; must land in a later block than `propose_price`.
    pub fn apply_price(&mut self, symbol: String) {
        self.assert_owner();
        let (price, proposed_ns) =
            self.pending_prices.get(&symbol).copied().unwrap_or_else(|| env::panic_str("no proposed price"));
        require!(env::block_timestamp() > proposed_ns, "apply in a later block");
        let mut c = self.coll_or_panic(&symbol);
        c.oracle_price_usd_e6 = U128(price);
        c.oracle_updated_ns = U64(env::block_timestamp());
        self.put_coll(c);
        self.pending_prices.remove(&symbol);
        emit("oracle_updated", json!({ "symbol": symbol, "price_usd_e6": U128(price) }));
    }

    pub fn pause(&mut self) {
        self.assert_owner();
        self.paused = true;
        emit("paused", json!({}));
    }

    pub fn unpause(&mut self) {
        self.assert_owner();
        self.paused = false;
        emit("unpaused", json!({}));
    }

    #[payable]
    pub fn fund_gas_reserve(&mut self) {
        self.assert_owner();
        let dep = env::attached_deposit().as_yoctonear();
        require!(dep > 0, "attach a deposit");
        self.gas_reserve_yocto = ok(math::add(self.gas_reserve_yocto, dep));
    }

    // ------------------------------------------------------------ buyer
    #[payable]
    pub fn initiate_quote_withdrawal(&mut self, quote_id: U64) {
        assert_one_yocto();
        let mut q = self.quote_or_panic(quote_id.0);
        require!(env::predecessor_account_id() == q.buyer, ERR_BUYER);
        require!(!q.exiting(), "already exiting");
        let mut c = self.coll_or_panic(&q.collateral);
        let acc = c.acc_fee_per_dollar_e18.0;
        ok(Self::checkpoint_fees(&mut q, acc));
        let q_new = ok(math::sub(c.active_committed_q_usd_e6.0, q.remaining_usd_e6.0));
        let unlock = env::block_timestamp()
            .checked_add(q.notice_period_ns.0)
            .unwrap_or_else(|| env::panic_str(math::ERR_OVERFLOW));
        q.unlock_ns = Some(U64(unlock));
        ok(Self::reset_fee_debt(&mut q, acc)); // weight is now 0
        c.active_committed_q_usd_e6 = U128(q_new);
        self.put_quote(q);
        self.put_coll(c);
        emit("quote_exiting", json!({ "quote_id": quote_id, "unlock_ns": U64(unlock) }));
    }

    #[payable]
    pub fn complete_quote_withdrawal(&mut self, quote_id: U64) -> Promise {
        assert_one_yocto();
        let mut q = self.quote_or_panic(quote_id.0);
        require!(env::predecessor_account_id() == q.buyer, ERR_BUYER);
        let unlock = q.unlock_ns.unwrap_or_else(|| env::panic_str("withdrawal not initiated"));
        require!(env::block_timestamp() >= unlock.0, "notice period not over");
        let principal = q.remaining_usd_e6.0;
        let fees = q.claimable_fees_usd_e6.0;
        let total = ok(math::add(principal, fees));
        require!(total > 0, "nothing to withdraw");
        q.remaining_usd_e6 = U128(0);
        q.claimable_fees_usd_e6 = U128(0);
        let buyer = q.buyer.clone();
        let symbol = q.collateral.clone();
        self.put_quote(q);
        self.remove_live(&symbol, quote_id.0);
        emit(
            "quote_withdrawn",
            json!({ "quote_id": quote_id, "principal_usd_e6": U128(principal), "fees_usd_e6": U128(fees) }),
        );
        Self::transfer(
            &self.usdc_token,
            &buyer,
            total,
            Payout::QuoteWithdrawal { quote_id, principal_usd_e6: U128(principal), fees_usd_e6: U128(fees) },
        )
    }

    #[payable]
    pub fn claim_fees(&mut self, quote_id: U64) -> Promise {
        assert_one_yocto();
        self.assert_not_paused();
        let mut q = self.quote_or_panic(quote_id.0);
        require!(env::predecessor_account_id() == q.buyer, ERR_BUYER);
        let c = self.coll_or_panic(&q.collateral);
        let acc = c.acc_fee_per_dollar_e18.0;
        ok(Self::checkpoint_fees(&mut q, acc));
        ok(Self::reset_fee_debt(&mut q, acc));
        let amount = q.claimable_fees_usd_e6.0;
        require!(amount > 0, "no fees");
        q.claimable_fees_usd_e6 = U128(0);
        let buyer = q.buyer.clone();
        self.put_quote(q);
        emit("fees_claimed", json!({ "quote_id": quote_id, "amount_usd_e6": U128(amount) }));
        Self::transfer(&self.usdc_token, &buyer, amount, Payout::Fees { quote_id })
    }

    // ------------------------------------------------------------ keeper
    /// Settles <= 8 quotes, ascending discount then oldest. P0: each quote's `max_discount_bps`.
    /// P1 (quoter pinned + vol set): OutLayer `request_execution` then `on_quoter_result` (interface-p1.md).
    pub fn trigger_preliquidation(&mut self, position_id: U64) {
        self.assert_not_paused();
        require!(env::predecessor_account_id() == self.keeper, ERR_KEEPER);
        let p = self.position_or_panic(position_id.0);
        require!(p.status == PositionStatus::Open, "position not open");
        if let Some(r) = &p.remote {
            require!(r.status == RemoteStatus::Open, "remote position not open");
        }
        let c = self.coll_or_panic(&p.collateral);
        // WO-10b: Pyth source -> freshness, conf, band and health are checked in `on_pyth_price`.
        #[cfg(feature = "p1")]
        if let Some(OracleSource::Pyth { account, price_identifier }) = self.oracle_sources.get(&p.collateral).cloned() {
            emit("preliq_triggered", json!({ "position_id": position_id, "keeper": env::predecessor_account_id() }));
            return self.start_pyth_read(position_id, p, account, price_identifier);
        }
        require!(self.oracle_fresh(&c), "oracle stale");
        require!(self.is_triggerable(&p, &c), "position healthy");
        let keeper = env::predecessor_account_id();
        emit("preliq_triggered", json!({ "position_id": position_id, "keeper": keeper }));
        let cands = self.select_quotes_for(&p, &c);

        #[cfg(feature = "p1")]
        if self.quoter_enabled() {
            match self.vol_bps.get(&p.collateral).copied() {
                Some(vol) => return self.start_quoter(position_id, p, &c, cands, vol),
                None => emit("quoter_fallback", json!({ "position_id": position_id, "reason": "vol_unset" })),
            }
        }
        if let Err(e) = self.settle(position_id, p, c, &cands, &keeper) {
            env::panic_str(e);
        }
    }

    // ------------------------------------------------------------ callbacks
    /// Rollback for a failed contract-initiated `ft_transfer`. Returns true on success.
    #[private]
    pub fn on_payout(&mut self, payout: Payout, account_id: AccountId, amount: U128) -> bool {
        if is_promise_success() {
            return true;
        }
        let amt = amount.0;
        match &payout {
            Payout::BorrowProceeds { position_id } => {
                // USDC never left: apply it as repayment of the same position.
                let mut p = self.position_or_panic(position_id.0);
                let applied = amt.min(p.debt_usd_e6.0);
                p.debt_usd_e6 = U128(ok(math::sub(p.debt_usd_e6.0, applied)));
                self.utilised_usd_e6 = ok(math::sub(self.utilised_usd_e6, applied));
                self.available_usd_e6 = ok(math::add(self.available_usd_e6, applied));
                let mut c = self.coll_or_panic(&p.collateral);
                c.total_debt_usd_e6 = U128(ok(math::sub(c.total_debt_usd_e6.0, applied)));
                self.put_coll(c);
                let surplus = ok(math::sub(amt, applied));
                self.treasury_usd_e6 = ok(math::add(self.treasury_usd_e6, surplus));
                emit(
                    "repaid",
                    json!({ "position_id": position_id, "amount_usd_e6": U128(applied), "remaining_debt_usd_e6": p.debt_usd_e6 }),
                );
                // Remote: the units sit in the vault; the borrower releases them with request_remote_release.
                if p.debt_usd_e6.0 == 0 && p.status == PositionStatus::Open && p.remote.is_none() {
                    let units = self.close_position(&mut p);
                    self.record_owed(&p.borrower, &p.collateral, units);
                }
                self.put_position(p);
            }
            Payout::CollateralRelease { position_id }
            | Payout::SettlementBuyer { position_id, .. }
            | Payout::SettlementKeeper { position_id } => {
                let p = self.position_or_panic(position_id.0);
                self.record_owed(&account_id, &p.collateral, amt);
            }
            // SR-17: the claim failed again; the units stay owed.
            Payout::OwedCollateral { symbol } => self.record_owed(&account_id, symbol, amt),
            Payout::QuoteWithdrawal { quote_id, principal_usd_e6, fees_usd_e6 } => {
                let mut q = self.quote_or_panic(quote_id.0);
                q.remaining_usd_e6 = U128(ok(math::add(q.remaining_usd_e6.0, principal_usd_e6.0)));
                q.claimable_fees_usd_e6 = U128(ok(math::add(q.claimable_fees_usd_e6.0, fees_usd_e6.0)));
                let mut ids = self.live_ids(&q.collateral);
                if principal_usd_e6.0 > 0 && !ids.contains(&quote_id.0) && ids.len() < MAX_QUOTES_PER_ASSET {
                    ids.push(quote_id.0);
                    self.quotes_by_collateral.insert(q.collateral.clone(), ids);
                }
                self.put_quote(q);
            }
            Payout::Fees { quote_id } => {
                let mut q = self.quote_or_panic(quote_id.0);
                q.claimable_fees_usd_e6 = U128(ok(math::add(q.claimable_fees_usd_e6.0, amt)));
                self.put_quote(q);
            }
            Payout::PayTo { position_id, borrower } => {
                // A4: proceeds stay in the contract as the borrower's claimable USDC; the debt stands.
                let v = ok(math::add(self.claimable(borrower), amt));
                self.claimable_usdc.insert(borrower.clone(), v);
                emit(
                    "pay_to_failed",
                    json!({ "position_id": position_id, "borrower": borrower, "receiver_id": account_id,
                            "amount_usd_e6": amount }),
                );
            }
            Payout::Claimable => {
                let v = ok(math::add(self.claimable(&account_id), amt));
                self.claimable_usdc.insert(account_id.clone(), v);
            }
            Payout::ReserveExit { .. } | Payout::ReserveUnits { .. } => self.restore_reserve_payout(&payout, amt),
        }
        emit("payout_failed", json!({ "payout": payout, "account": account_id, "amount": amount }));
        false
    }

    // ------------------------------------------------------------ views
    pub fn contract_version(&self) -> String {
        CONTRACT_VERSION.to_string()
    }

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            contract_version: CONTRACT_VERSION.to_string(),
            owner: self.owner.clone(),
            usdc_token: self.usdc_token.clone(),
            keeper: self.keeper.clone(),
            keeper_fee_bps: self.keeper_fee_bps,
            fee_split: self.fee_split,
            paused: self.paused,
            min_notice_period_ns: U64(self.min_notice_period_ns),
            min_quote_usd_e6: U128(self.min_quote_usd_e6),
            max_age_ns_session: U64(self.max_age_ns_session),
            max_age_ns_closed: U64(self.max_age_ns_closed),
            band_bps: self.band_bps,
            gas_reserve_yocto: U128(self.gas_reserve_yocto),
            next_quote_id: U64(self.next_quote_id),
            next_position_id: U64(self.next_position_id),
            max_quotes_per_asset: MAX_QUOTES_PER_ASSET as u32,
            max_quotes_per_settlement: MAX_QUOTES_PER_SETTLEMENT as u32,
            origination_fee_bps: self.origination_fee_bps,
        }
    }

    /// Layout version: 2 = V2 root (`new`).
    pub fn get_state_version(&self) -> u8 {
        env::storage_read(STATE_VERSION_KEY).and_then(|v| v.first().copied()).unwrap_or(0)
    }

    pub fn get_collateral(&self, symbol: String) -> Option<CollateralConfig> {
        self.coll(&symbol)
    }

    pub fn list_collaterals(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<CollateralConfig> {
        let from = from_index.unwrap_or(0) as usize;
        let lim = limit.unwrap_or(MAX_PAGE).min(MAX_PAGE) as usize;
        self.collaterals.values().skip(from).take(lim).map(|VCollateral::V2(c)| c.clone()).collect()
    }

    pub fn get_exit_capacity(&self, symbol: String) -> ExitCapacityView {
        let c = self.coll_or_panic(&symbol);
        let (session_open, session_reason) = self.session_state(&c);
        let (h, d_eff, cap) = ok(math::capacity(&self.limit_params(&c)));
        let price = c.oracle_price_usd_e6.0;
        let age_ns = env::block_timestamp().saturating_sub(c.oracle_updated_ns.0);
        // per whole token unit (10^d raw units), valued with the multiplier (A3)
        let per_unit = if price == 0 {
            None
        } else {
            let one = ok(Self::value_of(ok(math::pow10(c.decimals)), &c));
            Some(U128(ok(math::mul_div_floor(one, c.max_nectar_ltv_bps as u128, BPS))))
        };
        ExitCapacityView {
            q_usd_e6: c.active_committed_q_usd_e6,
            r_usd_e6: U128(Self::reserve_rc(&c)),
            d_usd_e6: U128(d_eff),
            haircut_bps: h,
            session_open,
            oracle_price_usd_e6: c.oracle_price_usd_e6,
            oracle_age_s: U64(age_ns / 1_000_000_000),
            oracle_fresh: self.oracle_fresh(&c),
            b_c_usd_per_unit_e6: per_unit,
            limit_bps_effective: if cap > 0 { c.max_nectar_ltv_bps } else { 0 },
            capacity_usd_e6: U128(cap),
            oracle_source: self.oracle_sources.get(&symbol).cloned().unwrap_or_default(),
            session_reason: session_reason.to_string(),
            total_debt_usd_e6: c.total_debt_usd_e6,
            aggregate_capacity_usd_e6: U128(cap),
            aggregate_headroom_usd_e6: U128(cap.saturating_sub(c.total_debt_usd_e6.0)),
            multiplier_e18: c.multiplier_e18,
            price_kind: c.price_kind,
            ca_pending: c.ca_pending,
            ca_effective_ns: c.ca_effective_ns,
            forced_closed: c.forced_closed,
        }
    }

    /// Quote with `claimable_fees_usd_e6` including fees accrued since the last checkpoint.
    pub fn get_quote(&self, quote_id: U64) -> Option<Quote> {
        let mut q = self.quote(quote_id.0)?;
        if let Some(c) = self.coll(&q.collateral) {
            ok(Self::checkpoint_fees(&mut q, c.acc_fee_per_dollar_e18.0));
            ok(Self::reset_fee_debt(&mut q, c.acc_fee_per_dollar_e18.0));
        }
        Some(q)
    }

    /// Live quotes (remaining > 0) for `symbol`, in funding order.
    pub fn list_quotes(&self, symbol: String, from_index: Option<u32>, limit: Option<u32>) -> Vec<Quote> {
        let from = from_index.unwrap_or(0) as usize;
        let lim = limit.unwrap_or(MAX_PAGE).min(MAX_PAGE) as usize;
        self.live_ids(&symbol).into_iter().skip(from).take(lim).filter_map(|id| self.get_quote(U64(id))).collect()
    }

    pub fn get_position(&self, position_id: U64) -> Option<Position> {
        self.position(position_id.0).map(|p| self.with_commitment(p))
    }

    pub fn list_positions(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Position> {
        let from = from_index.unwrap_or(0) as u64;
        let lim = limit.unwrap_or(MAX_PAGE).min(MAX_PAGE) as u64;
        let end = from.saturating_add(lim).min(self.next_position_id);
        (from..end).filter_map(|id| self.position(id)).map(|p| self.with_commitment(p)).collect()
    }

    pub fn get_health(&self, position_id: U64) -> HealthView {
        let p = self.position_or_panic(position_id.0);
        let c = self.coll_or_panic(&p.collateral);
        let value = ok(Self::value_of(p.units.0, &c));
        let fresh = self.oracle_fresh(&c);
        let trig = ok(math::triggerable(p.debt_usd_e6.0, value, p.pre_liq_ltv_bps));
        HealthView {
            value_usd_e6: U128(value),
            debt_usd_e6: p.debt_usd_e6,
            ltv_bps: math::ltv_bps(p.debt_usd_e6.0, value),
            pre_liq_ltv_bps: p.pre_liq_ltv_bps,
            oracle_fresh: fresh,
            triggerable: fresh && trig && p.status == PositionStatus::Open && !self.paused,
        }
    }

    pub fn get_pool(&self) -> PoolView {
        PoolView {
            available_usd_e6: U128(self.available_usd_e6),
            utilised_usd_e6: U128(self.utilised_usd_e6),
            treasury_usd_e6: U128(self.treasury_usd_e6),
            lenders_fees_usd_e6: U128(self.lenders_fees_usd_e6),
        }
    }

    /// Same checks as `LockCollateralAndBorrow` except `pre_liq_ltv_bps` (not an input here).
    /// v2: optional `referrer` (fee stack) and `borrower` (only to report `referrer_is_borrower`; a view
    /// has no predecessor).
    pub fn preview_borrow(
        &self,
        symbol: String,
        units: U128,
        borrow_usd_e6: U128,
        referrer: Option<AccountId>,
        borrower: Option<AccountId>,
        shield: Option<ShieldInput>,
    ) -> PreviewBorrowView {
        let c = match self.coll(&symbol) {
            Some(c) => c,
            None => {
                return PreviewBorrowView {
                    b_c_usd_e6: U128(0),
                    static_limit_usd_e6: U128(0),
                    premium_usd_e6: U128(0),
                    ok: false,
                    reason: Some(ERR_NO_COLLATERAL.to_string()),
                    origination_fee_usd_e6: U128(0),
                    referrer_share_usd_e6: U128(0),
                    total_fees_usd_e6: U128(0),
                    net_proceeds_usd_e6: U128(0),
                    aggregate_headroom_usd_e6: U128(0),
                    multiplier_e18: U128(0),
                    session_open: false,
                    shield_fee_usd_e6: U128(0),
                };
            }
        };
        let borrow = borrow_usd_e6.0;
        let registered = referrer.as_ref().is_some_and(|r| self.referrers.contains(r));
        // WO-23a: a Shield is validated against the borrower (daily count) when one is given.
        let shield_checked: Option<Result<Shield, &'static str>> = shield.as_ref().map(|s| match &borrower {
            Some(b) => self.validate_shield(&c, s, borrow, b),
            None => self.validate_shield(&c, s, borrow, &env::current_account_id()),
        });
        let shield_bps = shield.map(|s| self.shield_fee_bps(&c, s.kind));
        let l = ok(math::limit(units.0, &self.limit_params_for(&c, shield_bps.is_some())));
        let premium = match shield_bps {
            Some(bps) => ok(math::shield_fee(borrow, bps)),
            None => ok(math::premium_usd_e6(borrow, l.static_limit_usd_e6, c.limit_premium_bps)),
        };
        let origination = ok(math::origination_fee(borrow, self.origination_fee_bps));
        let share = if registered { origination / 2 } else { 0 };
        let total_fees = ok(math::add(premium, origination));
        let reason: Option<&str> = if self.paused {
            Some(ERR_PAUSED)
        } else if referrer.is_some() && referrer == borrower {
            Some(ERR_REFERRER_IS_BORROWER)
        } else if c.ca_pending {
            Some(ERR_CA_PENDING)
        } else if !self.oracle_fresh(&c) {
            Some("oracle stale")
        } else if borrow == 0 {
            Some("borrow is zero")
        } else if let Some(Err(e)) = shield_checked {
            Some(e)
        } else {
            self.check_borrow(&c, units.0, borrow, None, registered, shield_bps, None).err()
        };
        PreviewBorrowView {
            b_c_usd_e6: U128(l.b_c_usd_e6),
            static_limit_usd_e6: U128(l.static_limit_usd_e6),
            premium_usd_e6: U128(premium),
            ok: reason.is_none(),
            reason: reason.map(str::to_string),
            origination_fee_usd_e6: U128(origination),
            referrer_share_usd_e6: U128(share),
            total_fees_usd_e6: U128(total_fees),
            net_proceeds_usd_e6: U128(borrow.saturating_sub(total_fees)),
            aggregate_headroom_usd_e6: U128(l.headroom_usd_e6),
            multiplier_e18: c.multiplier_e18,
            session_open: self.session_open(&c),
            shield_fee_usd_e6: U128(if shield_bps.is_some() { premium } else { 0 }),
        }
    }


    /// Units whose ft_transfer to `account_id` failed and are held for them (additive view).
    pub fn get_owed_collateral(&self, account_id: AccountId, symbol: String) -> U128 {
        U128(self.owed_collateral.get(&Self::owed_key(&account_id, &symbol)).copied().unwrap_or(0))
    }
}
