//! WO-34b unit tests: each `sr<N>_*` reproduces the failure scenario of security-review-v7 SR-<N> and shows the new
//! behaviour. SR-22 and SR-23 live in tests_reserve.rs and tests_notes.rs (their private helpers), SR-27 in mock-ft.
//! `gap_*` cover the review's spec gap (no withdrawal path for the pools).

use super::*;
use crate::p1::QUOTER_ABORT_COOLDOWN_NS;
use crate::remote::{MAX_OPEN_RESERVATIONS, MAX_RESERVE_CONFIRMS, RESERVE_DEPOSIT_YOCTO};
use crate::tests_p2::*;
use near_sdk::PromiseResult;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::get_created_receipts;
use std::panic::{AssertUnwindSafe, catch_unwind};

const HOUR: u64 = 3_600 * SEC;
const LOCK: &str = r#"{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"11250000000","pre_liq_ltv_bps":7500}}"#;
const REPAY: &str = r#"{"Repay":{"position_id":"0"}}"#;

fn panics(f: impl FnOnce()) -> bool {
    catch_unwind(AssertUnwindSafe(f)).is_err()
}

fn near_transfer_to(who: &AccountId, yocto: u128) -> bool {
    get_created_receipts().iter().any(|r| {
        &r.receiver_id == who
            && r.actions.iter().any(|x| matches!(x, MockAction::Transfer { deposit, .. } if deposit.as_yoctonear() == yocto))
    })
}

fn quoter_on(c: &mut Nectar) {
    set_ctx(owner(), 0, T0);
    c.set_quoter_config(U128(100), 100, U64(100_000_000), 128, 30);
    c.set_quoter_pin("owner.testnet/nectar-quoter".into(), "ab".repeat(32));
    c.set_vol_bps("NVDAx".into(), 420);
}

fn quoter_cb(c: &mut Nectar, ts: u64, result: PromiseResult) {
    cb_ctx(ts, result);
    c.on_quoter_result(U64(0), "x".into(), vec![U64(0)]);
}

/// NEAR-held position 0: 100 NVDAx, $11,250, buyer1 $20k at `disc`; price down to 140 (unhealthy).
fn near_open(disc: u16) -> Nectar {
    let mut c = base(false);
    fund(&mut c, "buyer1.test", 20_000_000_000, disc, false);
    assert_eq!(ft(&mut c, nvdax(), "borrower.test", UNITS, LOCK), 0);
    drop_price(&mut c);
    c
}

fn set_price(c: &mut Nectar, px: u128) {
    let mut col = c.coll("NVDAx").unwrap();
    col.oracle_price_usd_e6 = U128(px);
    c.put_coll(col);
}

/// An underwater settlement that takes every unit and leaves $1,250 of debt: $100, 0 bps, no keeper share.
fn bad_debt() -> Nectar {
    let mut c = near_open(0);
    c.keeper_fee_bps = 0;
    set_price(&mut c, 100_000_000);
    trigger(&mut c);
    c
}

/// A quote emptied and delisted (Q_c back to 0).
fn empty_quote(c: &mut Nectar, id: u64) {
    let mut q = c.quote(id).unwrap();
    let mut col = c.coll("NVDAx").unwrap();
    col.active_committed_q_usd_e6 = U128(col.active_committed_q_usd_e6.0 - q.remaining_usd_e6.0);
    q.remaining_usd_e6 = U128(0);
    c.put_coll(col);
    c.put_quote(q);
    c.remove_live("NVDAx", id);
}

// ------------------------------------------------------------------ SR-6

#[test]
#[should_panic(expected = "borrower, keeper or owner only")]
fn sr6_stranger_cannot_confirm() {
    let mut c = reserved();
    set_ctx(a("anyone.test"), 0, T0 + 2 * SEC);
    c.confirm_remote_deposit(U64(0));
}

#[test]
fn sr6_borrower_confirm_spends_the_held_deposit_not_the_reserve() {
    let mut c = reserved();
    let (r0, held) = (c.get_gas_reserve().0, remote(&c, 0).deposit_yocto.0);
    set_ctx(borrower(), 0, T0 + 2 * SEC);
    c.confirm_remote_deposit(U64(0));
    assert_eq!((c.get_gas_reserve().0, remote(&c, 0).deposit_yocto.0), (r0, held - VR_DEPOSIT));
}

