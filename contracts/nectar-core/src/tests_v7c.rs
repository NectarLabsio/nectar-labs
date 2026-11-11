//! WO-34a (2.2.0-v7) unit tests: each `sr<N>_*` reproduces the failure scenario of security-review-v7 SR-<N> and shows
//! the new behaviour. The SELF and Base re-sign cases live in tests_v7b.rs and tests_evm.rs (their private helpers).

use super::*;
use crate::remote::{COMMITTED_DEPOSITOR_PREFIX, RESERVE_DEPOSIT_YOCTO, depositor_matches, remote_leg_seize, valid_depositor};
use crate::tests_p2::*;
use near_sdk::PromiseResult;
use std::panic::{AssertUnwindSafe, catch_unwind};

/// 43 chars, decodes to 31 bytes.
const B58_31: &str = "3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqi";
/// 32 chars, decodes to 23 bytes.
const B58_23: &str = "22222222222222222222222222222222";
/// 32 bytes, not an Ed25519 point.
const OFF_CURVE: &str = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const EVM_ZERO: &str = "0x0000000000000000000000000000000000000000";
const EVM_OK: &str = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BAD_RECIPIENTS: [&str; 4] = [B58_31, B58_23, OFF_CURVE, EVM_ZERO];

fn signed() -> Nectar {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Successful(sig_json(2, 64)));
    c
}
fn expiry_ns(c: &Nectar) -> u64 {
    c.get_pending_settlement(U64(0)).unwrap().expires.0 * SEC
}
fn resign(c: &mut Nectar, ts: u64) {
    set_ctx(a("anyone.test"), 0, ts);
    c.resign_remote_settlement(U64(0));
}
fn resign_cb(c: &mut Nectar, ts: u64, nonce: u64, result: PromiseResult) {
    cb_ctx(ts, result);
    c.on_resign_signature(U64(0), U64(0), U64(nonce));
}
fn reserve_amt(c: &mut Nectar, borrow: u128) -> u64 {
    set_ctx(borrower(), RESERVE_DEPOSIT_YOCTO, T0 + SEC);
    c.reserve_remote_position("NVDAx".into(), U128(UNITS), U128(borrow), 7500, None, None, None, None, DEPOSITOR.into()).0
}
fn prove(c: &mut Nectar, id: u64) {
    authority_cb(c, id, key_result(&auth()));
    confirm(c, id, T0 + 2 * SEC);
    verified(c, id, T0 + 2 * SEC, vault_json(id, UNITS, AUTH_B58, DEPOSITOR));
}
fn fund_to(c: &mut Nectar, buyer: &str, amt: u128, recipient: &str) -> u128 {
    let m = format!(
        r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":100,"notice_period_ns":"604800000000000","buyer_remote_recipient":"{recipient}"}}}}"#
    );
    ft(c, usdc(), buyer, amt, &m)
}

// ------------------------------------------------------------------ SR-3

#[test]
fn sr3_expired_signed_leg_resigns_identically_with_a_fresh_nonce() {
    let mut c = signed();
    let first = c.get_pending_settlement(U64(0)).unwrap();
    let (avail, treasury, reserve0) = (c.available_usd_e6, c.treasury_usd_e6, c.get_gas_reserve().0);
    let at = expiry_ns(&c);
    resign(&mut c, at);
    let d = c.get_pending_settlement(U64(0)).unwrap();
    assert!(event_with("settlement_resign_requested", "\"previous_nonce\":\"0\""));
    assert_eq!((d.status, d.nonce, d.expires, d.signature_hex.clone()), (PendingStatus::AwaitingSignature, U64(1), U64(at / SEC + 3600), None));
    assert_eq!((d.quote_id, d.repay_usd_e6, d.seize_units, d.recipient.clone(), d.kind), (first.quote_id, first.repay_usd_e6, first.seize_units, first.recipient.clone(), first.kind));
    assert!(d.preimage.contains("|nonce=1|") && d.preimage.ends_with("|kind=PRELIQ"), "{}", d.preimage);
    assert_eq!((c.get_next_nonce(), c.get_gas_reserve().0), (U64(2), reserve0 - 1));
    resign_cb(&mut c, at + SEC, 1, PromiseResult::Successful(sig_json(0xcd, 64)));
    assert!(event_with("settlement_signed", "\"resign\":true"));
    let d = c.get_pending_settlement(U64(0)).unwrap();
    assert_eq!((d.status, d.signature_hex), (PendingStatus::Signed, Some("cd".repeat(64))));
    assert_eq!((c.available_usd_e6, c.treasury_usd_e6), (avail, treasury), "no second pool or treasury credit");
    set_ctx(keeper(), 0, at + 2 * SEC);
    c.relay_settlement_result(U64(0), TX.into());
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Closed);
    assert!(!c.resign_marked(0), "marker cleared on relay");
}

