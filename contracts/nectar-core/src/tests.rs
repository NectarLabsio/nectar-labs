//! Unit tests: every public method, every ft_on_transfer variant and failure path,
//! settlement ordering/caps, callbacks, and the model.csv vectors.

use super::*;
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{PromiseResult, testing_env};

const T0: u64 = 1_700_000_000_000_000_000;
const SEC: u64 = 1_000_000_000;
const NVDAX_UNITS: u128 = 100_000_000; // 100 NVDAx (6 dp)

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
fn buyer1() -> AccountId {
    a("buyer1.test")
}
fn buyer2() -> AccountId {
    a("buyer2.test")
}
fn borrower() -> AccountId {
    a("borrower.test")
}
fn lender() -> AccountId {
    a("lender.test")
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

fn nvdax_input() -> CollateralInput {
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

/// v2 A2: one NYSE-like window around T0 (the session then opens while the price is <= 900 s old).
fn open_window(c: &mut Nectar) {
    set_ctx(owner(), 0, T0);
    c.set_session_calendar(vec![[U64(T0 - 3_600 * SEC), U64(T0 + 6 * 3_600 * SEC)]]);
}

fn setup() -> Nectar {
    set_ctx(owner(), 0, T0);
    let mut c = Nectar::new(owner(), usdc(), keeper());
    c.upsert_collateral("NVDAx".into(), nvdax_input());
    assert!(c.update_owner_price("NVDAx".into(), U128(180_000_000)));
    set_ctx(owner(), 1_000, T0);
    c.fund_gas_reserve();
    c
}

fn ft(c: &mut Nectar, token: AccountId, sender: AccountId, amount: u128, msg: &str) -> u128 {
    set_ctx(token, 0, T0 + SEC);
    match c.ft_on_transfer(sender, U128(amount), msg.to_string()) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    }
}

fn fund(c: &mut Nectar, buyer: AccountId, amount: u128, disc: u16) -> u128 {
    let msg = format!(
        r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":{disc},"notice_period_ns":"604800000000000","buyer_remote_recipient":null}}}}"#
    );
    ft(c, usdc(), buyer, amount, &msg)
}

fn borrow_msg(borrow: u128, pre_liq: u16) -> String {
    format!(r#"{{"LockCollateralAndBorrow":{{"collateral":"NVDAx","borrow_usd_e6":"{borrow}","pre_liq_ltv_bps":{pre_liq}}}}}"#)
}

/// Demo state: lender $50k, buyer1 $10k @250, buyer2 $5k @400, borrower 100 NVDAx at B_c.
fn demo() -> Nectar {
    let mut c = setup();
    assert_eq!(ft(&mut c, usdc(), lender(), 50_000_000_000, r#""SupplyLendingLiquidity""#), 0);
    assert_eq!(fund(&mut c, buyer1(), 10_000_000_000, 250), 0);
    assert_eq!(fund(&mut c, buyer2(), 5_000_000_000, 400), 0);
    assert_eq!(ft(&mut c, nvdax(), borrower(), NVDAX_UNITS, &borrow_msg(11_250_000_000, 7500)), 0);
    c
}

fn has_event(name: &str) -> bool {
    get_logs().iter().any(|l| l.starts_with("EVENT_JSON:") && l.contains(&format!("\"event\":\"{name}\"")))
}

// ------------------------------------------------------------------ init / admin

#[test]
fn new_sets_defaults() {
    set_ctx(owner(), 0, T0);
    let c = Nectar::new(owner(), usdc(), keeper());
    let cfg = c.get_config();
    assert_eq!(cfg.fee_split, FeeSplit { buyers_bps: 7000, lenders_bps: 2000, treasury_bps: 1000 });
    assert_eq!(cfg.min_notice_period_ns, U64(604_800 * SEC));
    assert_eq!(cfg.min_quote_usd_e6, U128(100_000_000));
    assert_eq!(cfg.max_age_ns_session, U64(120 * SEC));
    assert_eq!(cfg.max_age_ns_closed, U64(86_400 * SEC));
    assert_eq!(cfg.band_bps, 1500);
    assert_eq!(cfg.keeper_fee_bps, 50);
    assert_eq!(cfg.max_quotes_per_asset, 64);
    assert_eq!(cfg.max_quotes_per_settlement, 8);
    assert!(!cfg.paused);
}

#[test]
fn contract_version_view() {
    let c = setup();
    assert_eq!(c.contract_version(), "2.0.0-v7");
    assert_eq!(c.get_config().contract_version, c.contract_version());
    assert_eq!(c.get_state_version(), 2);
}

#[test]
fn upsert_collateral_creates_and_updates() {
    let mut c = setup();
    assert!(has_event("collateral_upserted") || c.get_collateral("NVDAx".into()).is_some());
    let mut i = nvdax_input();
    i.limit_premium_bps = 400;
    set_ctx(owner(), 0, T0);
    c.upsert_collateral("NVDAx".into(), i);
    let col = c.get_collateral("NVDAx".into()).unwrap();
    assert_eq!(col.limit_premium_bps, 400);
    assert_eq!(col.oracle_price_usd_e6, U128(180_000_000), "update keeps oracle state");
    assert!(has_event("collateral_upserted"));
}

#[test]
#[should_panic(expected = "owner only")]
fn upsert_collateral_owner_only() {
    let mut c = setup();
    set_ctx(buyer1(), 0, T0);
    c.upsert_collateral("NVDAx".into(), nvdax_input());
}

#[test]
#[should_panic(expected = "bps > 10000")]
fn upsert_collateral_rejects_bad_bps() {
    let mut c = setup();
    let mut i = nvdax_input();
    i.weekend_haircut_bps = 10_001;
    set_ctx(owner(), 0, T0);
    c.upsert_collateral("NVDAx".into(), i);
}

#[test]
#[should_panic(expected = "symbol mismatch")]
fn upsert_collateral_symbol_mismatch() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.upsert_collateral("TSLAx".into(), nvdax_input());
}

#[test]
#[should_panic(expected = "collateral token cannot be usdc")]
fn upsert_collateral_rejects_usdc_token() {
    let mut c = setup();
    let mut i = nvdax_input();
    i.token = usdc();
    set_ctx(owner(), 0, T0);
    c.upsert_collateral("NVDAx".into(), i);
}

#[test]
fn set_keeper_rotates() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.set_keeper(a("keeper2.test"));
    assert_eq!(c.get_config().keeper, a("keeper2.test"));
}

#[test]
#[should_panic(expected = "owner only")]
fn set_keeper_owner_only() {
    let mut c = setup();
    set_ctx(keeper(), 0, T0);
    c.set_keeper(keeper());
}

#[test]
fn set_fee_split_ok() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.set_fee_split(6000, 3000, 1000);
    assert_eq!(c.get_config().fee_split.lenders_bps, 3000);
}

#[test]
#[should_panic(expected = "fee split must sum to 10000")]
fn set_fee_split_must_sum() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.set_fee_split(7000, 2000, 999);
}

