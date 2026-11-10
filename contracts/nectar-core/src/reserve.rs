//! WO-23b (PRD §4.8, §6.11): Nectar Reserve (R_c), one pooled buyer per asset that fills after every Pappus quote.
//!
//! - Deposit: `ft_on_transfer` `JoinNectarReserve{collateral}` from `usdc_token`, at least 10,000,000 e6. Shares are
//!   minted against R_c (1:1 for the first deposit) and held by a Reserve Note `r-<collateral>-<n>` (n is global).
//!   Deposits need an enabled Reserve (`discount_bps > 0`, owner `set_reserve_params`).
//! - R_c = `reserve.usdc_e6 − reserve.notice_usdc_e6`. It is the R_c of every limit, view and the aggregate check.
//! - Fees: the buyers' share of every premium and Shield fee is split Q_c : R_c (`math::split_premium_qr`); the Reserve
//!   part accrues to `acc_fee_per_share_e18` and to a ring of daily totals (realised trailing 7-day APR, never promised).
//! - Settlement waterfall (`Nectar::settle`): quotes by ascending discount, then the Reserve at `discount_bps` only when
//!   no live quote outside the call still has capacity. Seized units stay in the contract (`reserve.units`) and accrue
//!   through `acc_units_per_share_e18`. A shortfall after the Reserve leaves the position `Settling` for the owner
//!   (`cancel_settlement`). NEAR-held collateral only: remote positions settle through `settle_remote`, never here.
//! - Each Note has `unit_debt` / `fee_debt` (MasterChef, rounded up), so a late depositor gets nothing from earlier fills.
//! - Exit: `initiate_reserve_exit` (Note owner; the shares leave R_c at once at their current value, pending units and
//!   fees are checkpointed), `complete_reserve_exit` after 7 days pays USDC (value + fees) and the units; `on_payout`
//!   restores the claim if a transfer fails. A Note transfer moves the claim; it is refused while a settlement that
//!   reached (or may reach) the Reserve of that asset is pending.

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::json;
use near_sdk::{AccountId, Promise, assert_one_yocto, env, near, require};

use crate::events::emit;
use crate::math::{self, MathResult};
use crate::notes::ERR_NOTE_OWNER;
use crate::shields::utc_day;
use crate::types::*;
use crate::{DAY_NS, ERR_NO_COLLATERAL, Nectar, NectarExt, ok};

pub const RESERVE_MIN_DEPOSIT_USD_E6: u128 = 10_000_000;
pub const RESERVE_NOTICE_NS: u64 = 7 * DAY_NS;
pub const RESERVE_MIN_NOTICE_NS: u64 = 60 * 1_000_000_000;
pub const RESERVE_MAX_NOTICE_NS: u64 = 30 * DAY_NS;
/// Daily fee totals kept for the realised APR (7-day window + today).
pub const RESERVE_FEE_DAYS: usize = 8;
pub const RESERVE_APR_WINDOW_DAYS: u32 = 7;

pub const ERR_RESERVE_MIN: &str = "reserve deposit below 10 USDC";
pub const ERR_RESERVE_DISABLED: &str = "reserve_disabled";
pub const ERR_NO_RESERVE_NOTE: &str = "unknown reserve note";

pub fn reserve_note_id(symbol: &str, n: u64) -> String {
    format!("r-{symbol}-{n}")
}

// ---------------------------------------------------------------- internal
impl Nectar {
    /// R_c: USDC of active shares.
    pub(crate) fn reserve_notice_ns(pool: &ReservePool) -> u64 {
        if pool.notice_ns.0 == 0 { RESERVE_NOTICE_NS } else { pool.notice_ns.0 }
    }
    pub(crate) fn reserve_rc(c: &CollateralConfig) -> u128 {
        c.reserve.usdc_e6.0.saturating_sub(c.reserve.notice_usdc_e6.0)
    }

    pub(crate) fn reserve_note(&self, n: u64) -> Option<ReserveNote> {
        self.reserve_notes.get(&n).map(|VReserveNote::V1(r)| r.clone())
    }
    pub(crate) fn put_reserve_note(&mut self, n: u64, r: ReserveNote) {
        self.reserve_notes.insert(n, VReserveNote::V1(r));
    }
    /// `(n, note)` for a minted `r-<collateral>-<n>` token id.
    pub(crate) fn reserve_note_by_id(&self, token_id: &str) -> Option<(u64, ReserveNote)> {
        match crate::notes::parse_note_id(token_id)? {
            crate::notes::NoteRef::Reserve(n) => {
                let r = self.reserve_note(n)?;
                (r.note_id == token_id).then_some((n, r))
            }
            _ => None,
        }
    }
    fn reserve_note_or_panic(&self, token_id: &str) -> (u64, ReserveNote) {
        self.reserve_note_by_id(token_id).unwrap_or_else(|| env::panic_str(ERR_NO_RESERVE_NOTE))
    }