#[test]
#[should_panic(expected = "remote settlement in flight")]
fn sr3_expired_signed_leg_still_blocks_release() {
    let mut c = signed();
    let at = expiry_ns(&c);
    release(&mut c, at);
}

#[test]
#[should_panic(expected = "signed remote leg")]
fn sr3_cancel_never_rolls_back_a_signed_leg() {
    let mut c = signed();
    let at = expiry_ns(&c);
    set_ctx(owner(), 0, at);
    c.cancel_settlement(U64(0));
}

#[test]
#[should_panic(expected = "signature valid until expiry")]
fn sr3_resign_refused_before_expiry() {
    let mut c = signed();
    let at = expiry_ns(&c);
    resign(&mut c, at - SEC);
}

#[test]
#[should_panic(expected = "settlement not signed")]
fn sr3_resign_refused_for_a_never_signed_leg() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    let at = expiry_ns(&c);
    resign(&mut c, at);
}

#[test]
#[should_panic(expected = "no pending settlement")]
fn sr3_resign_without_a_leg() {
    let mut c = open_remote(true, false);
    resign(&mut c, T0 + 6 * SEC);
}

#[test]
#[should_panic(expected = "paused")]
fn sr3_resign_refused_while_paused() {
    let mut c = signed();
    let at = expiry_ns(&c);
    c.paused = true;
    resign(&mut c, at);
}

#[test]
#[should_panic(expected = "gas reserve empty")]
fn sr3_resign_needs_gas_reserve() {
    let mut c = signed();
    let at = expiry_ns(&c);
    c.gas_reserve_yocto = 0;
    resign(&mut c, at);
}

#[test]
#[should_panic(expected = "settlement not signed")]
fn sr3_resign_refused_after_relay() {
    let mut c = signed();
    set_ctx(keeper(), 0, T0 + 7 * SEC);
    c.relay_settlement_result(U64(0), TX.into());
    let at = expiry_ns(&c);
    resign(&mut c, at);
}

#[test]
fn sr3_resign_failure_rolls_nothing_back_and_can_retry_at_once() {
    let mut c = signed();
    let at = expiry_ns(&c);
    let q0 = c.get_quote(U64(0)).unwrap().remaining_usd_e6;
    let avail = c.available_usd_e6;
    resign(&mut c, at);
    resign_cb(&mut c, at + SEC, 1, PromiseResult::Failed);
    assert!(event_with("settlement_resign_failed", "\"reason\":\"failed\""));
    let d = c.get_pending_settlement(U64(0)).unwrap();
    assert_eq!((d.status, d.expires), (PendingStatus::AwaitingSignature, U64(at / SEC + 1)));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6, p.remote.unwrap().status), (PositionStatus::Settling, U128(0), RemoteStatus::Settling));
    assert_eq!((c.get_quote(U64(0)).unwrap().remaining_usd_e6, c.available_usd_e6), (q0, avail));
    // the owner still cannot roll it back: the first signature may have executed
    set_ctx(owner(), 0, at + 2 * SEC);
    assert!(catch_unwind(AssertUnwindSafe(|| c.cancel_settlement(U64(0)))).is_err());
    assert_eq!(c.get_quote(U64(0)).unwrap().remaining_usd_e6, q0);
    resign(&mut c, at + 2 * SEC);
    assert_eq!(c.get_pending_settlement(U64(0)).unwrap().nonce, U64(2));
}

