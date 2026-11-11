//! WO-23a (PRD §4.9, §4.10, §4.11, §6.11): Shields, Profit-Lock self-settlement and the fee stack.
//!
//! Shields: `LockCollateralAndBorrow{.., shield}` and `reserve_remote_position(.., shield)` open a normal position
//! sized as if the session were closed (h = weekend haircut, D_c = 0) for a fixed window, and charge a flat
//! `shield_fee_bps` on the full borrow instead of the limit premium (same 70/20/10 split). Weekend windows must end
//! at the next calendar window open and last at most 65.5 h; event windows at most 72 h and never after the
//! curator's `event_window_end_ns`. Testnet minimum $5; at most 5 Shield opens per account per UTC day. Inside the
//! window only committed buyers settle the position (P0 has no DEX route, so the window is recorded and exposed).
//!
//! Profit-Lock: `self_settle(position_id)` (borrower, 1 yocto; the Loan Note owner after WO-22) needs health ≥ 1
//! (not triggerable) with a fresh price and no pending corporate action. Opted-in quotes (`accepts_voluntary_fills`)
//! fill `fill = debt + ceil(debt·50/1e4)` in ascending discount (≤ 8), each leg seizing
//! `seize_units_m(fill_i, M, P, d, δ_i, 0)` raw units (rounded up, against the borrower), under the asset's
//! `max_voluntary_fill_usd_e6_per_day` (UTC day counter). The pool gets the debt, the treasury the fee, the
//! borrower keeps the remaining units debt-free. NEAR-held positions settle on NEAR (ft_transfers); a remote
//! position takes one leg signed with `|kind=SELF` (src/remote.rs).

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::json;
use near_sdk::{AccountId, assert_one_yocto, env, near, require};

use crate::events::emit;
use crate::types::*;
use crate::{
    DAY_NS, ERR_CA_PENDING, GAS_FT_TRANSFER, GAS_ON_PAYOUT, MAX_QUOTES_PER_SETTLEMENT, MAX_SHIELD_FEE_BPS,
    MAX_SHIELD_OPENS_PER_DAY, Nectar, NectarExt, PROFIT_LOCK_FEE_BPS, REFERRER_SHARE_BPS, SHIELD_EVENT_MAX_NS,
    SHIELD_MIN_BORROW_USD_E6, SHIELD_WEEKEND_MAX_NS, chainsig, math,
};

pub(crate) const ERR_SHIELD_MIN: &str = "shield below minimum";
pub(crate) const ERR_SHIELD_ENDED: &str = "shield window ended";
pub(crate) const ERR_NO_NEXT_SESSION: &str = "no next session";
pub(crate) const ERR_WEEKEND_END: &str = "weekend shield must end at the next session open";
pub(crate) const ERR_WEEKEND_LONG: &str = "weekend shield above 65.5 h";
pub(crate) const ERR_NO_EVENT: &str = "no event window";
pub(crate) const ERR_EVENT_AFTER: &str = "event shield ends after the event window";
pub(crate) const ERR_EVENT_LONG: &str = "event shield above 72 h";
pub(crate) const ERR_SHIELD_DAILY: &str = "shield daily limit";
pub(crate) const ERR_HEALTH: &str = "health below 1";
pub(crate) const ERR_NO_VOLUNTARY: &str = "no voluntary capacity";
pub(crate) const ERR_VOLUNTARY_CAP: &str = "voluntary daily cap";
pub(crate) const ERR_UNITS_SHORT: &str = "collateral below Q_repaid";
/// Exec fees of each transfer pair's receipts, charged to the creator (WO-10a lesson; = p1 constant).
const GAS_RECEIPTS_PER_TRANSFER: u64 = 5_000_000_000_000;

/// A Profit-Lock plan (shared by `self_settle` and `preview_self_settle`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SelfPlan {
    pub debt: u128,
    pub fee: u128,
    pub fill: u128,
    pub units_repaid: u128,
    pub units_kept: u128,
    /// (quote_id, disc_bps, fill_usd_e6, units)
    pub legs: Vec<(u64, u16, u128, u128)>,
    pub day: u32,
    pub used_today: u128,
    /// Remote: the single leg's Solana recipient.
    pub recipient: Option<String>,
}

pub(crate) fn utc_day(ns: u64) -> u32 {
    u32::try_from(ns / DAY_NS).unwrap_or(u32::MAX)
}

impl Nectar {
    pub(crate) fn shield_fee_bps(&self, c: &CollateralConfig, kind: ShieldKind) -> u16 {
        match kind {
            ShieldKind::Weekend => c.shield.weekend_fee_bps,
            ShieldKind::Event => c.shield.event_fee_bps,
        }
    }

