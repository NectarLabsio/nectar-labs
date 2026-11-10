//! v2 unit tests (interface-v7.md §A, WO-19): aggregate debt, weekend guard, multiplier, pay_to/claimable,
//! referrers + origination fee, v2 views. Every new public method and panic path.

use super::*;
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{PromiseResult, testing_env};

const T0: u64 = 1_700_000_000_000_000_000;
const SEC: u64 = 1_000_000_000;
const HOUR: u64 = 3_600 * SEC;
const UNITS: u128 = 100_000_000;
const E18: u128 = math::E18;

fn a(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn owner() -> AccountId {
    a("owner.test")
}
fn usdc() -> AccountId {
    a("usdc.test")
}
fn nvdax() -> AccountId {
    a("nvdax.test")
}
fn keeper() -> AccountId {
    a("keeper.test")
}
fn core() -> AccountId {
    a("core.test")
}

fn set_ctx(pred: AccountId, deposit: u128, ts: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(core())
        .predecessor_account_id(pred.clone())
        .signer_account_id(pred)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(ts)
        .prepaid_gas(Gas::from_tgas(300));
    testing_env!(b.build());
}

fn input() -> CollateralInput {
    CollateralInput {
        symbol: "NVDAx".into(),
        token: nvdax(),
        decimals: 6,
        price_feed_id: "TODO-G5".into(),
        base_ltv_bps: 4000,
        max_nectar_ltv_bps: 7000,
        base_haircut_bps: 1000,
        weekend_haircut_bps: 2500,
        limit_premium_bps: 300,
        pre_liq_min_bps: 6500,
        pre_liq_max_bps: 8000,
        verified_dex_depth_usd_e6: U128(0),
        remote_chain: None,
        price_kind: None,
    }
}

fn has_event(name: &str) -> bool {
    get_logs().iter().any(|l| l.starts_with("EVENT_JSON:") && l.contains(&format!("\"event\":\"{name}\"")))
}
fn event_with(name: &str, needle: &str) -> bool {
    get_logs().iter().any(|l| l.contains(&format!("\"event\":\"{name}\"")) && l.contains(needle))
}

fn ft_at(c: &mut Nectar, token: AccountId, sender: &str, amount: u128, msg: &str, ts: u64) -> u128 {
    set_ctx(token, 0, ts);
    match c.ft_on_transfer(a(sender), U128(amount), msg.to_string()) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    }
}
fn ft(c: &mut Nectar, token: AccountId, sender: &str, amount: u128, msg: &str) -> u128 {
    ft_at(c, token, sender, amount, msg, T0 + SEC)
}