#[test]
#[should_panic(expected = "reservation deposit spent")]
fn sr6_expired_reservation_is_not_free_for_the_borrower() {
    let mut c = reserved();
    set_ctx(a("anyone.test"), 0, T0 + 2000 * SEC);
    c.expire_remote_reservation(U64(0));
    set_ctx(borrower(), 0, T0 + 2001 * SEC);
    c.confirm_remote_deposit(U64(0));
}

#[test]
fn sr6_keeper_reads_are_budgeted_per_position_and_the_owner_is_not() {
    let mut c = reserved();
    for i in 0..u64::from(MAX_RESERVE_CONFIRMS) {
        let ts = T0 + (2 + i * 31) * SEC;
        confirm(&mut c, 0, ts);
        verified(&mut c, 0, ts, PromiseResult::Failed);
    }
    let late = T0 + 200 * SEC;
    assert!(panics(|| confirm(&mut c, 0, late)), "budget spent");
    set_ctx(owner(), 0, late);
    c.confirm_remote_deposit(U64(0));
    assert!(remote(&c, 0).confirming);
}

#[test]
fn sr6_non_liquidation_spends_keep_the_reserve_floor() {
    let mut c = reserved();
    quoter_on(&mut c); // floor = 4 runs x 100
    c.gas_reserve_yocto = 400 + VR_DEPOSIT - 1;
    assert!(panics(|| confirm(&mut c, 0, T0 + 2 * SEC)), "below the floor");
    c.gas_reserve_yocto = 400 + VR_DEPOSIT;
    confirm(&mut c, 0, T0 + 2 * SEC);
    assert_eq!(c.get_gas_reserve().0, 400);
    set_ctx(keeper(), 0, T0 + 3 * SEC);
    assert!(panics(|| c.request_session_check("NVDAx".into())), "jobs too");
}

#[test]
fn sr6_job_requests_are_keeper_or_owner_only() {
    let mut c = base(true);
    set_ctx(owner(), 0, T0);
    c.set_multiplier_source("NVDAx".into(), "https://sepolia.base.org".into(), "0x70997970C51812dc3A010C7d01b50e0d17dc79C8".into());
    set_ctx(a("anyone.test"), 0, T0 + SEC);
    assert!(panics(|| c.request_session_check("NVDAx".into())));
    assert!(panics(|| c.request_multiplier_read("NVDAx".into())));
    set_ctx(keeper(), 0, T0 + SEC);
    c.request_session_check("NVDAx".into());
    set_ctx(owner(), 0, T0 + SEC);
    c.request_multiplier_read("NVDAx".into());
}

#[test]
fn sr6_short_reserve_falls_back_to_p0_instead_of_blocking_the_rescue() {
    let mut c = near_open(250);
    quoter_on(&mut c);
    c.gas_reserve_yocto = 50; // below the quoter deposit, enough for the transfers
    trigger(&mut c);
    assert!(event_with("quoter_fallback", "gas_reserve_short"));
    assert!(event_with("settled_near", "\"disc_bps\":250"));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Closed);
}

// ------------------------------------------------------------------ SR-9

#[test]
fn sr9_no_collateral_left_parks_for_the_owner() {
    let c = bad_debt();
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.units, p.debt_usd_e6), (PositionStatus::Settling, U128(0), U128(1_250_000_000)));
    assert!(!c.get_health(U64(0)).triggerable);
}

#[test]
#[should_panic(expected = "no collateral left")]
fn sr9_trigger_refused_without_collateral() {
    let mut c = bad_debt();
    set_ctx(owner(), 0, T0 + 6 * SEC);
    c.cancel_settlement(U64(0));
    assert!(!c.get_health(U64(0)).triggerable, "the keeper would not even try");
    set_ctx(keeper(), 0, T0 + 7 * SEC);
    c.trigger_preliquidation(U64(0));
}

#[test]
fn sr9_write_off_is_the_terminal_state() {
    let mut c = bad_debt();
    let pool = c.get_pool();
    set_ctx(owner(), 0, T0 + 6 * SEC);
    c.write_off_bad_debt(U64(0));
    assert!(event_with("bad_debt_written_off", "\"debt_usd_e6\":\"1250000000\""));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6), (PositionStatus::Closed, U128(0)));
    let after = c.get_pool();
    assert_eq!(after.utilised_usd_e6.0, pool.utilised_usd_e6.0 - 1_250_000_000);
    assert_eq!(after.available_usd_e6, pool.available_usd_e6, "the loss is not re-lent");
    assert_eq!(c.coll("NVDAx").unwrap().total_debt_usd_e6, U128(0));
    assert!(panics(|| c.write_off_bad_debt(U64(0))), "no debt left");
}