    /// Pending units and fees since the last checkpoint (O(1)).
    pub(crate) fn reserve_pending(note: &ReserveNote, pool: &ReservePool) -> MathResult<(u128, u128)> {
        let s = note.shares.0;
        Ok((
            math::pending_fees(s, pool.acc_units_per_share_e18.0, note.unit_debt.0)?,
            math::pending_fees(s, pool.acc_fee_per_share_e18.0, note.fee_debt.0)?,
        ))
    }

    /// Moves pending units and fees into the Note's claimable balances and resets both debts.
    fn reserve_checkpoint(note: &mut ReserveNote, pool: &ReservePool) -> MathResult<()> {
        let (u, f) = Self::reserve_pending(note, pool)?;
        note.claimable_units = U128(math::add(note.claimable_units.0, u)?);
        note.claimable_fees_usd_e6 = U128(math::add(note.claimable_fees_usd_e6.0, f)?);
        note.unit_debt = U128(math::fee_debt(note.shares.0, pool.acc_units_per_share_e18.0)?);
        note.fee_debt = U128(math::fee_debt(note.shares.0, pool.acc_fee_per_share_e18.0)?);
        Ok(())
    }

    /// Credits the Reserve's fee part (premium or Shield fee) to the index and to today's ring entry.
    pub(crate) fn reserve_accrue_fees(pool: &mut ReservePool, amount: u128, inc_e18: u128, now_ns: u64) -> MathResult<()> {
        if amount == 0 {
            return Ok(());
        }
        pool.acc_fee_per_share_e18 = U128(math::add(pool.acc_fee_per_share_e18.0, inc_e18)?);
        let day = utc_day(now_ns);
        match pool.fee_days.last_mut() {
            Some(d) if d.day == day => d.fees_usd_e6 = U128(math::add(d.fees_usd_e6.0, amount)?),
            _ => {
                pool.fee_days.push(ReserveFeeDay { day, fees_usd_e6: U128(amount) });
                if pool.fee_days.len() > RESERVE_FEE_DAYS {
                    pool.fee_days.remove(0);
                }
            }
        }
        Ok(())
    }

    /// Fees in the trailing `RESERVE_APR_WINDOW_DAYS` UTC days, today included.
    pub(crate) fn reserve_fees_7d(pool: &ReservePool, now_ns: u64) -> u128 {
        let today = utc_day(now_ns);
        pool.fee_days
            .iter()
            .filter(|d| d.day <= today && today - d.day < RESERVE_APR_WINDOW_DAYS)
            .fold(0u128, |a, d| a.saturating_add(d.fees_usd_e6.0))
    }

    /// The waterfall may reach the Reserve: no live quote outside `cands` still has capacity (<= 64 reads).
    pub(crate) fn reserve_stage_open(&self, symbol: &str, cands: &[(u16, u64)]) -> bool {
        self.live_ids(symbol).iter().all(|id| {
            cands.iter().any(|(_, c)| c == id) || self.quote(*id).is_none_or(|q| q.remaining_usd_e6.0 == 0)
        })
    }

    /// The Reserve of `symbol` may fill for `position_id` (Reserve Notes of that asset stay put meanwhile).
    pub(crate) fn reserve_ref_add(&mut self, symbol: &str, position_id: u64) {
        let mut refs = self.reserve_refs.get(symbol).cloned().unwrap_or_default();
        refs.retain(|pid| *pid != position_id && self.position(*pid).is_some_and(|p| self.settlement_pending(&p)));
        refs.push(position_id);
        self.reserve_refs.insert(symbol.to_string(), refs);
    }

    pub(crate) fn reserve_locked(&self, symbol: &str) -> bool {
        self.reserve_refs
            .get(symbol)
            .is_some_and(|ps| ps.iter().any(|pid| self.position(*pid).is_some_and(|p| self.settlement_pending(&p))))
    }