fn borrow_msg(borrow: u128) -> String {
    format!(r#"{{"LockCollateralAndBorrow":{{"collateral":"NVDAx","borrow_usd_e6":"{borrow}","pre_liq_ltv_bps":7500}}}}"#)
}
fn borrow_msg_with(borrow: u128, extra: &str) -> String {
    format!(
        r#"{{"LockCollateralAndBorrow":{{"collateral":"NVDAx","borrow_usd_e6":"{borrow}","pre_liq_ltv_bps":7500,{extra}}}}}"#
    )
}

/// Lender $50k, quotes $10k @250 + $5k @400 (Q = 15k -> weekend capacity 11,250), price 180, no borrow.
fn base() -> Nectar {
    set_ctx(owner(), 0, T0);
    let mut c = Nectar::new(owner(), usdc(), keeper());
    c.upsert_collateral("NVDAx".into(), input());
    assert!(c.update_owner_price("NVDAx".into(), U128(180_000_000)));
    set_ctx(owner(), 1_000, T0);
    c.fund_gas_reserve();
    assert_eq!(ft(&mut c, usdc(), "lender.test", 50_000_000_000, r#""SupplyLendingLiquidity""#), 0);
    for (b, amt, d) in [("buyer1.test", 10_000_000_000u128, 250u16), ("buyer2.test", 5_000_000_000, 400)] {
        let m = format!(
            r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":{d},"notice_period_ns":"604800000000000"}}}}"#
        );
        assert_eq!(ft(&mut c, usdc(), b, amt, &m), 0);
    }
    c
}

fn coll(c: &Nectar) -> CollateralConfig {
    c.get_collateral("NVDAx".into()).unwrap()
}

fn window(c: &mut Nectar, open: u64, close: u64) {
    set_ctx(owner(), 0, T0);
    c.set_session_calendar(vec![[U64(open), U64(close)]]);
}

fn fail_payout(c: &mut Nectar, payout: Payout, account: AccountId, amount: u128) -> bool {
    let mut b = VMContextBuilder::new();
    b.current_account_id(core()).predecessor_account_id(core()).block_timestamp(T0 + 9 * SEC);
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed]
    );
    c.on_payout(payout, account, U128(amount))
}

// ------------------------------------------------------------------ A1 aggregate debt

#[test]
fn two_borrowers_cannot_both_draw_full_capacity() {
    let mut c = base();
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(11_250_000_000)), 0);
    assert_eq!(coll(&c).total_debt_usd_e6, U128(11_250_000_000));
    // bob has his own 100 NVDAx: his LTV cap is 12,600 but the shared Q_c + R_c + D_c is drawn
    assert_eq!(ft(&mut c, nvdax(), "bob.test", UNITS, &borrow_msg(11_250_000_000)), UNITS, "full refund");
    assert_eq!(ft(&mut c, nvdax(), "bob.test", UNITS, &borrow_msg(1)), UNITS);
    assert!(get_logs().iter().any(|l| l.contains("refund: aggregate_limit")));
    let p = c.preview_borrow("NVDAx".into(), U128(UNITS), U128(1), None, None, None);
    assert_eq!(p.reason.as_deref(), Some("aggregate_limit"));
    assert_eq!(p.aggregate_headroom_usd_e6, U128(0));
    assert_eq!(p.b_c_usd_e6, U128(0));
    assert_eq!(c.get_config().next_position_id, U64(1));
    let e = c.get_exit_capacity("NVDAx".into());
    assert_eq!(e.total_debt_usd_e6, U128(11_250_000_000));
    assert_eq!(e.aggregate_capacity_usd_e6, U128(11_250_000_000));
    assert_eq!(e.aggregate_headroom_usd_e6, U128(0));
}

#[test]
fn split_capacity_between_two_borrowers_then_repay_frees_headroom() {
    let mut c = base();
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(10_500_000_000)), 0);
    assert_eq!(ft(&mut c, nvdax(), "bob.test", UNITS, &borrow_msg(750_000_000)), 0);
    assert_eq!(ft(&mut c, nvdax(), "bob.test", UNITS, &borrow_msg(1)), UNITS);
    assert_eq!(ft(&mut c, usdc(), "alice.test", 500_000_000, r#"{"Repay":{"position_id":"0"}}"#), 0);
    assert_eq!(coll(&c).total_debt_usd_e6, U128(10_750_000_000));
    assert_eq!(c.get_exit_capacity("NVDAx".into()).aggregate_headroom_usd_e6, U128(500_000_000));
    assert_eq!(ft(&mut c, nvdax(), "bob.test", UNITS, &borrow_msg(500_000_000)), 0);
    assert_eq!(coll(&c).total_debt_usd_e6, U128(11_250_000_000));
}

#[test]
fn settlement_reduces_total_debt() {
    let mut c = base();
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(10_500_000_000)), 0);
    assert_eq!(ft(&mut c, nvdax(), "bob.test", UNITS, &borrow_msg(750_000_000)), 0);
    assert_eq!(ft(&mut c, usdc(), "alice.test", 500_000_000, r#"{"Repay":{"position_id":"0"}}"#), 0);
    for (i, p) in [155_000_000u128, 140_000_000, 130_000_000].iter().enumerate() {
        set_ctx(owner(), 0, T0 + (2 + i as u64) * SEC);
        assert!(c.update_owner_price("NVDAx".into(), U128(*p)));
    }
    set_ctx(keeper(), 0, T0 + 6 * SEC);
    c.trigger_preliquidation(U64(0));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Closed);
    // model.csv agg_a_leg_1: one leg repays all 10,000 of alice's debt
    assert_eq!(coll(&c).total_debt_usd_e6, U128(750_000_000));
    assert_eq!(c.get_exit_capacity("NVDAx".into()).aggregate_headroom_usd_e6, U128(3_000_000_000));
}