#[test]
fn sr9_write_off_refusals() {
    let mut c = bad_debt();
    set_ctx(a("anyone.test"), 0, T0 + 6 * SEC);
    assert!(panics(|| c.write_off_bad_debt(U64(0))), "owner only");
    let mut live = near_open(250);
    set_ctx(owner(), 0, T0 + 6 * SEC);
    assert!(panics(|| live.write_off_bad_debt(U64(0))), "still holds collateral");
    let mut r = open_remote(true, false);
    let mut p = r.position(0).unwrap();
    p.units = U128(0);
    r.put_position(p);
    set_ctx(owner(), 0, T0 + 6 * SEC);
    assert!(panics(|| r.write_off_bad_debt(U64(0))), "remote position not closed");
}

#[test]
fn sr9_a_settle_that_cannot_succeed_never_spends_the_deposit() {
    let mut c = near_open(250);
    quoter_on(&mut c);
    let mut p = c.position(0).unwrap();
    p.units = U128(1); // no leg can be priced from one raw unit
    c.put_position(p);
    let r0 = c.get_gas_reserve().0;
    assert!(panics(|| trigger(&mut c)));
    assert_eq!(c.get_gas_reserve().0, r0);
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Open);
}

#[test]
fn sr9_aborted_run_costs_one_deposit_then_uses_static_pricing_until_the_cooldown_ends() {
    let mut c = near_open(250);
    quoter_on(&mut c);
    let r0 = c.get_gas_reserve().0;
    trigger(&mut c);
    assert_eq!(c.get_gas_reserve().0, r0 - 100);
    assert_eq!(c.get_quoter_cooldown(U64(0)), U64(0));
    c.paused = true;
    quoter_cb(&mut c, T0 + 6 * SEC, PromiseResult::Failed);
    c.paused = false;
    assert!(event_with("settlement_aborted", "paused"));
    assert_eq!(c.get_quoter_cooldown(U64(0)), U64(T0 + 6 * SEC + QUOTER_ABORT_COOLDOWN_NS));
    let r1 = c.get_gas_reserve().0;
    set_ctx(keeper(), 0, T0 + 7 * SEC);
    c.trigger_preliquidation(U64(0));
    assert!(event_with("quoter_fallback", "abort_cooldown"));
    assert!(event_with("settled_near", "\"disc_bps\":250"));
    assert!(r1 - c.get_gas_reserve().0 < 100, "no quoter deposit");
}

#[test]
fn sr9_quoter_runs_again_after_the_cooldown() {
    let mut c = near_open(250);
    quoter_on(&mut c);
    trigger(&mut c);
    c.paused = true;
    quoter_cb(&mut c, T0 + 6 * SEC, PromiseResult::Failed);
    c.paused = false;
    let r1 = c.get_gas_reserve().0;
    set_ctx(keeper(), 0, T0 + 6 * SEC + QUOTER_ABORT_COOLDOWN_NS);
    c.trigger_preliquidation(U64(0));
    assert_eq!(c.get_gas_reserve().0, r1 - 100, "paid run");
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Settling);
}

// ------------------------------------------------------------------ SR-13