#[test]
fn sr3_stale_callbacks_are_ignored() {
    let mut c = signed();
    let at = expiry_ns(&c);
    let avail = c.available_usd_e6;
    resign(&mut c, at);
    // the first sign callback arriving late must not credit the pool again
    callback(&mut c, at + SEC, 0, PromiseResult::Successful(sig_json(9, 64)));
    assert_eq!(c.available_usd_e6, avail);
    resign_cb(&mut c, at + SEC, 7, PromiseResult::Successful(sig_json(9, 64)));
    let d = c.get_pending_settlement(U64(0)).unwrap();
    assert_eq!((d.status, d.signature_hex), (PendingStatus::AwaitingSignature, None));
}

#[test]
fn sr3_malformed_resign_answer_is_a_failure() {
    let mut c = signed();
    let at = expiry_ns(&c);
    resign(&mut c, at);
    resign_cb(&mut c, at + SEC, 1, PromiseResult::Successful(b"not json".to_vec()));
    assert!(event_with("settlement_resign_failed", "\"nonce\":\"1\""));
    assert_eq!(c.get_pending_settlement(U64(0)).unwrap().status, PendingStatus::AwaitingSignature);
}

// ------------------------------------------------------------------ SR-5

#[test]
#[should_panic(expected = "remote_settle_capacity")]
fn sr5_live_seed_refuses_the_reservation() {
    // live seed: $10k, $5k, $5k with no recipient; the only remote-capable quote is $1k, the loan is $5k
    let mut c = base(true);
    fund(&mut c, "b1.test", 10_000_000_000, 250, false);
    fund(&mut c, "b2.test", 5_000_000_000, 400, false);
    fund(&mut c, "b3.test", 5_000_000_000, 450, false);
    fund(&mut c, "b4.test", 1_000_000_000, 300, true);
    reserve_amt(&mut c, 5_000_000_000);
}

#[test]
fn sr5_aggregate_sizing_counts_fitting_quotes_only() {
    // $900 passes the single-quote cap ($1k) but not Q_remote x 0.75 = $750, although Q_c is $21k
    let mut c = base(true);
    fund(&mut c, "b1.test", 10_000_000_000, 250, false);
    fund(&mut c, "b2.test", 5_000_000_000, 400, false);
    fund(&mut c, "b3.test", 5_000_000_000, 450, false);
    fund(&mut c, "b4.test", 1_000_000_000, 300, true);
    let avail = c.available_usd_e6;
    let id = reserve_amt(&mut c, 900_000_000);
    prove(&mut c, id);
    assert!(event_with("remote_loan_refused", ERR_AGGREGATE_LIMIT));
    let p = c.get_position(U64(id)).unwrap();
    assert_eq!((p.debt_usd_e6, p.remote.unwrap().depositor), (U128(0), Some(DEPOSITOR.to_string())));
    assert_eq!(c.available_usd_e6, avail);
}

#[test]
fn sr5_borrow_capped_at_the_largest_fitting_quote() {
    // the $12k quote drops its recipient after the reservation: Q_remote $16k still passes the aggregate
    // (x 0.75 = $12k), but no single quote can settle $11,250 any more
    let mut c = base(true);
    fund(&mut c, "b0.test", 12_000_000_000, 200, true);
    fund(&mut c, "b1.test", 8_000_000_000, 250, true);
    fund(&mut c, "b2.test", 8_000_000_000, 400, true);
    let id = reserve_amt(&mut c, BORROW);
    set_ctx(a("b0.test"), 0, T0 + SEC);
    c.set_quote_remote_recipient(U64(0), None);
    prove(&mut c, id);
    assert!(event_with("remote_loan_refused", ERR_REMOTE_SETTLE_CAP));
    assert_eq!(c.get_position(U64(id)).unwrap().debt_usd_e6, U128(0));
}

#[test]
fn sr5_capacity_counts_fitting_non_exiting_quotes_only() {
    let mut c = base(true);
    fund(&mut c, "b1.test", 15_000_000_000, 250, true);
    fund(&mut c, "b2.test", 5_000_000_000, 400, false);
    fund(&mut c, "b3.test", 3_000_000_000, 100, true);
    assert_eq!(fund_to(&mut c, "b4.test", 40_000_000_000, EVM_OK), 0);
    assert_eq!(c.remote_capacity("NVDAx", 1), Ok((18_000_000_000, 15_000_000_000)));
    assert_eq!(c.remote_capacity("NVDAx", 0), Ok((40_000_000_000, 40_000_000_000)));
    let mut q = c.quote(0).unwrap();
    q.unlock_ns = Some(U64(T0 + 1_000 * SEC));
    c.put_quote(q);
    assert_eq!(c.remote_capacity("NVDAx", 1), Ok((3_000_000_000, 3_000_000_000)));
}

