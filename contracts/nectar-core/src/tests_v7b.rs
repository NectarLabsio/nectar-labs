//! WO-23a unit tests: Shields, Profit-Lock (NEAR + remote `|kind=SELF`), fee stack, reservation deposit, OutLayer
//! job hooks (calendar can only close, multiplier bounded). Every new public method and panic path.

use super::*;
use crate::remote::RESERVE_DEPOSIT_YOCTO;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{VMContextBuilder, get_created_receipts, get_logs};
use near_sdk::{PromiseResult, testing_env};

const T0: u64 = 1_700_000_000_000_000_000;
const SEC: u64 = 1_000_000_000;
const HOUR: u64 = 3_600 * SEC;
const UNITS: u128 = 100_000_000;
const E18: u128 = math::E18;
const VAULT: &str = "Nectar1Vau1t11111111111111111111111111111111";
const RCPT: &str = "3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV";
const AUTH_B58: &str = "2fhY3GjCcp4LU75uiiChUqQg9fS6xCtptLYZUdKJibpN";
const DEPOSITOR: &str = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const VR_DEPOSIT: u128 = 100;

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
fn core() -> AccountId {
    a("core.test")
}
fn alice() -> AccountId {
    a("alice.test")
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
fn cb_ctx(ts: u64, result: PromiseResult) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(core()).predecessor_account_id(core()).block_timestamp(ts).prepaid_gas(Gas::from_tgas(60));
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
}
fn ok_bytes(s: &str) -> PromiseResult {
    PromiseResult::Successful(s.as_bytes().to_vec())
}
fn has_event(name: &str) -> bool {
    get_logs().iter().any(|l| l.starts_with("EVENT_JSON:") && l.contains(&format!("\"event\":\"{name}\"")))
}
fn event_with(name: &str, needle: &str) -> bool {
    get_logs().iter().any(|l| l.contains(&format!("\"event\":\"{name}\"")) && l.contains(needle))
}
fn refund_logged(reason: &str) -> bool {
    get_logs().iter().any(|l| l == &format!("refund: {reason}"))
}
fn near_transfer_to(who: &AccountId, yocto: u128) -> bool {
    get_created_receipts().iter().any(|r| {
        &r.receiver_id == who
            && r.actions.iter().any(|x| matches!(x, MockAction::Transfer { deposit, .. } if deposit.as_yoctonear() == yocto))
    })
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
fn fund(c: &mut Nectar, buyer: &str, amt: u128, disc: u16, remote: bool, opt_in: bool) {
    let rr = if remote { format!("\"{RCPT}\"") } else { "null".into() };
    let m = format!(
        r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":{disc},"notice_period_ns":"604800000000000","buyer_remote_recipient":{rr},"accepts_voluntary_fills":{opt_in}}}}}"#
    );
    assert_eq!(ft(c, usdc(), buyer, amt, &m), 0);
}
fn borrow_msg(borrow: u128, extra: &str) -> String {
    format!(r#"{{"LockCollateralAndBorrow":{{"collateral":"NVDAx","borrow_usd_e6":"{borrow}","pre_liq_ltv_bps":7500{extra}}}}}"#)
}
fn shield(kind: &str, end: u64) -> String {
    format!(r#","shield":{{"kind":"{kind}","window_end_ns":"{end}"}}"#)
}

/// Price 180 @T0, gas reserve, lender $50k, quotes $10k @250 + $5k @400 (not opted in). Closed session (no calendar).
fn base() -> Nectar {
    set_ctx(owner(), 0, T0);
    let mut c = Nectar::new(owner(), usdc(), a("keeper.test"));
    c.upsert_collateral("NVDAx".into(), input());
    assert!(c.update_owner_price("NVDAx".into(), U128(180_000_000)));
    set_ctx(owner(), 1_000, T0);
    c.fund_gas_reserve();
    assert_eq!(ft(&mut c, usdc(), "lender.test", 50_000_000_000, r#""SupplyLendingLiquidity""#), 0);
    fund(&mut c, "buyer1.test", 10_000_000_000, 250, false, false);
    fund(&mut c, "buyer2.test", 5_000_000_000, 400, false, false);
    c
}
fn coll(c: &Nectar) -> CollateralConfig {
    c.get_collateral("NVDAx".into()).unwrap()
}

/// In session at T0+1s (window [T0, T0+6h)), next window opens at T0+20h; D = $5k.
fn in_session() -> Nectar {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_session_calendar(vec![[U64(T0), U64(T0 + 6 * HOUR)], [U64(T0 + 20 * HOUR), U64(T0 + 26 * HOUR)]]);
    c.set_dex_depth("NVDAx".into(), U128(5_000_000_000));
    c
}

// ------------------------------------------------------------------ math

#[test]
fn math_helpers() {
    let w = [(10, 20), (30, 40)];
    assert_eq!(math::next_window_open(&w, 5), Some(10));
    assert_eq!(math::next_window_open(&w, 10), Some(30));
    assert_eq!(math::next_window_open(&w, 35), None);
    assert_eq!(math::shield_fee(10_000_000_000, 15).unwrap(), 15_000_000);
    assert_eq!(math::shield_fee(1, 15).unwrap(), 1, "rounded up");
    assert_eq!(math::profit_lock_fill(10_000_000_000, 50).unwrap(), (50_000_000, 10_050_000_000));
    assert_eq!(math::profit_lock_fill(1, 50).unwrap(), (1, 2));
}

// ------------------------------------------------------------------ Shields

#[test]
fn shield_sized_at_weekend_params_in_session_and_fee_replaces_premium() {
    let mut c = in_session();
    assert!(c.get_exit_capacity("NVDAx".into()).session_open);
    let p = c.preview_borrow("NVDAx".into(), U128(UNITS), U128(11_251_000_000), None, None, None);
    assert!(p.ok, "in session: capacity 18,000");
    let end = T0 + 20 * HOUR;
    let ps = c.preview_borrow(
        "NVDAx".into(),
        U128(UNITS),
        U128(11_251_000_000),
        None,
        Some(alice()),
        Some(ShieldInput { kind: ShieldKind::Weekend, window_end_ns: U64(end) }),
    );
    assert_eq!(ps.reason.as_deref(), Some(ERR_AGGREGATE_LIMIT), "shield capacity = weekend 11,250");
    assert_eq!(ps.shield_fee_usd_e6, U128(16_876_500));
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(11_251_000_000, &shield("Weekend", end))), UNITS);
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(10_000_000_000, &shield("Weekend", end))), 0);
    let pos = c.get_position(U64(0)).unwrap();
    assert_eq!(pos.premium_usd_e6, U128(15_000_000), "15 bps flat, not 3% of borrow above static");
    let s = pos.shield.unwrap();
    assert_eq!((s.kind, s.window_end_ns, s.fee_bps), (ShieldKind::Weekend, U64(end), 15));
    assert!(event_with("shield_opened", "\"fee_usd_e6\":\"15000000\""));
    assert!(event_with("position_opened", "\"net_proceeds_usd_e6\":\"9955000000\""));
    // same split as the premium: 70% buyers (fee index), 20% lenders, 10% treasury (+ origination)
    assert_eq!(c.get_pool().lenders_fees_usd_e6, U128(3_000_000));
    assert_eq!(c.get_pool().treasury_usd_e6, U128(1_500_000 + 30_000_000));
    let v = c.get_shield(U64(0)).unwrap();
    assert!(v.active && v.committed_buyers_only);
    assert_eq!(v.fee_usd_e6, U128(15_000_000));
    set_ctx(owner(), 0, end);
    assert!(!c.get_shield(U64(0)).unwrap().active, "an ordinary position after the window");
    assert!(c.get_shield(U64(9)).is_none());
}

#[test]
fn shield_window_and_minimum_refusals() {
    let mut c = in_session();
    let next = T0 + 20 * HOUR;
    let cases = [
        (borrow_msg(4_999_999, &shield("Weekend", next)), "shield below minimum"),
        (borrow_msg(5_000_000, &shield("Weekend", T0)), "shield window ended"),
        (borrow_msg(5_000_000, &shield("Weekend", next + 1)), "weekend shield must end at the next session open"),
        (borrow_msg(5_000_000, &shield("Event", T0 + HOUR)), "no event window"),
    ];
    for (msg, why) in cases {
        assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &msg), UNITS, "{why}");
        assert!(refund_logged(why), "{why}");
    }
    set_ctx(owner(), 0, T0);
    c.set_session_calendar(vec![[U64(T0), U64(T0 + 6 * HOUR)], [U64(T0 + 70 * HOUR), U64(T0 + 76 * HOUR)]]);
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(5_000_000, &shield("Weekend", T0 + 70 * HOUR))), UNITS);
    assert!(refund_logged("weekend shield above 65.5 h"));
    set_ctx(owner(), 0, T0);
    c.set_session_calendar(vec![[U64(T0), U64(T0 + 6 * HOUR)]]);
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(5_000_000, &shield("Weekend", T0 + 6 * HOUR))), UNITS);
    assert!(refund_logged("no next session"));
    // event windows: curator end, 72 h cap
    set_ctx(owner(), 0, T0);
    c.set_shield_params("NVDAx".into(), 15, 25, U64(T0 + 100 * HOUR));
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(5_000_000, &shield("Event", T0 + 101 * HOUR))), UNITS);
    assert!(refund_logged("event shield ends after the event window"));
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(5_000_000, &shield("Event", T0 + 80 * HOUR))), UNITS);
    assert!(refund_logged("event shield above 72 h"));
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(1_000_000_000, &shield("Event", T0 + 72 * HOUR))), 0);
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.premium_usd_e6, p.shield.unwrap().fee_bps), (U128(2_500_000), 25));
}