    /// Shield opens of `account` today (UTC).
    pub(crate) fn shield_opens_today(&self, account: &AccountId) -> u8 {
        match self.shield_opens.get(account) {
            Some((day, n)) if *day == utc_day(env::block_timestamp()) => *n,
            _ => 0,
        }
    }

    /// §4.9 window, minimum and daily-count checks. Writes nothing.
    pub(crate) fn validate_shield(
        &self,
        c: &CollateralConfig,
        s: &ShieldInput,
        borrow: u128,
        account: &AccountId,
    ) -> Result<Shield, &'static str> {
        if borrow < SHIELD_MIN_BORROW_USD_E6 {
            return Err(ERR_SHIELD_MIN);
        }
        let now = env::block_timestamp();
        let end = s.window_end_ns.0;
        if end <= now {
            return Err(ERR_SHIELD_ENDED);
        }
        let len = end - now;
        match s.kind {
            ShieldKind::Weekend => {
                let windows = self.session_calendar.get().as_deref().unwrap_or(&[]);
                let next = math::next_window_open(windows, now).ok_or(ERR_NO_NEXT_SESSION)?;
                if end != next {
                    return Err(ERR_WEEKEND_END);
                }
                if len > SHIELD_WEEKEND_MAX_NS {
                    return Err(ERR_WEEKEND_LONG);
                }
            }
            ShieldKind::Event => {
                let ev = c.shield.event_window_end_ns.0;
                if ev <= now {
                    return Err(ERR_NO_EVENT);
                }
                if end > ev {
                    return Err(ERR_EVENT_AFTER);
                }
                if len > SHIELD_EVENT_MAX_NS {
                    return Err(ERR_EVENT_LONG);
                }
            }
        }
        if self.shield_opens_today(account) >= MAX_SHIELD_OPENS_PER_DAY {
            return Err(ERR_SHIELD_DAILY);
        }
        Ok(Shield { kind: s.kind, window_end_ns: s.window_end_ns, fee_bps: self.shield_fee_bps(c, s.kind), opened_ns: U64(now) })
    }

    /// Effect: one more Shield open today.
    pub(crate) fn note_shield_open(&mut self, account: &AccountId) {
        let day = utc_day(env::block_timestamp());
        let n = self.shield_opens_today(account).saturating_add(1);
        self.shield_opens.insert(account.clone(), (day, n));
    }

    pub(crate) fn emit_shield_opened(
        &self,
        id: u64,
        borrower: &AccountId,
        collateral: &str,
        s: &Shield,
        fee: u128,
        remote: bool,
    ) {
        emit(
            "shield_opened",
            json!({ "position_id": U64(id), "borrower": borrower, "collateral": collateral, "kind": s.kind,
                    "window_end_ns": s.window_end_ns, "fee_bps": s.fee_bps, "fee_usd_e6": U128(fee),
                    "remote": remote }),
        );
    }

    /// §4.10 plan. Precedence: status, debt, ca_pending, oracle, health, opted-in capacity, units, daily cap.
    pub(crate) fn plan_self_settle(&self, p: &Position, c: &CollateralConfig) -> Result<SelfPlan, &'static str> {
        if p.status != PositionStatus::Open {
            return Err("position not open");
        }
        let remote = p.remote.is_some();
        let domain = p.remote.as_ref().map(|r| r.domain_id);
        if let Some(r) = &p.remote {
            if r.status != RemoteStatus::Open {
                return Err("remote position not open");
            }
        }
        let debt = p.debt_usd_e6.0;
        if debt == 0 {
            return Err("nothing to repay");
        }
        if c.ca_pending {
            return Err(ERR_CA_PENDING);
        }
        if !self.oracle_fresh(c) {
            return Err("oracle stale");
        }
        let value = Self::value_of(p.units.0, c)?;
        if math::triggerable(debt, value, p.pre_liq_ltv_bps)? {
            return Err(ERR_HEALTH);
        }
        let (fee, fill) = math::profit_lock_fill(debt, PROFIT_LOCK_FEE_BPS)?;
        // opted-in quotes, ascending discount then oldest; a remote leg needs one quote covering the whole fill
        let mut cands: Vec<(u16, u64, u128, Option<String>)> = Vec::new();
        for id in self.live_ids(&p.collateral) {
            let Some(q) = self.quote(id) else { continue };
            if q.remaining_usd_e6.0 == 0 || !q.accepts_voluntary_fills || q.collateral != p.collateral {
                continue;
            }
            // WO-29a: a 0x recipient fills EVM positions only, a base58 one Solana positions only
            let rcpt = q.buyer_remote_recipient.clone().filter(|x| domain.is_some_and(|d| chainsig::recipient_fits(d, x)));
            if remote && (rcpt.is_none() || q.remaining_usd_e6.0 < fill) {
                continue;
            }
            cands.push((q.max_discount_bps, id, q.remaining_usd_e6.0, rcpt));
        }
        cands.sort_unstable_by(|a, b| (a.0, a.1).cmp(&(b.0, b.1)));
        cands.truncate(MAX_QUOTES_PER_SETTLEMENT);
        let price = c.oracle_price_usd_e6.0;
        let m = Self::eff_multiplier(c);
        let mut need = fill;
        let mut legs = Vec::new();
        let mut units_repaid: u128 = 0;
        let mut recipient = None;
        for (disc, id, rem, rcpt) in cands {
            if need == 0 {
                break;
            }
            let f = need.min(rem);
            let (u, _) = math::seize_units_m(f, m, price, c.decimals, disc, 0)?;
            units_repaid = math::add(units_repaid, u)?;
            need = math::sub(need, f)?;
            legs.push((id, disc, f, u));
            if remote {
                recipient = rcpt;
                break;
            }
        }
        if need > 0 || legs.is_empty() {
            return Err(ERR_NO_VOLUNTARY);
        }
        if units_repaid > p.units.0 {
            return Err(ERR_UNITS_SHORT);
        }
        let day = utc_day(env::block_timestamp());
        let used_today = if c.voluntary_day == day { c.voluntary_filled_today_e6.0 } else { 0 };
        if math::add(used_today, fill)? > c.max_voluntary_fill_usd_e6_per_day.0 {
            return Err(ERR_VOLUNTARY_CAP);
        }
        Ok(SelfPlan {
            debt,
            fee,
            fill,
            units_repaid,
            units_kept: math::sub(p.units.0, units_repaid)?,
            legs,
            day,
            used_today,
            recipient,
        })
    }

    /// NEAR-held Profit-Lock: buyers get their units, the borrower the rest; position Closed. Checks first; `Err` =
    /// nothing written.
    fn self_settle_near(
        &mut self,
        position_id: U64,
        mut p: Position,
        mut c: CollateralConfig,
        plan: SelfPlan,
    ) -> Result<(), &'static str> {
        let acc = c.acc_fee_per_dollar_e18.0;
        let mut q_c = c.active_committed_q_usd_e6.0;
        let mut quotes: Vec<Quote> = Vec::with_capacity(plan.legs.len());
        let mut buyer_transfers: Vec<(AccountId, u128, u64)> = Vec::new();
        for &(qid, _, f, u) in &plan.legs {
            let mut q = self.quote(qid).ok_or("unknown quote")?;
            Self::checkpoint_fees(&mut q, acc)?;
            if !q.exiting() {
                q_c = math::sub(q_c, f)?;
            }
            q.remaining_usd_e6 = U128(math::sub(q.remaining_usd_e6.0, f)?);
            let dust = self.sweep_dust(&mut q)?;
            q_c = math::sub(q_c, dust)?;
            Self::reset_fee_debt(&mut q, acc)?;
            match buyer_transfers.iter_mut().find(|(b, _, _)| *b == q.buyer) {
                Some(e) => e.1 = math::add(e.1, u)?,
                None => buyer_transfers.push((q.buyer.clone(), u, qid)),
            }
            quotes.push(q);
        }
        let utilised = math::sub(self.utilised_usd_e6, plan.debt)?;
        let available = math::add(self.available_usd_e6, plan.debt)?;
        let treasury = math::add(self.treasury_usd_e6, plan.fee)?;
        let total_debt = math::sub(c.total_debt_usd_e6.0, plan.debt)?;
        let filled = math::add(plan.used_today, plan.fill)?;
        let n = buyer_transfers.len() as u64 + u64::from(plan.units_kept > 0);
        let reserve = math::sub(self.gas_reserve_yocto, u128::from(n)).map_err(|_| "gas reserve empty")?;
        let per = GAS_FT_TRANSFER.as_gas() + GAS_ON_PAYOUT.as_gas() + GAS_RECEIPTS_PER_TRANSFER;
        let left = env::prepaid_gas().as_gas().saturating_sub(env::used_gas().as_gas());
        if left < n.saturating_mul(per) {
            return Err("attach more gas");
        }
        // effects
        for q in quotes {
            if q.remaining_usd_e6.0 == 0 {
                self.remove_live(&p.collateral, q.quote_id.0);
            }
            self.put_quote(q);
        }
        self.utilised_usd_e6 = utilised;
        self.available_usd_e6 = available;
        self.treasury_usd_e6 = treasury;
        self.gas_reserve_yocto = reserve;
        c.active_committed_q_usd_e6 = U128(q_c);
        c.total_debt_usd_e6 = U128(total_debt);
        c.voluntary_day = plan.day;
        c.voluntary_filled_today_e6 = U128(filled);
        let token = c.token.clone();
        self.put_coll(c);
        let borrower = p.borrower.clone();
        p.debt_usd_e6 = U128(0);
        p.units = U128(0);
        p.status = PositionStatus::Closed;
        self.put_position(p);
        self.emit_self_settled(position_id, &borrower, &plan, false);
        // interactions
        for (buyer, u, qid) in buyer_transfers {
            Self::transfer(&token, &buyer, u, Payout::SettlementBuyer { position_id, quote_id: U64(qid) }).detach();
        }
        if plan.units_kept > 0 {
            Self::transfer(&token, &borrower, plan.units_kept, Payout::CollateralRelease { position_id }).detach();
        }
        Ok(())
    }

    pub(crate) fn emit_self_settled(&self, position_id: U64, borrower: &AccountId, plan: &SelfPlan, remote: bool) {
        let legs: Vec<_> = plan
            .legs
            .iter()
            .map(|(q, d, f, u)| json!({ "quote_id": U64(*q), "disc_bps": d, "fill_usd_e6": U128(*f), "units": U128(*u) }))
            .collect();
        emit(
            "self_settled",
            json!({ "position_id": position_id, "borrower": borrower, "debt_repaid_usd_e6": U128(plan.debt),
                    "fee_usd_e6": U128(plan.fee), "fill_usd_e6": U128(plan.fill),
                    "units_repaid": U128(plan.units_repaid), "units_kept": U128(plan.units_kept), "legs": legs,
                    "remote": remote, "status": if remote { "signing" } else { "settled" } }),
        );
    }

    #[cfg(not(feature = "p2"))]
    fn self_settle_remote(&mut self, _id: U64, _p: Position, _c: CollateralConfig, _plan: SelfPlan) -> Result<(), &'static str> {
        Err("p2 disabled")
    }
}