#[test]
fn failed_borrow_proceeds_leave_the_aggregate() {
    let mut c = base();
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(5_000_000_000)), 0);
    let net = 5_000_000_000 - 15_000_000; // below static: no premium; origination 30 bps
    assert!(!fail_payout(&mut c, Payout::BorrowProceeds { position_id: U64(0) }, a("alice.test"), net));
    assert_eq!(coll(&c).total_debt_usd_e6, U128(15_000_000));
    assert_eq!(c.get_position(U64(0)).unwrap().debt_usd_e6, U128(15_000_000));
}

// ------------------------------------------------------------------ A2 weekend guard

#[test]
fn empty_calendar_means_closed() {
    let mut c = base();
    let e = c.get_exit_capacity("NVDAx".into());
    assert!(!e.session_open);
    assert_eq!(e.session_reason, "no_calendar");
    window(&mut c, T0 - HOUR, T0 + HOUR);
    assert!(c.get_exit_capacity("NVDAx".into()).session_open);
    set_ctx(owner(), 0, T0);
    c.set_session_calendar(vec![]);
    assert!(has_event("session_calendar_set"));
    let e = c.get_exit_capacity("NVDAx".into());
    assert_eq!(e.session_reason, "no_calendar");
    assert!(c.get_session_calendar(None, None).is_empty());
}

#[test]
fn outside_hours_is_closed() {
    let mut c = base();
    window(&mut c, T0 + HOUR, T0 + 2 * HOUR);
    let e = c.get_exit_capacity("NVDAx".into());
    assert_eq!((e.session_open, e.session_reason.as_str()), (false, "outside_hours"));
}

#[test]
fn price_older_than_900s_flips_to_weekend_parameters() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_dex_depth("NVDAx".into(), U128(5_000_000_000));
    window(&mut c, T0 - HOUR, T0 + 6 * HOUR);
    set_ctx(owner(), 0, T0 + 900 * SEC);
    let open = c.get_exit_capacity("NVDAx".into());
    assert!(open.session_open, "exactly 900 s old is still fresh");
    assert_eq!((open.haircut_bps, open.d_usd_e6), (1000, U128(5_000_000_000)));
    assert_eq!(open.capacity_usd_e6, U128(18_000_000_000));
    set_ctx(owner(), 0, T0 + 901 * SEC);
    let stale = c.get_exit_capacity("NVDAx".into());
    assert_eq!((stale.session_open, stale.session_reason.as_str()), (false, "stale_price"));
    assert_eq!((stale.haircut_bps, stale.d_usd_e6), (2500, U128(0)));
    assert_eq!(stale.capacity_usd_e6, U128(11_250_000_000));
    // borrows still work at weekend parameters (closed max age 86,400 s)
    assert_eq!(ft_at(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(11_250_000_001), T0 + 901 * SEC), UNITS);
    assert_eq!(ft_at(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(11_250_000_000), T0 + 901 * SEC), 0);
    // a fresh price reopens the session
    set_ctx(owner(), 0, T0 + 902 * SEC);
    assert!(c.update_owner_price("NVDAx".into(), U128(181_000_000)));
    assert!(c.get_exit_capacity("NVDAx".into()).session_open);
}

#[test]
fn forced_closed_and_false_cannot_open() {
    let mut c = base();
    window(&mut c, T0 - HOUR, T0 + HOUR);
    set_ctx(owner(), 0, T0);
    c.force_session_closed("NVDAx".into(), true);
    assert!(event_with("session_forced_closed", "\"closed\":true"));
    let e = c.get_exit_capacity("NVDAx".into());
    assert_eq!((e.session_open, e.session_reason.as_str(), e.forced_closed), (false, "forced_closed", true));
    c.force_session_closed("NVDAx".into(), false);
    assert!(c.get_exit_capacity("NVDAx".into()).session_open);
    // outside the window `false` changes nothing
    window(&mut c, T0 + HOUR, T0 + 2 * HOUR);
    set_ctx(owner(), 0, T0);
    c.force_session_closed("NVDAx".into(), false);
    assert_eq!(c.get_exit_capacity("NVDAx".into()).session_reason, "outside_hours");
    // nor with a stale price inside the window
    window(&mut c, T0 - HOUR, T0 + 6 * HOUR);
    set_ctx(owner(), 0, T0 + 1_000 * SEC);
    c.force_session_closed("NVDAx".into(), false);
    assert_eq!(c.get_exit_capacity("NVDAx".into()).session_reason, "stale_price");
}