#[test]
fn shield_five_opens_per_day_then_refused_until_next_utc_day() {
    let mut c = in_session();
    let end = T0 + 20 * HOUR;
    for _ in 0..5 {
        assert_eq!(ft(&mut c, nvdax(), "alice.test", 1_000_000, &borrow_msg(5_000_000, &shield("Weekend", end))), 0);
    }
    assert_eq!(c.get_shield_opens_today(alice()), 5);
    assert_eq!(ft(&mut c, nvdax(), "alice.test", 1_000_000, &borrow_msg(5_000_000, &shield("Weekend", end))), 1_000_000);
    assert!(refund_logged("shield daily limit"));
    let p = c.preview_borrow(
        "NVDAx".into(),
        U128(1_000_000),
        U128(5_000_000),
        None,
        Some(alice()),
        Some(ShieldInput { kind: ShieldKind::Weekend, window_end_ns: U64(end) }),
    );
    assert_eq!(p.reason.as_deref(), Some("shield daily limit"));
    assert_eq!(ft(&mut c, nvdax(), "bob.test", 1_000_000, &borrow_msg(5_000_000, &shield("Weekend", end))), 0, "per account");
    // a plain borrow is not counted
    assert_eq!(ft(&mut c, nvdax(), "alice.test", 1_000_000, &borrow_msg(5_000_000, "")), 0);
    // next UTC day (T0 is 22:13 UTC): the count restarts
    let day2 = (T0 / DAY_NS + 1) * DAY_NS + SEC;
    set_ctx(owner(), 0, day2);
    assert_eq!(c.get_shield_opens_today(alice()), 0);
}