#[test]
fn sr5_sizing_excludes_reserve_and_depth() {
    let mut c = base(true);
    let mut cc = c.coll_or_panic("NVDAx");
    cc.reserve.usdc_e6 = U128(40_000_000_000);
    cc.reserve.shares = U128(1);
    cc.reserve.discount_bps = 3_000;
    cc.verified_dex_depth_usd_e6 = U128(40_000_000_000);
    assert!(c.check_borrow(&cc, UNITS, BORROW, None, false, None, None).is_ok(), "a NEAR loan counts R_c");
    assert_eq!(c.check_borrow(&cc, UNITS, BORROW, None, false, None, Some((0, 0))).err(), Some(ERR_AGGREGATE_LIMIT));
}

#[test]
fn sr5_unfit_quotes_cannot_crowd_out_a_fitting_one() {
    let mut c = open_remote(true, false);
    for i in 0..8 {
        fund(&mut c, &format!("x{i}.test"), 100_000_000, 0, false); // no recipient, cheapest
        fund(&mut c, &format!("y{i}.test"), 100_000_000, 0, true); // fits, cannot close the position
    }
    assert!(!c.select_quotes("NVDAx").iter().any(|(_, id)| *id == 0), "the old cut drops the only quote that can settle");
    trigger(&mut c);
    assert_eq!(c.get_pending_settlement(U64(0)).unwrap().quote_id, U64(0));
}

// ------------------------------------------------------------------ SR-7

#[test]
fn sr7_recipient_validity() {
    for r in BAD_RECIPIENTS {
        assert!(!chainsig::valid_remote_recipient(r), "{r}");
    }
    assert!(chainsig::valid_remote_recipient(RCPT) && chainsig::valid_remote_recipient(DEPOSITOR) && chainsig::valid_remote_recipient(EVM_OK));
    assert!(chainsig::recipient_fits(1, RCPT) && !chainsig::recipient_fits(0, RCPT));
    assert!(chainsig::recipient_fits(0, EVM_OK) && !chainsig::recipient_fits(1, EVM_OK));
    assert!(!chainsig::recipient_fits(0, EVM_ZERO) && !chainsig::recipient_fits(1, OFF_CURVE) && !chainsig::recipient_fits(7, RCPT));
    // program ids stay format-only: a vault program is not a wallet key
    assert!(chainsig::valid_base58_address(VAULT) && !chainsig::valid_solana_pubkey(VAULT));
}

#[test]
fn sr7_on_curve_matches_ed25519_dalek() {
    let check = |k: [u8; 32]| {
        assert_eq!(chainsig::on_curve(&k), ed25519_dalek::VerifyingKey::from_bytes(&k).is_ok(), "{k:?}");
    };
    // p = 2^255 - 19 in little-endian; y around 0, 1, p-1, p, p+1 and the non-canonical top range
    let mut p = [0xffu8; 32];
    p[0] = 0xed;
    p[31] = 0x7f;
    for delta in 0u8..38 {
        let mut lo = [0u8; 32];
        lo[0] = delta;
        check(lo);
        let mut hi = p;
        hi[0] = 0xed - 20 + delta; // p-20 .. p+17, the last ones non-canonical
        check(hi);
        hi[31] |= 0x80; // sign bit
        check(hi);
    }
    check([0xff; 32]);
    let mut s: u64 = 0x9e37_79b9_7f4a_7c15;
    let (mut on, mut off) = (0, 0);
    for _ in 0..4096 {
        let mut k = [0u8; 32];
        for chunk in k.chunks_mut(8) {
            s ^= s << 13;
            s ^= s >> 7;
            s ^= s << 17;
            chunk.copy_from_slice(&s.to_le_bytes());
        }
        check(k);
        if chainsig::on_curve(&k) { on += 1 } else { off += 1 }
    }
    assert!(on > 1500 && off > 1500, "both outcomes exercised: {on}/{off}");
}