    /// Highest `max_discount_bps` among live quotes of `symbol` (<= 64 reads).
    pub(crate) fn highest_quote_ceiling(&self, symbol: &str) -> u16 {
        self.live_ids(symbol).iter().filter_map(|id| self.quote(*id)).map(|q| q.max_discount_bps).max().unwrap_or(0)
    }

    /// `JoinNectarReserve{collateral}`: all checks before the first write; `Err` = full refund.
    pub(crate) fn on_join_reserve(&mut self, sender: &AccountId, amount: u128, collateral: String) -> Result<u128, &'static str> {
        let mut c = self.coll(&collateral).ok_or(ERR_NO_COLLATERAL)?;
        if amount < RESERVE_MIN_DEPOSIT_USD_E6 {
            return Err(ERR_RESERVE_MIN);
        }
        if c.reserve.discount_bps == 0 {
            return Err(ERR_RESERVE_DISABLED);
        }
        let rc = Self::reserve_rc(&c);
        let minted = math::reserve_shares_for(amount, c.reserve.shares.0, rc)?;
        if minted == 0 {
            return Err("reserve deposit mints no shares");
        }
        let n = self.next_reserve_note_id;
        let next = n.checked_add(1).ok_or(math::ERR_OVERFLOW)?;
        let note_id = reserve_note_id(&collateral, n);
        if note_id.len() > crate::MAX_STRING_LEN {
            return Err("string too long");
        }
        let shares = math::add(c.reserve.shares.0, minted)?;
        let usdc = math::add(c.reserve.usdc_e6.0, amount)?;
        let note = ReserveNote {
            note_id: note_id.clone(),
            collateral: collateral.clone(),
            owner: sender.clone(),
            deposited_usd_e6: U128(amount),
            shares: U128(minted),
            unit_debt: U128(math::fee_debt(minted, c.reserve.acc_units_per_share_e18.0)?),
            fee_debt: U128(math::fee_debt(minted, c.reserve.acc_fee_per_share_e18.0)?),
            claimable_units: U128(0),
            claimable_fees_usd_e6: U128(0),
            unlock_ns: None,
            exit_shares: U128(0),
            exit_usdc_e6: U128(0),
            exited: false,
            created_ns: U64(env::block_timestamp()),
        };
        // effects
        c.reserve.shares = U128(shares);
        c.reserve.usdc_e6 = U128(usdc);
        self.put_coll(c);
        self.next_reserve_note_id = next;
        self.put_reserve_note(n, note);
        self.mint_note(note_id.clone(), sender);
        emit(
            "reserve_joined",
            json!({ "note_id": note_id, "owner": sender, "collateral": collateral, "amount_usd_e6": U128(amount),
                    "shares": U128(minted) }),
        );
        Ok(0)
    }

    /// `on_payout` rollback for a failed `complete_reserve_exit` transfer: the claim returns to the Note.
    pub(crate) fn restore_reserve_payout(&mut self, payout: &Payout, amount: u128) {
        let note_id = match payout {
            Payout::ReserveExit { note_id, .. } | Payout::ReserveUnits { note_id } => note_id,
            _ => return,
        };
        let (n, mut note) = self.reserve_note_or_panic(note_id);
        let mut c = self.coll_or_panic(&note.collateral);
        match payout {
            Payout::ReserveExit { principal_usd_e6, fees_usd_e6, .. } => {
                let p = principal_usd_e6.0;
                note.exit_usdc_e6 = U128(ok(math::add(note.exit_usdc_e6.0, p)));
                note.claimable_fees_usd_e6 = U128(ok(math::add(note.claimable_fees_usd_e6.0, fees_usd_e6.0)));
                c.reserve.usdc_e6 = U128(ok(math::add(c.reserve.usdc_e6.0, p)));
                c.reserve.notice_usdc_e6 = U128(ok(math::add(c.reserve.notice_usdc_e6.0, p)));
            }
            _ => {
                note.claimable_units = U128(ok(math::add(note.claimable_units.0, amount)));
                c.reserve.units = U128(ok(math::add(c.reserve.units.0, amount)));
            }
        }
        note.exited = false;
        self.put_coll(c);
        self.put_reserve_note(n, note);
    }

    pub(crate) fn reserve_view(&self, c: &CollateralConfig) -> ReserveView {
        let pool = &c.reserve;
        let rc = Self::reserve_rc(c);
        let now = env::block_timestamp();
        let fees_7d = Self::reserve_fees_7d(pool, now);
        ReserveView {
            symbol: c.symbol.clone(),
            r_usd_e6: U128(rc),
            shares: pool.shares,
            usdc_e6: pool.usdc_e6,
            notice_usdc_e6: pool.notice_usdc_e6,
            units: pool.units,
            discount_bps: pool.discount_bps,
            acc_fee_per_share_e18: pool.acc_fee_per_share_e18,
            acc_units_per_share_e18: pool.acc_units_per_share_e18,
            share_price_e6: U128(if pool.shares.0 == 0 {
                1_000_000
            } else {
                ok(math::mul_div_floor(1_000_000, rc, pool.shares.0))
            }),
            min_deposit_usd_e6: U128(RESERVE_MIN_DEPOSIT_USD_E6),
            notice_period_ns: U64(Self::reserve_notice_ns(pool)),
            fees_7d_usd_e6: U128(fees_7d),
            realised_apr_7d_bps: U128(ok(math::realised_apr_bps(fees_7d, u128::from(RESERVE_APR_WINDOW_DAYS), rc))),
        }
    }

    /// Note value, claimable units and fees including accruals since the last checkpoint.
    pub(crate) fn reserve_note_live(&self, note: &ReserveNote) -> (u128, u128, u128) {
        let Some(c) = self.coll(&note.collateral) else { return (0, 0, 0) };
        let (u, f) = Self::reserve_pending(note, &c.reserve).unwrap_or((0, 0));
        let value = if note.unlock_ns.is_some() {
            note.exit_usdc_e6.0
        } else {
            math::reserve_share_value(note.shares.0, c.reserve.shares.0, Self::reserve_rc(&c)).unwrap_or(0)
        };
        (value, note.claimable_units.0.saturating_add(u), note.claimable_fees_usd_e6.0.saturating_add(f))
    }
}

