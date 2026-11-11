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
        self.assert_not_paused();
        let account = env::predecessor_account_id();
        let amount = self.claimable(&account);
        require!(amount > 0, "nothing to withdraw");
        // effects
        self.claimable_usdc.remove(&account);
        emit("claimable_withdrawn", json!({ "account_id": account, "amount_usd_e6": U128(amount) }));
        // interaction
        Self::transfer(&self.usdc_token, &account, amount, Payout::Claimable)
    }

    /// SR-17 (WO-34a): pays the caller's owed collateral of `symbol` (units of a failed settlement, release or proceeds
    /// rollback transfer; 1 yocto). `on_payout` restores the balance if this transfer fails too (still unregistered).
    #[payable]
    pub fn claim_owed_collateral(&mut self, symbol: String) -> Promise {
        assert_one_yocto();
        self.assert_not_paused();
        let account = env::predecessor_account_id();
        let key = Self::owed_key(&account, &symbol);
        let amount = self.owed_collateral.get(&key).copied().unwrap_or(0);
        require!(amount > 0, "nothing owed");
        let token = self.coll_or_panic(&symbol).token;
        // effects
        self.owed_collateral.remove(&key);
        Self::set_owed_total(&symbol, Self::owed_total(&symbol).saturating_sub(amount));
        emit("owed_collateral_claimed", json!({ "account_id": account, "symbol": symbol, "units": U128(amount) }));
        // interaction
        Self::transfer(&token, &account, amount, Payout::OwedCollateral { symbol })
    }

    // ------------------------------------------------------------ pool withdrawals (owner, 1 yocto)
    /// Spec gap of security-review-v7: pays `amount` of the treasury's USDC to `receiver_id`; restored if the transfer fails.
    #[payable]
    pub fn withdraw_treasury(&mut self, receiver_id: AccountId, amount_usd_e6: U128) -> Promise {
        assert_one_yocto();
        self.assert_owner();
        self.assert_not_paused();
        require!(amount_usd_e6.0 > 0, "amount is zero");
        // effects
        self.treasury_usd_e6 = math::sub(self.treasury_usd_e6, amount_usd_e6.0).unwrap_or_else(|_| env::panic_str("exceeds treasury"));
        emit("treasury_withdrawn", json!({ "receiver_id": receiver_id, "amount_usd_e6": amount_usd_e6 }));
        // interaction
        Self::transfer(&self.usdc_token, &receiver_id, amount_usd_e6.0, Payout::Treasury)
    }

    /// Spec gap: the lenders' fee pool has no per-lender index, so the owner distributes it to `receiver_id`.
    #[payable]
    pub fn withdraw_lender_fees(&mut self, receiver_id: AccountId, amount_usd_e6: U128) -> Promise {
        assert_one_yocto();
        self.assert_owner();
        self.assert_not_paused();
        require!(amount_usd_e6.0 > 0, "amount is zero");
        // effects
        self.lenders_fees_usd_e6 = math::sub(self.lenders_fees_usd_e6, amount_usd_e6.0).unwrap_or_else(|_| env::panic_str("exceeds lender fees"));
        emit("lender_fees_withdrawn", json!({ "receiver_id": receiver_id, "amount_usd_e6": amount_usd_e6 }));
        // interaction
        Self::transfer(&self.usdc_token, &receiver_id, amount_usd_e6.0, Payout::LenderFees)
    }

    /// Spec gap: returns supplied liquidity to the `lender` who supplied it (never another account), up to what the pool
    /// has free: lent USDC stays lent.
    #[payable]
    pub fn withdraw_liquidity(&mut self, lender: AccountId, amount_usd_e6: U128) -> Promise {
        assert_one_yocto();
        self.assert_owner();
        self.assert_not_paused();
        let amount = amount_usd_e6.0;
        require!(amount > 0, "amount is zero");
        let supplied = self.lender_supplied.get(&lender).copied().unwrap_or(0);
        let left = math::sub(supplied, amount).unwrap_or_else(|_| env::panic_str("exceeds supplied"));
        let available = math::sub(self.available_usd_e6, amount).unwrap_or_else(|_| env::panic_str("insufficient pool liquidity"));
        // effects
        self.available_usd_e6 = available;
        if left == 0 {
            self.lender_supplied.remove(&lender);
        } else {
            self.lender_supplied.insert(lender.clone(), left);
        }
        emit("liquidity_withdrawn", json!({ "lender": lender, "amount_usd_e6": amount_usd_e6 }));
        // interaction
        Self::transfer(&self.usdc_token, &lender, amount, Payout::Liquidity)
    }

    pub fn get_claimable(&self, account_id: AccountId) -> U128 {
        U128(self.claimable(&account_id))
    }
}