#[test]
#[should_panic(expected = "owner only")]
fn set_shield_params_owner_only() {
    let mut c = base();
    set_ctx(alice(), 0, T0);
    c.set_shield_params("NVDAx".into(), 15, 25, U64(0));
}
#[test]
#[should_panic(expected = "shield fee > 1000 bps")]
fn set_shield_params_fee_bound() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_shield_params("NVDAx".into(), 1001, 25, U64(0));
}
#[test]
#[should_panic(expected = "event window must end in the future")]
fn set_shield_params_event_in_past() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_shield_params("NVDAx".into(), 15, 25, U64(T0));
}
#[test]
#[should_panic(expected = "unknown collateral")]
fn set_shield_params_unknown_symbol() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_shield_params("TSLAx".into(), 15, 25, U64(0));
}

#[test]
fn fee_stack_view() {
    let mut c = base();
    let d = c.get_fee_stack(None);
    assert_eq!(
        (d.limit_premium_bps, d.shield_weekend_fee_bps, d.shield_event_fee_bps, d.origination_fee_bps),
        (None, 15, 25, 30)
    );
    assert_eq!((d.referrer_share_bps, d.profit_lock_fee_bps, d.keeper_fee_bps), (5000, 50, 50));
    set_ctx(owner(), 0, T0);
    c.set_shield_params("NVDAx".into(), 20, 40, U64(0));
    let s = c.get_fee_stack(Some("NVDAx".into()));
    assert_eq!((s.limit_premium_bps, s.shield_weekend_fee_bps, s.shield_event_fee_bps), (Some(300), 20, 40));
    assert_eq!(s.fee_split.buyers_bps, 7000);
}

// ------------------------------------------------------------------ Profit-Lock (NEAR-held)

/// alice borrows $10k on 100 NVDAx @180 (position 0); buyer3 $12k @200 opted in; daily cap $20k.
fn opened() -> Nectar {
    let mut c = base();
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(10_000_000_000, "")), 0);
    fund(&mut c, "buyer3.test", 12_000_000_000, 200, false, true);
    set_ctx(owner(), 0, T0);
    c.set_max_voluntary_fill("NVDAx".into(), U128(20_000_000_000));
    c
}
fn settle_self(c: &mut Nectar, who: AccountId, ts: u64) {
    set_ctx(who, 1, ts);
    c.self_settle(U64(0));
}

#[test]
fn self_settle_happy_path_exact_units() {
    let mut c = opened();
    let pre = c.preview_self_settle(U64(0));
    let (q_units, _) = math::seize_units_m(10_050_000_000, E18, 180_000_000, 6, 200, 0).unwrap();
    assert!(pre.ok, "{:?}", pre.reason);
    assert_eq!((pre.fee_usd_e6, pre.fill_usd_e6, pre.units_repaid), (U128(50_000_000), U128(10_050_000_000), U128(q_units)));
    assert_eq!(pre.units_kept, U128(UNITS - q_units));
    let pool0 = c.get_pool();
    settle_self(&mut c, alice(), T0 + 2 * SEC);
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6, p.units), (PositionStatus::Closed, U128(0), U128(0)));
    let q = c.get_quote(U64(2)).unwrap();
    assert_eq!(q.remaining_usd_e6, U128(12_000_000_000 - 10_050_000_000));
    let pool = c.get_pool();
    assert_eq!(pool.treasury_usd_e6.0 - pool0.treasury_usd_e6.0, 50_000_000);
    assert_eq!(pool.utilised_usd_e6, U128(0));
    assert_eq!(pool.available_usd_e6.0 - pool0.available_usd_e6.0, 10_000_000_000);
    let cc = coll(&c);
    assert_eq!((cc.total_debt_usd_e6, cc.voluntary_filled_today_e6), (U128(0), U128(10_050_000_000)));
    assert_eq!(cc.active_committed_q_usd_e6, U128(15_000_000_000 + 1_950_000_000));
    assert!(event_with("self_settled", &format!("\"units_repaid\":\"{q_units}\"")));
    assert!(event_with("self_settled", &format!("\"units_kept\":\"{}\"", UNITS - q_units)));
    assert_eq!(get_created_receipts().iter().filter(|r| r.receiver_id == nvdax()).count(), 2, "buyer + borrower");
    assert_eq!(c.preview_self_settle(U64(0)).reason.as_deref(), Some("position not open"));
}