#[test]
fn sr7_funding_refuses_a_recipient_no_vault_can_pay() {
    let mut c = base(true);
    for r in BAD_RECIPIENTS {
        assert_eq!(fund_to(&mut c, "b1.test", 1_000_000_000, r), 1_000_000_000, "{r} refunded");
    }
    assert!(c.list_quotes("NVDAx".into(), None, None).is_empty());
    assert_eq!(fund_to(&mut c, "b1.test", 1_000_000_000, RCPT), 0);
    assert_eq!(fund_to(&mut c, "b1.test", 1_000_000_000, EVM_OK), 0);
}

#[test]
fn sr7_set_recipient_refuses_and_accepts() {
    let mut c = base(true);
    fund(&mut c, "b1.test", 1_000_000_000, 250, false);
    for r in BAD_RECIPIENTS {
        set_ctx(a("b1.test"), 0, T0 + 2 * SEC);
        assert!(catch_unwind(AssertUnwindSafe(|| c.set_quote_remote_recipient(U64(0), Some(r.into())))).is_err(), "{r}");
    }
    set_ctx(a("b1.test"), 0, T0 + 2 * SEC);
    c.set_quote_remote_recipient(U64(0), Some(RCPT.into()));
    assert_eq!(c.get_quote(U64(0)).unwrap().buyer_remote_recipient.as_deref(), Some(RCPT));
}

#[test]
#[should_panic(expected = "no remote quote capacity")]
fn sr7_legacy_quote_with_a_bad_recipient_is_never_signed() {
    // funded under 2.1 with a 31-byte address: filtered, so the leg is never signed into a stuck state
    let mut c = open_remote(true, false);
    let mut q = c.quote(0).unwrap();
    q.buyer_remote_recipient = Some(B58_31.into());
    c.put_quote(q);
    trigger(&mut c);
}

// ------------------------------------------------------------------ SR-8

#[test]
#[should_panic(expected = "bad depositor")]
fn sr8_reserve_refuses_an_off_curve_depositor() {
    let mut c = base(true);
    set_ctx(borrower(), RESERVE_DEPOSIT_YOCTO, T0 + SEC);
    c.reserve_remote_position("NVDAx".into(), U128(UNITS), U128(BORROW), 7500, None, None, None, None, OFF_CURVE.into());
}

#[test]
fn sr8_depositor_validity_and_matching() {
    assert!(valid_depositor(DEPOSITOR, 1) && valid_depositor(EVM_OK, 0));
    assert!(!valid_depositor(EVM_ZERO, 0) && !valid_depositor(OFF_CURVE, 1) && !valid_depositor(EVM_OK, 1) && !valid_depositor(DEPOSITOR, 9));
    assert!(depositor_matches(EVM_OK, &EVM_OK.to_lowercase(), 0));
    assert!(!depositor_matches(DEPOSITOR, &DEPOSITOR.to_lowercase(), 1));
}

#[test]
fn sr8_squatted_slot_never_confirms_the_reservation() {
    let mut c = reserved();
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 3 * SEC, vault_json(0, UNITS, AUTH_B58, RCPT));
    assert!(event_with("remote_deposit_rejected", "depositor_mismatch"));
    let r = remote(&c, 0);
    assert_eq!((r.status, r.depositor), (RemoteStatus::AwaitingDeposit, None));
    assert_eq!(c.get_position(U64(0)).unwrap().debt_usd_e6, U128(0));
    // the borrower's own slot still confirms
    confirm(&mut c, 0, T0 + 40 * SEC);
    verified(&mut c, 0, T0 + 40 * SEC, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    assert_eq!(remote(&c, 0).status, RemoteStatus::Open);
}

#[test]
#[should_panic(expected = "depositor mismatch")]
fn sr8_keeper_attestation_must_name_the_commitment() {
    let mut c = reserved();
    set_ctx(owner(), 0, T0 + SEC);
    c.set_allow_keeper_deposit_attestation(true);
    set_ctx(keeper(), 0, T0 + 2 * SEC);
    c.keeper_attest_deposit(U64(0), "tx".into(), RCPT.into());
}