// ---------------------------------------------------------------- public ABI
#[near]
impl Nectar {
    /// Owner: Reserve fill discount for `symbol`. Must exceed every live quote ceiling and stay below 1e4; a quote
    /// funded later must stay below it (`FundPappusQuote` refuses otherwise).
    /// `notice_ns` (optional, 60 s ..= 30 days) applies to exits initiated afterwards; default 7 days.
    pub fn set_reserve_params(&mut self, symbol: String, discount_bps: u16, notice_ns: Option<U64>) {
        self.assert_owner();
        let mut c = self.coll_or_panic(&symbol);
        require!(u128::from(discount_bps) < math::BPS, "discount_bps out of range");
        let highest = self.highest_quote_ceiling(&symbol);
        require!(discount_bps > highest, "reserve discount must exceed every live quote ceiling");
        if let Some(n) = notice_ns {
            require!((RESERVE_MIN_NOTICE_NS..=RESERVE_MAX_NOTICE_NS).contains(&n.0), "notice_ns out of range");
            c.reserve.notice_ns = n;
        }
        c.reserve.discount_bps = discount_bps;
        let notice = Self::reserve_notice_ns(&c.reserve);
        self.put_coll(c);
        emit("reserve_params_set", json!({ "symbol": symbol, "discount_bps": discount_bps, "notice_ns": U64(notice) }));
    }

    /// Note owner, 1 yocto: the shares leave R_c at once at their current USDC value; pending units and fees are
    /// checkpointed into the Note. `complete_reserve_exit` pays after `RESERVE_NOTICE_NS`.
    #[payable]
    pub fn initiate_reserve_exit(&mut self, note_id: String) {
        assert_one_yocto();
        let (n, mut note) = self.reserve_note_or_panic(&note_id);
        require!(env::predecessor_account_id() == note.owner, ERR_NOTE_OWNER);
        require!(note.unlock_ns.is_none(), "already exiting");
        let mut c = self.coll_or_panic(&note.collateral);
        ok(Self::reserve_checkpoint(&mut note, &c.reserve));
        let s = note.shares.0;
        let value = ok(math::reserve_share_value(s, c.reserve.shares.0, Self::reserve_rc(&c)));
        let unlock = env::block_timestamp()
            .checked_add(Self::reserve_notice_ns(&c.reserve))
            .unwrap_or_else(|| env::panic_str(math::ERR_OVERFLOW));
        let shares = ok(math::sub(c.reserve.shares.0, s));
        let notice = ok(math::add(c.reserve.notice_usdc_e6.0, value));
        // effects
        c.reserve.shares = U128(shares);
        c.reserve.notice_usdc_e6 = U128(notice);
        note.shares = U128(0);
        note.unit_debt = U128(0);
        note.fee_debt = U128(0);
        note.exit_shares = U128(s);
        note.exit_usdc_e6 = U128(value);
        note.unlock_ns = Some(U64(unlock));
        let owner = note.owner.clone();
        self.put_coll(c);
        self.put_reserve_note(n, note);
        emit(
            "reserve_exiting",
            json!({ "note_id": note_id, "owner": owner, "shares": U128(s), "usdc_e6": U128(value), "unlock_ns": U64(unlock) }),
        );
    }