#[test]
fn reason_precedence_outside_hours_before_stale_and_forced() {
    let mut c = base();
    window(&mut c, T0 + HOUR, T0 + 2 * HOUR);
    set_ctx(owner(), 0, T0);
    c.force_session_closed("NVDAx".into(), true);
    set_ctx(owner(), 0, T0 + 1_000 * SEC);
    assert_eq!(c.get_exit_capacity("NVDAx".into()).session_reason, "outside_hours");
    window(&mut c, T0 - HOUR, T0 + 6 * HOUR);
    set_ctx(owner(), 0, T0 + 1_000 * SEC);
    assert_eq!(c.get_exit_capacity("NVDAx".into()).session_reason, "stale_price");
}

#[test]
#[should_panic(expected = "owner only")]
fn force_session_closed_owner_only() {
    let mut c = base();
    set_ctx(keeper(), 0, T0);
    c.force_session_closed("NVDAx".into(), true);
}

#[test]
fn calendar_set_and_paginate() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    let w: Vec<[U64; 2]> = (0..600u64).map(|i| [U64(T0 + i * 10 * SEC), U64(T0 + i * 10 * SEC + 5 * SEC)]).collect();
    c.set_session_calendar(w.clone());
    assert_eq!(c.get_session_calendar(None, None).len(), 100);
    assert_eq!(c.get_session_calendar(Some(598), Some(10)), w[598..].to_vec());
    assert_eq!(c.get_session_calendar(Some(700), None), Vec::<[U64; 2]>::new());
}

#[test]
#[should_panic(expected = "more than 600 windows")]
fn calendar_over_600_rejected() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    let w: Vec<[U64; 2]> = (0..601u64).map(|i| [U64(i * 10), U64(i * 10 + 5)]).collect();
    c.set_session_calendar(w);
}

#[test]
#[should_panic(expected = "windows must be sorted, non-overlapping, open < close")]
fn calendar_unsorted_rejected() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_session_calendar(vec![[U64(30), U64(40)], [U64(10), U64(20)]]);
}

#[test]
#[should_panic(expected = "windows must be sorted, non-overlapping, open < close")]
fn calendar_overlap_rejected() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_session_calendar(vec![[U64(10), U64(21)], [U64(20), U64(30)]]);
}

#[test]
#[should_panic(expected = "windows must be sorted, non-overlapping, open < close")]
fn calendar_empty_window_rejected() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_session_calendar(vec![[U64(10), U64(10)]]);
}

#[test]
#[should_panic(expected = "owner only")]
fn calendar_owner_only() {
    let mut c = base();
    set_ctx(keeper(), 0, T0);
    c.set_session_calendar(vec![]);
}

// ------------------------------------------------------------------ A3 multiplier

#[test]
fn set_multiplier_bounds() {
    let mut c = base();
    set_ctx(owner(), 0, T0 + 5 * SEC);
    c.set_multiplier("NVDAx".into(), U128(1_050_000_000_000_000_000));
    assert!(event_with("multiplier_updated", "\"source\":\"owner\""));
    let k = coll(&c);
    assert_eq!(k.multiplier_e18, U128(1_050_000_000_000_000_000));
    assert_eq!(k.multiplier_updated_ns, U64(T0 + 5 * SEC));
    assert_eq!(c.get_exit_capacity("NVDAx".into()).multiplier_e18, U128(1_050_000_000_000_000_000));
}

#[test]
#[should_panic(expected = "increase above 5% needs announce_corporate_action")]
fn set_multiplier_above_5pct_refused() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_multiplier("NVDAx".into(), U128(1_050_100_000_000_000_000));
}