#[test]
fn sr13_an_outlayer_answer_closes_for_a_bounded_time() {
    let mut c = base(true);
    set_ctx(owner(), 0, T0);
    c.set_session_calendar(vec![[U64(T0), U64(T0 + 6 * HOUR)]]);
    assert_eq!(c.get_outlayer_closed_until("NVDAx".into()), U64(0));
    cb_ctx(T0 + 3 * SEC, PromiseResult::Successful(br#"{"force_closed":true,"reason":"weekend"}"#.to_vec()));
    c.on_session_check("NVDAx".into());
    assert!(event_with("session_forced_closed", "\"source\":\"outlayer\""));
    assert!(!c.coll("NVDAx").unwrap().forced_closed, "never latches");
    let until = T0 + 3 * SEC + OUTLAYER_CLOSED_TTL_NS;
    assert_eq!(c.get_outlayer_closed_until("NVDAx".into()), U64(until));
    let e = c.get_exit_capacity("NVDAx".into());
    assert_eq!((e.session_open, e.session_reason.as_str(), e.forced_closed), (false, "forced_closed", true));
    // the window is still open once the answer has expired; a fresh price reopens the session
    set_ctx(owner(), 0, until);
    assert!(c.update_owner_price("NVDAx".into(), U128(180_000_000)));
    let e = c.get_exit_capacity("NVDAx".into());
    assert_eq!((e.session_open, e.forced_closed), (true, false));
}

// ------------------------------------------------------------------ SR-14

#[test]
fn sr14_the_record_storage_is_kept_from_the_deposit() {
    let mut c = reserved();
    let held = remote(&c, 0).deposit_yocto.0;
    assert!(held > 0 && held < RESERVE_DEPOSIT_YOCTO, "{held}");
    set_ctx(a("anyone.test"), 0, T0 + 2000 * SEC);
    c.expire_remote_reservation(U64(0));
    assert!(near_transfer_to(&borrower(), held), "the refund is the deposit minus the storage");
}

#[test]
fn sr14_near_borrow_below_the_minimum_is_refunded() {
    let mut c = base(false);
    fund(&mut c, "buyer1.test", 20_000_000_000, 250, false);
    let m = r#"{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"4999999","pre_liq_ltv_bps":7500}}"#;
    assert_eq!(ft(&mut c, nvdax(), "borrower.test", UNITS, m), UNITS);
    assert_eq!(c.preview_borrow("NVDAx".into(), U128(UNITS), U128(4_999_999), None, None, None).reason.as_deref(), Some(ERR_MIN_BORROW));
    assert_eq!(c.get_config().next_position_id, U64(0));
}

#[test]
#[should_panic(expected = "borrow below minimum")]
fn sr14_remote_borrow_below_the_minimum_is_refused() {
    let mut c = base(true);
    fund(&mut c, "buyer1.test", 15_000_000_000, 250, true);
    set_ctx(borrower(), RESERVE_DEPOSIT_YOCTO, T0 + SEC);
    c.reserve_remote_position("NVDAx".into(), U128(UNITS), U128(4_999_999), 7500, None, None, None, None, DEPOSITOR.into());
}

#[test]
fn sr14_open_reservations_are_capped_per_account() {
    let mut c = base(true);
    fund(&mut c, "buyer1.test", 15_000_000_000, 250, true);
    for _ in 0..MAX_OPEN_RESERVATIONS {
        reserve(&mut c, T0 + SEC);
    }
    assert!(panics(|| {
        reserve(&mut c, T0 + SEC);
    }));
    let at = T0 + SEC + 1_800 * SEC;
    set_ctx(a("anyone.test"), 0, at);
    c.expire_remote_reservation(U64(0));
    assert_eq!(reserve(&mut c, at), u64::from(MAX_OPEN_RESERVATIONS), "an ended reservation frees a slot");
}

#[test]
fn sr14_a_refused_retry_counts_as_one_end() {
    let mut c = reserved();
    set_ctx(owner(), 0, T0);
    c.set_oracle_params(U64(1), U64(1), 1500);
    assert_eq!(Nectar::open_reservations(&borrower()), 1);
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 2 * SEC, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    assert_eq!(Nectar::open_reservations(&borrower()), 0);
    reserve(&mut c, T0 + 3 * SEC);
    confirm(&mut c, 0, T0 + 40 * SEC);
    verified(&mut c, 0, T0 + 40 * SEC, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    assert_eq!(Nectar::open_reservations(&borrower()), 1, "the retry of #0 does not close #1");
}

// ------------------------------------------------------------------ SR-15

fn second_symbol(c: &mut Nectar) -> CollateralInput {
    let mut i = input();
    i.symbol = "TSLAx".into();
    i.token = a("tslax.test");
    set_ctx(owner(), 0, T0);
    c.upsert_collateral("TSLAx".into(), i.clone());
    i
}

#[test]
fn sr15_a_vault_serves_one_collateral() {
    let mut c = base(true);
    let mut i = second_symbol(&mut c);
    assert!(panics(|| c.set_remote_chain("TSLAx".into(), Some(rc()))), "primary");
    i.remote_chain = Some(rc());
    assert!(panics(|| c.upsert_collateral("TSLAx".into(), i)), "upsert");
    // another vault is fine; the same symbol may re-set its own
    c.set_remote_chain("TSLAx".into(), Some(RemoteChain { vault_program: RCPT.into(), ..rc() }));
    c.set_remote_chain("NVDAx".into(), Some(rc()));
}

#[test]
fn sr15_extra_chains_too() {
    let mut c = base(true);
    second_symbol(&mut c);
    let base_rc = RemoteChain {
        chain_id: "base-sepolia".into(),
        vault_program: "0x4E65637461725661756c74426173650000000001".into(),
        mpc_domain_id: 0,
    };
    let rpc = "https://sepolia.base.org";
    c.set_extra_remote_chain("NVDAx".into(), base_rc.clone(), rpc.into());
    assert!(panics(|| c.set_extra_remote_chain("TSLAx".into(), base_rc.clone(), rpc.into())));
    assert!(panics(|| c.set_extra_remote_chain("TSLAx".into(), RemoteChain { ..rc() }, rpc.into())));
}

// ------------------------------------------------------------------ SR-16

#[test]
fn sr16_top_up_cannot_relist_above_the_reserve_discount() {
    let mut c = base(false);
    fund(&mut c, "buyer1.test", 500_000_000, 550, false);
    empty_quote(&mut c, 0);
    set_ctx(owner(), 0, T0);
    c.set_reserve_params("NVDAx".into(), 500, None);
    let top = r#"{"TopUpQuote":{"quote_id":"0"}}"#;
    assert_eq!(ft(&mut c, usdc(), "buyer1.test", 500_000_000, top), 500_000_000, "refunded");
    assert!(c.list_quotes("NVDAx".into(), None, None).is_empty());
    set_ctx(owner(), 0, T0);
    c.set_reserve_params("NVDAx".into(), 600, None);
    assert_eq!(ft(&mut c, usdc(), "buyer1.test", 500_000_000, top), 0, "below the discount it relists");
    assert_eq!(c.list_quotes("NVDAx".into(), None, None).len(), 1);
}

#[test]
fn sr16_sign_failure_leaves_a_too_expensive_quote_as_an_exit() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    let repay = c.get_pending_settlement(U64(0)).unwrap().repay_usd_e6.0;
    empty_quote(&mut c, 0);
    let mut col = c.coll("NVDAx").unwrap();
    col.reserve.discount_bps = 200; // below the quote's 250
    let q_c = col.active_committed_q_usd_e6;
    c.put_coll(col);
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Failed);
    let q = c.get_quote(U64(0)).unwrap();
    assert_eq!(q.remaining_usd_e6, U128(repay), "escrow restored");
    assert_eq!(q.unlock_ns, Some(U64(T0 + 6 * SEC)), "withdrawable at once");
    assert!(!c.live_ids("NVDAx").contains(&0), "not relisted");
    assert_eq!(c.coll("NVDAx").unwrap().active_committed_q_usd_e6, q_c, "not in Q_c");
}

#[test]
fn sr16_failed_withdrawal_restores_without_relisting_above_the_reserve() {
    let mut c = base(false);
    fund(&mut c, "buyer1.test", 500_000_000, 550, false);
    set_ctx(a("buyer1.test"), 1, T0 + SEC);
    c.initiate_quote_withdrawal(U64(0));
    let at = T0 + SEC + 604_800 * SEC;
    set_ctx(a("buyer1.test"), 1, at);
    let _ = c.complete_quote_withdrawal(U64(0));
    set_ctx(owner(), 0, at);
    c.set_reserve_params("NVDAx".into(), 500, None);
    cb_ctx(at, PromiseResult::Failed);
    let payout = Payout::QuoteWithdrawal { quote_id: U64(0), principal_usd_e6: U128(500_000_000), fees_usd_e6: U128(0) };
    assert!(!c.on_payout(payout, a("buyer1.test"), U128(500_000_000)));
    assert_eq!(c.get_quote(U64(0)).unwrap().remaining_usd_e6, U128(500_000_000));
    assert!(!c.live_ids("NVDAx").contains(&0));
}

// ------------------------------------------------------------------ SR-19

#[test]
#[should_panic(expected = "token or decimals change with an open book")]
fn sr19_token_change_refused_with_open_debt() {
    let mut c = near_open(250);
    let mut i = input();
    i.token = a("other.test");
    set_ctx(owner(), 0, T0 + 6 * SEC);
    c.upsert_collateral("NVDAx".into(), i);
}

#[test]
#[should_panic(expected = "token or decimals change with an open book")]
fn sr19_decimals_change_refused_with_live_quotes() {
    let mut c = base(false);
    fund(&mut c, "buyer1.test", 500_000_000, 250, false);
    let mut i = input();
    i.decimals = 8;
    set_ctx(owner(), 0, T0);
    c.upsert_collateral("NVDAx".into(), i);
}

#[test]
#[should_panic(expected = "token or decimals change with an open book")]
fn sr19_token_change_refused_with_owed_collateral() {
    let mut c = base(false);
    c.record_owed(&a("buyer1.test"), "NVDAx", 5);
    let mut i = input();
    i.token = a("other.test");
    set_ctx(owner(), 0, T0);
    c.upsert_collateral("NVDAx".into(), i);
}

#[test]
fn sr19_idempotent_upsert_and_an_empty_book_are_fine() {
    let mut c = near_open(250);
    set_ctx(owner(), 0, T0 + 6 * SEC);
    c.upsert_collateral("NVDAx".into(), input()); // scripts/20 and 21 re-run this
    let mut c = base(false);
    let mut i = input();
    i.token = a("other.test");
    i.decimals = 8;
    set_ctx(owner(), 0, T0);
    c.upsert_collateral("NVDAx".into(), i);
    let col = c.coll("NVDAx").unwrap();
    assert_eq!((col.token, col.decimals), (a("other.test"), 8));
}

#[test]
fn sr19_a_claim_clears_the_owed_total() {
    let mut c = base(false);
    c.record_owed(&a("buyer1.test"), "NVDAx", 5);
    assert_eq!(Nectar::owed_total("NVDAx"), 5);
    set_ctx(a("buyer1.test"), 1, T0);
    let _ = c.claim_owed_collateral("NVDAx".into());
    assert_eq!(Nectar::owed_total("NVDAx"), 0);
}

// ------------------------------------------------------------------ SR-20

#[test]
fn sr20_dust_q_collects_no_premium_and_never_moves_the_index() {
    let mut c = base(false);
    set_ctx(owner(), 0, T0);
    c.set_session_calendar(vec![[U64(T0), U64(T0 + 6 * HOUR)]]);
    c.set_dex_depth("NVDAx".into(), U128(50_000_000_000));
    fund(&mut c, "buyer1.test", 100_000_000, 250, false);
    let mut q = c.quote(0).unwrap();
    q.remaining_usd_e6 = U128(1);
    c.put_quote(q);
    let mut col = c.coll("NVDAx").unwrap();
    col.active_committed_q_usd_e6 = U128(1);
    c.put_coll(col);
    assert_eq!(ft(&mut c, nvdax(), "borrower.test", UNITS, LOCK), 0);
    let premium = c.get_position(U64(0)).unwrap().premium_usd_e6.0;
    assert!(premium > 0);
    assert_eq!(c.coll("NVDAx").unwrap().acc_fee_per_dollar_e18, U128(0));
    let lenders = premium * 2000 / 10_000;
    let origination = 11_250_000_000 * u128::from(c.origination_fee_bps) / 10_000;
    assert_eq!(c.get_pool().treasury_usd_e6.0, premium - lenders + origination, "the buyers' share goes to treasury");
}

#[test]
fn sr20_a_fill_delists_a_dust_remainder_and_credits_it() {
    let mut c = near_open(250);
    c.min_quote_usd_e6 = 15_000_000_000; // the $8,750 left after the fill is now below the minimum
    trigger(&mut c);
    let q = c.get_quote(U64(0)).unwrap();
    assert_eq!(q.remaining_usd_e6, U128(0));
    assert!(q.claimable_fees_usd_e6.0 >= 8_750_000_000, "{}", q.claimable_fees_usd_e6.0);
    assert!(!c.live_ids("NVDAx").contains(&0));
    assert_eq!(c.coll("NVDAx").unwrap().active_committed_q_usd_e6, U128(0));
    assert!(event_with("settled_near", "\"dust_usd_e6\":\"8750000000\""));
}

#[test]
fn sr20_a_signed_leg_delists_a_dust_remainder() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    c.min_quote_usd_e6 = 4_000_000_000; // $3,750 left
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Successful(sig_json(2, 64)));
    let q = c.get_quote(U64(0)).unwrap();
    assert_eq!(q.remaining_usd_e6, U128(0));
    assert!(q.claimable_fees_usd_e6.0 >= 3_750_000_000);
    assert!(!c.live_ids("NVDAx").contains(&0));
    assert_eq!(c.coll("NVDAx").unwrap().active_committed_q_usd_e6, U128(5_000_000_000));
}