#[test]
fn sr8_commitment_is_exposed_sent_to_vault_read_and_off_the_struct() {
    let mut c = reserved();
    assert_eq!(remote(&c, 0).committed_depositor.as_deref(), Some(DEPOSITOR));
    assert_eq!(c.list_positions(None, None)[0].remote.as_ref().unwrap().committed_depositor.as_deref(), Some(DEPOSITOR));
    confirm(&mut c, 0, T0 + 2 * SEC);
    assert!(event_with("remote_deposit_check_requested", DEPOSITOR));
    // stored layout is the 2.1 layout: the field is not serialized
    let stored = c.position(0).unwrap().remote.unwrap();
    assert_eq!(stored.committed_depositor, None);
    let viewed = remote(&c, 0);
    assert_eq!(near_sdk::borsh::to_vec(&stored).unwrap(), near_sdk::borsh::to_vec(&viewed).unwrap());
    assert!(serde_json::to_string(&stored).unwrap().find("committed_depositor").is_none(), "absent, not null");
}

#[test]
fn sr8_pre_upgrade_reservation_without_commitment_still_confirms() {
    let mut c = reserved();
    env::storage_remove(&[COMMITTED_DEPOSITOR_PREFIX, &0u64.to_le_bytes()].concat());
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 3 * SEC, vault_json(0, UNITS, AUTH_B58, RCPT));
    assert_eq!(remote(&c, 0).depositor.as_deref(), Some(RCPT));
}

// ------------------------------------------------------------------ SR-10

#[test]
fn sr10_underwater_rounding_seizes_every_unit() {
    let half = math::E18 / 2;
    let cases: [(u128, u128, u128, u8, u128); 3] = [
        (1_000_001, half, 360_000_000, 6, 300_000_000),            // M < 1e18, odd units (the review's scenario)
        (100_000_001, math::E18, 1_000_000, 8, 5_000_000),         // 8 decimals
        (1_000_000_000_000_000_001, math::E18, 1_000_000, 18, 5_000_000), // 18 decimals
    ];
    for (units, m, price, decimals, debt) in cases {
        let remaining = 1_000_000_000_000;
        let leg = math::settle_leg_m(debt, remaining, units, m, price, decimals, 250, 0).unwrap().unwrap();
        assert!(leg.repay_usd_e6 < debt && leg.buyer_units < units, "the old equality check fails: {leg:?}");
        assert_eq!(remote_leg_seize(&leg, debt, units, remaining), Some(units));
        assert!(math::value_m_usd_e6(units - leg.buyer_units, m, price, decimals).unwrap() <= 2, "only dust is added: {leg:?}");
    }
}

#[test]
fn sr10_a_partial_quote_still_does_not_close() {
    let (debt, remaining, units) = (1_000_000_000, 10_000_000, 1_000_000_000);
    let leg = math::settle_leg_m(debt, remaining, units, math::E18, 180_000_000, 6, 250, 0).unwrap().unwrap();
    assert_eq!(remote_leg_seize(&leg, debt, units, remaining), None);
}

#[test]
fn sr10_contract_settles_an_odd_unit_underwater_position() {
    let mut c = open_remote(true, false);
    let mut cc = c.coll_or_panic("NVDAx");
    cc.multiplier_e18 = U128(math::E18 / 2);
    cc.oracle_price_usd_e6 = U128(360_000_000);
    c.put_coll(cc);
    let mut p = c.position(0).unwrap();
    p.units = U128(1_000_001);
    c.put_position(p);
    trigger(&mut c);
    let d = c.get_pending_settlement(U64(0)).unwrap();
    assert_eq!(d.seize_units, U128(1_000_001));
    assert!(d.repay_usd_e6.0 < BORROW);
    assert_eq!(c.get_position(U64(0)).unwrap().units, U128(0));
}

// ------------------------------------------------------------------ SR-17

fn owed_buyer() -> (Nectar, AccountId) {
    let mut c = open_remote(true, false);
    let buyer = a("buyer1.test");
    cb_ctx(T0 + 6 * SEC, PromiseResult::Failed);
    assert!(!c.on_payout(Payout::SettlementBuyer { position_id: U64(0), quote_id: U64(0) }, buyer.clone(), U128(700)));
    assert_eq!(c.get_owed_collateral(buyer.clone(), "NVDAx".into()), U128(700));
    (c, buyer)
}