#[test]
fn self_settle_fills_opted_in_quotes_in_ascending_discount() {
    let mut c = base();
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(10_000_000_000, "")), 0);
    fund(&mut c, "buyera.test", 5_000_000_000, 300, false, true);
    fund(&mut c, "buyerb.test", 6_000_000_000, 200, false, true);
    set_ctx(owner(), 0, T0);
    c.set_max_voluntary_fill("NVDAx".into(), U128(20_000_000_000));
    let pre = c.preview_self_settle(U64(0));
    let ub = math::seize_units_m(6_000_000_000, E18, 180_000_000, 6, 200, 0).unwrap().0;
    let ua = math::seize_units_m(4_050_000_000, E18, 180_000_000, 6, 300, 0).unwrap().0;
    assert_eq!(pre.legs.len(), 2);
    assert_eq!((pre.legs[0].quote_id, pre.legs[0].fill_usd_e6, pre.legs[0].units), (U64(3), U128(6_000_000_000), U128(ub)));
    assert_eq!((pre.legs[1].quote_id, pre.legs[1].fill_usd_e6, pre.legs[1].units), (U64(2), U128(4_050_000_000), U128(ua)));
    settle_self(&mut c, alice(), T0 + 2 * SEC);
    assert!(c.list_quotes("NVDAx".into(), None, None).iter().all(|q| q.quote_id != U64(3)), "emptied quote unlisted");
    assert_eq!(c.get_quote(U64(2)).unwrap().remaining_usd_e6, U128(950_000_000));
}

#[test]
fn self_settle_daily_cap_resets_next_day() {
    let mut c = opened();
    set_ctx(owner(), 0, T0);
    c.set_max_voluntary_fill("NVDAx".into(), U128(10_049_999_999));
    assert_eq!(c.preview_self_settle(U64(0)).reason.as_deref(), Some("voluntary daily cap"));
    c.set_max_voluntary_fill("NVDAx".into(), U128(10_050_000_000));
    // a stale counter from yesterday does not count
    let mut cc = coll(&c);
    cc.voluntary_day = shields::utc_day(T0) - 1;
    cc.voluntary_filled_today_e6 = U128(10_050_000_000);
    c.put_coll(cc);
    assert!(c.preview_self_settle(U64(0)).ok);
    assert!(event_with("voluntary_fill_cap_set", "10050000000"));
}

fn self_settle_fails_with(setup: impl FnOnce(&mut Nectar)) {
    let mut c = opened();
    setup(&mut c);
    settle_self(&mut c, alice(), T0 + 9 * SEC);
}

#[test]
#[should_panic(expected = "no voluntary capacity")]
fn self_settle_without_opted_in_capacity() {
    let mut c = base();
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(10_000_000_000, "")), 0);
    set_ctx(owner(), 0, T0);
    c.set_max_voluntary_fill("NVDAx".into(), U128(20_000_000_000));
    settle_self(&mut c, alice(), T0 + 2 * SEC);
}
#[test]
#[should_panic(expected = "voluntary daily cap")]
fn self_settle_above_daily_cap() {
    self_settle_fails_with(|c| {
        set_ctx(owner(), 0, T0);
        c.set_max_voluntary_fill("NVDAx".into(), U128(0));
    });
}
#[test]
#[should_panic(expected = "health below 1")]
fn self_settle_health_below_one() {
    self_settle_fails_with(|c| {
        set_ctx(owner(), 0, T0 + 2 * SEC);
        assert!(c.update_owner_price("NVDAx".into(), U128(155_000_000)));
        set_ctx(owner(), 0, T0 + 3 * SEC);
        assert!(c.update_owner_price("NVDAx".into(), U128(132_000_000)));
    });
}
#[test]
#[should_panic(expected = "ca_pending")]
fn self_settle_ca_pending() {
    self_settle_fails_with(|c| {
        set_ctx(owner(), 0, T0);
        c.announce_corporate_action("NVDAx".into(), U128(2 * E18), U64(T0 + 2 * HOUR));
    });
}
#[test]
#[should_panic(expected = "oracle stale")]
fn self_settle_oracle_stale() {
    let mut c = opened();
    settle_self(&mut c, alice(), T0 + DAY_NS + SEC);
}
#[test]
#[should_panic(expected = "borrower only")]
fn self_settle_borrower_only() {
    let mut c = opened();
    settle_self(&mut c, a("mallory.test"), T0 + 2 * SEC);
}
#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn self_settle_needs_one_yocto() {
    let mut c = opened();
    set_ctx(alice(), 0, T0 + 2 * SEC);
    c.self_settle(U64(0));
}
#[test]
#[should_panic(expected = "paused")]
fn self_settle_paused() {
    self_settle_fails_with(|c| {
        set_ctx(owner(), 0, T0);
        c.pause();
    });
}
#[test]
#[should_panic(expected = "position not open")]
fn self_settle_closed_position() {
    let mut c = opened();
    settle_self(&mut c, alice(), T0 + 2 * SEC);
    settle_self(&mut c, alice(), T0 + 3 * SEC);
}
#[test]
#[should_panic(expected = "unknown position")]
fn self_settle_unknown_position() {
    let mut c = opened();
    set_ctx(alice(), 1, T0 + 2 * SEC);
    c.self_settle(U64(7));
}
#[test]
#[should_panic(expected = "owner only")]
fn set_max_voluntary_fill_owner_only() {
    let mut c = base();
    set_ctx(alice(), 0, T0);
    c.set_max_voluntary_fill("NVDAx".into(), U128(1));
}

#[test]
fn preview_self_settle_reasons() {
    let mut c = opened();
    assert_eq!(c.preview_self_settle(U64(9)).reason.as_deref(), Some("unknown position"));
    set_ctx(owner(), 0, T0);
    c.pause();
    assert_eq!(c.preview_self_settle(U64(0)).reason.as_deref(), Some("paused"));
    c.unpause();
    c.set_max_voluntary_fill("NVDAx".into(), U128(0));
    let p = c.preview_self_settle(U64(0));
    assert_eq!((p.ok, p.fill_usd_e6, p.daily_cap_usd_e6), (false, U128(10_050_000_000), U128(0)));
}

