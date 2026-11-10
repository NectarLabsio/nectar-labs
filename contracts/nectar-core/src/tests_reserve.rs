//! WO-23b unit tests: Nectar Reserve (PRD §4.8). Names start with `v7_reserve_` (gates-v7 G11 `cargo test v7_`).

use super::*;
use crate::reserve::*;
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{PromiseResult, testing_env};

const T0: u64 = 1_700_000_000_000_000_000;
const SEC: u64 = 1_000_000_000;
const UNITS: u128 = 100_000_000; // 100 NVDAx (6 dp)
const JOIN: &str = r#"{"JoinNectarReserve":{"collateral":"NVDAx"}}"#;

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
fn buyer() -> AccountId {
    a("buyer.test")
}
fn alice() -> AccountId {
    a("alice.test")
}
fn bob() -> AccountId {
    a("bob.test")
}
fn carol() -> AccountId {
    a("carol.test")
}
fn borrower() -> AccountId {
    a("borrower.test")
}
fn lender() -> AccountId {
    a("lender.test")
}

fn set_ctx(pred: AccountId, deposit: u128, ts: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(a("core.test"))
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

/// Closed session (no calendar), NVDAx $180, lender $50k, gas reserve funded.
fn setup() -> Nectar {
    set_ctx(owner(), 0, T0);
    let mut c = Nectar::new(owner(), usdc(), keeper());
    c.upsert_collateral("NVDAx".into(), input());
    assert!(c.update_owner_price("NVDAx".into(), U128(180_000_000)));
    set_ctx(owner(), 1_000, T0);
    c.fund_gas_reserve();
    assert_eq!(ft(&mut c, usdc(), lender(), 50_000_000_000, r#""SupplyLendingLiquidity""#), 0);
    c
}

fn enable(c: &mut Nectar, disc: u16) {
    set_ctx(owner(), 0, T0);
    c.set_reserve_params("NVDAx".into(), disc, None);
}

fn ft(c: &mut Nectar, token: AccountId, sender: AccountId, amount: u128, msg: &str) -> u128 {
    set_ctx(token, 0, T0 + SEC);
    match c.ft_on_transfer(sender, U128(amount), msg.to_string()) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    }
}

fn join(c: &mut Nectar, who: AccountId, amount: u128) -> u128 {
    ft(c, usdc(), who, amount, JOIN)
}

fn fund(c: &mut Nectar, amount: u128, disc: u16) -> u128 {
    let msg = format!(
        r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":{disc},"notice_period_ns":"604800000000000"}}}}"#
    );
    ft(c, usdc(), buyer(), amount, &msg)
}

fn borrow(c: &mut Nectar, units: u128, amount: u128, pre_liq: u16) -> u128 {
    let msg = format!(r#"{{"LockCollateralAndBorrow":{{"collateral":"NVDAx","borrow_usd_e6":"{amount}","pre_liq_ltv_bps":{pre_liq}}}}}"#);
    ft(c, nvdax(), borrower(), units, &msg)
}

fn crash_to_140(c: &mut Nectar) {
    set_ctx(owner(), 0, T0 + 2 * SEC);
    assert!(c.update_owner_price("NVDAx".into(), U128(155_000_000)));
    set_ctx(owner(), 0, T0 + 3 * SEC);
    assert!(c.update_owner_price("NVDAx".into(), U128(140_000_000)));
}

fn trigger(c: &mut Nectar, id: u64, ts: u64) -> Vec<String> {
    set_ctx(keeper(), 0, ts);
    c.trigger_preliquidation(U64(id));
    get_logs()
}

fn rv(c: &Nectar) -> ReserveView {
    c.get_reserve("NVDAx".into())
}
fn note(c: &Nectar, id: &str) -> ReserveNoteView {
    c.get_reserve_note(id.into()).expect("reserve note")
}
fn event<'a>(logs: &'a [String], name: &str) -> Option<&'a String> {
    logs.iter().find(|l| l.contains(&format!(r#""event":"{name}""#)))
}
fn pos_of(logs: &[String], name: &str) -> usize {
    logs.iter().position(|l| l.contains(&format!(r#""event":"{name}""#))).unwrap_or(usize::MAX)
}

/// Q = $10k @ 250 bps, Reserve $5k (alice, `r-NVDAx-0`) @ 1000 bps, borrower 100 NVDAx at B_c = $11,250.
fn scenario() -> Nectar {
    let mut c = setup();
    assert_eq!(fund(&mut c, 10_000_000_000, 250), 0);
    enable(&mut c, 1_000);
    assert_eq!(join(&mut c, alice(), 5_000_000_000), 0);
    assert_eq!(borrow(&mut c, UNITS, 11_250_000_000, 7500), 0);
    c
}

/// `scenario` crashed to $140 and settled: quote leg $10k @ 250, then Reserve leg $1,250 @ 1000.
fn settled() -> (Nectar, Vec<String>) {
    let mut c = scenario();
    crash_to_140(&mut c);
    let logs = trigger(&mut c, 0, T0 + 4 * SEC);
    (c, logs)
}

const RESERVE_LEG_UNITS: u128 = 9_920_635; // ceil(1.25e9 * 1e4 * 1e6 / (140e6 * 9000))
const ALICE_FEES: u128 = 28_350_000; // 85.05 buyers' share * 5k / 15k

fn fail_payout(c: &mut Nectar, payout: Payout, account: AccountId, amount: u128) -> bool {
    let mut b = VMContextBuilder::new();
    b.current_account_id(a("core.test")).predecessor_account_id(a("core.test")).block_timestamp(T0 + 30 * DAY_NS);
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed]
    );
    c.on_payout(payout, account, U128(amount))
}

// ------------------------------------------------------------------ deposit

#[test]
fn v7_reserve_join_first_deposit_mints_1to1_and_a_note() {
    let mut c = setup();
    enable(&mut c, 1_000);
    assert_eq!(join(&mut c, alice(), 10_000_000), 0);
    let logs = get_logs();
    let j = event(&logs, "reserve_joined").expect("reserve_joined");
    assert!(j.contains(r#""note_id":"r-NVDAx-0""#) && j.contains(r#""shares":"10000000""#), "{j}");
    assert!(event(&logs, "nft_mint").is_some_and(|l| l.contains("r-NVDAx-0")));
    let r = rv(&c);
    assert_eq!((r.shares, r.usdc_e6, r.r_usd_e6, r.share_price_e6), (U128(10_000_000), U128(10_000_000), U128(10_000_000), U128(1_000_000)));
    let n = note(&c, "r-NVDAx-0");
    assert_eq!((n.note.owner.clone(), n.note.shares, n.value_usd_e6), (alice(), U128(10_000_000), U128(10_000_000)));
    assert!(!n.can_complete && !n.transfer_locked);
    let t = c.nft_token("r-NVDAx-0".into()).unwrap();
    assert_eq!(t.owner_id, alice());
    assert_eq!(t.metadata.unwrap().title.unwrap(), "Reserve Note r-NVDAx-0");
    assert!(c.nft_token_svg("r-NVDAx-0".into()).contains("RESERVE"));
    // R_c enters the limit and the views
    assert_eq!(c.get_exit_capacity("NVDAx".into()).r_usd_e6, U128(10_000_000));
}

#[test]
fn v7_reserve_join_below_ten_dollars_refunded() {
    let mut c = setup();
    enable(&mut c, 1_000);
    assert_eq!(join(&mut c, alice(), 9_999_999), 9_999_999);
    assert!(get_logs().iter().any(|l| l.contains(ERR_RESERVE_MIN)));
    assert_eq!(rv(&c).shares, U128(0));
    assert!(c.get_reserve_note("r-NVDAx-0".into()).is_none());
}

#[test]
fn v7_reserve_join_disabled_refunded() {
    let mut c = setup();
    assert_eq!(join(&mut c, alice(), 10_000_000), 10_000_000);
    assert!(get_logs().iter().any(|l| l.contains(ERR_RESERVE_DISABLED)));
}

#[test]
fn v7_reserve_join_unknown_collateral_and_wrong_token_refunded() {
    let mut c = setup();
    enable(&mut c, 1_000);
    assert_eq!(ft(&mut c, usdc(), alice(), 10_000_000, r#"{"JoinNectarReserve":{"collateral":"TSLAx"}}"#), 10_000_000);
    assert!(get_logs().iter().any(|l| l.contains("unknown collateral")));
    assert_eq!(ft(&mut c, nvdax(), alice(), 10_000_000, JOIN), 10_000_000);
    assert!(get_logs().iter().any(|l| l.contains("msg not valid for this token")));
}

#[test]
fn v7_reserve_join_depleted_refunded() {
    let mut c = setup();
    enable(&mut c, 1_000);
    let mut col = c.coll("NVDAx").unwrap();
    col.reserve.shares = U128(5);
    c.put_coll(col);
    assert_eq!(join(&mut c, alice(), 10_000_000), 10_000_000);
    assert!(get_logs().iter().any(|l| l.contains("reserve_depleted")));
}

// ------------------------------------------------------------------ owner params

#[test]
fn v7_reserve_set_params_ok_and_event() {
    let mut c = setup();
    assert_eq!(fund(&mut c, 1_000_000_000, 400), 0);
    enable(&mut c, 401);
    assert!(event(&get_logs(), "reserve_params_set").is_some());
    assert_eq!(rv(&c).discount_bps, 401);
}

#[test]
#[should_panic(expected = "owner only")]
fn v7_reserve_set_params_owner_only() {
    let mut c = setup();
    set_ctx(alice(), 0, T0);
    c.set_reserve_params("NVDAx".into(), 1_000, None);
}

#[test]
#[should_panic(expected = "discount_bps out of range")]
fn v7_reserve_set_params_out_of_range() {
    let mut c = setup();
    enable(&mut c, 10_000);
}

#[test]
#[should_panic(expected = "reserve discount must exceed every live quote ceiling")]
fn v7_reserve_set_params_must_exceed_quote_ceilings() {
    let mut c = setup();
    assert_eq!(fund(&mut c, 1_000_000_000, 400), 0);
    enable(&mut c, 400);
}

#[test]
#[should_panic(expected = "reserve discount must exceed every live quote ceiling")]
fn v7_reserve_set_params_zero_refused() {
    let mut c = setup();
    enable(&mut c, 0);
}

#[test]
#[should_panic(expected = "unknown collateral")]
fn v7_reserve_set_params_unknown_collateral() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.set_reserve_params("TSLAx".into(), 1_000, None);
}

#[test]
fn v7_reserve_quote_at_or_above_reserve_discount_refunded() {
    let mut c = setup();
    enable(&mut c, 500);
    assert_eq!(fund(&mut c, 1_000_000_000, 500), 1_000_000_000);
    assert!(get_logs().iter().any(|l| l.contains("below the reserve discount")));
    assert_eq!(fund(&mut c, 1_000_000_000, 499), 0);
}

// ------------------------------------------------------------------ fees

#[test]
fn v7_reserve_premium_split_q_to_r_and_realised_apr() {
    let c = scenario();
    // premium 121.5, buyers 85.05: quotes 56.70 (Q = 10k), Reserve 28.35 (R = 5k, 5e9 shares)
    let col = c.coll("NVDAx").unwrap();
    assert_eq!(col.acc_fee_per_dollar_e18, U128(5_670_000_000_000_000));
    let r = rv(&c);
    assert_eq!(r.acc_fee_per_share_e18, U128(5_670_000_000_000_000));
    assert_eq!(r.fees_7d_usd_e6, U128(ALICE_FEES));
    // 28.35 * 365 / 7 / 5,000 = 29.565 % -> 2956 bps (floor), historical only
    assert_eq!(r.realised_apr_7d_bps, U128(2_956));
    assert_eq!(note(&c, "r-NVDAx-0").claimable_fees_usd_e6, U128(ALICE_FEES));
    assert_eq!(c.get_quote(U64(0)).unwrap().claimable_fees_usd_e6, U128(56_700_000));
    let x = c.get_exit_capacity("NVDAx".into());
    assert_eq!((x.q_usd_e6, x.r_usd_e6, x.capacity_usd_e6), (U128(10_000_000_000), U128(5_000_000_000), U128(11_250_000_000)));
}

#[test]
fn v7_reserve_apr_window_drops_old_days() {
    let mut pool = ReservePool::default();
    for d in 0..10u64 {
        Nectar::reserve_accrue_fees(&mut pool, 1_000_000, 1, T0 + d * DAY_NS).unwrap();
    }
    assert_eq!(pool.fee_days.len(), RESERVE_FEE_DAYS);
    assert_eq!(Nectar::reserve_fees_7d(&pool, T0 + 9 * DAY_NS), 7_000_000);
    assert_eq!(Nectar::reserve_fees_7d(&pool, T0 + 30 * DAY_NS), 0);
    assert_eq!(pool.acc_fee_per_share_e18, U128(10));
}

// ------------------------------------------------------------------ waterfall

#[test]
fn v7_reserve_fills_only_after_every_quote() {
    let (c, logs) = settled();
    let near = pos_of(&logs, "settled_near");
    let res = pos_of(&logs, "settled_reserve");
    assert!(near < res && res != usize::MAX, "quote leg first, then the Reserve: {logs:?}");
    let e = event(&logs, "settled_reserve").unwrap();
    assert!(e.contains(r#""repay_usd_e6":"1250000000""#) && e.contains(&format!(r#""seize_units":"{RESERVE_LEG_UNITS}""#)), "{e}");
    let want = math::settle_leg_m(1_250_000_000, 5_000_000_000, 26_373_625, math::E18, 140_000_000, 6, 1_000, 50).unwrap().unwrap();
    assert_eq!(want.buyer_units, RESERVE_LEG_UNITS);
    assert_eq!(c.get_quote(U64(0)).unwrap().remaining_usd_e6, U128(0));
    let r = rv(&c);
    assert_eq!((r.usdc_e6, r.r_usd_e6, r.units), (U128(3_750_000_000), U128(3_750_000_000), U128(RESERVE_LEG_UNITS)));
    assert_eq!(r.acc_units_per_share_e18, U128(1_984_127_000_000_000));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6), (PositionStatus::Closed, U128(0)));
    assert_eq!(note(&c, "r-NVDAx-0").claimable_units, U128(RESERVE_LEG_UNITS));
}

#[test]
fn v7_reserve_waits_for_quotes_beyond_the_call() {
    let mut c = setup();
    for i in 0..9u16 {
        assert_eq!(fund(&mut c, 100_000_000, 100 + 10 * i), 0);
    }
    enable(&mut c, 1_000);
    assert_eq!(join(&mut c, alice(), 5_000_000_000), 0);
    assert_eq!(borrow(&mut c, 20_000_000, 2_340_000_000, 6500), 0);
    crash_to_140(&mut c);
    let first = trigger(&mut c, 0, T0 + 4 * SEC);
    assert!(event(&first, "settled_reserve").is_none(), "quote 9 (180 bps) still has capacity");
    assert_eq!(first.iter().filter(|l| l.contains(r#""event":"settled_near""#)).count(), 8);
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Open);
    assert_eq!(rv(&c).usdc_e6, U128(5_000_000_000));
    let second = trigger(&mut c, 0, T0 + 5 * SEC);
    assert!(pos_of(&second, "settled_near") < pos_of(&second, "settled_reserve"));
    assert!(event(&second, "settled_reserve").unwrap().contains(r#""repay_usd_e6":"1440000000""#));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Closed);
    assert_eq!(rv(&c).usdc_e6, U128(3_560_000_000));
}

/// alice $1,000 + bob $10; borrower 20 NVDAx at $700; alice exits (R_c = $10); price $50: the Reserve fills $10.
fn shortfall() -> Nectar {
    let mut c = setup();
    enable(&mut c, 1_000);
    assert_eq!(join(&mut c, alice(), 1_000_000_000), 0);
    assert_eq!(join(&mut c, bob(), 10_000_000), 0);
    assert_eq!(borrow(&mut c, 20_000_000, 700_000_000, 6500), 0);
    set_ctx(alice(), 1, T0 + SEC);
    c.initiate_reserve_exit("r-NVDAx-0".into());
    assert_eq!(rv(&c).r_usd_e6, U128(10_000_000));
    set_ctx(owner(), 0, T0 + 2 * SEC);
    c.propose_price("NVDAx".into(), U128(50_000_000));
    set_ctx(owner(), 0, T0 + 3 * SEC);
    c.apply_price("NVDAx".into());
    let logs = trigger(&mut c, 0, T0 + 4 * SEC);
    assert!(event(&logs, "settled_reserve").unwrap().contains(r#""repay_usd_e6":"10000000""#));
    c
}

#[test]
fn v7_reserve_shortfall_stays_settling_and_locks_reserve_notes() {
    let mut c = shortfall();
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6), (PositionStatus::Settling, U128(690_000_000)));
    assert_eq!(rv(&c).r_usd_e6, U128(0));
    assert!(c.nft_transfer_locked("r-NVDAx-1".into()));
    assert!(note(&c, "r-NVDAx-1").transfer_locked);
    assert!(c.nft_token_svg("r-NVDAx-1".into()).contains("SETTLING"));
    // the owner resolves it; the lock lifts
    set_ctx(owner(), 0, T0 + 5 * SEC);
    c.cancel_settlement(U64(0));
    assert!(!c.nft_transfer_locked("r-NVDAx-1".into()));
    // an exiting Note is not locked out of its exit by a pending settlement (only transfers are)
    set_ctx(alice(), 1, T0 + 8 * DAY_NS);
    let _ = c.complete_reserve_exit("r-NVDAx-0".into());
}

#[test]
#[should_panic(expected = "note_locked: pending settlement")]
fn v7_reserve_note_transfer_refused_while_reserve_settlement_pending() {
    let mut c = shortfall();
    set_ctx(bob(), 1, T0 + 5 * SEC);
    c.nft_transfer(carol(), "r-NVDAx-1".into(), None, None);
}

#[test]
#[should_panic(expected = "no quote capacity")]
fn v7_reserve_enabled_but_empty_and_no_quotes_reverts() {
    let mut c = setup();
    enable(&mut c, 1_000);
    assert_eq!(fund(&mut c, 20_000_000_000, 250), 0);
    assert_eq!(borrow(&mut c, UNITS, 11_250_000_000, 7500), 0);
    set_ctx(buyer(), 1, T0 + SEC);
    c.initiate_quote_withdrawal(U64(0));
    // the exiting quote still fills; drain it first via a direct write
    let mut q = c.quote(0).unwrap();
    q.remaining_usd_e6 = U128(0);
    c.put_quote(q);
    crash_to_140(&mut c);
    trigger(&mut c, 0, T0 + 4 * SEC);
}

// ------------------------------------------------------------------ late depositor

#[test]
fn v7_reserve_late_depositor_gets_no_earlier_units_or_fees() {
    let (mut c, _) = settled();
    // R_c = 3,750 for 5e9 shares: 3,750 USDC mints 5e9 shares
    assert_eq!(join(&mut c, carol(), 3_750_000_000), 0);
    assert!(event(&get_logs(), "reserve_joined").unwrap().contains(r#""shares":"5000000000""#));
    let late = note(&c, "r-NVDAx-1");
    assert_eq!((late.claimable_units, late.claimable_fees_usd_e6, late.value_usd_e6), (U128(0), U128(0), U128(3_750_000_000)));
    let early = note(&c, "r-NVDAx-0");
    assert_eq!((early.claimable_units, early.claimable_fees_usd_e6), (U128(RESERVE_LEG_UNITS), U128(ALICE_FEES)));
    assert_eq!(early.value_usd_e6, U128(3_750_000_000));
}

// ------------------------------------------------------------------ exit

#[test]
fn v7_reserve_exit_after_notice_pays_exact_amounts() {
    let (mut c, _) = settled();
    assert_eq!(join(&mut c, carol(), 3_750_000_000), 0);
    set_ctx(alice(), 1, T0 + 10 * SEC);
    c.initiate_reserve_exit("r-NVDAx-0".into());
    let e = event(&get_logs(), "reserve_exiting").unwrap().clone();
    assert!(e.contains(r#""usdc_e6":"3750000000""#) && e.contains(r#""shares":"5000000000""#), "{e}");
    let r = rv(&c);
    assert_eq!((r.r_usd_e6, r.notice_usdc_e6, r.shares), (U128(3_750_000_000), U128(3_750_000_000), U128(5_000_000_000)));
    assert!(!note(&c, "r-NVDAx-0").can_complete);
    set_ctx(alice(), 1, T0 + 10 * SEC + RESERVE_NOTICE_NS);
    assert!(note(&c, "r-NVDAx-0").can_complete);
    let _ = c.complete_reserve_exit("r-NVDAx-0".into());
    let x = event(&get_logs(), "reserve_exited").unwrap().clone();
    assert!(x.contains(r#""principal_usd_e6":"3750000000""#), "{x}");
    assert!(x.contains(&format!(r#""fees_usd_e6":"{ALICE_FEES}""#)) && x.contains(&format!(r#""units":"{RESERVE_LEG_UNITS}""#)), "{x}");
    let r = rv(&c);
    assert_eq!((r.usdc_e6, r.notice_usdc_e6, r.units), (U128(3_750_000_000), U128(0), U128(0)));
    let n = note(&c, "r-NVDAx-0");
    assert!(n.note.exited && !n.can_complete);
    assert_eq!((n.claimable_units, n.claimable_fees_usd_e6, n.value_usd_e6), (U128(0), U128(0), U128(0)));
    assert!(c.nft_token_svg("r-NVDAx-0".into()).contains("EXITED"));
}

#[test]
fn v7_reserve_failed_exit_transfers_restore_the_claim() {
    let (mut c, _) = settled();
    set_ctx(alice(), 1, T0 + 10 * SEC);
    c.initiate_reserve_exit("r-NVDAx-0".into());
    set_ctx(alice(), 1, T0 + 10 * SEC + RESERVE_NOTICE_NS);
    let _ = c.complete_reserve_exit("r-NVDAx-0".into());
    let id = "r-NVDAx-0".to_string();
    let usdc_payout =
        Payout::ReserveExit { note_id: id.clone(), principal_usd_e6: U128(3_750_000_000), fees_usd_e6: U128(ALICE_FEES) };
    assert!(!fail_payout(&mut c, usdc_payout, alice(), 3_750_000_000 + ALICE_FEES));
    assert!(!fail_payout(&mut c, Payout::ReserveUnits { note_id: id.clone() }, alice(), RESERVE_LEG_UNITS));
    let n = note(&c, &id);
    assert!(!n.note.exited && n.can_complete);
    assert_eq!(n.note.exit_usdc_e6, U128(3_750_000_000));
    assert_eq!((n.claimable_units, n.claimable_fees_usd_e6), (U128(RESERVE_LEG_UNITS), U128(ALICE_FEES)));
    let r = rv(&c);
    assert_eq!((r.usdc_e6, r.notice_usdc_e6, r.units), (U128(3_750_000_000), U128(3_750_000_000), U128(RESERVE_LEG_UNITS)));
    // and the exit can be completed again
    set_ctx(alice(), 1, T0 + 31 * DAY_NS);
    let _ = c.complete_reserve_exit(id);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn v7_reserve_initiate_needs_one_yocto() {
    let mut c = scenario();
    set_ctx(alice(), 0, T0 + SEC);
    c.initiate_reserve_exit("r-NVDAx-0".into());
}

#[test]
#[should_panic(expected = "unknown reserve note")]
fn v7_reserve_initiate_unknown_note() {
    let mut c = scenario();
    set_ctx(alice(), 1, T0 + SEC);
    c.initiate_reserve_exit("r-TSLAx-0".into());
}

#[test]
#[should_panic(expected = "note owner only")]
fn v7_reserve_initiate_note_owner_only() {
    let mut c = scenario();
    set_ctx(bob(), 1, T0 + SEC);
    c.initiate_reserve_exit("r-NVDAx-0".into());
}

#[test]
#[should_panic(expected = "already exiting")]
fn v7_reserve_initiate_twice() {
    let mut c = scenario();
    set_ctx(alice(), 1, T0 + SEC);
    c.initiate_reserve_exit("r-NVDAx-0".into());
    c.initiate_reserve_exit("r-NVDAx-0".into());
}

#[test]
#[should_panic(expected = "exit not initiated")]
fn v7_reserve_complete_not_initiated() {
    let mut c = scenario();
    set_ctx(alice(), 1, T0 + SEC);
    let _ = c.complete_reserve_exit("r-NVDAx-0".into());
}

#[test]
#[should_panic(expected = "notice period not over")]
fn v7_reserve_complete_before_notice() {
    let mut c = scenario();
    set_ctx(alice(), 1, T0 + SEC);
    c.initiate_reserve_exit("r-NVDAx-0".into());
    set_ctx(alice(), 1, T0 + SEC + RESERVE_NOTICE_NS - 1);
    let _ = c.complete_reserve_exit("r-NVDAx-0".into());
}

#[test]
#[should_panic(expected = "note owner only")]
fn v7_reserve_complete_note_owner_only() {
    let mut c = scenario();
    set_ctx(alice(), 1, T0 + SEC);
    c.initiate_reserve_exit("r-NVDAx-0".into());
    set_ctx(bob(), 1, T0 + SEC + RESERVE_NOTICE_NS);
    let _ = c.complete_reserve_exit("r-NVDAx-0".into());
}

#[test]
#[should_panic(expected = "reserve note exited")]
fn v7_reserve_complete_twice() {
    let mut c = scenario();
    set_ctx(alice(), 1, T0 + SEC);
    c.initiate_reserve_exit("r-NVDAx-0".into());
    set_ctx(alice(), 1, T0 + SEC + RESERVE_NOTICE_NS);
    let _ = c.complete_reserve_exit("r-NVDAx-0".into());
    let _ = c.complete_reserve_exit("r-NVDAx-0".into());
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn v7_reserve_complete_needs_one_yocto() {
    let mut c = scenario();
    set_ctx(alice(), 1, T0 + SEC);
    c.initiate_reserve_exit("r-NVDAx-0".into());
    set_ctx(alice(), 0, T0 + SEC + RESERVE_NOTICE_NS);
    let _ = c.complete_reserve_exit("r-NVDAx-0".into());
}

#[test]
#[should_panic(expected = "nothing to withdraw")]
fn v7_reserve_complete_nothing_to_withdraw() {
    let mut c = scenario();
    let mut n = c.reserve_note(0).unwrap();
    n.shares = U128(0);
    n.unlock_ns = Some(U64(T0));
    c.put_reserve_note(0, n);
    set_ctx(alice(), 1, T0 + SEC);
    let _ = c.complete_reserve_exit("r-NVDAx-0".into());
}

// ------------------------------------------------------------------ Note transfer

#[test]
fn v7_reserve_note_transfer_moves_the_claim() {
    let (mut c, _) = settled();
    set_ctx(alice(), 1, T0 + 10 * SEC);
    c.nft_transfer(bob(), "r-NVDAx-0".into(), None, None);
    assert_eq!(c.nft_token("r-NVDAx-0".into()).unwrap().owner_id, bob());
    assert_eq!(c.nft_supply_for_owner(bob()), U128(1));
    let n = note(&c, "r-NVDAx-0");
    assert_eq!((n.note.owner.clone(), n.claimable_units), (bob(), U128(RESERVE_LEG_UNITS)));
    // in notice the claim still moves; the new owner completes
    set_ctx(bob(), 1, T0 + 11 * SEC);
    c.initiate_reserve_exit("r-NVDAx-0".into());
    c.nft_transfer(carol(), "r-NVDAx-0".into(), None, None);
    set_ctx(carol(), 1, T0 + 11 * SEC + RESERVE_NOTICE_NS);
    let _ = c.complete_reserve_exit("r-NVDAx-0".into());
    assert!(event(&get_logs(), "reserve_exited").unwrap().contains(r#""owner":"carol.test""#));
}

#[test]
#[should_panic(expected = "note owner only")]
fn v7_reserve_old_owner_loses_authority_after_transfer() {
    let mut c = scenario();
    set_ctx(alice(), 1, T0 + SEC);
    c.nft_transfer(bob(), "r-NVDAx-0".into(), None, None);
    c.initiate_reserve_exit("r-NVDAx-0".into());
}

// ------------------------------------------------------------------ views + math

#[test]
fn v7_reserve_views_unknown_and_math_helpers() {
    let c = setup();
    assert!(c.get_reserve_note("r-NVDAx-0".into()).is_none());
    assert!(c.get_reserve_note("q-0".into()).is_none());
    let r = rv(&c);
    assert_eq!((r.min_deposit_usd_e6, r.notice_period_ns, r.realised_apr_7d_bps), (U128(10_000_000), U64(RESERVE_NOTICE_NS), U128(0)));
    assert_eq!(math::reserve_shares_for(10, 0, 0), Ok(10));
    assert_eq!(math::reserve_shares_for(10, 5, 0), Err("reserve_depleted"));
    assert_eq!(math::reserve_shares_for(3, 10, 7), Ok(4));
    assert_eq!(math::reserve_share_value(3, 10, 7), Ok(2));
    assert_eq!(math::reserve_share_value(10, 10, 7), Ok(7));
    assert_eq!(math::reserve_share_value(0, 10, 7), Ok(0));
    let s = math::split_premium_qr(100, 7000, 2000, 0, 50, 0).unwrap();
    assert_eq!((s.buyers_usd_e6, s.reserve_usd_e6, s.treasury_usd_e6), (0, 0, 80), "no shares: R ignored");
    let s = math::split_premium_qr(100, 7000, 2000, 0, 50, 50).unwrap();
    assert_eq!((s.buyers_usd_e6, s.reserve_usd_e6, s.acc_increment_e18, s.reserve_acc_increment_e18), (70, 70, 0, 14 * math::E18 / 10));
    assert_eq!(math::split_premium(100, 7000, 2000, 10), math::split_premium_qr(100, 7000, 2000, 10, 0, 0));
}

#[test]
#[should_panic(expected = "unknown collateral")]
fn v7_reserve_get_reserve_unknown_symbol() {
    let c = setup();
    let _ = c.get_reserve("TSLAx".into());
}

#[test]
fn v7_reserve_notice_param_bounds_and_effect() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.set_reserve_params("NVDAx".into(), 1_000, Some(U64(60 * SEC)));
    assert_eq!(rv(&c).notice_period_ns, U64(60 * SEC));
    assert_eq!(join(&mut c, alice(), 10_000_000), 0);
    set_ctx(alice(), 1, T0 + SEC);
    c.initiate_reserve_exit("r-NVDAx-0".into());
    set_ctx(alice(), 1, T0 + 61 * SEC);
    let _ = c.complete_reserve_exit("r-NVDAx-0".into());
    assert!(event(&get_logs(), "reserve_exited").unwrap().contains(r#""principal_usd_e6":"10000000""#));
}

#[test]
#[should_panic(expected = "notice_ns out of range")]
fn v7_reserve_notice_param_below_min() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.set_reserve_params("NVDAx".into(), 1_000, Some(U64(59 * SEC)));
}
