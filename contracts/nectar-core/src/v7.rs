//! v2 public surface of the v7 P0 delta (interface-v7.md §A; PRD §4.6, §4.7, §4.11, §6.11).
//!
//! A2 weekend guard: owner `set_session_calendar` / `force_session_closed`; the session itself is computed in
//! `Nectar::session_state` and fails closed. A3 multiplier: owner `set_multiplier` (≤ +5 %),
//! `announce_corporate_action` (≥ 1 h ahead), anyone `apply_corporate_action`. A4 claimable USDC.
//! A5 referrers and the origination fee. Owner/anyone methods here are not payable, except
//! `withdraw_claimable` (1 yocto, NEP-141 style).

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::json;
use near_sdk::{AccountId, Promise, assert_one_yocto, env, near, require};

use crate::events::emit;
use crate::types::*;
use crate::{
    CA_MIN_NOTICE_NS, MAX_CALENDAR_WINDOWS, MAX_ORIGINATION_FEE_BPS, MAX_PAGE, MULTIPLIER_MAX_INCREASE_BPS, Nectar,
    NectarExt, math, ok,
};

#[near]
impl Nectar {
    // ------------------------------------------------------------ A2 weekend guard
    /// Replaces the whole calendar. Panics unless sorted, non-overlapping, `open < close`, ≤ 600 windows.
    /// An empty list closes every session.
    pub fn set_session_calendar(&mut self, windows: Vec<[U64; 2]>) {
        self.assert_owner();
        require!(windows.len() <= MAX_CALENDAR_WINDOWS, "more than 600 windows");
        let w: Vec<(u64, u64)> = windows.iter().map(|[o, c]| (o.0, c.0)).collect();
        require!(math::valid_calendar(&w), "windows must be sorted, non-overlapping, open < close");
        emit(
            "session_calendar_set",
            json!({ "windows": w.len(), "first_open_ns": w.first().map(|x| U64(x.0)),
                    "last_close_ns": w.last().map(|x| U64(x.1)) }),
        );
        self.session_calendar.set(Some(w));
    }

    /// `true` forces the session closed; `false` only clears the force (it never opens a session).
    pub fn force_session_closed(&mut self, symbol: String, closed: bool) {
        self.assert_owner();
        let mut c = self.coll_or_panic(&symbol);
        c.forced_closed = closed;
        self.put_coll(c);
        emit("session_forced_closed", json!({ "symbol": symbol, "closed": closed }));
    }