/// v1 `set_session` coverage, v2 form: the session comes from the calendar (A2), not an owner flag.
#[test]
fn session_window_switches_haircut_and_depth() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.set_dex_depth("NVDAx".into(), U128(4_000_000_000));
    // WO-23b: R_c comes from Reserve deposits (the owner setter is gone).
    c.set_reserve_params("NVDAx".into(), 1_000, None);
    assert_eq!(ft(&mut c, usdc(), lender(), 1_000_000_000, r#"{"JoinNectarReserve":{"collateral":"NVDAx"}}"#), 0);
    set_ctx(owner(), 0, T0);
    let closed = c.get_exit_capacity("NVDAx".into());
    assert_eq!(closed.haircut_bps, 2500);
    assert_eq!(closed.d_usd_e6, U128(0));
    assert_eq!(closed.r_usd_e6, U128(1_000_000_000));
    assert_eq!(closed.capacity_usd_e6, U128(750_000_000));
    assert_eq!(closed.session_reason, "no_calendar");
    open_window(&mut c);
    let open = c.get_exit_capacity("NVDAx".into());
    assert_eq!(open.haircut_bps, 1000);
    assert_eq!(open.d_usd_e6, U128(4_000_000_000));
    assert_eq!(open.capacity_usd_e6, U128(4_500_000_000));
    assert!(open.session_open);
    assert_eq!(open.session_reason, "open");
}

#[test]
#[should_panic(expected = "unknown collateral")]
fn force_session_closed_unknown_symbol() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.force_session_closed("TSLAx".into(), true);
}

#[test]
fn set_dex_depth_and_reserve_owner_values() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.set_dex_depth("NVDAx".into(), U128(7));
    c.set_reserve_params("NVDAx".into(), 9, None);
    let col = c.get_collateral("NVDAx".into()).unwrap();
    assert_eq!(col.verified_dex_depth_usd_e6, U128(7));
    assert_eq!(col.reserve.discount_bps, 9);
}

#[test]
#[should_panic(expected = "owner only")]
fn set_dex_depth_owner_only() {
    let mut c = setup();
    set_ctx(buyer1(), 0, T0);
    c.set_dex_depth("NVDAx".into(), U128(1));
}

#[test]
fn set_quote_params_ok() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.set_quote_params(U64(SEC), U128(1));
    let cfg = c.get_config();
    assert_eq!(cfg.min_notice_period_ns, U64(SEC));
    assert_eq!(cfg.min_quote_usd_e6, U128(1));
}

#[test]
fn set_oracle_params_ok() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.set_oracle_params(U64(60 * SEC), U64(3_600 * SEC), 1000);
    let cfg = c.get_config();
    assert_eq!(cfg.max_age_ns_session, U64(60 * SEC));
    assert_eq!(cfg.band_bps, 1000);
}

#[test]
#[should_panic(expected = "max age must be > 0")]
fn set_oracle_params_rejects_zero_age() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.set_oracle_params(U64(0), U64(1), 1000);
}

// ------------------------------------------------------------------ oracle

#[test]
fn update_owner_price_band() {
    let mut c = setup();
    set_ctx(owner(), 0, T0 + SEC);
    assert!(c.update_owner_price("NVDAx".into(), U128(155_000_000))); // -13.9 %
    assert!(has_event("oracle_updated"));
    set_ctx(owner(), 0, T0 + 2 * SEC);
    assert!(!c.update_owner_price("NVDAx".into(), U128(100_000_000))); // -35 %
    assert!(has_event("oracle_rejected"));
    let col = c.get_collateral("NVDAx".into()).unwrap();
    assert_eq!(col.oracle_price_usd_e6, U128(155_000_000));
    assert_eq!(col.oracle_updated_ns, U64(T0 + SEC), "rejection does not refresh the timestamp");
}

#[test]
#[should_panic(expected = "owner only")]
fn update_owner_price_owner_only() {
    let mut c = setup();
    set_ctx(keeper(), 0, T0);
    c.update_owner_price("NVDAx".into(), U128(1));
}

#[test]
fn propose_apply_bypasses_band() {
    let mut c = setup();
    set_ctx(owner(), 0, T0 + SEC);
    c.propose_price("NVDAx".into(), U128(90_000_000));
    set_ctx(owner(), 0, T0 + 2 * SEC);
    c.apply_price("NVDAx".into());
    assert_eq!(c.get_collateral("NVDAx".into()).unwrap().oracle_price_usd_e6, U128(90_000_000));
    assert!(has_event("oracle_updated"));
}

#[test]
#[should_panic(expected = "apply in a later block")]
fn apply_price_same_block_rejected() {
    let mut c = setup();
    set_ctx(owner(), 0, T0 + SEC);
    c.propose_price("NVDAx".into(), U128(90_000_000));
    c.apply_price("NVDAx".into());
}

#[test]
#[should_panic(expected = "no proposed price")]
fn apply_price_without_proposal() {
    let mut c = setup();
    set_ctx(owner(), 0, T0 + SEC);
    c.apply_price("NVDAx".into());
}

// ------------------------------------------------------------------ pause / gas reserve