#[test]
#[should_panic(expected = "decrease needs announce_corporate_action")]
fn set_multiplier_decrease_refused() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_multiplier("NVDAx".into(), U128(E18 - 1));
}

#[test]
#[should_panic(expected = "owner only")]
fn set_multiplier_owner_only() {
    let mut c = base();
    set_ctx(keeper(), 0, T0);
    c.set_multiplier("NVDAx".into(), U128(E18));
}

#[test]
#[should_panic(expected = "corporate action pending")]
fn set_multiplier_refused_while_pending() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.announce_corporate_action("NVDAx".into(), U128(2 * E18), U64(T0 + HOUR));
    c.set_multiplier("NVDAx".into(), U128(E18));
}

#[test]
#[should_panic(expected = "effective_ns must be at least 1 h ahead")]
fn announce_under_one_hour_refused() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.announce_corporate_action("NVDAx".into(), U128(2 * E18), U64(T0 + HOUR - 1));
}

#[test]
#[should_panic(expected = "multiplier must be > 0")]
fn announce_zero_refused() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.announce_corporate_action("NVDAx".into(), U128(0), U64(T0 + HOUR));
}

#[test]
#[should_panic(expected = "owner only")]
fn announce_owner_only() {
    let mut c = base();
    set_ctx(keeper(), 0, T0);
    c.announce_corporate_action("NVDAx".into(), U128(2 * E18), U64(T0 + HOUR));
}

#[test]
fn borrow_refused_while_ca_pending_repay_continues() {
    let mut c = base();
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(5_000_000_000)), 0);
    set_ctx(owner(), 0, T0 + 2 * SEC);
    c.announce_corporate_action("NVDAx".into(), U128(2 * E18), U64(T0 + 2 * SEC + HOUR));
    assert!(event_with("corporate_action_announced", "\"multiplier_e18\":\"2000000000000000000\""));
    let e = c.get_exit_capacity("NVDAx".into());
    assert!(e.ca_pending);
    assert_eq!(e.ca_effective_ns, U64(T0 + 2 * SEC + HOUR));
    assert_eq!(ft_at(&mut c, nvdax(), "bob.test", UNITS, &borrow_msg(1_000_000), T0 + 3 * SEC), UNITS);
    assert!(get_logs().iter().any(|l| l.contains("refund: ca_pending")));
    set_ctx(owner(), 0, T0 + 3 * SEC);
    let p = c.preview_borrow("NVDAx".into(), U128(UNITS), U128(1_000_000), None, None, None);
    assert_eq!(p.reason.as_deref(), Some("ca_pending"));
    assert_eq!(ft_at(&mut c, usdc(), "alice.test", 1_000_000_000, r#"{"Repay":{"position_id":"0"}}"#, T0 + 3 * SEC), 0);
    assert_eq!(c.get_position(U64(0)).unwrap().debt_usd_e6, U128(4_000_000_000));
}

#[test]
#[should_panic(expected = "corporate action not yet effective")]
fn apply_before_effective_refused() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.announce_corporate_action("NVDAx".into(), U128(2 * E18), U64(T0 + HOUR));
    set_ctx(a("anyone.test"), 0, T0 + HOUR - 1);
    c.apply_corporate_action("NVDAx".into());
}

#[test]
#[should_panic(expected = "no corporate action pending")]
fn apply_without_announcement_refused() {
    let mut c = base();
    set_ctx(a("anyone.test"), 0, T0);
    c.apply_corporate_action("NVDAx".into());
}

