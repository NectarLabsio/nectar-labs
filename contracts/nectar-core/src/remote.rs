//! v2 remote collateral lifecycle (interface-v7 §B, PRD §9B, WO-21). Solana now (domain 1); the authority
//! parsing is domain-aware so the Base spoke (domain 0, P2b) only adds its signing path later.
//!
//! 1. `reserve_remote_position` (borrower, no deposit): position with `remote.status = AwaitingDeposit`, path
//!    `<chain>/pos/<id>`, cross-contract `derived_public_key({path, predecessor: <this>, domain_id})` (F-338)
//!    `.then(on_authority)`. No pool funds are locked; the reservation expires after 30 min
//!    (`expire_remote_reservation`, anyone).
//! 2. `confirm_remote_deposit` (anyone): OutLayer `vault_read` (deposit from `gas_reserve_yocto`)
//!    `.then(on_deposit_verified)`: authority and committed depositor must match (SR-8), depositor recorded; then both
//!    limits (A1), sized against fitting quotes only (SR-5), are re-checked with the stored price (must be fresh) and
//!    the loan is paid (A4 `pay_to`, A5 fees). OutLayer failure: stays AwaitingDeposit + `remote_deposit_rejected` (no
//!    fallback payout). A proven deposit whose loan is refused (limits, expiry, units below reserved: SR-18) records
//!    the depositor so the collateral can be released.
//!    `keeper_attest_deposit` is the testnet fallback behind `allow_keeper_deposit_attestation` (`source: "keeper"`).
//! 3. Settlement: `settle_remote` (one signed leg, `|kind=PRELIQ`, the position's own path; src/p2.rs).
//! 4. `request_remote_release` (anyone, after debt = 0): signs `NECTAR_RELEASE_V1` with the position's path;
//!    `relay_release_result` (keeper) closes it.
//!
//! All amounts in Solana preimages are u64 (the vault takes u64): units and repay that do not fit are refused.
//! Keeper-callable methods are not payable; the 1 yocto `sign` deposit and the OutLayer deposit come from
//! `gas_reserve_yocto`. State: raw storage keys (like `__p2_*`).

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{self, Value, json};
use near_sdk::{AccountId, Gas, GasWeight, NearToken, Promise, PromiseError, env, near, require};

use crate::chainsig;
use crate::events::emit;
use crate::evm;
use crate::p2::{SEC, SignCall, sign_args};
use crate::types::*;
use crate::{
    ERR_CA_PENDING, ERR_KEEPER, ERR_REFERRER_IS_BORROWER, ERR_REMOTE_SETTLE_CAP, MAX_QUOTES_PER_SETTLEMENT, MAX_STRING_LEN, Nectar,
    NectarExt, math,
};

/// SR-8 (WO-34a): the depositor committed at reservation (raw key: code-only upgrade, no struct layout change).
pub const COMMITTED_DEPOSITOR_PREFIX: &[u8] = b"__v7c_depositor:";

pub const ALLOW_KEEPER_ATTEST_KEY: &[u8] = b"__v7_allow_keeper_attest";
pub const VAULT_READ_KEY: &[u8] = b"__v7_vault_read";
pub const RELEASE_PREFIX: &[u8] = b"__v7_release:";
/// 30 min (interface-v7 §B; config `v7.reservation_expiry_s`).
pub const RESERVATION_EXPIRY_S: u64 = 1_800;
/// Minimum spacing of two `vault_read` requests on one position (bounds `gas_reserve_yocto` griefing).
pub const CONFIRM_COOLDOWN_S: u64 = 30;
/// `derived_public_key` is pure math (F-338). TODO-G10: confirm the live burn on `v1.signer-prod.testnet`.
pub const GAS_DERIVE_KEY: Gas = Gas::from_tgas(10);
pub const GAS_ON_AUTHORITY: Gas = Gas::from_tgas(10);
/// Own burn of `on_deposit_verified` (parse, limits, ~6 writes, SR-5 recipient checks over up to 64 quotes), on top of
/// one USDC transfer pair. Measured 67 Tgas at 64 fitting quotes. It must cover that worst case: anyone chooses the
/// attached gas, and a callback that runs out leaves `confirming` set, which would block the reservation for good.
pub const GAS_ON_DEPOSIT_BASE: Gas = Gas::from_tgas(70);
pub const GAS_ON_RELEASE_SIG: Gas = Gas::from_tgas(10);
/// Exec fees of the receipts a method creates, charged to it (WO-10a lesson).
pub const GAS_CREATE_RECEIPTS: Gas = Gas::from_tgas(5);
/// `"ed25519:<44 b58>"` / `"secp256k1:<88 b58>"` < 128 B.
pub const MAX_DERIVED_KEY_LEN: usize = 256;
/// OutLayer stdout ≤ 900 B (F-043); headroom for the JSON string wrapper.
pub const MAX_VAULT_READ_LEN: usize = 1024;
pub const SOURCE_OUTLAYER: &str = "outlayer";
pub const SOURCE_KEEPER: &str = "keeper";
pub(crate) const U64_MAX: u128 = u64::MAX as u128;
/// WO-23a (WO-21 open question 3): 0.05 NEAR held per reservation against spam, refunded to the borrower.
pub const RESERVE_DEPOSIT_YOCTO: u128 = 50_000_000_000_000_000_000_000;

fn release_key(position_id: u64) -> Vec<u8> {
    let mut k = RELEASE_PREFIX.to_vec();
    k.extend_from_slice(&position_id.to_le_bytes());
    k
}

fn committed_key(position_id: u64) -> Vec<u8> {
    let mut k = COMMITTED_DEPOSITOR_PREFIX.to_vec();
    k.extend_from_slice(&position_id.to_le_bytes());
    k
}

/// Vault depositor of the position's chain. SR-8: a 32-byte on-curve Solana key (domain 1) or a non-zero 0x address
/// (domain 0).
pub fn valid_depositor(s: &str, domain_id: u32) -> bool {
    match domain_id {
        chainsig::ED25519_DOMAIN_ID => chainsig::valid_solana_pubkey(s),
        chainsig::SECP256K1_DOMAIN_ID => chainsig::valid_evm_recipient(s),
        _ => false,
    }
}

/// SR-8: a reported depositor equals the commitment (EVM addresses compare case-insensitively).
pub fn depositor_matches(committed: &str, reported: &str, domain_id: u32) -> bool {
    if domain_id == chainsig::SECP256K1_DOMAIN_ID { committed.eq_ignore_ascii_case(reported) } else { committed == reported }
}