#[test]
fn opted_in_quote_event_and_flag() {
    let c = opened();
    assert!(c.get_quote(U64(2)).unwrap().accepts_voluntary_fills);
    assert!(!c.get_quote(U64(0)).unwrap().accepts_voluntary_fills, "default false");
}

// ------------------------------------------------------------------ remote: deposit + SELF leg

fn chain_base() -> Nectar {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_remote_chain(
        "NVDAx".into(),
        Some(RemoteChain { chain_id: "solana-devnet".into(), vault_program: VAULT.into(), mpc_domain_id: 1 }),
    );
    c.set_signer_config(a("v1.signer-prod.testnet"), "solana-devnet-v1".into(), 15, 3600);
    c.set_vault_read_config("nectar.testnet/vault-read".into(), "ab".repeat(32), U128(VR_DEPOSIT), 50);
    c
}
fn reserve_at(c: &mut Nectar, deposit: u128, borrow: u128) -> u64 {
    set_ctx(alice(), deposit, T0 + SEC);
    c.reserve_remote_position("NVDAx".into(), U128(UNITS), U128(borrow), 7500, None, None, None).0
}
fn authority_ok(c: &mut Nectar, id: u64) {
    cb_ctx(T0 + SEC, PromiseResult::Successful(serde_json::to_vec(&format!("ed25519:{AUTH_B58}")).unwrap()));
    c.on_authority(U64(id));
}
fn confirm_and_verify(c: &mut Nectar, id: u64) {
    set_ctx(a("anyone.test"), 0, T0 + 2 * SEC);
    c.confirm_remote_deposit(U64(id));
    cb_ctx(
        T0 + 2 * SEC,
        ok_bytes(&format!(
            r#"{{"position_id":"{id}","units":"{UNITS}","authority":"ed25519:{AUTH_B58}","depositor":"{DEPOSITOR}","slot_or_block":412345678}}"#
        )),
    );
    c.on_deposit_verified(U64(id));
}

#[test]
#[should_panic(expected = "attach the reservation deposit (0.05 NEAR)")]
fn reserve_refused_below_deposit() {
    let mut c = chain_base();
    reserve_at(&mut c, RESERVE_DEPOSIT_YOCTO - 1, 10_000_000_000);
}

#[test]
fn reservation_deposit_refunded_on_confirm() {
    let mut c = chain_base();
    let id = reserve_at(&mut c, RESERVE_DEPOSIT_YOCTO, 10_000_000_000);
    assert_eq!(c.get_position(U64(id)).unwrap().remote.unwrap().deposit_yocto, U128(RESERVE_DEPOSIT_YOCTO));
    assert_eq!(c.get_remote_config().reserve_deposit_yocto, U128(RESERVE_DEPOSIT_YOCTO));
    authority_ok(&mut c, id);
    confirm_and_verify(&mut c, id);
    assert!(event_with("reservation_deposit_refunded", "\"reason\":\"confirmed\""));
    assert!(near_transfer_to(&alice(), RESERVE_DEPOSIT_YOCTO));
    assert_eq!(c.get_position(U64(id)).unwrap().remote.unwrap().deposit_yocto, U128(0));
}

#[test]
fn reservation_deposit_refunded_on_expiry() {
    let mut c = chain_base();
    let id = reserve_at(&mut c, RESERVE_DEPOSIT_YOCTO + 7, 10_000_000_000);
    authority_ok(&mut c, id);
    set_ctx(a("anyone.test"), 0, T0 + SEC + 1_800 * SEC);
    c.expire_remote_reservation(U64(id));
    assert!(event_with("reservation_deposit_refunded", "\"reason\":\"expired\""));
    assert!(near_transfer_to(&alice(), RESERVE_DEPOSIT_YOCTO + 7), "the whole attachment, to the borrower");
}

#[test]
fn reservation_deposit_refunded_on_authority_failure_and_refused_loan() {
    let mut c = chain_base();
    let id = reserve_at(&mut c, RESERVE_DEPOSIT_YOCTO, 10_000_000_000);
    cb_ctx(T0 + SEC, PromiseResult::Failed);
    c.on_authority(U64(id));
    assert!(event_with("reservation_deposit_refunded", "\"reason\":\"authority_failed\""));
    // a proven deposit whose loan is refused (paused meanwhile) also returns it
    let id2 = reserve_at(&mut c, RESERVE_DEPOSIT_YOCTO, 10_000_000_000);
    authority_ok(&mut c, id2);
    set_ctx(a("anyone.test"), 0, T0 + 2 * SEC);
    c.confirm_remote_deposit(U64(id2));
    set_ctx(owner(), 0, T0 + 2 * SEC);
    c.pause();
    cb_ctx(
        T0 + 2 * SEC,
        ok_bytes(&format!(
            r#"{{"position_id":"{id2}","units":"{UNITS}","authority":"ed25519:{AUTH_B58}","depositor":"{DEPOSITOR}","slot_or_block":1}}"#
        )),
    );
    c.on_deposit_verified(U64(id2));
    assert!(event_with("remote_loan_refused", "paused"));
    assert!(event_with("reservation_deposit_refunded", "\"reason\":\"loan_refused\""));
    assert!(near_transfer_to(&alice(), RESERVE_DEPOSIT_YOCTO));
}

