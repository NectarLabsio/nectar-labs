//! nectar-core (P0): Pappus funded quotes + Cramér borrowing limit on NEAR.
//! ABI: docs/work/interface-p0.md. Spec: docs/PRD.md §4, §6, §8 (D-009 parameters).
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
mod migrate;
pub mod types;

#[cfg(feature = "p1")]
mod p1;
#[cfg(feature = "p2")]
mod p2;

#[cfg(test)]
mod tests;
#[cfg(all(test, feature = "p1"))]
mod tests_p1;
#[cfg(all(test, feature = "p2"))]
mod tests_p2;

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, assert_one_yocto, env,
    is_promise_success, near, require,
};

use crate::events::emit;
use crate::math::{BPS, LimitParams, MathResult};
use crate::types::*;

#[cfg(feature = "p2")]
pub const CONTRACT_VERSION: &str = concat!("nectar-core ", env!("CARGO_PKG_VERSION"), " p2");
#[cfg(all(feature = "p1", not(feature = "p2")))]
pub const CONTRACT_VERSION: &str = concat!("nectar-core ", env!("CARGO_PKG_VERSION"), " p1");
#[cfg(not(feature = "p1"))]
pub const CONTRACT_VERSION: &str = concat!("nectar-core ", env!("CARGO_PKG_VERSION"), " p0");
/// Raw storage key holding the state layout version (absent = P0 layout). Written by `new` and `migrate`.
pub const STATE_VERSION_KEY: &[u8] = b"__state_version";
pub const STATE_VERSION: u8 = 1;
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
    // ---- V1 (P1). P0 fields above keep their borsh order; `migrate` reads them as `NectarV0`.
    quoter: QuoterConfig,
    vol_bps: LookupMap<String, u16>,
    oracle_sources: LookupMap<String, OracleSource>,
    max_conf_bps: u16,
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
        self.collaterals.get(symbol).map(|VCollateral::V1(c)| c.clone())
    }
    fn coll_or_panic(&self, symbol: &str) -> CollateralConfig {
        self.coll(symbol).unwrap_or_else(|| env::panic_str(ERR_NO_COLLATERAL))
    }
    fn put_coll(&mut self, c: CollateralConfig) {
        self.collaterals.insert(c.symbol.clone(), VCollateral::V1(c));
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
        self.positions.get(&id).map(|VPosition::V1(p)| p.clone())
    }
    fn position_or_panic(&self, id: u64) -> Position {
        self.position(id).unwrap_or_else(|| env::panic_str(ERR_NO_POSITION))
    }
    fn put_position(&mut self, p: Position) {
        self.positions.insert(p.position_id.0, VPosition::V1(p));
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

    fn max_age_ns(&self, c: &CollateralConfig) -> u64 {
        if c.market_session_open { self.max_age_ns_session } else { self.max_age_ns_closed }
    }
    fn oracle_fresh(&self, c: &CollateralConfig) -> bool {
        if c.oracle_price_usd_e6.0 == 0 || c.oracle_updated_ns.0 == 0 {
            return false;
        }
        let now = env::block_timestamp();
        now.saturating_sub(c.oracle_updated_ns.0) <= self.max_age_ns(c)
    }
    fn limit_params(c: &CollateralConfig) -> LimitParams {
        LimitParams {
            decimals: c.decimals,
            price_usd_e6: c.oracle_price_usd_e6.0,
            q_usd_e6: c.active_committed_q_usd_e6.0,
            r_usd_e6: c.nectar_reserve_usd_e6.0,
            d_usd_e6: c.verified_dex_depth_usd_e6.0,
            session_open: c.market_session_open,
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
        let args = json!({ "receiver_id": receiver, "amount": U128(amount) }).to_string();
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
    ) -> Result<u128, &'static str> {
        let mut c = self.coll(&collateral).ok_or(ERR_NO_COLLATERAL)?;
        if max_discount_bps as u128 >= BPS {
            return Err("max_discount_bps out of range");
        }
        if notice_period_ns < self.min_notice_period_ns {
            return Err("notice period below minimum");
        }
        if amount < self.min_quote_usd_e6 {
            return Err("quote below minimum");
        }
        Self::validate_string(&buyer_remote_recipient)?;
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
                    "amount_usd_e6": U128(amount), "max_discount_bps": max_discount_bps }),
        );
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
    ) -> Result<u128, &'static str> {
        if collateral != token_symbol {
            return Err("collateral does not match token");
        }
        let mut c = self.coll(&collateral).ok_or(ERR_NO_COLLATERAL)?;
        if !self.oracle_fresh(&c) {
            return Err("oracle stale");
        }
        if pre_liq_ltv_bps < c.pre_liq_min_bps || pre_liq_ltv_bps > c.pre_liq_max_bps {
            return Err("pre_liq_ltv_bps out of range");
        }
        if borrow == 0 {
            return Err("borrow is zero");
        }
        Self::validate_string(&remote_path)?;
        let (premium, split) = self.check_borrow(&c, units, borrow, Some(pre_liq_ltv_bps))?;
        let payout = math::sub(borrow, premium)?;
        let available = math::sub(self.available_usd_e6, borrow)?;
        let utilised = math::add(self.utilised_usd_e6, borrow)?;
        let treasury = math::add(self.treasury_usd_e6, split.treasury_usd_e6)?;
        let lenders = math::add(self.lenders_fees_usd_e6, split.lenders_usd_e6)?;
        let acc = math::add(c.acc_fee_per_dollar_e18.0, split.acc_increment_e18)?;
        let id = self.next_position_id;
        let next = id.checked_add(1).ok_or(math::ERR_OVERFLOW)?;
        // effects
        self.available_usd_e6 = available;
        self.utilised_usd_e6 = utilised;
        self.treasury_usd_e6 = treasury;
        self.lenders_fees_usd_e6 = lenders;
        self.next_position_id = next;
        c.acc_fee_per_dollar_e18 = U128(acc);
        let usdc = self.usdc_token.clone();
        self.put_coll(c);
        self.put_position(Position {
            position_id: U64(id),
            borrower: sender.clone(),
            collateral: collateral.clone(),
            units: U128(units),
            debt_usd_e6: U128(borrow),
            premium_usd_e6: U128(premium),
            pre_liq_ltv_bps,
            opened_ns: U64(env::block_timestamp()),
            remote_path,
            nonce: U64(id),
            status: PositionStatus::Open,
        });
        emit(
            "position_opened",
            json!({ "position_id": U64(id), "borrower": sender, "collateral": collateral,
                    "units": U128(units), "debt_usd_e6": U128(borrow), "premium_usd_e6": U128(premium) }),
        );
        // interaction
        if payout > 0 {
            Self::transfer(&usdc, sender, payout, Payout::BorrowProceeds { position_id: U64(id) }).detach();
        }
        Ok(0)
    }

    /// Shared by `LockCollateralAndBorrow` and `preview_borrow`. Returns (premium, split).
    fn check_borrow(
        &self,
        c: &CollateralConfig,
        units: u128,
        borrow: u128,
        pre_liq_ltv_bps: Option<u16>,
    ) -> Result<(u128, math::PremiumSplit), &'static str> {
        let l = math::limit(units, &Self::limit_params(c))?;
        if borrow > l.b_c_usd_e6 {
            return Err("borrow above B_c");
        }
        if borrow > self.available_usd_e6 {
            return Err("insufficient pool liquidity");
        }
        if let Some(pl) = pre_liq_ltv_bps {
            if math::triggerable(borrow, l.value_usd_e6, pl)? {
                return Err("borrow above pre_liq_ltv_bps");
            }
        }
        let premium = math::premium_usd_e6(borrow, l.static_limit_usd_e6, c.limit_premium_bps)?;
        let split = math::split_premium(
            premium,
            self.fee_split.buyers_bps,
            self.fee_split.lenders_bps,
            c.active_committed_q_usd_e6.0,
        )?;
        Ok((premium, split))
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
        let token = self.coll(&p.collateral).ok_or(ERR_NO_COLLATERAL)?.token;
        // effects
        self.utilised_usd_e6 = utilised;
        self.available_usd_e6 = available;
        p.debt_usd_e6 = U128(debt);
        emit(
            "repaid",
            json!({ "position_id": U64(position_id), "amount_usd_e6": U128(applied), "remaining_debt_usd_e6": U128(debt) }),
        );
        let release = if debt == 0 { self.close_position(&mut p) } else { 0 };
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
        let value = ok(math::value_usd_e6(p.units.0, c.oracle_price_usd_e6.0, c.decimals));
        ok(math::triggerable(p.debt_usd_e6.0, value, p.pre_liq_ltv_bps))
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
    pub(crate) fn settle(
        &mut self,
        position_id: U64,
        mut p: Position,
        mut c: CollateralConfig,
        cands: &[(u16, u64)],
        keeper: &AccountId,
    ) -> Result<(), &'static str> {
        let price = c.oracle_price_usd_e6.0;
        let acc = c.acc_fee_per_dollar_e18.0;
        let mut debt = p.debt_usd_e6.0;
        let mut units = p.units.0;
        let mut q_c = c.active_committed_q_usd_e6.0;
        let mut total_repay: u128 = 0;
        let mut keeper_units: u128 = 0;
        let mut buyer_transfers: Vec<(AccountId, u128, u64)> = Vec::new();
        let mut legs: Vec<(Quote, u16, u128, u128, bool)> = Vec::new();
        // P2: at most one remote (Solana) leg per call; None without feature p2 or remote_chain/signer.
        let remote_ctx = self.remote_ctx(position_id.0, &c);
        let mut remote: Option<RemoteLeg> = None;
        for &(disc, qid) in cands.iter().take(MAX_QUOTES_PER_SETTLEMENT) {
            if debt == 0 || units == 0 {
                break;
            }
            let Some(mut q) = self.quote(qid) else { continue };
            if q.remaining_usd_e6.0 == 0 || q.collateral != p.collateral {
                continue;
            }
            let recipient = match (&remote_ctx, &q.buyer_remote_recipient) {
                (Some(_), Some(r)) if chainsig::valid_base58_address(r) => Some(r.clone()),
                _ => None,
            };
            if recipient.is_some() && remote.is_some() {
                continue; // one remote leg per settlement call; the keeper re-triggers after the relay
            }
            let Some(leg) =
                math::settle_leg(debt, q.remaining_usd_e6.0, units, price, c.decimals, disc, self.keeper_fee_bps)?
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
            let is_remote = recipient.is_some();
            if let Some(r) = recipient {
                // Collateral for this leg is released on Solana, not ft_transferred here; the keeper's
                // share and the pool credit wait for the MPC signature (`on_signature`).
                remote = Some(RemoteLeg {
                    quote_id: qid,
                    repay_usd_e6: leg.repay_usd_e6,
                    buyer_units: leg.buyer_units,
                    keeper_units: leg.keeper_units,
                    recipient: r,
                });
            } else {
                keeper_units = math::add(keeper_units, leg.keeper_units)?;
                // One ft_transfer per distinct buyer (bounds receipts to <= 8 + keeper + borrower).
                match buyer_transfers.iter_mut().find(|(b, _, _)| *b == q.buyer) {
                    Some(entry) => entry.1 = math::add(entry.1, leg.buyer_units)?,
                    None => buyer_transfers.push((q.buyer.clone(), leg.buyer_units, qid)),
                }
            }
            legs.push((q, disc, leg.repay_usd_e6, leg.buyer_units, is_remote));
        }
        if total_repay == 0 {
            return Err("no quote capacity");
        }
        let pool_repay = math::sub(total_repay, remote.as_ref().map_or(0, |r| r.repay_usd_e6))?;
        let utilised = math::sub(self.utilised_usd_e6, pool_repay)?;
        let available = math::add(self.available_usd_e6, pool_repay)?;
        p.debt_usd_e6 = U128(debt);
        p.units = U128(units);
        let release = if debt == 0 {
            self.close_position(&mut p)
        } else {
            p.status = PositionStatus::Open;
            0
        };
        let n_local = buyer_transfers.len() as u64 + u64::from(keeper_units > 0) + u64::from(release > 0);
        // sign (1 yocto) + the remote leg's keeper transfer (scheduled by on_signature)
        let n_remote = remote.as_ref().map_or(0, |r| 1 + u64::from(r.keeper_units > 0));
        let reserve =
            math::sub(self.gas_reserve_yocto, u128::from(n_local + n_remote)).map_err(|_| "gas reserve empty")?;
        if remote.is_some() {
            p.status = PositionStatus::Settling; // until relay_settlement_result (or sign failure)
            self.check_remote_gas(&remote_ctx, n_local)?;
        }

        // effects
        let sign_call = match (remote, &remote_ctx) {
            (Some(r), Some((rc, s))) => Some(self.record_remote_leg(&mut p, rc, s, r)?),
            _ => None,
        };
        for (q, disc, repay, seize, is_remote) in legs {
            if !is_remote {
                emit(
                    "settled_near",
                    json!({ "position_id": position_id, "quote_id": q.quote_id, "disc_bps": disc,
                            "repay_usd_e6": U128(repay), "seize_units": U128(seize), "buyer": q.buyer }),
                );
            }
            if q.remaining_usd_e6.0 == 0 {
                self.remove_live(&p.collateral, q.quote_id.0);
            }
            self.put_quote(q);
        }
        self.utilised_usd_e6 = utilised;
        self.available_usd_e6 = available;
        self.gas_reserve_yocto = reserve;
        c.active_committed_q_usd_e6 = U128(q_c);
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
        if let Some(call) = sign_call {
            Self::schedule_sign(call);
        }
        Ok(())
    }

    // ---- P2 hooks: no-ops without feature `p2` (src/p2.rs implements them).
    #[cfg(not(feature = "p2"))]
    fn remote_ctx(&self, _position_id: u64, _c: &CollateralConfig) -> Option<(RemoteChain, SignerConfig)> {
        None
    }
    #[cfg(not(feature = "p2"))]
    fn check_remote_gas(&self, _ctx: &Option<(RemoteChain, SignerConfig)>, _n_local: u64) -> Result<(), &'static str> {
        Ok(())
    }
    #[cfg(not(feature = "p2"))]
    fn record_remote_leg(
        &mut self,
        _p: &mut Position,
        _rc: &RemoteChain,
        _s: &SignerConfig,
        _r: RemoteLeg,
    ) -> Result<(), &'static str> {
        Err("p2 disabled")
    }
    #[cfg(not(feature = "p2"))]
    fn schedule_sign(_call: ()) {}
    /// Extra gas a settlement of this collateral needs downstream for the sign leg (0 without p2).
    #[cfg(not(feature = "p2"))]
    #[allow(dead_code)]
    pub(crate) fn remote_extra_gas(&self, _symbol: &str) -> u64 {
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
            ),
            (TokenMsg::TopUpQuote { quote_id }, None) => self.on_top_up(&sender_id, amount, quote_id.0),
            (TokenMsg::Repay { position_id }, None) => self.on_repay(amount, position_id.0),
            (
                TokenMsg::LockCollateralAndBorrow { collateral, borrow_usd_e6, pre_liq_ltv_bps, remote_path },
                Some(sym),
            ) => self.on_lock_and_borrow(
                &sender_id,
                &sym,
                amount,
                collateral,
                borrow_usd_e6.0,
                pre_liq_ltv_bps,
                remote_path,
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
                    market_session_open: i.market_session_open,
                    verified_dex_depth_usd_e6: i.verified_dex_depth_usd_e6,
                    nectar_reserve_usd_e6: i.nectar_reserve_usd_e6,
                    remote_chain: i.remote_chain,
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
                market_session_open: i.market_session_open,
                oracle_price_usd_e6: U128(0),
                oracle_updated_ns: U64(0),
                verified_dex_depth_usd_e6: i.verified_dex_depth_usd_e6,
                nectar_reserve_usd_e6: i.nectar_reserve_usd_e6,
                active_committed_q_usd_e6: U128(0),
                acc_fee_per_dollar_e18: U128(0),
                remote_chain: i.remote_chain,
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

    pub fn set_session(&mut self, symbol: String, open: bool) {
        self.assert_owner();
        let mut c = self.coll_or_panic(&symbol);
        c.market_session_open = open;
        self.put_coll(c);
    }

    pub fn set_dex_depth(&mut self, symbol: String, depth_usd_e6: U128) {
        self.assert_owner();
        let mut c = self.coll_or_panic(&symbol);
        c.verified_dex_depth_usd_e6 = depth_usd_e6;
        self.put_coll(c);
    }

    pub fn set_reserve(&mut self, symbol: String, reserve_usd_e6: U128) {
        self.assert_owner();
        let mut c = self.coll_or_panic(&symbol);
        c.nectar_reserve_usd_e6 = reserve_usd_e6;
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
        let cands = self.select_quotes(&p.collateral);

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
                let surplus = ok(math::sub(amt, applied));
                self.treasury_usd_e6 = ok(math::add(self.treasury_usd_e6, surplus));
                emit(
                    "repaid",
                    json!({ "position_id": position_id, "amount_usd_e6": U128(applied), "remaining_debt_usd_e6": p.debt_usd_e6 }),
                );
                if p.debt_usd_e6.0 == 0 && p.status == PositionStatus::Open {
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
        }
    }

    pub fn get_collateral(&self, symbol: String) -> Option<CollateralConfig> {
        self.coll(&symbol)
    }

    pub fn list_collaterals(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<CollateralConfig> {
        let from = from_index.unwrap_or(0) as usize;
        let lim = limit.unwrap_or(MAX_PAGE).min(MAX_PAGE) as usize;
        self.collaterals.values().skip(from).take(lim).map(|VCollateral::V1(c)| c.clone()).collect()
    }

    pub fn get_exit_capacity(&self, symbol: String) -> ExitCapacityView {
        let c = self.coll_or_panic(&symbol);
        let (h, d_eff, cap) = ok(math::capacity(&Self::limit_params(&c)));
        let price = c.oracle_price_usd_e6.0;
        let age_ns = env::block_timestamp().saturating_sub(c.oracle_updated_ns.0);
        let per_unit = if price == 0 {
            None
        } else {
            Some(U128(ok(math::mul_div_floor(price, c.max_nectar_ltv_bps as u128, BPS))))
        };
        ExitCapacityView {
            q_usd_e6: c.active_committed_q_usd_e6,
            r_usd_e6: c.nectar_reserve_usd_e6,
            d_usd_e6: U128(d_eff),
            haircut_bps: h,
            session_open: c.market_session_open,
            oracle_price_usd_e6: c.oracle_price_usd_e6,
            oracle_age_s: U64(age_ns / 1_000_000_000),
            oracle_fresh: self.oracle_fresh(&c),
            b_c_usd_per_unit_e6: per_unit,
            limit_bps_effective: if cap > 0 { c.max_nectar_ltv_bps } else { 0 },
            capacity_usd_e6: U128(cap),
            oracle_source: self.oracle_sources.get(&symbol).cloned().unwrap_or_default(),
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
        self.position(position_id.0)
    }

    pub fn list_positions(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Position> {
        let from = from_index.unwrap_or(0) as u64;
        let lim = limit.unwrap_or(MAX_PAGE).min(MAX_PAGE) as u64;
        let end = from.saturating_add(lim).min(self.next_position_id);
        (from..end).filter_map(|id| self.position(id)).collect()
    }

    pub fn get_health(&self, position_id: U64) -> HealthView {
        let p = self.position_or_panic(position_id.0);
        let c = self.coll_or_panic(&p.collateral);
        let value = ok(math::value_usd_e6(p.units.0, c.oracle_price_usd_e6.0, c.decimals));
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
    pub fn preview_borrow(&self, symbol: String, units: U128, borrow_usd_e6: U128) -> PreviewBorrowView {
        let c = match self.coll(&symbol) {
            Some(c) => c,
            None => {
                return PreviewBorrowView {
                    b_c_usd_e6: U128(0),
                    static_limit_usd_e6: U128(0),
                    premium_usd_e6: U128(0),
                    ok: false,
                    reason: Some(ERR_NO_COLLATERAL.to_string()),
                };
            }
        };
        let l = ok(math::limit(units.0, &Self::limit_params(&c)));
        let premium = ok(math::premium_usd_e6(borrow_usd_e6.0, l.static_limit_usd_e6, c.limit_premium_bps));
        let reason: Option<&str> = if self.paused {
            Some(ERR_PAUSED)
        } else if !self.oracle_fresh(&c) {
            Some("oracle stale")
        } else if borrow_usd_e6.0 == 0 {
            Some("borrow is zero")
        } else {
            self.check_borrow(&c, units.0, borrow_usd_e6.0, None).err()
        };
        PreviewBorrowView {
            b_c_usd_e6: U128(l.b_c_usd_e6),
            static_limit_usd_e6: U128(l.static_limit_usd_e6),
            premium_usd_e6: U128(premium),
            ok: reason.is_none(),
            reason: reason.map(str::to_string),
        }
    }

    /// Units whose ft_transfer to `account_id` failed and are held for them (additive view).
    pub fn get_owed_collateral(&self, account_id: AccountId, symbol: String) -> U128 {
        U128(self.owed_collateral.get(&Self::owed_key(&account_id, &symbol)).copied().unwrap_or(0))
    }
}