#[test]
fn sr17_owed_collateral_is_claimable() {
    let (mut c, buyer) = owed_buyer();
    set_ctx(buyer.clone(), 1, T0 + 7 * SEC);
    let _ = c.claim_owed_collateral("NVDAx".into());
    assert!(event_with("owed_collateral_claimed", "\"units\":\"700\""));
    assert_eq!(c.get_owed_collateral(buyer.clone(), "NVDAx".into()), U128(0), "zeroed before the transfer");
    cb_ctx(T0 + 8 * SEC, PromiseResult::Successful(vec![]));
    assert!(c.on_payout(Payout::OwedCollateral { symbol: "NVDAx".into() }, buyer.clone(), U128(700)));
    assert_eq!(c.get_owed_collateral(buyer, "NVDAx".into()), U128(0));
}

#[test]
fn sr17_failed_claim_restores_the_balance() {
    let (mut c, buyer) = owed_buyer();
    set_ctx(buyer.clone(), 1, T0 + 7 * SEC);
    let _ = c.claim_owed_collateral("NVDAx".into());
    cb_ctx(T0 + 8 * SEC, PromiseResult::Failed);
    assert!(!c.on_payout(Payout::OwedCollateral { symbol: "NVDAx".into() }, buyer.clone(), U128(700)));
    assert_eq!(c.get_owed_collateral(buyer, "NVDAx".into()), U128(700));
}

#[test]
#[should_panic(expected = "nothing owed")]
fn sr17_nothing_to_claim() {
    let mut c = base(false);
    set_ctx(a("b1.test"), 1, T0 + SEC);
    let _ = c.claim_owed_collateral("NVDAx".into());
}

#[test]
#[should_panic(expected = "1 yoctoNEAR")]
fn sr17_claim_needs_one_yocto() {
    let (mut c, buyer) = owed_buyer();
    set_ctx(buyer, 0, T0 + 7 * SEC);
    let _ = c.claim_owed_collateral("NVDAx".into());
}

#[test]
#[should_panic(expected = "paused")]
fn sr17_claim_refused_while_paused() {
    let (mut c, buyer) = owed_buyer();
    c.paused = true;
    set_ctx(buyer, 1, T0 + 7 * SEC);
    let _ = c.claim_owed_collateral("NVDAx".into());
}

// ------------------------------------------------------------------ SR-18

fn short_deposit() -> Nectar {
    let mut c = reserved();
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 3 * SEC, vault_json(0, UNITS - 1, AUTH_B58, DEPOSITOR));
    c
}

#[test]
fn sr18_short_deposit_is_recorded_refused_and_releasable() {
    let mut c = reserved();
    let avail = c.available_usd_e6;
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 3 * SEC, vault_json(0, UNITS - 1, AUTH_B58, DEPOSITOR));
    assert!(event_with("remote_loan_refused", "units_below_reserved"));
    assert!(event_with("reservation_deposit_refunded", "loan_refused"));
    let p = c.get_position(U64(0)).unwrap();
    let r = p.remote.clone().unwrap();
    assert_eq!((p.status, p.debt_usd_e6, p.units), (PositionStatus::Open, U128(0), U128(UNITS - 1)));
    assert_eq!((r.status, r.depositor.as_deref(), r.units), (RemoteStatus::Open, Some(DEPOSITOR), U128(UNITS - 1)));
    assert_eq!(c.available_usd_e6, avail, "no loan");
    release(&mut c, T0 + 10 * SEC);
    let d = c.get_pending_release(U64(0)).unwrap();
    assert_eq!((d.recipient.as_str(), d.status), (DEPOSITOR, ReleaseStatus::AwaitingSignature));
}

#[test]
#[should_panic(expected = "not awaiting deposit")]
fn sr18_short_deposit_cannot_be_retried_into_a_loan() {
    let mut c = short_deposit();
    confirm(&mut c, 0, T0 + 40 * SEC);
}

#[test]
fn sr18_zero_units_or_a_foreign_slot_are_not_recorded() {
    for (units, depositor, reason) in [(0, DEPOSITOR, "units_below_reserved"), (UNITS - 1, RCPT, "depositor_mismatch")] {
        let mut c = reserved();
        confirm(&mut c, 0, T0 + 2 * SEC);
        verified(&mut c, 0, T0 + 3 * SEC, vault_json(0, units, AUTH_B58, depositor));
        assert!(event_with("remote_deposit_rejected", reason), "{reason}");
        assert_eq!(remote(&c, 0).depositor, None, "{reason}");
    }
}