#[near]
impl Nectar {
    // ------------------------------------------------------------ §4.9 Shields
    /// Owner: per-asset Shield fees (≤ 1000 bps) and the curator's event window end (0 = none, else in the future).
    pub fn set_shield_params(&mut self, symbol: String, weekend_fee_bps: u16, event_fee_bps: u16, event_window_end_ns: U64) {
        self.assert_owner();
        require!(weekend_fee_bps <= MAX_SHIELD_FEE_BPS && event_fee_bps <= MAX_SHIELD_FEE_BPS, "shield fee > 1000 bps");
        require!(
            event_window_end_ns.0 == 0 || event_window_end_ns.0 > env::block_timestamp(),
            "event window must end in the future"
        );
        let mut c = self.coll_or_panic(&symbol);
        c.shield = ShieldParams { weekend_fee_bps, event_fee_bps, event_window_end_ns };
        self.put_coll(c);
        emit(
            "shield_params_set",
            json!({ "symbol": symbol, "weekend_fee_bps": weekend_fee_bps, "event_fee_bps": event_fee_bps,
                    "event_window_end_ns": event_window_end_ns }),
        );
    }

    pub fn get_shield(&self, position_id: U64) -> Option<ShieldView> {
        let p = self.position(position_id.0)?;
        let s = p.shield?;
        let active = env::block_timestamp() < s.window_end_ns.0;
        Some(ShieldView {
            position_id,
            kind: s.kind,
            window_end_ns: s.window_end_ns,
            fee_bps: s.fee_bps,
            fee_usd_e6: p.premium_usd_e6,
            active,
            committed_buyers_only: active,
        })
    }