/// SR-10 (WO-34a): the units a remote leg signs, or `None` if the leg cannot close the vault position in one message. It
/// closes when it repays the whole debt or takes every unit. A leg below both the debt and the quote's remaining came
/// from the underwater cap branch of `settle_leg_m`: the units ran out and only rounding is left, so it seizes them all.
pub(crate) fn remote_leg_seize(leg: &math::Leg, debt: u128, units: u128, remaining: u128) -> Option<u128> {
    if leg.repay_usd_e6 == debt || leg.buyer_units == units {
        Some(leg.buyer_units)
    } else if leg.repay_usd_e6 < remaining {
        Some(units)
    } else {
        None
    }
}

/// `tx_ref` of a keeper attestation: printable ASCII, 1..=128 bytes.
pub fn valid_tx_ref(s: &str) -> bool {
    (1..=MAX_STRING_LEN).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_graphic())
}

fn u128_of(v: &Value) -> Option<u128> {
    match v {
        Value::String(s) if !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()) => s.parse().ok(),
        Value::Number(n) => n.as_u64().map(u128::from),
        _ => None,
    }
}

/// One `vault_read` answer.
#[derive(Debug, PartialEq, Eq)]
pub struct VaultRead {
    pub units: u128,
    pub authority: String,
    pub depositor: String,
    pub slot_or_block: String,
}

/// OutLayer `vault_read` stdout (WO-24): `{"position_id","units","authority","depositor","slot_or_block"}`;
/// numbers may be JSON numbers or decimal strings. `null` (failed run) and `{"error":..}` are failures.
pub fn parse_vault_read(raw: &[u8], position_id: u64) -> Result<VaultRead, &'static str> {
    let v: Value = serde_json::from_slice(raw).map_err(|_| "parse")?;
    if v.is_null() {
        return Err("no_result");
    }
    if v.get("error").is_some() {
        return Err("job_error");
    }
    if u128_of(&v["position_id"]) != Some(u128::from(position_id)) {
        return Err("position_mismatch");
    }
    // WO-24: `{"position_id":"<id>","found":false}` when the vault has no position PDA yet.
    if v.get("found").and_then(Value::as_bool) == Some(false) {
        return Err("not_found");
    }
    let units = u128_of(&v["units"]).ok_or("bad_units")?;
    let authority = v["authority"].as_str().ok_or("bad_authority")?.to_string();
    let depositor = v["depositor"].as_str().ok_or("bad_depositor")?.to_string();
    let slot_or_block = match &v["slot_or_block"] {
        Value::Number(n) => n.to_string(),
        Value::String(s) if valid_tx_ref(s) => s.clone(),
        _ => return Err("bad_slot"),
    };
    if authority.len() > MAX_STRING_LEN || depositor.len() > MAX_STRING_LEN {
        return Err("too_long");
    }
    Ok(VaultRead { units, authority, depositor, slot_or_block })
}