#[test]
fn split_two_for_one_leaves_ltv_and_value_unchanged() {
    let mut c = base();
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(10_000_000_000)), 0);
    let before = c.get_health(U64(0));
    set_ctx(owner(), 0, T0 + 2 * SEC);
    c.propose_price("NVDAx".into(), U128(170_000_000)); // pre-split override is voided by the split
    c.announce_corporate_action("NVDAx".into(), U128(2 * E18), U64(T0 + 2 * SEC + HOUR));
    set_ctx(a("anyone.test"), 0, T0 + 2 * SEC + HOUR);
    c.apply_corporate_action("NVDAx".into());
    assert!(event_with("multiplier_updated", "\"source\":\"corporate_action\""));
    let k = coll(&c);
    assert_eq!((k.multiplier_e18, k.oracle_price_usd_e6, k.ca_pending), (U128(2 * E18), U128(90_000_000), false));
    assert_eq!(k.oracle_updated_ns, U64(T0), "price age unchanged by the rescale");
    let after = c.get_health(U64(0));
    assert_eq!(after.value_usd_e6, before.value_usd_e6);
    assert_eq!(after.ltv_bps, before.ltv_bps);
    assert_eq!(c.get_position(U64(0)).unwrap().units, U128(UNITS), "raw units unchanged");
    assert_eq!(c.get_position(U64(0)).unwrap().entry_multiplier_e18, U128(E18), "display only");
    set_ctx(owner(), 0, T0 + 3 * SEC + HOUR);
    // band reference reset: a post-split price within the band of 90 is accepted, the pre-split proposal is gone
    assert!(c.update_owner_price("NVDAx".into(), U128(91_000_000)));
}

#[test]
#[should_panic(expected = "no proposed price")]
fn split_voids_pending_price_proposal() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.propose_price("NVDAx".into(), U128(170_000_000));
    c.announce_corporate_action("NVDAx".into(), U128(2 * E18), U64(T0 + HOUR));
    set_ctx(a("anyone.test"), 0, T0 + HOUR);
    c.apply_corporate_action("NVDAx".into());
    set_ctx(owner(), 0, T0 + HOUR + SEC);
    c.apply_price("NVDAx".into());
}

#[test]
fn settlement_after_split_seizes_model_units() {
    let mut c = base();
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(11_250_000_000)), 0);
    set_ctx(owner(), 0, T0 + 2 * SEC);
    c.announce_corporate_action("NVDAx".into(), U128(2 * E18), U64(T0 + 2 * SEC + HOUR));
    set_ctx(a("anyone.test"), 0, T0 + 2 * SEC + HOUR);
    c.apply_corporate_action("NVDAx".into()); // price 90
    for (i, p) in [80_000_000u128, 70_000_000].iter().enumerate() {
        set_ctx(owner(), 0, T0 + (3 + i as u64) * SEC + HOUR);
        assert!(c.update_owner_price("NVDAx".into(), U128(*p)));
    }
    set_ctx(keeper(), 0, T0 + 6 * SEC + HOUR);
    c.trigger_preliquidation(U64(0));
    // model.csv mult_leg_split: repay 10,000, buyer 73,260,074 raw units, keeper 366,301
    let l = get_logs().into_iter().find(|l| l.contains("settled_near")).unwrap();
    assert!(l.contains(r#""repay_usd_e6":"10000000000""#) && l.contains(r#""seize_units":"73260074""#), "{l}");
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Closed);
}

#[test]
fn token_includes_multiplier_ignores_m_and_keeps_price() {
    set_ctx(owner(), 0, T0);
    let mut c = Nectar::new(owner(), usdc(), keeper());
    let mut i = input();
    i.price_kind = Some(PriceKind::TokenIncludesMultiplier);
    c.upsert_collateral("NVDAx".into(), i);
    assert!(c.update_owner_price("NVDAx".into(), U128(180_000_000)));
    c.announce_corporate_action("NVDAx".into(), U128(2 * E18), U64(T0 + HOUR));
    set_ctx(a("anyone.test"), 0, T0 + HOUR);
    c.apply_corporate_action("NVDAx".into());
    let k = coll(&c);
    assert_eq!((k.multiplier_e18, k.oracle_price_usd_e6), (U128(2 * E18), U128(180_000_000)));
    let e = c.get_exit_capacity("NVDAx".into());
    assert_eq!(e.price_kind, PriceKind::TokenIncludesMultiplier);
    // per whole token: 180 * 70 % (M ignored)
    assert_eq!(e.b_c_usd_per_unit_e6, Some(U128(126_000_000)));
}