    /// Shield opens of `account_id` in the current UTC day (max 5).
    pub fn get_shield_opens_today(&self, account_id: AccountId) -> u8 {
        self.shield_opens_today(&account_id)
    }

    // ------------------------------------------------------------ §4.10 Profit-Lock
    /// Owner: USDC opted-in quotes may fill per UTC day for this asset (0 turns self-settlement off).
    pub fn set_max_voluntary_fill(&mut self, symbol: String, max_usd_e6_per_day: U128) {
        self.assert_owner();
        let mut c = self.coll_or_panic(&symbol);
        c.max_voluntary_fill_usd_e6_per_day = max_usd_e6_per_day;
        self.put_coll(c);
        emit("voluntary_fill_cap_set", json!({ "symbol": symbol, "max_usd_e6_per_day": max_usd_e6_per_day }));
    }

    /// Borrower (Loan Note owner after WO-22), 1 yocto. Sells just enough collateral to opted-in committed buyers
    /// to repay debt + 50 bps; keeps the rest debt-free. Remote positions: one signed `|kind=SELF` leg.
    #[payable]
    pub fn self_settle(&mut self, position_id: U64) {
        assert_one_yocto();
        self.assert_not_paused();
        let p = self.position_or_panic(position_id.0);
        require!(env::predecessor_account_id() == p.borrower, "borrower only");
        let c = self.coll_or_panic(&p.collateral);
        let plan = self.plan_self_settle(&p, &c).unwrap_or_else(|e| env::panic_str(e));
        let res = if p.remote.is_some() {
            self.self_settle_remote(position_id, p, c, plan)
        } else {
            self.self_settle_near(position_id, p, c, plan)
        };
        if let Err(e) = res {
            env::panic_str(e);
        }
    }