    /// Note owner, 1 yocto, after the notice: pays the frozen USDC value plus fees (USDC) and the claimable units
    /// (collateral token). Effects first; `on_payout` restores the claim of a failed transfer.
    #[payable]
    pub fn complete_reserve_exit(&mut self, note_id: String) -> Promise {
        assert_one_yocto();
        let (n, mut note) = self.reserve_note_or_panic(&note_id);
        require!(env::predecessor_account_id() == note.owner, ERR_NOTE_OWNER);
        let unlock = note.unlock_ns.unwrap_or_else(|| env::panic_str("exit not initiated"));
        require!(env::block_timestamp() >= unlock.0, "notice period not over");
        require!(!note.exited, "reserve note exited");
        let principal = note.exit_usdc_e6.0;
        let fees = note.claimable_fees_usd_e6.0;
        let units = note.claimable_units.0;
        let usdc_total = ok(math::add(principal, fees));
        require!(usdc_total > 0 || units > 0, "nothing to withdraw");
        let mut c = self.coll_or_panic(&note.collateral);
        let pool_usdc = ok(math::sub(c.reserve.usdc_e6.0, principal));
        let notice = ok(math::sub(c.reserve.notice_usdc_e6.0, principal));
        let pool_units = ok(math::sub(c.reserve.units.0, units));
        let token = c.token.clone();
        // effects
        c.reserve.usdc_e6 = U128(pool_usdc);
        c.reserve.notice_usdc_e6 = U128(notice);
        c.reserve.units = U128(pool_units);
        note.exit_usdc_e6 = U128(0);
        note.claimable_fees_usd_e6 = U128(0);
        note.claimable_units = U128(0);
        note.exited = true;
        let owner = note.owner.clone();
        self.put_coll(c);
        self.put_reserve_note(n, note);
        emit(
            "reserve_exited",
            json!({ "note_id": note_id, "owner": owner, "principal_usd_e6": U128(principal), "fees_usd_e6": U128(fees),
                    "units": U128(units) }),
        );
        // interactions
        let usdc_p = (usdc_total > 0).then(|| {
            Self::transfer(
                &self.usdc_token,
                &owner,
                usdc_total,
                Payout::ReserveExit {
                    note_id: note_id.clone(),
                    principal_usd_e6: U128(principal),
                    fees_usd_e6: U128(fees),
                },
            )
        });
        let units_p =
            (units > 0).then(|| Self::transfer(&token, &owner, units, Payout::ReserveUnits { note_id: note_id.clone() }));
        match (usdc_p, units_p) {
            (Some(a), Some(b)) => {
                b.detach();
                a
            }
            (Some(a), None) => a,
            (None, Some(b)) => b,
            (None, None) => env::panic_str("nothing to withdraw"),
        }
    }

    /// Pool state of `symbol` incl. R_c and the realised trailing 7-day APR from fee accruals.
    pub fn get_reserve(&self, symbol: String) -> ReserveView {
        let c = self.coll_or_panic(&symbol);
        self.reserve_view(&c)
    }

    pub fn get_reserve_note(&self, note_id: String) -> Option<ReserveNoteView> {
        let (_, note) = self.reserve_note_by_id(&note_id)?;
        let (value, units, fees) = self.reserve_note_live(&note);
        let can_complete =
            !note.exited && note.unlock_ns.is_some_and(|u| env::block_timestamp() >= u.0) && (value > 0 || units > 0 || fees > 0);
        let transfer_locked = self.reserve_locked(&note.collateral);
        Some(ReserveNoteView {
            value_usd_e6: U128(value),
            claimable_units: U128(units),
            claimable_fees_usd_e6: U128(fees),
            can_complete,
            transfer_locked,
            note,
        })
    }
}