#[test]
fn underlying_multiplier_values_per_unit_with_m() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_multiplier("NVDAx".into(), U128(1_020_000_000_000_000_000));
    // per whole token: 1.02 * 180 * 70 %
    assert_eq!(c.get_exit_capacity("NVDAx".into()).b_c_usd_per_unit_e6, Some(U128(128_520_000)));
    let p = c.preview_borrow("NVDAx".into(), U128(UNITS), U128(10_000_000_000), None, None, None);
    assert_eq!(p.multiplier_e18, U128(1_020_000_000_000_000_000));
    assert_eq!(p.static_limit_usd_e6, U128(7_344_000_000), "model mult_dividend_2pct: V 18,360");
}

#[test]
#[should_panic(expected = "price_kind change with open debt")]
fn price_kind_change_with_debt_refused() {
    let mut c = base();
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(1_000_000_000)), 0);
    let mut i = input();
    i.price_kind = Some(PriceKind::TokenIncludesMultiplier);
    set_ctx(owner(), 0, T0);
    c.upsert_collateral("NVDAx".into(), i);
}

// ------------------------------------------------------------------ A4 pay_to + claimable

#[test]
fn pay_to_failure_credits_borrower_claimable_then_withdraw() {
    let mut c = base();
    let m = borrow_msg_with(5_000_000_000, r#""pay_to":{"receiver_id":"merchant.test","memo":"inv-42"}"#);
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &m), 0);
    assert!(event_with("position_opened", "\"pay_to\":\"merchant.test\""));
    let net = 5_000_000_000 - 15_000_000;
    let payout = Payout::PayTo { position_id: U64(0), borrower: a("alice.test") };
    assert!(!fail_payout(&mut c, payout, a("merchant.test"), net));
    assert!(event_with("pay_to_failed", "\"receiver_id\":\"merchant.test\""));
    assert_eq!(c.get_claimable(a("alice.test")), U128(net));
    assert_eq!(c.get_position(U64(0)).unwrap().debt_usd_e6, U128(5_000_000_000), "debt stands");
    set_ctx(a("alice.test"), 1, T0 + 10 * SEC);
    let _ = c.withdraw_claimable();
    assert!(event_with("claimable_withdrawn", &format!("\"amount_usd_e6\":\"{net}\"")));
    assert_eq!(c.get_claimable(a("alice.test")), U128(0));
    // failed withdrawal restores it
    assert!(!fail_payout(&mut c, Payout::Claimable, a("alice.test"), net));
    assert_eq!(c.get_claimable(a("alice.test")), U128(net));
}

#[test]
fn pay_to_memo_too_long_refunds() {
    let mut c = base();
    let memo = "x".repeat(129);
    let m = borrow_msg_with(1_000_000, &format!(r#""pay_to":{{"receiver_id":"merchant.test","memo":"{memo}"}}"#));
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &m), UNITS);
}

#[test]
#[should_panic(expected = "nothing to withdraw")]
fn withdraw_claimable_nothing() {
    let mut c = base();
    set_ctx(a("alice.test"), 1, T0);
    let _ = c.withdraw_claimable();
}

#[test]
#[should_panic(expected = "exactly 1 yoctoNEAR")]
fn withdraw_claimable_requires_one_yocto() {
    let mut c = base();
    set_ctx(a("alice.test"), 0, T0);
    let _ = c.withdraw_claimable();
}

#[test]
fn get_claimable_default_zero() {
    let c = base();
    assert_eq!(c.get_claimable(a("nobody.test")), U128(0));
}

// ------------------------------------------------------------------ A5 referrers + origination

#[test]
fn referrer_registry() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    assert!(!c.is_referrer(a("ref.test")));
    c.register_referrer(a("ref.test"));
    assert!(has_event("referrer_registered"));
    assert!(c.is_referrer(a("ref.test")));
    c.unregister_referrer(a("ref.test"));
    assert!(has_event("referrer_unregistered"));
    assert!(!c.is_referrer(a("ref.test")));
}

#[test]
#[should_panic(expected = "owner only")]
fn register_referrer_owner_only() {
    let mut c = base();
    set_ctx(keeper(), 0, T0);
    c.register_referrer(keeper());
}

#[test]
#[should_panic(expected = "owner only")]
fn unregister_referrer_owner_only() {
    let mut c = base();
    set_ctx(keeper(), 0, T0);
    c.unregister_referrer(keeper());
}