#[test]
fn sr20_a_failed_signature_sweeps_nothing() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    c.min_quote_usd_e6 = 4_000_000_000;
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Failed);
    assert_eq!(c.get_quote(U64(0)).unwrap().remaining_usd_e6, U128(15_000_000_000), "the whole escrow is back");
}

#[test]
fn sr20_a_top_up_cannot_relist_dust() {
    let mut c = base(false);
    fund(&mut c, "buyer1.test", 500_000_000, 250, false);
    empty_quote(&mut c, 0);
    let top = r#"{"TopUpQuote":{"quote_id":"0"}}"#;
    assert_eq!(ft(&mut c, usdc(), "buyer1.test", 1, top), 1, "refunded");
    assert_eq!(ft(&mut c, usdc(), "buyer1.test", 100_000_000, top), 0);
}

// ------------------------------------------------------------------ SR-21

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn sr21_recipient_change_needs_one_yocto() {
    let mut c = base(false);
    fund(&mut c, "buyer1.test", 500_000_000, 250, false);
    set_ctx(a("buyer1.test"), 0, T0 + SEC);
    c.set_quote_remote_recipient(U64(0), Some(RCPT.into()));
}

// ------------------------------------------------------------------ SR-24

#[test]
fn sr24_an_aborted_run_leaves_no_lock_on_its_quotes() {
    let mut c = open_remote(true, false);
    quoter_on(&mut c);
    trigger(&mut c);
    assert!(c.nft_transfer_locked("q-0".into()), "locked during the run");
    c.paused = true;
    quoter_cb(&mut c, T0 + 6 * SEC, PromiseResult::Failed);
    c.paused = false;
    assert!(!c.nft_transfer_locked("q-0".into()), "freed by the abort");
    assert_eq!(ft(&mut c, usdc(), "borrower.test", BORROW, REPAY), 0);
    release(&mut c, T0 + 10 * SEC);
    assert_eq!(remote(&c, 0).status, RemoteStatus::Releasing);
    assert!(c.nft_transfer_locked("p-0".into()), "its own Note is locked");
    assert!(!c.nft_transfer_locked("q-0".into()), "an unrelated release does not relock the quote");
}