    /// Profit-Lock quote for the UI: same checks and numbers as `self_settle` (no caller check).
    pub fn preview_self_settle(&self, position_id: U64) -> SelfSettlePreview {
        let empty = |reason: &str, remote: bool, cap: U128, used: U128| SelfSettlePreview {
            ok: false,
            reason: Some(reason.to_string()),
            debt_usd_e6: U128(0),
            fee_usd_e6: U128(0),
            fill_usd_e6: U128(0),
            units_repaid: U128(0),
            units_kept: U128(0),
            legs: Vec::new(),
            remote,
            daily_cap_usd_e6: cap,
            daily_used_usd_e6: used,
        };
        let Some(p) = self.position(position_id.0) else {
            return empty("unknown position", false, U128(0), U128(0));
        };
        let Some(c) = self.coll(&p.collateral) else {
            return empty("unknown collateral", p.remote.is_some(), U128(0), U128(0));
        };
        let day = utc_day(env::block_timestamp());
        let used = U128(if c.voluntary_day == day { c.voluntary_filled_today_e6.0 } else { 0 });
        let cap = c.max_voluntary_fill_usd_e6_per_day;
        if self.paused {
            return empty("paused", p.remote.is_some(), cap, used);
        }
        match self.plan_self_settle(&p, &c) {
            Ok(plan) => SelfSettlePreview {
                ok: true,
                reason: None,
                debt_usd_e6: U128(plan.debt),
                fee_usd_e6: U128(plan.fee),
                fill_usd_e6: U128(plan.fill),
                units_repaid: U128(plan.units_repaid),
                units_kept: U128(plan.units_kept),
                legs: plan
                    .legs
                    .iter()
                    .map(|&(q, d, f, u)| SelfSettleLegView { quote_id: U64(q), disc_bps: d, fill_usd_e6: U128(f), units: U128(u) })
                    .collect(),
                remote: p.remote.is_some(),
                daily_cap_usd_e6: cap,
                daily_used_usd_e6: used,
            },
            Err(e) => {
                let mut v = empty(e, p.remote.is_some(), cap, used);
                if let Ok((fee, fill)) = math::profit_lock_fill(p.debt_usd_e6.0, PROFIT_LOCK_FEE_BPS) {
                    v.debt_usd_e6 = p.debt_usd_e6;
                    v.fee_usd_e6 = U128(fee);
                    v.fill_usd_e6 = U128(fill);
                }
                v
            }
        }
    }

    // ------------------------------------------------------------ §4.11 fee stack
    /// Every fee in one view. With a symbol: that asset's limit premium and Shield fees; without: the defaults.
    pub fn get_fee_stack(&self, symbol: Option<String>) -> FeeStackView {
        let c = symbol.as_deref().and_then(|s| self.coll(s));
        let (prem, wk, ev) = match &c {
            Some(c) => (Some(c.limit_premium_bps), c.shield.weekend_fee_bps, c.shield.event_fee_bps),
            None => (None, crate::DEFAULT_SHIELD_WEEKEND_FEE_BPS, crate::DEFAULT_SHIELD_EVENT_FEE_BPS),
        };
        FeeStackView {
            limit_premium_bps: prem,
            shield_weekend_fee_bps: wk,
            shield_event_fee_bps: ev,
            origination_fee_bps: self.origination_fee_bps,
            referrer_share_bps: REFERRER_SHARE_BPS,
            profit_lock_fee_bps: PROFIT_LOCK_FEE_BPS,
            keeper_fee_bps: self.keeper_fee_bps,
            fee_split: self.fee_split,
        }
    }
}