#[test]
fn referrer_equal_to_borrower_refused_with_full_refund() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.register_referrer(a("alice.test"));
    let m = borrow_msg_with(5_000_000_000, r#""referrer":"alice.test""#);
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &m), UNITS);
    assert!(get_logs().iter().any(|l| l.contains("refund: referrer_is_borrower")));
    assert_eq!(c.get_config().next_position_id, U64(0));
    assert_eq!(coll(&c).total_debt_usd_e6, U128(0));
    set_ctx(owner(), 0, T0);
    let p = c.preview_borrow("NVDAx".into(), U128(UNITS), U128(1_000_000), Some(a("alice.test")), Some(a("alice.test")), None);
    assert_eq!(p.reason.as_deref(), Some("referrer_is_borrower"));
}

#[test]
fn registered_referrer_gets_half_the_origination_fee() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.register_referrer(a("ref.test"));
    let t0 = c.get_pool().treasury_usd_e6.0;
    let m = borrow_msg_with(11_250_000_000, r#""referrer":"ref.test""#);
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &m), 0);
    // origination 33.75 -> referrer 16.875, treasury 16.875 + premium share 12.15
    assert!(event_with("referrer_paid", "\"amount_usd_e6\":\"16875000\""));
    assert_eq!(c.get_claimable(a("ref.test")), U128(16_875_000));
    assert_eq!(c.get_pool().treasury_usd_e6.0 - t0, 16_875_000 + 12_150_000);
    set_ctx(owner(), 0, T0 + 2 * SEC);
    let p = c.preview_borrow("NVDAx".into(), U128(UNITS), U128(0), Some(a("ref.test")), None, None);
    assert_eq!(p.referrer_share_usd_e6, U128(0));
}

#[test]
fn unregistered_referrer_fee_goes_to_treasury() {
    let mut c = base();
    let t0 = c.get_pool().treasury_usd_e6.0;
    let m = borrow_msg_with(11_250_000_000, r#""referrer":"stranger.test""#);
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &m), 0);
    assert!(!has_event("referrer_paid"));
    assert_eq!(c.get_claimable(a("stranger.test")), U128(0));
    assert_eq!(c.get_pool().treasury_usd_e6.0 - t0, 33_750_000 + 12_150_000);
}

#[test]
fn preview_with_registered_referrer_returns_fee_stack() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.register_referrer(a("ref.test"));
    let p = c.preview_borrow("NVDAx".into(), U128(UNITS), U128(11_250_000_000), Some(a("ref.test")), Some(a("alice.test")), None);
    assert!(p.ok, "{:?}", p.reason);
    assert_eq!(p.origination_fee_usd_e6, U128(33_750_000));
    assert_eq!(p.referrer_share_usd_e6, U128(16_875_000));
    assert_eq!(p.total_fees_usd_e6, U128(121_500_000 + 33_750_000));
    assert_eq!(p.net_proceeds_usd_e6, U128(11_250_000_000 - 121_500_000 - 33_750_000));
}

#[test]
fn set_origination_fee_bps_bounds() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_origination_fee_bps(100);
    assert_eq!(c.get_config().origination_fee_bps, 100);
    c.set_origination_fee_bps(0);
    let p = c.preview_borrow("NVDAx".into(), U128(UNITS), U128(1_000_000_000), None, None, None);
    assert_eq!(p.origination_fee_usd_e6, U128(0));
    assert_eq!(p.net_proceeds_usd_e6, U128(1_000_000_000));
}

#[test]
#[should_panic(expected = "origination_fee_bps > 100")]
fn set_origination_fee_bps_above_100_refused() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_origination_fee_bps(101);
}

#[test]
#[should_panic(expected = "owner only")]
fn set_origination_fee_bps_owner_only() {
    let mut c = base();
    set_ctx(keeper(), 0, T0);
    c.set_origination_fee_bps(10);
}

#[test]
fn reserved_fields_present_and_zero() {
    let c = base();
    let k = coll(&c);
    assert_eq!((k.weekend_ref_price_e6, k.weekend_ref_updated_ns), (U128(0), U64(0)));
    assert_eq!(k.reserve, ReservePool::default());
    assert_eq!((k.ca_multiplier_e18, k.forced_closed), (U128(0), false));
}