#[test]
fn sr24_a_signed_leg_locks_its_quote_until_relayed() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    assert!(c.nft_transfer_locked("q-0".into()));
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Successful(sig_json(2, 64)));
    assert!(c.nft_transfer_locked("q-0".into()));
    set_ctx(keeper(), 0, T0 + 7 * SEC);
    c.relay_settlement_result(U64(0), TX.into());
    assert!(!c.nft_transfer_locked("q-0".into()));
}

#[test]
fn sr24_a_failed_signature_frees_the_quote() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Failed);
    assert!(!c.nft_transfer_locked("q-0".into()));
}

// ------------------------------------------------------------------ SR-25

#[test]
#[should_panic(expected = "paused")]
fn sr25_withdraw_claimable_refused_while_paused() {
    let mut c = base(false);
    c.claimable_usdc.insert(a("buyer1.test"), 5);
    c.paused = true;
    set_ctx(a("buyer1.test"), 1, T0);
    let _ = c.withdraw_claimable();
}

// ------------------------------------------------------------------ SR-26

fn refused_loan() -> Nectar {
    let mut c = reserved();
    set_ctx(owner(), 0, T0);
    c.set_oracle_params(U64(1), U64(1), 1500); // every price is stale
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 2 * SEC, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    assert_eq!(remote(&c, 0).status, RemoteStatus::AwaitingDeposit);
    c
}