    pub fn get_session_calendar(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<[U64; 2]> {
        let from = from_index.unwrap_or(0) as usize;
        let lim = limit.unwrap_or(MAX_PAGE).min(MAX_PAGE) as usize;
        match self.session_calendar.get() {
            Some(w) => w.iter().skip(from).take(lim).map(|(o, c)| [U64(*o), U64(*c)]).collect(),
            None => Vec::new(),
        }
    }

    // ------------------------------------------------------------ A3 multiplier
    /// Increase only, at most +5 % per call; refused while a corporate action is pending.
    pub fn set_multiplier(&mut self, symbol: String, multiplier_e18: U128) {
        self.assert_owner();
        let mut c = self.coll_or_panic(&symbol);
        require!(!c.ca_pending, "corporate action pending");
        let old = c.multiplier_e18.0;
        require!(multiplier_e18.0 >= old, "decrease needs announce_corporate_action");
        require!(
            ok(math::within_increase_bound(old, multiplier_e18.0, MULTIPLIER_MAX_INCREASE_BPS)),
            "increase above 5% needs announce_corporate_action"
        );
        c.multiplier_e18 = multiplier_e18;
        c.multiplier_updated_ns = U64(env::block_timestamp());
        self.put_coll(c);
        emit(
            "multiplier_updated",
            json!({ "symbol": symbol, "multiplier_e18": multiplier_e18, "old_multiplier_e18": U128(old),
                    "source": "owner" }),
        );
    }

    /// Any change (a decrease or more than +5 %); `effective_ns ≥ now + 1 h`. Re-announcing replaces the
    /// pending action (the 1 h notice applies again). New borrows are refused until it is applied.
    pub fn announce_corporate_action(&mut self, symbol: String, multiplier_e18: U128, effective_ns: U64) {
        self.assert_owner();
        let mut c = self.coll_or_panic(&symbol);
        require!(multiplier_e18.0 > 0, "multiplier must be > 0");
        let earliest = env::block_timestamp()
            .checked_add(CA_MIN_NOTICE_NS)
            .unwrap_or_else(|| env::panic_str(math::ERR_OVERFLOW));
        require!(effective_ns.0 >= earliest, "effective_ns must be at least 1 h ahead");
        c.ca_pending = true;
        c.ca_effective_ns = effective_ns;
        c.ca_multiplier_e18 = multiplier_e18;
        self.put_coll(c);
        emit(
            "corporate_action_announced",
            json!({ "symbol": symbol, "multiplier_e18": multiplier_e18, "effective_ns": effective_ns }),
        );
    }

    /// Anyone, once `now ≥ ca_effective_ns`: sets M, clears `ca_pending`; for Underlying rescales the stored
    /// price by `old_M/new_M` (floor) and drops a pending band override, so V is continuous.
    pub fn apply_corporate_action(&mut self, symbol: String) {
        let mut c = self.coll_or_panic(&symbol);
        require!(c.ca_pending, "no corporate action pending");
        require!(env::block_timestamp() >= c.ca_effective_ns.0, "corporate action not yet effective");
        let old = c.multiplier_e18.0;
        let new = c.ca_multiplier_e18.0;
        if c.price_kind == PriceKind::Underlying && c.oracle_price_usd_e6.0 > 0 {
            // band reference = the rescaled stored price; a proposed pre-split price is void
            c.oracle_price_usd_e6 = U128(ok(math::mul_div_floor(c.oracle_price_usd_e6.0, old, new)));
            self.pending_prices.remove(&symbol);
        }
        c.multiplier_e18 = U128(new);
        c.multiplier_updated_ns = U64(env::block_timestamp());
        c.ca_pending = false;
        c.ca_effective_ns = U64(0);
        c.ca_multiplier_e18 = U128(0);
        let price = c.oracle_price_usd_e6;
        self.put_coll(c);
        emit(
            "multiplier_updated",
            json!({ "symbol": symbol, "multiplier_e18": U128(new), "old_multiplier_e18": U128(old),
                    "source": "corporate_action", "price_usd_e6": price }),
        );
    }

    // ------------------------------------------------------------ A5 referrers + origination
    pub fn register_referrer(&mut self, account_id: AccountId) {
        self.assert_owner();
        if self.referrers.insert(account_id.clone()) {
            emit("referrer_registered", json!({ "account_id": account_id }));
        }
    }

    pub fn unregister_referrer(&mut self, account_id: AccountId) {
        self.assert_owner();
        if self.referrers.remove(&account_id) {
            emit("referrer_unregistered", json!({ "account_id": account_id }));
        }
    }

    pub fn is_referrer(&self, account_id: AccountId) -> bool {
        self.referrers.contains(&account_id)
    }

    /// At most 100 bps (A5).
    pub fn set_origination_fee_bps(&mut self, bps: u16) {
        self.assert_owner();
        require!(bps <= MAX_ORIGINATION_FEE_BPS, "origination_fee_bps > 100");
        self.origination_fee_bps = bps;
        emit("origination_fee_set", json!({ "bps": bps }));
    }

    // ------------------------------------------------------------ A4 claimable USDC
    /// Pays all of the caller's claimable USDC (1 yocto); `on_payout` restores it if the transfer fails.
    #[payable]
    pub fn withdraw_claimable(&mut self) -> Promise {
        assert_one_yocto();
        let account = env::predecessor_account_id();
        let amount = self.claimable(&account);
        require!(amount > 0, "nothing to withdraw");
        // effects
        self.claimable_usdc.remove(&account);
        emit("claimable_withdrawn", json!({ "account_id": account, "amount_usd_e6": U128(amount) }));
        // interaction
        Self::transfer(&self.usdc_token, &account, amount, Payout::Claimable)
    }

    pub fn get_claimable(&self, account_id: AccountId) -> U128 {
        U128(self.claimable(&account_id))
    }
}