impl Nectar {
    pub(crate) fn allow_keeper_attest(&self) -> bool {
        env::storage_read(ALLOW_KEEPER_ATTEST_KEY).as_deref() == Some(&[1u8][..])
    }
    pub(crate) fn vault_read_config(&self) -> Option<VaultReadConfig> {
        env::storage_read(VAULT_READ_KEY).and_then(|b| near_sdk::borsh::from_slice(&b).ok())
    }
    pub(crate) fn release(&self, position_id: u64) -> Option<PendingRelease> {
        env::storage_read(&release_key(position_id))
            .and_then(|b| near_sdk::borsh::from_slice::<VRelease>(&b).ok())
            .map(|VRelease::V1(d)| d)
    }
    fn put_release(&mut self, d: PendingRelease) {
        let b = near_sdk::borsh::to_vec(&VRelease::V1(d.clone())).unwrap_or_else(|_| env::panic_str("borsh"));
        env::storage_write(&release_key(d.position_id.0), &b);
    }
    fn gas_left() -> u64 {
        env::prepaid_gas().as_gas().saturating_sub(env::used_gas().as_gas())
    }
    /// SR-8: the depositor committed at reservation; `None` for a reservation made before 2.2.
    pub(crate) fn committed_depositor(&self, position_id: u64) -> Option<String> {
        env::storage_read(&committed_key(position_id)).and_then(|b| String::from_utf8(b).ok())
    }
    /// SR-5: (sum, largest) `remaining` of the live, non-exiting quotes whose recipient fits `domain_id`. <= 64 reads.
    pub(crate) fn remote_capacity(&self, symbol: &str, domain_id: u32) -> Result<(u128, u128), &'static str> {
        let (mut sum, mut largest) = (0u128, 0u128);
        for id in self.live_ids(symbol) {
            let Some(q) = self.quote(id) else { continue };
            let rem = q.remaining_usd_e6.0;
            if rem == 0 || q.exiting() || q.collateral != symbol {
                continue;
            }
            if q.buyer_remote_recipient.as_deref().is_some_and(|x| chainsig::recipient_fits(domain_id, x)) {
                sum = math::add(sum, rem)?;
                largest = largest.max(rem);
            }
        }
        Ok((sum, largest))
    }
    /// SR-5: <= 8 quotes that can settle this remote position alone, ascending discount then oldest. Unfit quotes are
    /// dropped before the cut, so they cannot take a candidate slot. The cheap checks run before the curve check.
    pub(crate) fn select_remote_quotes(&self, p: &Position, domain_id: u32, c: &CollateralConfig) -> Vec<(u16, u64)> {
        let (debt, units) = (p.debt_usd_e6.0, p.units.0);
        let (m, price) = (Self::eff_multiplier(c), c.oracle_price_usd_e6.0);
        let mut closing: Vec<(u16, u64, String)> = Vec::new();
        for id in self.live_ids(&p.collateral) {
            let Some(q) = self.quote(id) else { continue };
            let rem = q.remaining_usd_e6.0;
            if rem == 0 || q.collateral != p.collateral {
                continue;
            }
            let closes = matches!(
                math::settle_leg_m(debt, rem, units, m, price, c.decimals, q.max_discount_bps, 0),
                Ok(Some(leg)) if remote_leg_seize(&leg, debt, units, rem).is_some()
            );
            if let (true, Some(rcpt)) = (closes, q.buyer_remote_recipient) {
                closing.push((q.max_discount_bps, id, rcpt));
            }
        }
        closing.sort_unstable();
        // lazy: the curve check stops once 8 candidates fit
        closing
            .into_iter()
            .filter(|(_, _, rcpt)| chainsig::recipient_fits(domain_id, rcpt))
            .take(MAX_QUOTES_PER_SETTLEMENT)
            .map(|(disc, id, _)| (disc, id))
            .collect()
    }
    fn remote_or_panic(p: &Position) -> RemoteInfo {
        p.remote.clone().unwrap_or_else(|| env::panic_str("not a remote position"))
    }

    /// Effect half of the reservation-deposit refund: zeroes the held deposit and returns what to send.
    /// The caller writes the position, then calls `send_reservation_refund` (CEI).
    pub(crate) fn take_reservation_deposit(r: &mut RemoteInfo) -> u128 {
        let amt = r.deposit_yocto.0;
        r.deposit_yocto = U128(0);
        amt
    }
    pub(crate) fn send_reservation_refund(position_id: u64, borrower: &AccountId, amount: u128, reason: &str) {
        if amount == 0 {
            return;
        }
        emit(
            "reservation_deposit_refunded",
            json!({ "position_id": U64(position_id), "account_id": borrower, "amount_yocto": U128(amount),
                    "reason": reason }),
        );
        Promise::new(borrower.clone()).transfer(NearToken::from_yoctonear(amount)).detach();
    }

    /// A deposit is proven (attested read or keeper attestation): record it, then pay the loan if both limits
    /// still hold with a fresh price. Never panics on business failures (callback path). SR-18: `short` = the proven
    /// units are below the reserved units: recorded so they can be released, loan refused, no retry (no vault top-up).
    pub(crate) fn accept_deposit(
        &mut self,
        mut p: Position,
        units: u128,
        depositor: String,
        source: &str,
        deposit_ref: String,
        short: bool,
    ) {
        let id = p.position_id.0;
        let Some(mut r) = p.remote.take() else { return };
        let now = env::block_timestamp();
        let late = r.status == RemoteStatus::Expired || now >= r.expires_ns.0;
        r.depositor = Some(depositor.clone());
        r.source = Some(source.to_string());
        r.deposit_ref = Some(deposit_ref.clone());
        r.units = U128(units);
        p.units = U128(units);
        let borrow = r.borrow_usd_e6.0;
        let c = self.coll_or_panic(&p.collateral);
        let referrer = r.referrer.clone().filter(|x| self.referrers.contains(x));
        // WO-23a: a proven deposit (funded or refused) returns the reservation deposit.
        let refund = Self::take_reservation_deposit(&mut r);
        let refusal = if short {
            Some("units_below_reserved")
        } else if late {
            Some("reservation_expired")
        } else if self.paused {
            Some("paused")
        } else if c.ca_pending {
            Some(ERR_CA_PENDING)
        } else if !self.oracle_fresh(&c) {
            Some("oracle stale")
        } else if p.shield.is_some_and(|s| now >= s.window_end_ns.0) {
            Some("shield_window_over")
        } else {
            None
        };
        let terms = match refusal {
            Some(e) => Err(e),
            None => self.remote_capacity(&p.collateral, r.domain_id).and_then(|cap| {
                self.check_borrow(
                    &c,
                    units,
                    borrow,
                    Some(p.pre_liq_ltv_bps),
                    referrer.is_some(),
                    p.shield.map(|s| s.fee_bps),
                    Some(cap),
                )
            }),
        };
        let entry_m = c.multiplier_e18;
        let booked = match terms {
            Ok(t) => self.book_borrow(c, &t, borrow, &referrer).map(|_| t),
            Err(e) => Err(e),
        };
        emit(
            "remote_deposit_confirmed",
            json!({ "position_id": U64(id), "units": U128(units), "depositor": depositor, "source": source,
                    "deposit_ref": deposit_ref, "funded": booked.is_ok() }),
        );
        match booked {
            Ok(t) => {
                p.debt_usd_e6 = U128(borrow);
                p.premium_usd_e6 = U128(t.premium);
                p.opened_ns = U64(now);
                p.entry_multiplier_e18 = entry_m;
                p.status = PositionStatus::Open;
                r.status = RemoteStatus::Open;
                r.paid_usd_e6 = U128(t.net);
                let pay_to = r.pay_to.clone();
                p.remote = Some(r);
                let borrower = p.borrower.clone();
                let collateral = p.collateral.clone();
                let shield = p.shield;
                self.put_position(p);
                self.emit_opened(id, &borrower, &collateral, units, borrow, &t, pay_to.as_ref(), &referrer, true);
                self.mint_note(crate::notes::position_note_id(id), &borrower);
                if let Some(s) = &shield {
                    self.emit_shield_opened(id, &borrower, &collateral, s, t.premium, true);
                }
                self.pay_proceeds(id, &borrower, t.net, pay_to);
                Self::send_reservation_refund(id, &borrower, refund, "confirmed");
            }
            Err(reason) => {
                // The collateral is in the vault under our key: it stays releasable (debt 0). Before expiry the
                // borrower may retry the confirmation; after it, or for a short deposit, the position is Open with no loan.
                if late || short {
                    r.status = RemoteStatus::Open;
                    p.status = PositionStatus::Open;
                }
                emit("remote_loan_refused", json!({ "position_id": U64(id), "reason": reason }));
                p.remote = Some(r);
                let borrower = p.borrower.clone();
                self.put_position(p);
                Self::send_reservation_refund(id, &borrower, refund, "loan_refused");
            }
        }
    }

    /// One signed leg for a remote position (v2 settle preimage + `|kind=PRELIQ`, the position's own path).
    /// Only quotes with a valid `buyer_remote_recipient` fill it, and the leg must leave the debt or the units at
    /// 0, because the vault closes the position on settle. No keeper share in collateral. `Err` = nothing written.
    pub(crate) fn settle_remote(
        &mut self,
        position_id: U64,
        mut p: Position,
        mut c: CollateralConfig,
        cands: &[(u16, u64)],
    ) -> Result<(), &'static str> {
        let r = p.remote.clone().ok_or("not a remote position")?;
        if r.status != RemoteStatus::Open {
            return Err("remote position not open");
        }
        if r.domain_id != chainsig::ED25519_DOMAIN_ID && r.domain_id != chainsig::SECP256K1_DOMAIN_ID {
            return Err("remote settle: domain not supported");
        }
        let s = self.signer_config().ok_or("no signer config")?;
        if self.settle_in_flight(position_id.0) {
            return Err("remote settlement in flight");
        }
        let price = c.oracle_price_usd_e6.0;
        let m = Self::eff_multiplier(&c);
        let acc = c.acc_fee_per_dollar_e18.0;
        let debt = p.debt_usd_e6.0;
        let units = p.units.0;
        let mut chosen: Option<(Quote, math::Leg, String)> = None;
        for &(disc, qid) in cands.iter().take(MAX_QUOTES_PER_SETTLEMENT) {
            let Some(q) = self.quote(qid) else { continue };
            if q.remaining_usd_e6.0 == 0 || q.collateral != p.collateral {
                continue;
            }
            // WO-29a: a 0x recipient fills EVM positions only, a base58 one Solana positions only
            let Some(rcpt) = q.buyer_remote_recipient.clone().filter(|x| chainsig::recipient_fits(r.domain_id, x)) else {
                continue;
            };
            let Some(leg) = math::settle_leg_m(debt, q.remaining_usd_e6.0, units, m, price, c.decimals, disc, 0)? else {
                continue;
            };
            // SR-10: rounding can leave dust units in the underwater branch; the leg then seizes every unit.
            if let Some(buyer_units) = remote_leg_seize(&leg, debt, units, q.remaining_usd_e6.0) {
                chosen = Some((q, math::Leg { buyer_units, ..leg }, rcpt));
                break;
            }
        }
        let (mut q, leg, rcpt) = chosen.ok_or("no remote quote capacity")?;
        if leg.repay_usd_e6 > U64_MAX || leg.buyer_units > U64_MAX {
            return Err("amount exceeds u64");
        }
        let reserve = math::sub(self.gas_reserve_yocto, 1).map_err(|_| "gas reserve empty")?;
        Self::check_sign_gas(&s)?;
        Self::checkpoint_fees(&mut q, acc)?;
        let q_c = if q.exiting() {
            c.active_committed_q_usd_e6.0
        } else {
            math::sub(c.active_committed_q_usd_e6.0, leg.repay_usd_e6)?
        };
        q.remaining_usd_e6 = U128(math::sub(q.remaining_usd_e6.0, leg.repay_usd_e6)?);
        Self::reset_fee_debt(&mut q, acc)?;
        let debt_after = math::sub(debt, leg.repay_usd_e6)?;
        let units_after = math::sub(units, leg.buyer_units)?;
        // A1: the leg's repayment leaves the aggregate now; `rollback_leg` re-adds it on a sign failure.
        let total_debt = math::sub(c.total_debt_usd_e6.0, leg.repay_usd_e6)?;
        p.debt_usd_e6 = U128(debt_after);
        p.units = U128(units_after);
        p.status = PositionStatus::Settling; // until relay_settlement_result (or sign failure)
        if let Some(pr) = p.remote.as_mut() {
            pr.status = RemoteStatus::Settling;
        }

        // effects (record_remote_leg writes nothing on Err)
        let call = self.record_remote_leg(
            &mut p,
            &r,
            &s,
            RemoteLeg {
                quote_id: q.quote_id.0,
                repay_usd_e6: leg.repay_usd_e6,
                buyer_units: leg.buyer_units,
                keeper_units: 0,
                recipient: rcpt,
                kind: chainsig::KIND_PRELIQ,
                fee_usd_e6: 0,
            },
        )?;
        if q.remaining_usd_e6.0 == 0 {
            self.remove_live(&p.collateral, q.quote_id.0);
        }
        self.put_quote(q);
        self.gas_reserve_yocto = reserve;
        c.active_committed_q_usd_e6 = U128(q_c);
        c.total_debt_usd_e6 = U128(total_debt);
        self.put_coll(c);
        self.put_position(p);
        // interaction
        Self::schedule_sign(call);
        Ok(())
    }

    /// WO-23a Profit-Lock on a remote position: one opted-in quote with a Solana recipient pays `debt + fee`; the
    /// vault pays `units_repaid` to it and the rest to the depositor. Preimage `repay_e6` = the debt repaid,
    /// `|kind=SELF`, the position's path. Debt leaves the aggregate now; the pool (debt) and the treasury (fee) are
    /// credited when the signature arrives, and a sign failure rolls the leg back. `Err` = nothing written.
    pub(crate) fn self_settle_remote(
        &mut self,
        position_id: U64,
        mut p: Position,
        mut c: CollateralConfig,
        plan: crate::shields::SelfPlan,
    ) -> Result<(), &'static str> {
        let r = p.remote.clone().ok_or("not a remote position")?;
        if r.domain_id != chainsig::ED25519_DOMAIN_ID && r.domain_id != chainsig::SECP256K1_DOMAIN_ID {
            return Err("remote settle: domain not supported");
        }
        let s = self.signer_config().ok_or("no signer config")?;
        if self.settle_in_flight(position_id.0) {
            return Err("remote settlement in flight");
        }
        let &(qid, _, fill, units) = plan.legs.first().ok_or(crate::shields::ERR_NO_VOLUNTARY)?;
        let rcpt = plan.recipient.clone().ok_or(crate::shields::ERR_NO_VOLUNTARY)?;
        if plan.debt > U64_MAX || units > U64_MAX {
            return Err("amount exceeds u64");
        }
        let reserve = math::sub(self.gas_reserve_yocto, 1).map_err(|_| "gas reserve empty")?;
        Self::check_sign_gas(&s)?;
        let acc = c.acc_fee_per_dollar_e18.0;
        let mut q = self.quote(qid).ok_or("unknown quote")?;
        Self::checkpoint_fees(&mut q, acc)?;
        let q_c = if q.exiting() {
            c.active_committed_q_usd_e6.0
        } else {
            math::sub(c.active_committed_q_usd_e6.0, fill)?
        };
        q.remaining_usd_e6 = U128(math::sub(q.remaining_usd_e6.0, fill)?);
        Self::reset_fee_debt(&mut q, acc)?;
        let total_debt = math::sub(c.total_debt_usd_e6.0, plan.debt)?;
        let filled = math::add(plan.used_today, plan.fill)?;
        p.debt_usd_e6 = U128(0);
        p.units = U128(math::sub(p.units.0, units)?);
        p.status = PositionStatus::Settling;
        if let Some(pr) = p.remote.as_mut() {
            pr.status = RemoteStatus::Settling;
        }
        // effects (record_remote_leg writes nothing on Err)
        let call = self.record_remote_leg(
            &mut p,
            &r,
            &s,
            RemoteLeg {
                quote_id: qid,
                repay_usd_e6: plan.debt,
                buyer_units: units,
                keeper_units: 0,
                recipient: rcpt,
                kind: chainsig::KIND_SELF,
                fee_usd_e6: plan.fee,
            },
        )?;
        if q.remaining_usd_e6.0 == 0 {
            self.remove_live(&p.collateral, qid);
        }
        self.put_quote(q);
        self.gas_reserve_yocto = reserve;
        c.active_committed_q_usd_e6 = U128(q_c);
        c.total_debt_usd_e6 = U128(total_debt);
        c.voluntary_day = plan.day;
        c.voluntary_filled_today_e6 = U128(filled);
        self.put_coll(c);
        let borrower = p.borrower.clone();
        self.put_position(p);
        self.emit_self_settled(position_id, &borrower, &plan, true);
        // interaction
        Self::schedule_sign(call);
        Ok(())
    }
}