#[test]
#[should_panic(expected = "borrower only during the retry window")]
fn sr26_stranger_cannot_kill_the_retry() {
    let mut c = refused_loan();
    release(&mut c, T0 + 3 * SEC);
}

#[test]
fn sr26_borrower_may_give_up_the_retry() {
    let mut c = refused_loan();
    set_ctx(borrower(), 0, T0 + 3 * SEC);
    c.request_remote_release(U64(0));
    assert_eq!(remote(&c, 0).status, RemoteStatus::Releasing);
}

#[test]
fn sr26_anyone_may_release_after_expiry() {
    let mut c = refused_loan();
    release(&mut c, T0 + SEC + 1_800 * SEC);
    assert_eq!(remote(&c, 0).status, RemoteStatus::Releasing);
}

// ------------------------------------------------------------------ spec gap: pool withdrawals

fn failed_payout(c: &mut Nectar, payout: Payout, to: &str, amount: u128) {
    cb_ctx(T0 + 7 * SEC, PromiseResult::Failed);
    assert!(!c.on_payout(payout, a(to), U128(amount)));
}

#[test]
fn gap_withdraw_treasury_pays_and_restores_on_failure() {
    let mut c = near_open(250);
    let t0 = c.get_pool().treasury_usd_e6.0;
    assert!(t0 > 10);
    set_ctx(owner(), 1, T0 + 6 * SEC);
    let _ = c.withdraw_treasury(a("ops.test"), U128(10));
    assert_eq!(c.get_pool().treasury_usd_e6.0, t0 - 10);
    assert!(event_with("treasury_withdrawn", "\"amount_usd_e6\":\"10\""));
    failed_payout(&mut c, Payout::Treasury, "ops.test", 10);
    assert_eq!(c.get_pool().treasury_usd_e6.0, t0);
}