#[test]
fn vault_read_not_found_is_rejected() {
    assert_eq!(crate::remote::parse_vault_read(br#"{"position_id":"3","found":false}"#, 3), Err("not_found"));
}

/// Remote position 0 ($10k on 100 units) with buyer3 $12k @200 opted in with a Solana recipient.
fn remote_open() -> Nectar {
    let mut c = chain_base();
    let id = reserve_at(&mut c, RESERVE_DEPOSIT_YOCTO, 10_000_000_000);
    authority_ok(&mut c, id);
    confirm_and_verify(&mut c, id);
    fund(&mut c, "buyer3.test", 12_000_000_000, 200, true, true);
    set_ctx(owner(), 0, T0);
    c.set_max_voluntary_fill("NVDAx".into(), U128(20_000_000_000));
    c
}

#[test]
fn remote_self_settle_signs_kind_self_and_credits_on_signature() {
    let mut c = remote_open();
    let pre = c.preview_self_settle(U64(0));
    assert!(pre.ok && pre.remote, "{:?}", pre.reason);
    settle_self(&mut c, alice(), T0 + 3 * SEC);
    let d = c.get_pending_settlement(U64(0)).unwrap();
    let units = math::seize_units_m(10_050_000_000, E18, 180_000_000, 6, 200, 0).unwrap().0;
    assert_eq!((d.kind, d.fee_usd_e6, d.repay_usd_e6, d.seize_units), (2, U128(50_000_000), U128(10_000_000_000), U128(units)));
    assert!(d.preimage.ends_with("|kind=SELF") && d.preimage.contains("|quote=2|repay_e6=10000000000|"));
    assert!(event_with("self_settled", "\"remote\":true"));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6), (PositionStatus::Settling, U128(0)));
    let t0 = c.get_pool().treasury_usd_e6.0;
    cb_ctx(T0 + 4 * SEC, PromiseResult::Successful(format!(r#"{{"scheme":"Ed25519","signature":{:?}}}"#, vec![7u8; 64]).into_bytes()));
    c.on_signature(U64(0), U64(2), d.nonce);
    assert_eq!(c.get_pool().treasury_usd_e6.0 - t0, 50_000_000);
    assert_eq!(c.get_pool().utilised_usd_e6, U128(0));
}

#[test]
fn remote_self_settle_sign_failure_rolls_back_fill() {
    let mut c = remote_open();
    settle_self(&mut c, alice(), T0 + 3 * SEC);
    let d = c.get_pending_settlement(U64(0)).unwrap();
    cb_ctx(T0 + 4 * SEC, PromiseResult::Failed);
    c.on_signature(U64(0), U64(2), d.nonce);
    assert_eq!(c.get_quote(U64(2)).unwrap().remaining_usd_e6, U128(12_000_000_000));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6, p.units), (PositionStatus::Open, U128(10_000_000_000), U128(UNITS)));
    assert_eq!(coll(&c).total_debt_usd_e6, U128(10_000_000_000));
}

#[test]
fn remote_self_settle_needs_a_remote_recipient_covering_the_fill() {
    let mut c = chain_base();
    let id = reserve_at(&mut c, RESERVE_DEPOSIT_YOCTO, 10_000_000_000);
    authority_ok(&mut c, id);
    confirm_and_verify(&mut c, id);
    fund(&mut c, "buyer3.test", 12_000_000_000, 200, false, true); // NEAR-only
    fund(&mut c, "buyer4.test", 10_000_000_000, 150, true, true); // too small for the whole fill
    set_ctx(owner(), 0, T0);
    c.set_max_voluntary_fill("NVDAx".into(), U128(20_000_000_000));
    assert_eq!(c.preview_self_settle(U64(0)).reason.as_deref(), Some("no voluntary capacity"));
}

#[test]
fn shield_on_remote_reservation_counts_and_prices_at_confirm() {
    let mut c = chain_base();
    set_ctx(owner(), 0, T0);
    c.set_shield_params("NVDAx".into(), 15, 25, U64(T0 + 10 * HOUR));
    set_ctx(alice(), RESERVE_DEPOSIT_YOCTO, T0 + SEC);
    let id = c
        .reserve_remote_position(
            "NVDAx".into(),
            U128(UNITS),
            U128(10_000_000_000),
            7500,
            None,
            None,
            Some(ShieldInput { kind: ShieldKind::Event, window_end_ns: U64(T0 + 10 * HOUR) }),
        )
        .0;
    assert_eq!(c.get_shield_opens_today(alice()), 1);
    authority_ok(&mut c, id);
    confirm_and_verify(&mut c, id);
    assert_eq!(c.get_position(U64(id)).unwrap().premium_usd_e6, U128(25_000_000));
    assert!(event_with("shield_opened", "\"remote\":true"));
}

#[test]
#[should_panic(expected = "shield below minimum")]
fn shield_on_remote_reservation_validated() {
    let mut c = chain_base();
    set_ctx(alice(), RESERVE_DEPOSIT_YOCTO, T0 + SEC);
    c.reserve_remote_position(
        "NVDAx".into(),
        U128(UNITS),
        U128(1),
        7500,
        None,
        None,
        Some(ShieldInput { kind: ShieldKind::Weekend, window_end_ns: U64(T0 + HOUR) }),
    );
}

// ------------------------------------------------------------------ OutLayer jobs

fn request_session(c: &mut Nectar, ts: u64) {
    set_ctx(a("anyone.test"), 0, ts);
    c.request_session_check("NVDAx".into());
}

#[test]
fn calendar_job_can_close_but_never_open() {
    let mut c = chain_base();
    set_ctx(owner(), 0, T0);
    set_ctx(owner(), 0, T0);
    c.set_session_calendar(vec![[U64(T0), U64(T0 + 6 * HOUR)]]);
    let g0 = c.get_config().gas_reserve_yocto.0;
    request_session(&mut c, T0 + SEC);
    assert_eq!(c.get_config().gas_reserve_yocto.0, g0 - VR_DEPOSIT, "deposit from gas_reserve_yocto");
    assert!(c.get_job_state("calendar".into(), "NVDAx".into()).in_flight);
    assert!(event_with("job_requested", "\\\"job\\\":\\\"calendar\\\""));
    // false is ignored: an owner force-close stays
    set_ctx(owner(), 0, T0 + SEC);
    c.force_session_closed("NVDAx".into(), true);
    cb_ctx(T0 + 2 * SEC, ok_bytes(r#"{"force_closed":false,"reason":"open"}"#));
    c.on_session_check("NVDAx".into());
    assert!(coll(&c).forced_closed);
    assert!(event_with("session_check_result", "\"applied\":false"));
    assert!(!c.get_job_state("calendar".into(), "NVDAx".into()).in_flight);
    // true closes an open session
    set_ctx(owner(), 0, T0 + 2 * SEC);
    c.force_session_closed("NVDAx".into(), false);
    assert!(c.get_exit_capacity("NVDAx".into()).session_open);
    cb_ctx(T0 + 3 * SEC, ok_bytes(r#"{"force_closed":true,"reason":"holiday"}"#));
    c.on_session_check("NVDAx".into());
    assert!(coll(&c).forced_closed);
    assert!(event_with("session_forced_closed", "\"source\":\"outlayer\""));
    cb_ctx(T0 + 4 * SEC, PromiseResult::Failed);
    c.on_session_check("NVDAx".into());
    assert!(event_with("job_failed", "\"reason\":\"failed\""));
    cb_ctx(T0 + 4 * SEC, ok_bytes("null"));
    c.on_session_check("NVDAx".into());
    assert!(event_with("job_failed", "no_result"));
}

#[test]
#[should_panic(expected = "job cooldown")]
fn calendar_job_cooldown() {
    let mut c = chain_base();
    request_session(&mut c, T0 + SEC);
    cb_ctx(T0 + 2 * SEC, ok_bytes(r#"{"force_closed":false,"reason":"open"}"#));
    c.on_session_check("NVDAx".into());
    request_session(&mut c, T0 + 30 * SEC);
}
#[test]
fn calendar_job_after_cooldown_and_stale_in_flight() {
    let mut c = chain_base();
    request_session(&mut c, T0 + SEC);
    request_session(&mut c, T0 + SEC + 600 * SEC); // lost callback freed after 10 min
    cb_ctx(T0 + 700 * SEC, ok_bytes(r#"{"force_closed":false}"#));
    c.on_session_check("NVDAx".into());
    request_session(&mut c, T0 + 700 * SEC);
}
#[test]
#[should_panic(expected = "job in flight")]
fn calendar_job_in_flight() {
    let mut c = chain_base();
    request_session(&mut c, T0 + SEC);
    request_session(&mut c, T0 + 120 * SEC);
}
#[test]
#[should_panic(expected = "job not configured")]
fn job_not_configured() {
    let mut c = base();
    request_session(&mut c, T0 + SEC);
}
#[test]
#[should_panic(expected = "gas reserve empty")]
fn job_needs_gas_reserve() {
    let mut c = chain_base();
    set_ctx(owner(), 0, T0);
    c.set_job_config("calendar".into(), "p/x".into(), "v".into(), U128(10_000), 50);
    request_session(&mut c, T0 + SEC);
}
#[test]
#[should_panic(expected = "paused")]
fn job_refused_while_paused() {
    let mut c = chain_base();
    set_ctx(owner(), 0, T0);
    c.pause();
    request_session(&mut c, T0 + SEC);
}

#[test]
fn job_config_pin_and_fallback() {
    let mut c = chain_base();
    assert_eq!(c.get_job_config("calendar".into()).unwrap().source, "vault_read");
    set_ctx(owner(), 0, T0);
    c.set_job_config("multiplier".into(), "nectar.testnet/quoter".into(), "cd".repeat(32), U128(5), 40);
    let j = c.get_job_config("multiplier".into()).unwrap();
    assert_eq!((j.source.as_str(), j.gas_tgas, j.deposit_yocto), ("job", 40, U128(5)));
    assert!(c.get_job_config("other".into()).is_none());
}
#[test]
#[should_panic(expected = "unknown job")]
fn set_job_config_unknown_job() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_job_config("vault".into(), "p".into(), "v".into(), U128(1), 50);
}
#[test]
#[should_panic(expected = "gas_tgas out of range")]
fn set_job_config_gas_range() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_job_config("calendar".into(), "p".into(), "v".into(), U128(1), 101);
}
#[test]
#[should_panic(expected = "deposit must be > 0")]
fn set_job_config_zero_deposit() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_job_config("calendar".into(), "p".into(), "v".into(), U128(0), 50);
}
#[test]
#[should_panic(expected = "bad project pin")]
fn set_job_config_bad_pin() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_job_config("calendar".into(), String::new(), "v".into(), U128(1), 50);
}
#[test]
#[should_panic(expected = "owner only")]
fn set_job_config_owner_only() {
    let mut c = base();
    set_ctx(alice(), 0, T0);
    c.set_job_config("calendar".into(), "p".into(), "v".into(), U128(1), 50);
}

const TOKEN: &str = "0x1111111111111111111111111111111111111111";

fn with_source() -> Nectar {
    let mut c = chain_base();
    set_ctx(owner(), 0, T0);
    c.set_multiplier_source("NVDAx".into(), "https://sepolia.base.org".into(), TOKEN.into());
    c
}
fn mult_cb(c: &mut Nectar, body: &str) {
    cb_ctx(T0 + 2 * SEC, ok_bytes(body));
    c.on_multiplier_read("NVDAx".into());
}

#[test]
fn multiplier_job_bounded() {
    let mut c = with_source();
    assert_eq!(c.get_multiplier_source("NVDAx".into()).unwrap().token, TOKEN);
    set_ctx(a("anyone.test"), 0, T0 + SEC);
    c.request_multiplier_read("NVDAx".into());
    assert!(event_with("job_requested", "sepolia.base.org"));
    mult_cb(&mut c, r#"{"multiplier_e18":"1050000000000000000"}"#);
    assert_eq!(coll(&c).multiplier_e18, U128(1_050_000_000_000_000_000), "+5% applied");
    assert!(event_with("multiplier_updated", "\"source\":\"outlayer\""));
    mult_cb(&mut c, r#"{"multiplier_e18":"2000000000000000000"}"#);
    assert_eq!(coll(&c).multiplier_e18, U128(1_050_000_000_000_000_000), "> +5% not applied");
    assert_eq!(coll(&c).ca_suggested_multiplier_e18, U128(2 * E18));
    assert!(has_event("corporate_action_suggested"));
    mult_cb(&mut c, r#"{"multiplier_e18":"1000000000000000000"}"#);
    assert_eq!(coll(&c).multiplier_e18, U128(1_050_000_000_000_000_000), "decrease not applied");
    assert_eq!(coll(&c).ca_suggested_multiplier_e18, U128(E18));
    mult_cb(&mut c, r#"{"multiplier_e18":1050000000000000000}"#);
    assert!(event_with("multiplier_read_result", "unchanged"));
    set_ctx(owner(), 0, T0 + 2 * SEC);
    c.announce_corporate_action("NVDAx".into(), U128(2 * E18), U64(T0 + 2 * HOUR));
    mult_cb(&mut c, r#"{"multiplier_e18":"1060000000000000000"}"#);
    assert_eq!(coll(&c).multiplier_e18, U128(1_050_000_000_000_000_000), "never while ca_pending");
    assert!(event_with("corporate_action_suggested", "\"ca_pending\":true"));
    for (bad, why) in [
        (r#"{"multiplier_e18":"0"}"#, "zero_multiplier"),
        (r#"{"multiplier_e18":"x"}"#, "bad_multiplier"),
        (r#"{"error":"rpc"}"#, "job_error"),
        ("null", "no_result"),
        ("nope", "parse"),
    ] {
        mult_cb(&mut c, bad);
        assert!(event_with("job_failed", why), "{why}");
    }
}

#[test]
#[should_panic(expected = "token_includes_multiplier")]
fn multiplier_job_refused_for_token_feed() {
    let mut c = with_source();
    set_ctx(owner(), 0, T0);
    let mut i = input();
    i.price_kind = Some(PriceKind::TokenIncludesMultiplier);
    c.upsert_collateral("NVDAx".into(), i);
    set_ctx(a("anyone.test"), 0, T0 + SEC);
    c.request_multiplier_read("NVDAx".into());
}
#[test]
#[should_panic(expected = "no multiplier source")]
fn multiplier_job_needs_source() {
    let mut c = chain_base();
    set_ctx(a("anyone.test"), 0, T0 + SEC);
    c.request_multiplier_read("NVDAx".into());
}
#[test]
#[should_panic(expected = "bad token")]
fn set_multiplier_source_bad_token() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_multiplier_source("NVDAx".into(), "https://sepolia.base.org".into(), "0x12".into());
}
#[test]
#[should_panic(expected = "bad rpc_url")]
fn set_multiplier_source_bad_rpc() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_multiplier_source("NVDAx".into(), "http://x".into(), TOKEN.into());
}

#[test]
fn job_output_parsers() {
    use crate::jobs::{parse_calendar, parse_multiplier, valid_evm_address};
    assert_eq!(parse_calendar(br#"{"force_closed":true,"reason":"early_close"}"#), Ok((true, "early_close".into())));
    assert_eq!(parse_calendar(br#"{"force_closed":"yes"}"#), Err("bad_force_closed"));
    assert_eq!(parse_calendar(br#"{"force_closed":true,"reason":7}"#), Err("bad_reason"));
    assert_eq!(parse_calendar(b"null"), Err("no_result"));
    assert_eq!(parse_calendar(br#"{"error":"x"}"#), Err("job_error"));
    assert_eq!(parse_calendar(b"{"), Err("parse"));
    assert_eq!(parse_multiplier(br#"{"multiplier_e18":"1000000000000000000"}"#), Ok(E18));
    assert_eq!(parse_multiplier(br#"{}"#), Err("bad_multiplier"));
    assert!(valid_evm_address(TOKEN) && !valid_evm_address("0xzz11111111111111111111111111111111111111"));
}