#[test]
fn pause_unpause_and_paused_refunds() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.pause();
    assert!(has_event("paused"));
    assert!(c.get_config().paused);
    assert_eq!(ft(&mut c, usdc(), lender(), 1_000, r#""SupplyLendingLiquidity""#), 1_000);
    assert_eq!(c.get_pool().available_usd_e6, U128(0));
    set_ctx(owner(), 0, T0);
    c.unpause();
    assert!(has_event("unpaused"));
    assert_eq!(ft(&mut c, usdc(), lender(), 1_000, r#""SupplyLendingLiquidity""#), 0);
}

#[test]
#[should_panic(expected = "owner only")]
fn pause_owner_only() {
    let mut c = setup();
    set_ctx(keeper(), 0, T0);
    c.pause();
}

#[test]
fn fund_gas_reserve_accumulates() {
    let c = setup();
    assert_eq!(c.get_config().gas_reserve_yocto, U128(1_000));
}

#[test]
#[should_panic(expected = "attach a deposit")]
fn fund_gas_reserve_requires_deposit() {
    let mut c = setup();
    set_ctx(owner(), 0, T0);
    c.fund_gas_reserve();
}

// ------------------------------------------------------------------ ft_on_transfer

#[test]
#[should_panic(expected = "unknown token")]
fn ft_on_transfer_unknown_token_panics() {
    let mut c = setup();
    ft(&mut c, a("fake-usdc.test"), lender(), 1, r#""SupplyLendingLiquidity""#);
}

#[test]
fn ft_on_transfer_invalid_msg_refunds() {
    let mut c = setup();
    assert_eq!(ft(&mut c, usdc(), lender(), 5, "not json"), 5);
    assert_eq!(ft(&mut c, usdc(), lender(), 5, r#"{"Nope":{}}"#), 5);
    assert_eq!(ft(&mut c, usdc(), lender(), 0, r#""SupplyLendingLiquidity""#), 0);
}

#[test]
fn ft_on_transfer_wrong_token_for_variant_refunds() {
    let mut c = setup();
    // collateral token cannot supply liquidity; usdc cannot lock collateral
    assert_eq!(ft(&mut c, nvdax(), lender(), 5, r#""SupplyLendingLiquidity""#), 5);
    assert_eq!(ft(&mut c, usdc(), borrower(), 5, &borrow_msg(1, 7500)), 5);
}

#[test]
fn supply_lending_liquidity() {
    let mut c = setup();
    assert_eq!(ft(&mut c, usdc(), lender(), 50_000_000_000, r#""SupplyLendingLiquidity""#), 0);
    assert!(has_event("liquidity_supplied"));
    assert_eq!(c.get_pool().available_usd_e6, U128(50_000_000_000));
}

#[test]
fn fund_quote_creates_quote_and_q() {
    let mut c = setup();
    assert_eq!(fund(&mut c, buyer1(), 10_000_000_000, 250), 0);
    assert!(has_event("quote_funded"));
    let q = c.get_quote(U64(0)).unwrap();
    assert_eq!(q.quote_id, U64(0));
    assert_eq!(q.remaining_usd_e6, U128(10_000_000_000));
    assert_eq!(q.buyer, buyer1());
    assert_eq!(c.get_exit_capacity("NVDAx".into()).q_usd_e6, U128(10_000_000_000));
}

#[test]
fn fund_quote_failures_refund_without_state_change() {
    let mut c = setup();
    // below minimum size
    assert_eq!(fund(&mut c, buyer1(), 99_999_999, 250), 99_999_999);
    // notice below minimum
    let short = r#"{"FundPappusQuote":{"collateral":"NVDAx","max_discount_bps":250,"notice_period_ns":"1"}}"#;
    assert_eq!(ft(&mut c, usdc(), buyer1(), 100_000_000, short), 100_000_000);
    // discount out of range
    assert_eq!(fund(&mut c, buyer1(), 100_000_000, 10_000), 100_000_000);
    // unknown collateral
    let unk = r#"{"FundPappusQuote":{"collateral":"TSLAx","max_discount_bps":250,"notice_period_ns":"604800000000000"}}"#;
    assert_eq!(ft(&mut c, usdc(), buyer1(), 100_000_000, unk), 100_000_000);
    assert_eq!(c.get_config().next_quote_id, U64(0));
    assert_eq!(c.get_exit_capacity("NVDAx".into()).q_usd_e6, U128(0));
}

#[test]
fn fund_quote_cap_64() {
    let mut c = setup();
    for _ in 0..64 {
        assert_eq!(fund(&mut c, buyer1(), 100_000_000, 250), 0);
    }
    assert_eq!(fund(&mut c, buyer1(), 100_000_000, 250), 100_000_000);
    assert_eq!(c.list_quotes("NVDAx".into(), None, Some(100)).len(), 64);
}

#[test]
fn top_up_quote() {
    let mut c = setup();
    fund(&mut c, buyer1(), 1_000_000_000, 250);
    assert_eq!(ft(&mut c, usdc(), buyer1(), 500_000_000, r#"{"TopUpQuote":{"quote_id":"0"}}"#), 0);
    assert!(has_event("quote_topped_up"));
    let q = c.get_quote(U64(0)).unwrap();
    assert_eq!(q.remaining_usd_e6, U128(1_500_000_000));
    assert_eq!(q.committed_usd_e6, U128(1_500_000_000));
    assert_eq!(c.get_exit_capacity("NVDAx".into()).q_usd_e6, U128(1_500_000_000));
    // other sender / unknown quote refund
    assert_eq!(ft(&mut c, usdc(), buyer2(), 5, r#"{"TopUpQuote":{"quote_id":"0"}}"#), 5);
    assert_eq!(ft(&mut c, usdc(), buyer1(), 5, r#"{"TopUpQuote":{"quote_id":"9"}}"#), 5);
}

#[test]
fn top_up_settles_fees_first() {
    let mut c = demo(); // premium distributed to Q = 15k
    ft(&mut c, usdc(), buyer1(), 5_000_000_000, r#"{"TopUpQuote":{"quote_id":"0"}}"#);
    let q = c.get_quote(U64(0)).unwrap();
    assert_eq!(q.claimable_fees_usd_e6, U128(56_700_000), "fees before top-up are kept");
}

#[test]
fn lock_and_borrow_at_limit() {
    let c = demo();
    assert!(has_event("position_opened"));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!(p.position_id, U64(0));
    assert_eq!(p.status, PositionStatus::Open);
    assert_eq!(p.units, U128(NVDAX_UNITS));
    assert_eq!(p.debt_usd_e6, U128(11_250_000_000));
    assert_eq!(p.premium_usd_e6, U128(121_500_000));
    assert_eq!(p.pre_liq_ltv_bps, 7500);
    let pool = c.get_pool();
    assert_eq!(pool.available_usd_e6, U128(50_000_000_000 - 11_250_000_000));
    assert_eq!(pool.utilised_usd_e6, U128(11_250_000_000));
    // premium treasury share 12.15 + origination 30 bps of 11,250 = 33.75 (no referrer)
    assert_eq!(pool.treasury_usd_e6, U128(12_150_000 + 33_750_000));
    assert_eq!(p.entry_multiplier_e18, U128(math::E18));
    assert_eq!(c.get_collateral("NVDAx".into()).unwrap().total_debt_usd_e6, U128(11_250_000_000));
    assert_eq!(pool.lenders_fees_usd_e6, U128(24_300_000));
    assert_eq!(c.get_quote(U64(0)).unwrap().claimable_fees_usd_e6, U128(56_700_000));
    assert_eq!(c.get_quote(U64(1)).unwrap().claimable_fees_usd_e6, U128(28_350_000));
}

#[test]
fn lock_and_borrow_failures_refund() {
    let mut c = setup();
    ft(&mut c, usdc(), lender(), 50_000_000_000, r#""SupplyLendingLiquidity""#);
    fund(&mut c, buyer1(), 15_000_000_000, 250);
    // above the aggregate capacity (v2 A1; LTV cap is 12,600)
    assert_eq!(ft(&mut c, nvdax(), borrower(), NVDAX_UNITS, &borrow_msg(11_250_000_001, 7500)), NVDAX_UNITS);
    // above the LTV cap (40 NVDAx: V 7,200 -> LTV cap 5,040)
    assert_eq!(ft(&mut c, nvdax(), borrower(), 40_000_000, &borrow_msg(5_040_000_001, 8000)), 40_000_000);
    // pre_liq out of [6500, 8000]
    assert_eq!(ft(&mut c, nvdax(), borrower(), NVDAX_UNITS, &borrow_msg(1_000, 8001)), NVDAX_UNITS);
    // borrow above pre_liq (6250 bps needs pre_liq >= 6250; 11.25k/18k = 6250 -> ok at 6500; use V smaller)
    assert_eq!(ft(&mut c, nvdax(), borrower(), 10_000_000, &borrow_msg(1_200_000_000, 6500)), 10_000_000);
    // zero borrow
    assert_eq!(ft(&mut c, nvdax(), borrower(), NVDAX_UNITS, &borrow_msg(0, 7500)), NVDAX_UNITS);
    // collateral/token mismatch
    let m = r#"{"LockCollateralAndBorrow":{"collateral":"TSLAx","borrow_usd_e6":"1","pre_liq_ltv_bps":7500}}"#;
    assert_eq!(ft(&mut c, nvdax(), borrower(), NVDAX_UNITS, m), NVDAX_UNITS);
    assert_eq!(c.get_config().next_position_id, U64(0));
    assert_eq!(c.get_pool().utilised_usd_e6, U128(0));
}

#[test]
fn lock_and_borrow_stale_oracle_refunds() {
    let mut c = setup();
    ft(&mut c, usdc(), lender(), 50_000_000_000, r#""SupplyLendingLiquidity""#);
    fund(&mut c, buyer1(), 15_000_000_000, 250);
    set_ctx(nvdax(), 0, T0 + 86_401 * SEC);
    let r = c.ft_on_transfer(borrower(), U128(NVDAX_UNITS), borrow_msg(1_000_000, 7500));
    assert!(matches!(r, PromiseOrValue::Value(U128(v)) if v == NVDAX_UNITS));
}

#[test]
fn lock_and_borrow_pool_insufficient_refunds() {
    let mut c = setup();
    ft(&mut c, usdc(), lender(), 1_000_000_000, r#""SupplyLendingLiquidity""#);
    fund(&mut c, buyer1(), 15_000_000_000, 250);
    assert_eq!(ft(&mut c, nvdax(), borrower(), NVDAX_UNITS, &borrow_msg(2_000_000_000, 7500)), NVDAX_UNITS);
}

#[test]
fn repay_partial_full_and_overpay() {
    let mut c = demo();
    let r = ft(&mut c, usdc(), borrower(), 1_250_000_000, r#"{"Repay":{"position_id":"0"}}"#);
    assert_eq!(r, 0);
    assert!(has_event("repaid"));
    assert_eq!(c.get_position(U64(0)).unwrap().debt_usd_e6, U128(10_000_000_000));
    let r = ft(&mut c, usdc(), borrower(), 10_000_000_007, r#"{"Repay":{"position_id":"0"}}"#);
    assert_eq!(r, 7, "unused returned");
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!(p.status, PositionStatus::Closed);
    assert_eq!(p.units, U128(0));
    assert_eq!(c.get_pool().utilised_usd_e6, U128(0));
    assert_eq!(c.get_pool().available_usd_e6, U128(50_000_000_000));
    // closed position: refund
    assert_eq!(ft(&mut c, usdc(), borrower(), 3, r#"{"Repay":{"position_id":"0"}}"#), 3);
    assert_eq!(ft(&mut c, usdc(), borrower(), 3, r#"{"Repay":{"position_id":"7"}}"#), 3);
}

// ------------------------------------------------------------------ quote lifecycle

#[test]
fn initiate_and_complete_withdrawal() {
    let mut c = demo();
    set_ctx(buyer2(), 1, T0 + 10 * SEC);
    c.initiate_quote_withdrawal(U64(1));
    assert!(has_event("quote_exiting"));
    let q = c.get_quote(U64(1)).unwrap();
    assert_eq!(q.unlock_ns, Some(U64(T0 + 10 * SEC + 604_800 * SEC)));
    assert_eq!(c.get_exit_capacity("NVDAx".into()).q_usd_e6, U128(10_000_000_000));
    assert_eq!(q.claimable_fees_usd_e6, U128(28_350_000));
    set_ctx(buyer2(), 1, T0 + 10 * SEC + 604_800 * SEC);
    let _ = c.complete_quote_withdrawal(U64(1));
    assert!(has_event("quote_withdrawn"));
    let q = c.get_quote(U64(1)).unwrap();
    assert_eq!(q.remaining_usd_e6, U128(0));
    assert_eq!(q.claimable_fees_usd_e6, U128(0));
    assert_eq!(c.list_quotes("NVDAx".into(), None, None).len(), 1);
}

#[test]
#[should_panic(expected = "notice period not over")]
fn complete_withdrawal_before_unlock() {
    let mut c = demo();
    set_ctx(buyer2(), 1, T0 + 10 * SEC);
    c.initiate_quote_withdrawal(U64(1));
    set_ctx(buyer2(), 1, T0 + 11 * SEC);
    let _ = c.complete_quote_withdrawal(U64(1));
}

#[test]
#[should_panic(expected = "withdrawal not initiated")]
fn complete_withdrawal_without_initiate() {
    let mut c = demo();
    set_ctx(buyer2(), 1, T0 + 10 * SEC);
    let _ = c.complete_quote_withdrawal(U64(1));
}

#[test]
#[should_panic(expected = "buyer only")]
fn initiate_withdrawal_buyer_only() {
    let mut c = demo();
    set_ctx(buyer1(), 1, T0);
    c.initiate_quote_withdrawal(U64(1));
}

#[test]
#[should_panic(expected = "exactly 1 yoctoNEAR")]
fn initiate_withdrawal_requires_one_yocto() {
    let mut c = demo();
    set_ctx(buyer2(), 0, T0);
    c.initiate_quote_withdrawal(U64(1));
}

#[test]
#[should_panic(expected = "already exiting")]
fn initiate_withdrawal_twice() {
    let mut c = demo();
    set_ctx(buyer2(), 1, T0);
    c.initiate_quote_withdrawal(U64(1));
    c.initiate_quote_withdrawal(U64(1));
}

#[test]
fn complete_withdrawal_allowed_while_paused() {
    let mut c = demo();
    set_ctx(buyer2(), 1, T0);
    c.initiate_quote_withdrawal(U64(1));
    set_ctx(owner(), 0, T0);
    c.pause();
    set_ctx(buyer2(), 1, T0 + 604_800 * SEC);
    let _ = c.complete_quote_withdrawal(U64(1));
    assert_eq!(c.get_quote(U64(1)).unwrap().remaining_usd_e6, U128(0));
}

#[test]
fn claim_fees_pays_and_zeroes() {
    let mut c = demo();
    set_ctx(buyer1(), 1, T0 + 5 * SEC);
    let _ = c.claim_fees(U64(0));
    assert!(has_event("fees_claimed"));
    assert_eq!(c.get_quote(U64(0)).unwrap().claimable_fees_usd_e6, U128(0));
}

#[test]
#[should_panic(expected = "no fees")]
fn claim_fees_nothing() {
    let mut c = setup();
    fund(&mut c, buyer1(), 100_000_000, 250);
    set_ctx(buyer1(), 1, T0);
    let _ = c.claim_fees(U64(0));
}

#[test]
#[should_panic(expected = "paused")]
fn claim_fees_refused_when_paused() {
    let mut c = demo();
    set_ctx(owner(), 0, T0);
    c.pause();
    set_ctx(buyer1(), 1, T0);
    let _ = c.claim_fees(U64(0));
}

#[test]
fn fees_after_exit_stop_accruing() {
    let mut c = setup();
    ft(&mut c, usdc(), lender(), 50_000_000_000, r#""SupplyLendingLiquidity""#);
    fund(&mut c, buyer1(), 10_000_000_000, 250);
    fund(&mut c, buyer2(), 10_000_000_000, 400);
    set_ctx(buyer2(), 1, T0);
    c.initiate_quote_withdrawal(U64(1));
    ft(&mut c, nvdax(), borrower(), NVDAX_UNITS, &borrow_msg(7_500_000_000, 7500));
    // premium = (7.5k - 7.2k) * 3% = 9 USDC; buyers 6.3 all to quote 0
    assert_eq!(c.get_quote(U64(0)).unwrap().claimable_fees_usd_e6, U128(6_300_000));
    assert_eq!(c.get_quote(U64(1)).unwrap().claimable_fees_usd_e6, U128(0));
}

// ------------------------------------------------------------------ settlement

fn crash_price(c: &mut Nectar) {
    set_ctx(owner(), 0, T0 + 2 * SEC);
    assert!(c.update_owner_price("NVDAx".into(), U128(155_000_000)));
    set_ctx(owner(), 0, T0 + 3 * SEC);
    assert!(c.update_owner_price("NVDAx".into(), U128(140_000_000)));
}

#[test]
fn trigger_preliquidation_static_settle_matches_model() {
    let mut c = demo();
    crash_price(&mut c);
    let h = c.get_health(U64(0));
    assert!(h.triggerable);
    assert_eq!(h.ltv_bps, 8036);
    set_ctx(keeper(), 0, T0 + 4 * SEC);
    c.trigger_preliquidation(U64(0));
    assert!(has_event("preliq_triggered"));
    assert_eq!(get_logs().iter().filter(|l| l.contains("\"event\":\"settled_near\"")).count(), 2);
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!(p.status, PositionStatus::Closed);
    assert_eq!(p.debt_usd_e6, U128(0));
    let q0 = c.get_quote(U64(0)).unwrap();
    let q1 = c.get_quote(U64(1)).unwrap();
    assert_eq!(q0.remaining_usd_e6, U128(0));
    assert_eq!(q1.remaining_usd_e6, U128(3_750_000_000));
    assert_eq!(c.get_exit_capacity("NVDAx".into()).q_usd_e6, U128(3_750_000_000));
    assert_eq!(c.list_quotes("NVDAx".into(), None, None).len(), 1, "emptied quote leaves live list");
    let pool = c.get_pool();
    assert_eq!(pool.utilised_usd_e6, U128(0));
    assert_eq!(pool.available_usd_e6, U128(50_000_000_000));
    assert_eq!(c.get_config().gas_reserve_yocto, U128(1_000 - 4));
    // fees accrued before settlement survive
    assert_eq!(q0.claimable_fees_usd_e6, U128(56_700_000));
}

#[test]
#[should_panic(expected = "position not open")]
fn trigger_twice_on_one_position() {
    let mut c = demo();
    crash_price(&mut c);
    set_ctx(keeper(), 0, T0 + 4 * SEC);
    c.trigger_preliquidation(U64(0));
    c.trigger_preliquidation(U64(0));
}

#[test]
#[should_panic(expected = "keeper only")]
fn trigger_keeper_only() {
    let mut c = demo();
    crash_price(&mut c);
    set_ctx(buyer1(), 0, T0 + 4 * SEC);
    c.trigger_preliquidation(U64(0));
}

#[test]
#[should_panic(expected = "position healthy")]
fn trigger_healthy_position() {
    let mut c = demo();
    set_ctx(keeper(), 0, T0 + 4 * SEC);
    c.trigger_preliquidation(U64(0));
}

#[test]
#[should_panic(expected = "oracle stale")]
fn trigger_stale_oracle() {
    let mut c = demo();
    crash_price(&mut c);
    set_ctx(keeper(), 0, T0 + 3 * SEC + 86_401 * SEC);
    c.trigger_preliquidation(U64(0));
}

#[test]
#[should_panic(expected = "paused")]
fn trigger_paused() {
    let mut c = demo();
    crash_price(&mut c);
    set_ctx(owner(), 0, T0);
    c.pause();
    set_ctx(keeper(), 0, T0 + 4 * SEC);
    c.trigger_preliquidation(U64(0));
}

#[test]
#[should_panic(expected = "gas reserve empty")]
fn trigger_needs_gas_reserve() {
    set_ctx(owner(), 0, T0);
    let mut c = Nectar::new(owner(), usdc(), keeper());
    c.upsert_collateral("NVDAx".into(), nvdax_input());
    c.update_owner_price("NVDAx".into(), U128(180_000_000));
    ft(&mut c, usdc(), lender(), 50_000_000_000, r#""SupplyLendingLiquidity""#);
    fund(&mut c, buyer1(), 15_000_000_000, 250);
    ft(&mut c, nvdax(), borrower(), NVDAX_UNITS, &borrow_msg(11_250_000_000, 7500));
    crash_price(&mut c);
    set_ctx(keeper(), 0, T0 + 4 * SEC);
    c.trigger_preliquidation(U64(0));
}

#[test]
fn settlement_order_and_cap_of_eight() {
    let mut c = setup();
    ft(&mut c, usdc(), lender(), 50_000_000_000, r#""SupplyLendingLiquidity""#);
    // 20 quotes of $750; discounts descending so ordering is visible; ids 0..19
    for i in 0..20u16 {
        fund(&mut c, buyer1(), 750_000_000, 1000 - i * 40);
    }
    ft(&mut c, nvdax(), borrower(), NVDAX_UNITS, &borrow_msg(11_250_000_000, 7500));
    crash_price(&mut c);
    set_ctx(keeper(), 0, T0 + 4 * SEC);
    c.trigger_preliquidation(U64(0));
    let settled: Vec<String> =
        get_logs().into_iter().filter(|l| l.contains("\"event\":\"settled_near\"")).collect();
    assert_eq!(settled.len(), 8, "at most 8 quotes per settlement");
    assert!(settled[0].contains("\"quote_id\":\"19\""), "lowest discount first: {}", settled[0]);
    assert!(settled[7].contains("\"quote_id\":\"12\""));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!(p.debt_usd_e6, U128(11_250_000_000 - 8 * 750_000_000), "remaining debt after 8 legs");
    assert_eq!(p.status, PositionStatus::Open, "partial settle returns to Open");
}

#[test]
fn settlement_consumes_exiting_quote_during_notice() {
    let mut c = demo();
    set_ctx(buyer1(), 1, T0 + SEC);
    c.initiate_quote_withdrawal(U64(0));
    crash_price(&mut c);
    set_ctx(keeper(), 0, T0 + 4 * SEC);
    c.trigger_preliquidation(U64(0));
    let q0 = c.get_quote(U64(0)).unwrap();
    assert_eq!(q0.remaining_usd_e6, U128(0), "exiting quote still backs existing positions");
    // Q_c only counted quote 1 (5k) and drops by its 1,250 leg
    assert_eq!(c.get_exit_capacity("NVDAx".into()).q_usd_e6, U128(3_750_000_000));
}

#[test]
#[should_panic(expected = "no quote capacity")]
fn trigger_without_quotes_reverts() {
    let mut c = setup();
    ft(&mut c, usdc(), lender(), 50_000_000_000, r#""SupplyLendingLiquidity""#);
    set_ctx(owner(), 0, T0);
    // WO-23b: capacity from a Reserve deposit that then leaves R_c (notice), so neither quotes nor Reserve can fill.
    c.set_reserve_params("NVDAx".into(), 1_000, None);
    ft(&mut c, usdc(), lender(), 20_000_000_000, r#"{"JoinNectarReserve":{"collateral":"NVDAx"}}"#);
    ft(&mut c, nvdax(), borrower(), NVDAX_UNITS, &borrow_msg(11_250_000_000, 7500));
    set_ctx(lender(), 1, T0 + SEC);
    c.initiate_reserve_exit("r-NVDAx-0".into());
    crash_price(&mut c);
    set_ctx(keeper(), 0, T0 + 4 * SEC);
    c.trigger_preliquidation(U64(0));
}

// ------------------------------------------------------------------ callbacks

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

#[test]
fn on_payout_success_is_noop() {
    let mut c = demo();
    let mut b = VMContextBuilder::new();
    b.current_account_id(core()).predecessor_account_id(core());
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(vec![])]
    );
    assert!(c.on_payout(Payout::Fees { quote_id: U64(0) }, buyer1(), U128(1)));
}

// #[private] on on_payout is enforced by the wasm entry point; covered in tests/sandbox.rs.

#[test]
fn on_payout_failed_borrow_proceeds_become_repayment() {
    let mut c = demo();
    let payout = 11_250_000_000 - 121_500_000;
    assert!(!fail_payout(&mut c, Payout::BorrowProceeds { position_id: U64(0) }, borrower(), payout));
    assert!(has_event("payout_failed"));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!(p.debt_usd_e6, U128(121_500_000));
    assert_eq!(c.get_pool().utilised_usd_e6, U128(121_500_000));
}

#[test]
fn on_payout_failed_withdrawal_restores_quote() {
    let mut c = demo();
    set_ctx(buyer2(), 1, T0);
    c.initiate_quote_withdrawal(U64(1));
    set_ctx(buyer2(), 1, T0 + 604_800 * SEC);
    let _ = c.complete_quote_withdrawal(U64(1));
    let p = Payout::QuoteWithdrawal {
        quote_id: U64(1),
        principal_usd_e6: U128(5_000_000_000),
        fees_usd_e6: U128(28_350_000),
    };
    fail_payout(&mut c, p, buyer2(), 5_028_350_000);
    let q = c.get_quote(U64(1)).unwrap();
    assert_eq!(q.remaining_usd_e6, U128(5_000_000_000));
    assert_eq!(q.claimable_fees_usd_e6, U128(28_350_000));
    assert_eq!(c.get_exit_capacity("NVDAx".into()).q_usd_e6, U128(10_000_000_000), "exiting: not in Q_c");
}

#[test]
fn on_payout_failed_fees_restored() {
    let mut c = demo();
    set_ctx(buyer1(), 1, T0);
    let _ = c.claim_fees(U64(0));
    fail_payout(&mut c, Payout::Fees { quote_id: U64(0) }, buyer1(), 56_700_000);
    assert_eq!(c.get_quote(U64(0)).unwrap().claimable_fees_usd_e6, U128(56_700_000));
}

#[test]
fn on_payout_failed_collateral_recorded_as_owed() {
    let mut c = demo();
    fail_payout(&mut c, Payout::SettlementBuyer { position_id: U64(0), quote_id: U64(0) }, buyer1(), 42);
    fail_payout(&mut c, Payout::CollateralRelease { position_id: U64(0) }, borrower(), 7);
    fail_payout(&mut c, Payout::SettlementKeeper { position_id: U64(0) }, keeper(), 3);
    assert_eq!(c.get_owed_collateral(buyer1(), "NVDAx".into()), U128(42));
    assert_eq!(c.get_owed_collateral(borrower(), "NVDAx".into()), U128(7));
    assert_eq!(c.get_owed_collateral(keeper(), "NVDAx".into()), U128(3));
}

// ------------------------------------------------------------------ views

#[test]
fn list_collaterals_paginates() {
    let mut c = setup();
    let mut i = nvdax_input();
    i.symbol = "TSLAx".into();
    i.token = a("tslax.test");
    set_ctx(owner(), 0, T0);
    c.upsert_collateral("TSLAx".into(), i);
    assert_eq!(c.list_collaterals(None, None).len(), 2);
    assert_eq!(c.list_collaterals(Some(1), Some(5)).len(), 1);
    assert_eq!(c.list_collaterals(Some(0), Some(1))[0].symbol, "NVDAx");
}

#[test]
fn get_exit_capacity_view() {
    let c = demo();
    let e = c.get_exit_capacity("NVDAx".into());
    assert_eq!(e.q_usd_e6, U128(15_000_000_000));
    assert_eq!(e.capacity_usd_e6, U128(11_250_000_000));
    assert_eq!(e.haircut_bps, 2500);
    assert!(!e.session_open);
    assert!(e.oracle_fresh);
    assert_eq!(e.oracle_price_usd_e6, U128(180_000_000));
    assert_eq!(e.b_c_usd_per_unit_e6, Some(U128(126_000_000)));
    assert_eq!(e.limit_bps_effective, 7000);
}

#[test]
fn get_quote_and_list_quotes_views() {
    let c = demo();
    let qs = c.list_quotes("NVDAx".into(), None, None);
    assert_eq!(qs.len(), 2);
    assert_eq!(qs[1].quote_id, U64(1));
    assert_eq!(c.list_quotes("NVDAx".into(), Some(1), Some(1)).len(), 1);
    assert!(c.get_quote(U64(99)).is_none());
    assert!(c.list_quotes("NOPE".into(), None, None).is_empty());
}

#[test]
fn get_position_and_list_positions_views() {
    let c = demo();
    assert_eq!(c.list_positions(None, None).len(), 1);
    assert!(c.list_positions(Some(1), None).is_empty());
    assert!(c.get_position(U64(5)).is_none());
}

#[test]
fn get_health_view() {
    let c = demo();
    let h = c.get_health(U64(0));
    assert_eq!(h.value_usd_e6, U128(18_000_000_000));
    assert_eq!(h.debt_usd_e6, U128(11_250_000_000));
    assert_eq!(h.ltv_bps, 6250);
    assert_eq!(h.pre_liq_ltv_bps, 7500);
    assert!(h.oracle_fresh);
    assert!(!h.triggerable);
}

#[test]
fn get_pool_view() {
    let c = setup();
    let p = c.get_pool();
    assert_eq!(p.available_usd_e6, U128(0));
    assert_eq!(p.treasury_usd_e6, U128(0));
}

#[test]
fn preview_borrow_view() {
    let mut c = setup();
    ft(&mut c, usdc(), lender(), 50_000_000_000, r#""SupplyLendingLiquidity""#);
    fund(&mut c, buyer1(), 15_000_000_000, 250);
    let ok = c.preview_borrow("NVDAx".into(), U128(NVDAX_UNITS), U128(11_250_000_000), None, None, None);
    assert!(ok.ok);
    assert_eq!(ok.b_c_usd_e6, U128(11_250_000_000));
    assert_eq!(ok.static_limit_usd_e6, U128(7_200_000_000));
    assert_eq!(ok.premium_usd_e6, U128(121_500_000));
    assert_eq!(ok.origination_fee_usd_e6, U128(33_750_000));
    assert_eq!(ok.referrer_share_usd_e6, U128(0));
    assert_eq!(ok.total_fees_usd_e6, U128(155_250_000));
    assert_eq!(ok.net_proceeds_usd_e6, U128(11_094_750_000));
    assert_eq!(ok.aggregate_headroom_usd_e6, U128(11_250_000_000));
    assert_eq!(ok.multiplier_e18, U128(math::E18));
    assert!(!ok.session_open);
    let over = c.preview_borrow("NVDAx".into(), U128(NVDAX_UNITS), U128(11_250_000_001), None, None, None);
    assert!(!over.ok);
    assert_eq!(over.reason.as_deref(), Some("aggregate_limit"));
    let over_ltv = c.preview_borrow("NVDAx".into(), U128(40_000_000), U128(5_040_000_001), None, None, None);
    assert_eq!(over_ltv.reason.as_deref(), Some("borrow above B_c"));
    let unk = c.preview_borrow("NOPE".into(), U128(1), U128(1), None, None, None);
    assert_eq!(unk.reason.as_deref(), Some("unknown collateral"));
    set_ctx(owner(), 0, T0 + 86_401 * SEC);
    let stale = c.preview_borrow("NVDAx".into(), U128(NVDAX_UNITS), U128(1), None, None, None);
    assert_eq!(stale.reason.as_deref(), Some("oracle stale"));
}

#[test]
fn get_owed_collateral_default_zero() {
    let c = setup();
    assert_eq!(c.get_owed_collateral(buyer1(), "NVDAx".into()), U128(0));
}

#[test]
fn events_are_nep297() {
    let _c = demo();
    let l = get_logs().into_iter().find(|l| l.contains("position_opened")).unwrap();
    assert!(l.starts_with(r#"EVENT_JSON:{"standard":"nectar","version":"2.0.0","event":"position_opened","data":[{"#));
    assert!(l.contains(r#""debt_usd_e6":"11250000000""#));
}

// ------------------------------------------------------------------ model.csv

#[test]
fn model_csv_vectors_match_contract_math() {
    let csv = include_str!("../tests/model.csv");
    let mut lines = csv.lines();
    let header: Vec<&str> = lines.next().unwrap().split(',').collect();
    let mut n = 0;
    for line in lines {
        let cells: Vec<&str> = line.split(',').collect();
        let get = |k: &str| -> &str { cells[header.iter().position(|h| *h == k).unwrap()] };
        let u = |k: &str| -> u128 { get(k).parse().unwrap() };
        let case = get("case");
        match get("kind") {
            "limit" => {
                let p = math::LimitParams {
                    decimals: u("decimals") as u8,
                    m_e18: u("multiplier_e18"),
                    total_debt_usd_e6: u("total_debt_usd_e6"),
                    price_usd_e6: u("price_usd_e6"),
                    q_usd_e6: u("q_usd_e6"),
                    r_usd_e6: u("r_usd_e6"),
                    d_usd_e6: u("d_usd_e6"),
                    session_open: u("session_open") == 1,
                    base_ltv_bps: u("base_ltv_bps") as u16,
                    max_nectar_ltv_bps: u("max_nectar_ltv_bps") as u16,
                    base_haircut_bps: u("base_haircut_bps") as u16,
                    weekend_haircut_bps: u("weekend_haircut_bps") as u16,
                };
                let l = math::limit(u("units"), &p).unwrap();
                assert_eq!(l.value_usd_e6, u("value_usd_e6"), "{case}");
                assert_eq!(l.haircut_bps as u128, u("haircut_bps"), "{case}");
                assert_eq!(l.capacity_usd_e6, u("capacity_usd_e6"), "{case}");
                assert_eq!(l.static_limit_usd_e6, u("static_limit_usd_e6"), "{case}");
                assert_eq!(l.b_c_usd_e6, u("b_c_usd_e6"), "{case}");
                assert_eq!(l.headroom_usd_e6, u("aggregate_headroom_usd_e6"), "{case}");
                let borrow = u("borrow_usd_e6");
                let pre_liq = u("pre_liq_ltv_bps") as u16;
                let ok = borrow > 0
                    && borrow <= l.ltv_cap_usd_e6
                    && u("total_debt_usd_e6") + borrow <= l.capacity_usd_e6
                    && !math::triggerable(borrow, l.value_usd_e6, pre_liq).unwrap();
                assert_eq!(ok as u128, u("borrow_ok"), "{case}");
                let orig = math::origination_fee(borrow, u("origination_fee_bps") as u16).unwrap();
                assert_eq!(orig, u("origination_fee_usd_e6"), "{case}");
                let prem = math::premium_usd_e6(borrow, l.static_limit_usd_e6, u("limit_premium_bps") as u16).unwrap();
                assert_eq!(prem, u("premium_usd_e6"), "{case}");
                // WO-23b: Q:R split; limit rows model R as backed 1:1 by shares
                let s = math::split_premium_qr(
                    prem,
                    u("buyers_bps") as u16,
                    u("lenders_bps") as u16,
                    u("q_usd_e6"),
                    u("r_usd_e6"),
                    u("r_usd_e6"),
                )
                .unwrap();
                assert_eq!(s.buyers_usd_e6, u("buyers_fee_usd_e6"), "{case}");
                assert_eq!(s.lenders_usd_e6, u("lenders_fee_usd_e6"), "{case}");
                assert_eq!(s.treasury_usd_e6, u("treasury_fee_usd_e6"), "{case}");
                assert_eq!(s.acc_increment_e18, u("acc_increment_e18"), "{case}");
                assert_eq!(s.reserve_usd_e6, u("reserve_fee_usd_e6"), "{case}");
                assert_eq!(borrow.saturating_sub(prem + orig), u("net_proceeds_usd_e6"), "{case}");
                let debt = u("debt_usd_e6");
                assert_eq!(math::ltv_bps(debt, l.value_usd_e6) as u128, u("ltv_bps"), "{case}");
                let trig = math::triggerable(debt, l.value_usd_e6, pre_liq).unwrap();
                assert_eq!(trig as u128, u("triggerable"), "{case}");
            }
            "leg" => {
                let leg = math::settle_leg_m(
                    u("debt_usd_e6"),
                    u("quote_remaining_usd_e6"),
                    u("units"),
                    u("multiplier_e18"),
                    u("price_usd_e6"),

                    u("decimals") as u8,
                    u("disc_bps") as u16,
                    u("keeper_fee_bps") as u16,
                )
                .unwrap();
                if get("repay_usd_e6").is_empty() {
                    assert!(leg.is_none(), "{case}");
                } else {
                    let leg = leg.unwrap_or_else(|| panic!("{case}: expected a leg"));
                    assert_eq!(leg.repay_usd_e6, u("repay_usd_e6"), "{case}");
                    assert_eq!(leg.buyer_units, u("buyer_units"), "{case}");
                    assert_eq!(leg.keeper_units, u("keeper_units"), "{case}");
                }
            }
            // WO-23a §4.9: sized with the session closed whatever `session_open` says; flat fee replaces the premium.
            "shield" => {
                let p = math::LimitParams {
                    decimals: u("decimals") as u8,
                    m_e18: u("multiplier_e18"),
                    total_debt_usd_e6: u("total_debt_usd_e6"),
                    price_usd_e6: u("price_usd_e6"),
                    q_usd_e6: u("q_usd_e6"),
                    r_usd_e6: u("r_usd_e6"),
                    d_usd_e6: u("d_usd_e6"),
                    session_open: false,
                    base_ltv_bps: u("base_ltv_bps") as u16,
                    max_nectar_ltv_bps: u("max_nectar_ltv_bps") as u16,
                    base_haircut_bps: u("base_haircut_bps") as u16,
                    weekend_haircut_bps: u("weekend_haircut_bps") as u16,
                };
                let l = math::limit(u("units"), &p).unwrap();
                assert_eq!(l.capacity_usd_e6, u("capacity_usd_e6"), "{case}");
                assert_eq!(l.haircut_bps as u128, u("haircut_bps"), "{case}");
                assert_eq!(l.b_c_usd_e6, u("b_c_usd_e6"), "{case}");
                let borrow = u("borrow_usd_e6");
                let ok = borrow > 0
                    && borrow <= l.ltv_cap_usd_e6
                    && u("total_debt_usd_e6") + borrow <= l.capacity_usd_e6
                    && !math::triggerable(borrow, l.value_usd_e6, u("pre_liq_ltv_bps") as u16).unwrap();
                assert_eq!(ok as u128, u("borrow_ok"), "{case}");
                let fee = math::shield_fee(borrow, u("shield_fee_bps") as u16).unwrap();
                assert_eq!(fee, u("premium_usd_e6"), "{case}");
                let s = math::split_premium(fee, u("buyers_bps") as u16, u("lenders_bps") as u16, u("q_usd_e6")).unwrap();
                assert_eq!(s.buyers_usd_e6, u("buyers_fee_usd_e6"), "{case}");
                assert_eq!(s.treasury_usd_e6, u("treasury_fee_usd_e6"), "{case}");
                let orig = math::origination_fee(borrow, u("origination_fee_bps") as u16).unwrap();
                assert_eq!(borrow.saturating_sub(fee + orig), u("net_proceeds_usd_e6"), "{case}");
            }
            // WO-23a §4.10: one opted-in quote fills debt + fee.
            "self" => {
                let (fee, fill) = math::profit_lock_fill(u("debt_usd_e6"), u("pl_fee_bps") as u16).unwrap();
                assert_eq!((fee, fill), (u("pl_fee_usd_e6"), u("fill_usd_e6")), "{case}");
                if !get("buyer_units").is_empty() {
                    let (b, _) = math::seize_units_m(
                        fill,
                        u("multiplier_e18"),
                        u("price_usd_e6"),
                        u("decimals") as u8,
                        u("disc_bps") as u16,
                        0,
                    )
                    .unwrap();
                    assert_eq!(b, u("buyer_units"), "{case}");
                    assert_eq!(u("units") - b, u("units_kept"), "{case}");
                }
            }
            // WO-23b §4.8: fee split Q:R, shares for a deposit, Reserve leg and the per-share unit index.
            "reserve" => {
                let shares = u("reserve_shares");
                let r = u("r_usd_e6");
                let s = math::split_premium_qr(u("premium_usd_e6"), u("buyers_bps") as u16, u("lenders_bps") as u16, u("q_usd_e6"), r, shares)
                    .unwrap();
                assert_eq!(s.buyers_usd_e6, u("buyers_fee_usd_e6"), "{case}");
                assert_eq!(s.acc_increment_e18, u("acc_increment_e18"), "{case}");
                assert_eq!(s.reserve_usd_e6, u("reserve_fee_usd_e6"), "{case}");
                assert_eq!(s.reserve_acc_increment_e18, u("reserve_acc_increment_e18"), "{case}");
                let minted = math::reserve_shares_for(u("reserve_deposit_usd_e6"), shares, r);
                if get("minted_shares").is_empty() {
                    assert!(minted.is_err(), "{case}");
                } else {
                    assert_eq!(minted.unwrap(), u("minted_shares"), "{case}");
                }
                let leg = math::settle_leg_m(
                    u("debt_usd_e6"),
                    r,
                    u("units"),
                    math::E18,
                    u("price_usd_e6").max(1),
                    u("decimals") as u8,
                    u("disc_bps") as u16,
                    u("keeper_fee_bps") as u16,
                )
                .unwrap();
                if !get("repay_usd_e6").is_empty() {
                    let leg = leg.unwrap_or_else(|| panic!("{case}: expected a leg"));
                    assert_eq!((leg.repay_usd_e6, leg.buyer_units, leg.keeper_units), (u("repay_usd_e6"), u("buyer_units"), u("keeper_units")), "{case}");
                    assert_eq!(math::mul_div_floor(leg.buyer_units, math::E18, shares).unwrap(), u("reserve_acc_units_e18"), "{case}");
                }
            }
            k => panic!("unknown kind {k}"),
        }
        n += 1;
    }
    assert!(n >= 50, "model.csv rows: {n}");
}