#[test]
fn gap_withdraw_lender_fees_pays_and_restores_on_failure() {
    let mut c = near_open(250);
    let f0 = c.get_pool().lenders_fees_usd_e6.0;
    assert!(f0 > 10);
    set_ctx(owner(), 1, T0 + 6 * SEC);
    let _ = c.withdraw_lender_fees(a("lender.test"), U128(10));
    assert_eq!(c.get_pool().lenders_fees_usd_e6.0, f0 - 10);
    failed_payout(&mut c, Payout::LenderFees, "lender.test", 10);
    assert_eq!(c.get_pool().lenders_fees_usd_e6.0, f0);
}

#[test]
fn gap_withdraw_liquidity_returns_it_to_the_lender_and_restores_on_failure() {
    let mut c = base(false);
    let a0 = c.get_pool().available_usd_e6.0;
    set_ctx(owner(), 1, T0 + SEC);
    let _ = c.withdraw_liquidity(a("lender.test"), U128(1_000));
    assert_eq!(c.get_pool().available_usd_e6.0, a0 - 1_000);
    assert_eq!(c.lender_supplied.get(&a("lender.test")).copied(), Some(50_000_000_000 - 1_000));
    failed_payout(&mut c, Payout::Liquidity, "lender.test", 1_000);
    assert_eq!(c.get_pool().available_usd_e6.0, a0);
    assert_eq!(c.lender_supplied.get(&a("lender.test")).copied(), Some(50_000_000_000));
    // all of it: the record is removed
    set_ctx(owner(), 1, T0 + SEC);
    let _ = c.withdraw_liquidity(a("lender.test"), U128(50_000_000_000));
    assert_eq!(c.lender_supplied.get(&a("lender.test")).copied(), None);
}

#[test]
fn gap_withdrawal_refusals() {
    let mut c = near_open(250);
    let t = c.get_pool().treasury_usd_e6;
    let f = c.get_pool().lenders_fees_usd_e6;
    let ops = a("ops.test");
    let lender = a("lender.test");
    // owner only
    set_ctx(a("anyone.test"), 1, T0 + 6 * SEC);
    assert!(panics(|| drop(c.withdraw_treasury(ops.clone(), U128(1)))));
    assert!(panics(|| drop(c.withdraw_lender_fees(ops.clone(), U128(1)))));
    assert!(panics(|| drop(c.withdraw_liquidity(lender.clone(), U128(1)))));
    // 1 yocto
    set_ctx(owner(), 0, T0 + 6 * SEC);
    assert!(panics(|| drop(c.withdraw_treasury(ops.clone(), U128(1)))));
    assert!(panics(|| drop(c.withdraw_lender_fees(ops.clone(), U128(1)))));
    assert!(panics(|| drop(c.withdraw_liquidity(lender.clone(), U128(1)))));
    // zero, above the balance, a non-lender, more than is free
    set_ctx(owner(), 1, T0 + 6 * SEC);
    assert!(panics(|| drop(c.withdraw_treasury(ops.clone(), U128(0)))));
    assert!(panics(|| drop(c.withdraw_treasury(ops.clone(), U128(t.0 + 1)))));
    assert!(panics(|| drop(c.withdraw_lender_fees(ops.clone(), U128(0)))));
    assert!(panics(|| drop(c.withdraw_lender_fees(ops.clone(), U128(f.0 + 1)))));
    assert!(panics(|| drop(c.withdraw_liquidity(ops.clone(), U128(1)))));
    assert!(panics(|| drop(c.withdraw_liquidity(lender.clone(), U128(0)))));
    assert!(panics(|| drop(c.withdraw_liquidity(lender.clone(), U128(50_000_000_000)))), "lent USDC stays lent");
    // paused
    c.paused = true;
    assert!(panics(|| drop(c.withdraw_treasury(ops.clone(), U128(1)))));
    assert!(panics(|| drop(c.withdraw_lender_fees(ops.clone(), U128(1)))));
    assert!(panics(|| drop(c.withdraw_liquidity(lender.clone(), U128(1)))));
    c.paused = false;
    assert_eq!((c.get_pool().treasury_usd_e6, c.get_pool().lenders_fees_usd_e6), (t, f));
}