#[near]
impl Nectar {
    // ------------------------------------------------------------ 1. reserve
    /// Borrower, attaches `RESERVE_DEPOSIT_YOCTO` (0.05 NEAR; less is refused, the whole attachment is held and
    /// refunded on confirm, refused loan, failed authority or expiry). Reserves a remote position
    /// (`AwaitingDeposit`) and asks the signer for the position's vault authority. Limits run at confirmation,
    /// not here (a reservation locks no pool funds). A `shield` is validated and counted here (§4.9).
    /// WO-29a: `chain` (optional) selects the remote chain by id (`"base-sepolia"`); `None` = the primary chain.
    /// SR-8: `depositor` is the borrower's remote address; only a deposit from it can confirm this reservation.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn reserve_remote_position(
        &mut self,
        collateral: String,
        units: U128,
        borrow_usd_e6: U128,
        pre_liq_ltv_bps: u16,
        pay_to: Option<PayTo>,
        referrer: Option<AccountId>,
        shield: Option<ShieldInput>,
        chain: Option<String>,
        depositor: String,
    ) -> U64 {
        self.assert_not_paused();
        let borrower = env::predecessor_account_id();
        require!(referrer.as_ref() != Some(&borrower), ERR_REFERRER_IS_BORROWER);
        let c = self.coll_or_panic(&collateral);
        let rc = self.select_remote_chain(&c, chain.as_deref());
        let s = self.signer_config().unwrap_or_else(|| env::panic_str("no signer config"));
        require!(units.0 > 0, "units is zero");
        require!(units.0 <= U64_MAX, "units exceed u64");
        require!(borrow_usd_e6.0 > 0, "borrow is zero");
        require!(borrow_usd_e6.0 <= U64_MAX, "borrow exceeds u64");
        require!(valid_depositor(&depositor, rc.mpc_domain_id), "bad depositor");
        require!(
            (c.pre_liq_min_bps..=c.pre_liq_max_bps).contains(&pre_liq_ltv_bps),
            "pre_liq_ltv_bps out of range"
        );
        if let Err(e) = Self::validate_string(&pay_to.as_ref().and_then(|p| p.memo.clone())) {
            env::panic_str(e);
        }
        require!(
            Self::gas_left() >= GAS_DERIVE_KEY.as_gas() + GAS_ON_AUTHORITY.as_gas() + GAS_CREATE_RECEIPTS.as_gas(),
            "attach more gas"
        );
        let shield = shield.map(|s| self.validate_shield(&c, &s, borrow_usd_e6.0, &borrower).unwrap_or_else(|e| env::panic_str(e)));
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit >= RESERVE_DEPOSIT_YOCTO, "attach the reservation deposit (0.05 NEAR)");
        // SR-5: refuse before the borrower deposits a loan no single fitting quote could settle. This check needs no
        // price; the full sizing runs at confirmation, against the quotes and the price of that moment.
        let settleable = self.live_ids(&collateral).into_iter().filter_map(|id| self.quote(id)).any(|q| {
            q.remaining_usd_e6.0 >= borrow_usd_e6.0
                && !q.exiting()
                && q.buyer_remote_recipient.as_deref().is_some_and(|x| chainsig::recipient_fits(rc.mpc_domain_id, x))
        });
        require!(settleable, ERR_REMOTE_SETTLE_CAP);
        let id = self.next_position_id;
        let next = id.checked_add(1).unwrap_or_else(|| env::panic_str(math::ERR_OVERFLOW));
        let path = chainsig::position_path(&rc.chain_id, id);
        require!(chainsig::valid_path(&path), "bad path");
        let now = env::block_timestamp();
        let expires_ns = now
            .checked_add(RESERVATION_EXPIRY_S * SEC)
            .unwrap_or_else(|| env::panic_str(math::ERR_OVERFLOW));
        // effects
        self.next_position_id = next;
        if shield.is_some() {
            self.note_shield_open(&borrower);
        }
        self.put_position(Position {
            position_id: U64(id),
            borrower: borrower.clone(),
            collateral: collateral.clone(),
            units: U128(0),
            debt_usd_e6: U128(0),
            premium_usd_e6: U128(0),
            pre_liq_ltv_bps,
            opened_ns: U64(now),
            remote_path: Some(path.clone()),
            nonce: U64(id),
            status: PositionStatus::Open,
            entry_multiplier_e18: c.multiplier_e18,
            remote: Some(RemoteInfo {
                chain_id: rc.chain_id.clone(),
                vault_program: rc.vault_program.clone(),
                domain_id: rc.mpc_domain_id,
                path: path.clone(),
                authority: None,
                status: RemoteStatus::AwaitingDeposit,
                reserved_units: units,
                units,
                borrow_usd_e6,
                paid_usd_e6: U128(0),
                reserved_ns: U64(now),
                pay_to,
                referrer,
                expires_ns: U64(expires_ns),
                depositor: None,
                source: None,
                deposit_ref: None,
                confirming: false,
                last_confirm_ns: U64(0),
                deposit_yocto: U128(deposit),
                committed_depositor: None,
            }),
            shield,
        });
        env::storage_write(&committed_key(id), depositor.as_bytes());
        emit(
            "remote_reserved",
            json!({ "position_id": U64(id), "borrower": borrower, "collateral": collateral, "chain": rc.chain_id,
                    "vault_program": rc.vault_program, "path": path, "domain_id": rc.mpc_domain_id,
                    "units": units, "borrow_usd_e6": borrow_usd_e6, "expires_ns": U64(expires_ns),
                    "deposit_yocto": U128(deposit), "shield": shield, "depositor": depositor }),
        );
        // interaction (F-338: always pass predecessor and domain_id)
        let args = json!({ "path": path, "predecessor": env::current_account_id(), "domain_id": rc.mpc_domain_id });
        Promise::new(s.account)
            .function_call("derived_public_key", args.to_string().into_bytes(), NearToken::from_yoctonear(0), GAS_DERIVE_KEY)
            .then(Promise::new(env::current_account_id()).function_call(
                "on_authority",
                json!({ "position_id": U64(id) }).to_string().into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_ON_AUTHORITY,
            ))
            .detach();
        U64(id)
    }

    /// `derived_public_key` callback: stores the vault authority. A failed or malformed answer ends the reservation.
    #[private]
    pub fn on_authority(&mut self, position_id: U64) {
        let Some(mut p) = self.position(position_id.0) else { return };
        let Some(mut r) = p.remote.clone() else { return };
        if r.authority.is_some() || r.status != RemoteStatus::AwaitingDeposit {
            return;
        }
        let res: Result<String, &'static str> = if env::promise_results_count() != 1 {
            Err("no_result")
        } else {
            match env::promise_result_checked(0, MAX_DERIVED_KEY_LEN) {
                Ok(b) => serde_json::from_slice::<String>(&b)
                    .map_err(|_| "parse")
                    .and_then(|k| chainsig::authority_from_derived_key(&k, r.domain_id)),
                Err(PromiseError::TooLong(_)) => Err("too_long"),
                Err(_) => Err("failed"),
            }
        };
        let mut refund = 0;
        match res {
            Ok(a) => {
                emit(
                    "remote_authority_set",
                    json!({ "position_id": position_id, "path": r.path, "domain_id": r.domain_id, "authority": a }),
                );
                r.authority = Some(a);
            }
            Err(reason) => {
                r.status = RemoteStatus::Expired;
                p.status = PositionStatus::Closed;
                refund = Self::take_reservation_deposit(&mut r);
                emit("remote_reservation_failed", json!({ "position_id": position_id, "reason": reason }));
            }
        }
        p.remote = Some(r);
        let borrower = p.borrower.clone();
        self.put_position(p);
        Self::send_reservation_refund(position_id.0, &borrower, refund, "authority_failed");
    }

    /// Anyone, once the reservation is 30 min old without a recorded deposit.
    pub fn expire_remote_reservation(&mut self, position_id: U64) {
        let mut p = self.position_or_panic(position_id.0);
        let mut r = Self::remote_or_panic(&p);
        require!(r.status == RemoteStatus::AwaitingDeposit, "not awaiting deposit");
        require!(env::block_timestamp() >= r.expires_ns.0, "reservation not expired");
        require!(!r.confirming, "deposit check in flight");
        require!(r.depositor.is_none(), "deposit recorded: request_remote_release");
        r.status = RemoteStatus::Expired;
        p.status = PositionStatus::Closed;
        let refund = Self::take_reservation_deposit(&mut r);
        p.remote = Some(r);
        let borrower = p.borrower.clone();
        self.put_position(p);
        emit("remote_reservation_expired", json!({ "position_id": position_id }));
        // interaction: the deposit goes back to the borrower, whoever expires it
        Self::send_reservation_refund(position_id.0, &borrower, refund, "expired");
    }

    // ------------------------------------------------------------ 2. confirm
    /// Anyone (the keeper key included). OutLayer `vault_read` (WO-24) `.then(on_deposit_verified)`. Accepted on an
    /// expired reservation too, so a late deposit can be proven and released (no loan then).
    pub fn confirm_remote_deposit(&mut self, position_id: U64) {
        self.assert_not_paused();
        let mut p = self.position_or_panic(position_id.0);
        let mut r = Self::remote_or_panic(&p);
        require!(
            matches!(r.status, RemoteStatus::AwaitingDeposit | RemoteStatus::Expired),
            "not awaiting deposit"
        );
        require!(r.authority.is_some(), "authority pending");
        require!(!r.confirming, "deposit check in flight");
        let now = env::block_timestamp();
        require!(
            r.last_confirm_ns.0 == 0 || now >= r.last_confirm_ns.0.saturating_add(CONFIRM_COOLDOWN_S * SEC),
            "confirm cooldown"
        );
        let cfg = self.vault_read_config().unwrap_or_else(|| env::panic_str("vault_read not configured"));
        require!(self.gas_reserve_yocto >= cfg.deposit_yocto, "gas reserve empty");
        let exec_gas = Gas::from_tgas(cfg.gas_tgas);
        let cb_gas = GAS_ON_DEPOSIT_BASE.as_gas() + Self::per_transfer_gas();
        require!(
            Self::gas_left() >= exec_gas.as_gas() + cb_gas + GAS_CREATE_RECEIPTS.as_gas(),
            "attach more gas"
        );
        // WO-29a: an EVM vault is read over the chain's RPC (`vault_read` job, Base input shape).
        let mut input = if r.domain_id == chainsig::SECP256K1_DOMAIN_ID {
            let rpc = self.chain_rpc_url(&p.collateral, &r.chain_id).unwrap_or_else(|| env::panic_str(evm::ERR_NO_RPC));
            json!({ "job": "vault_read", "chain": r.chain_id, "vault": r.vault_program, "position_id": position_id,
                    "rpc_url": rpc })
        } else {
            json!({ "job": "vault_read", "chain": r.chain_id, "program": r.vault_program, "position_id": position_id })
        };
        // SR-8: the slot is keyed by the depositor too.
        if let Some(d) = self.committed_depositor(position_id.0) {
            input["depositor"] = json!(d);
        }
        let input = input.to_string();
        let q = &self.quoter;
        let args = json!({
            "source": { "Project": { "project_id": cfg.project_id, "version_key": cfg.version_key } },
            "resource_limits": { "max_instructions": q.max_instructions, "max_memory_mb": q.max_memory_mb,
                                 "max_execution_seconds": q.max_execution_seconds },
            "input_data": input,
            "response_format": "Json",
            "payer_account_id": env::current_account_id(),
        })
        .to_string();
        let outlayer = q.outlayer_account.clone();
        // effects
        self.gas_reserve_yocto = math::sub(self.gas_reserve_yocto, cfg.deposit_yocto).unwrap_or_else(|e| env::panic_str(e));
        r.confirming = true;
        r.last_confirm_ns = U64(now);
        p.remote = Some(r);
        self.put_position(p);
        emit(
            "remote_deposit_check_requested",
            json!({ "position_id": position_id, "input": input, "deposit_yocto": U128(cfg.deposit_yocto) }),
        );
        // interaction
        Promise::new(outlayer)
            .function_call("request_execution", args.into_bytes(), NearToken::from_yoctonear(cfg.deposit_yocto), exec_gas)
            .then(Promise::new(env::current_account_id()).function_call_weight(
                "on_deposit_verified",
                json!({ "position_id": position_id }).to_string().into_bytes(),
                NearToken::from_yoctonear(0),
                Gas::from_gas(cb_gas),
                GasWeight(1),
            ))
            .detach();
    }

    /// OutLayer callback (F-048). Never panics on business failures.
    #[private]
    pub fn on_deposit_verified(&mut self, position_id: U64) {
        let Some(mut p) = self.position(position_id.0) else { return };
        let Some(mut r) = p.remote.clone() else { return };
        if !r.confirming {
            return;
        }
        r.confirming = false;
        let read = if env::promise_results_count() != 1 {
            Err("no_result")
        } else {
            match env::promise_result_checked(0, MAX_VAULT_READ_LEN) {
                Ok(b) => parse_vault_read(&b, position_id.0),
                Err(PromiseError::TooLong(_)) => Err("too_long"),
                Err(_) => Err("failed"),
            }
        };
        let committed = self.committed_depositor(position_id.0);
        let checked = read.and_then(|v| {
            let stored = r.authority.as_deref().ok_or("authority_pending")?;
            if !chainsig::authority_matches(stored, &v.authority) {
                return Err("authority_mismatch");
            }
            if !valid_depositor(&v.depositor, r.domain_id) {
                return Err("bad_depositor");
            }
            // SR-8: only the committed depositor's slot proves this deposit; a squatter's slot is never recorded.
            if committed.as_deref().is_some_and(|c| !depositor_matches(c, &v.depositor, r.domain_id)) {
                return Err("depositor_mismatch");
            }
            if v.units == 0 {
                return Err("units_below_reserved");
            }
            if v.units > U64_MAX {
                return Err("units_exceed_u64");
            }
            Ok(v)
        });
        match checked {
            Ok(v) => {
                // SR-18: a proven deposit below the reserved units is recorded, so it stays releasable.
                let short = v.units < r.reserved_units.0;
                p.remote = Some(r);
                self.accept_deposit(p, v.units, v.depositor, SOURCE_OUTLAYER, v.slot_or_block, short);
            }
            Err(reason) => {
                emit(
                    "remote_deposit_rejected",
                    json!({ "position_id": position_id, "reason": reason, "source": SOURCE_OUTLAYER }),
                );
                p.remote = Some(r);
                self.put_position(p);
            }
        }
    }

    /// Testnet fallback (PRD §9B): keeper only, only while `allow_keeper_deposit_attestation` is set. The same
    /// checks without the attested read; the reserved units are taken as deposited. Not payable.
    pub fn keeper_attest_deposit(&mut self, position_id: U64, tx_ref: String, depositor: String) {
        self.assert_not_paused();
        require!(env::predecessor_account_id() == self.keeper, ERR_KEEPER);
        require!(self.allow_keeper_attest(), "keeper attestation disabled");
        let p = self.position_or_panic(position_id.0);
        let r = Self::remote_or_panic(&p);
        require!(
            matches!(r.status, RemoteStatus::AwaitingDeposit | RemoteStatus::Expired),
            "not awaiting deposit"
        );
        require!(r.authority.is_some(), "authority pending");
        require!(!r.confirming, "deposit check in flight");
        require!(valid_tx_ref(&tx_ref), "bad tx_ref");
        require!(valid_depositor(&depositor, r.domain_id), "bad depositor");
        // SR-8: the attestation must name the committed depositor.
        if let Some(c) = self.committed_depositor(position_id.0) {
            require!(depositor_matches(&c, &depositor, r.domain_id), "depositor mismatch");
        }
        let units = r.reserved_units.0;
        self.accept_deposit(p, units, depositor, SOURCE_KEEPER, tx_ref, false);
    }

    // ------------------------------------------------------------ 4. release
    /// Anyone, after debt = 0 and a recorded deposit: signs `NECTAR_RELEASE_V1` (raw bytes, Eddsa, the position's
    /// path, 1 yocto from `gas_reserve_yocto`) to the depositor. Re-requestable only after a sign failure or once a
    /// signed release has expired unrelayed (fresh nonce). Not payable.
    pub fn request_remote_release(&mut self, position_id: U64) {
        self.assert_not_paused();
        let mut p = self.position_or_panic(position_id.0);
        let mut r = Self::remote_or_panic(&p);
        require!(
            r.domain_id == chainsig::ED25519_DOMAIN_ID || r.domain_id == chainsig::SECP256K1_DOMAIN_ID,
            "release: domain not supported"
        );
        require!(p.debt_usd_e6.0 == 0, "debt outstanding");
        require!(!r.confirming, "deposit check in flight");
        require!(!self.settle_in_flight(position_id.0), "remote settlement in flight");
        let depositor = r.depositor.clone().unwrap_or_else(|| env::panic_str("no deposit recorded"));
        let now_s = env::block_timestamp() / SEC;
        match r.status {
            RemoteStatus::Open | RemoteStatus::AwaitingDeposit | RemoteStatus::Expired => {}
            RemoteStatus::Releasing => {
                let d = self.release(position_id.0).unwrap_or_else(|| env::panic_str("no pending release"));
                require!(
                    d.status == ReleaseStatus::SignFailed || (d.status == ReleaseStatus::Signed && now_s >= d.expires.0),
                    "release pending"
                );
            }
            RemoteStatus::Settling => env::panic_str("remote position settling"),
            RemoteStatus::Closed => env::panic_str("remote position closed"),
        }
        let s = self.signer_config().unwrap_or_else(|| env::panic_str("no signer config"));
        require!(self.gas_reserve_yocto >= 1, "gas reserve empty");
        let need = Gas::from_tgas(s.gas_tgas).as_gas() + GAS_ON_RELEASE_SIG.as_gas() + GAS_CREATE_RECEIPTS.as_gas();
        require!(Self::gas_left() >= need, "attach more gas");
        let nonce = self.next_nonce();
        let expires = now_s.checked_add(s.expiry_s).unwrap_or_else(|| env::panic_str("expiry overflow"));
        // WO-29a: an EVM position signs the EIP-712 `Release` digest; `message` holds `0x<digest>`.
        let (message, args, evm_rec) = if r.domain_id == chainsig::SECP256K1_DOMAIN_ID {
            let (digest, rec) = evm::release_digest_for(&r, position_id.0, &depositor, nonce, expires)
                .unwrap_or_else(|e| env::panic_str(e));
            (evm::hex0x(&digest), evm::ecdsa_sign_args(&r.path, &digest, r.domain_id), Some(rec))
        } else {
            let message = chainsig::build_release_preimage(&r.chain_id, &r.vault_program, position_id.0, &depositor, nonce, expires);
            require!(message.len() <= chainsig::MAX_EDDSA_PAYLOAD, "message too long");
            let args = sign_args(&r.path, &message, r.domain_id);
            (message, args, None)
        };
        // effects
        self.take_nonce().unwrap_or_else(|e| env::panic_str(e));
        self.gas_reserve_yocto -= 1;
        if let Some(rec) = evm_rec {
            self.put_evm_record(evm::EVM_RELEASE_PREFIX, position_id.0, rec);
        }
        let chain_id = r.chain_id.clone();
        let path = r.path.clone();
        r.status = RemoteStatus::Releasing;
        p.remote = Some(r);
        self.put_position(p);
        emit(
            "remote_release_requested",
            json!({ "position_id": position_id, "nonce": U64(nonce), "expires": U64(expires), "message": message,
                    "recipient": depositor, "path": path, "chain": chain_id }),
        );
        self.put_release(PendingRelease {
            position_id,
            message,
            signature_hex: None,
            nonce: U64(nonce),
            expires: U64(expires),
            recipient: depositor,
            status: ReleaseStatus::AwaitingSignature,
            solana_tx_sig: None,
        });
        // interaction
        Self::schedule_sign(SignCall {
            account: s.account,
            args,
            cb_method: "on_release_signature",
            cb: json!({ "position_id": position_id, "nonce": U64(nonce) }).to_string(),
            gas: Gas::from_tgas(s.gas_tgas),
            cb_gas: GAS_ON_RELEASE_SIG,
        });
    }

    /// MPC `sign` callback of a release (F-035). Never panics on business failures.
    #[private]
    pub fn on_release_signature(&mut self, position_id: U64, nonce: U64) {
        let Some(mut d) = self.release(position_id.0) else { return };
        if d.nonce != nonce || d.status != ReleaseStatus::AwaitingSignature {
            return;
        }
        let domain = self.remote_domain(position_id.0);
        let sig = if env::promise_results_count() != 1 {
            Err("no_result")
        } else {
            match env::promise_result_checked(0, crate::p2::MAX_SIGNATURE_RESULT_LEN) {
                Ok(b) => evm::parse_sign_result(&b, domain),
                Err(PromiseError::TooLong(_)) => Err("too_long"),
                Err(_) => Err("failed"),
            }
        };
        match sig {
            Ok((signature_hex, evm_sig)) => {
                let (path, authority, chain) = self
                    .position(position_id.0)
                    .and_then(|p| p.remote)
                    .map_or((None, None, None), |r| (Some(r.path), r.authority, Some(r.chain_id)));
                let mut ev = json!({ "position_id": position_id, "nonce": nonce, "expires": d.expires, "message": d.message,
                            "signature_hex": signature_hex, "recipient": d.recipient, "path": path,
                            "pubkey": authority, "chain": chain });
                if let Some(es) = &evm_sig {
                    ev["digest"] = json!(d.message);
                    ev["r"] = json!(evm::hex0x(&es.r));
                    ev["s"] = json!(evm::hex0x(&es.s));
                    ev["v"] = json!(es.v);
                    ev["s_normalised"] = json!(es.normalised);
                    self.store_evm_sig(evm::EVM_RELEASE_PREFIX, position_id.0, es);
                }
                emit("remote_release_signed", ev);
                d.signature_hex = Some(signature_hex);
                d.status = ReleaseStatus::Signed;
            }
            Err(reason) => {
                emit("remote_release_sign_failed", json!({ "position_id": position_id, "nonce": nonce, "reason": reason }));
                d.status = ReleaseStatus::SignFailed;
            }
        }
        self.put_release(d);
    }

    /// Keeper records the remote release tx (Solana signature, or the `0x` tx hash of an EVM position): the
    /// position is Closed. Not payable.
    pub fn relay_release_result(&mut self, position_id: U64, solana_tx_sig: String) {
        require!(env::predecessor_account_id() == self.keeper, ERR_KEEPER);
        require!(evm::valid_relay_tx(self.remote_domain(position_id.0), &solana_tx_sig), "bad solana_tx_sig");
        let mut d = self.release(position_id.0).unwrap_or_else(|| env::panic_str("no pending release"));
        require!(d.status == ReleaseStatus::Signed, "release not signed");
        let mut p = self.position_or_panic(position_id.0);
        let mut r = Self::remote_or_panic(&p);
        r.status = RemoteStatus::Closed;
        p.remote = Some(r);
        p.units = U128(0);
        p.status = PositionStatus::Closed;
        d.status = ReleaseStatus::Relayed;
        d.solana_tx_sig = Some(solana_tx_sig.clone());
        emit(
            "remote_release_relayed",
            json!({ "position_id": position_id, "nonce": d.nonce, "solana_tx_sig": solana_tx_sig }),
        );
        self.put_release(d);
        self.put_position(p);
    }

    // ------------------------------------------------------------ owner
    pub fn set_allow_keeper_deposit_attestation(&mut self, allow: bool) {
        self.assert_owner();
        env::storage_write(ALLOW_KEEPER_ATTEST_KEY, &[u8::from(allow)]);
        emit("keeper_deposit_attestation_set", json!({ "allow": allow }));
    }

    /// OutLayer `vault_read` project pin (WO-24); `deposit_yocto` > 0, `gas_tgas` in 10..=100.
    pub fn set_vault_read_config(&mut self, project_id: String, version_key: String, deposit_yocto: U128, gas_tgas: u64) {
        self.assert_owner();
        require!(
            (1..=MAX_STRING_LEN).contains(&project_id.len()) && (1..=MAX_STRING_LEN).contains(&version_key.len()),
            "bad project pin"
        );
        require!(deposit_yocto.0 > 0, "deposit must be > 0");
        require!((10..=100).contains(&gas_tgas), "gas_tgas out of range");
        let cfg = VaultReadConfig { project_id, version_key, deposit_yocto: deposit_yocto.0, gas_tgas };
        let b = near_sdk::borsh::to_vec(&cfg).unwrap_or_else(|_| env::panic_str("borsh"));
        env::storage_write(VAULT_READ_KEY, &b);
        emit(
            "vault_read_config_set",
            json!({ "project_id": cfg.project_id, "version_key": cfg.version_key, "deposit_yocto": deposit_yocto,
                    "gas_tgas": gas_tgas }),
        );
    }

    // ------------------------------------------------------------ views
    pub fn get_pending_release(&self, position_id: U64) -> Option<PendingRelease> {
        self.release(position_id.0)
    }

    pub fn get_remote_config(&self) -> RemoteConfigView {
        let v = self.vault_read_config();
        RemoteConfigView {
            allow_keeper_deposit_attestation: self.allow_keeper_attest(),
            vault_read_project_id: v.as_ref().map(|c| c.project_id.clone()),
            vault_read_version_key: v.as_ref().map(|c| c.version_key.clone()),
            vault_read_deposit_yocto: v.as_ref().map(|c| U128(c.deposit_yocto)),
            vault_read_gas_tgas: v.as_ref().map(|c| c.gas_tgas),
            reservation_expiry_s: RESERVATION_EXPIRY_S,
            reserve_deposit_yocto: U128(RESERVE_DEPOSIT_YOCTO),
        }
    }
}
