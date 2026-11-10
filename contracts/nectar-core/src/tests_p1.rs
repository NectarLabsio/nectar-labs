//! P1 unit tests: v2 layout/version, quoter setters/views, trigger -> on_quoter_result (clamp, every fallback
//! reason, abort paths), parse_quoter_output, and quoter/tests/vectors.json when WO-9 is merged.

use super::*;
use crate::p1::{hex, parse_quoter_output};
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{PromiseResult, testing_env};

const T0: u64 = 1_700_000_000_000_000_000;
const SEC: u64 = 1_000_000_000;

fn a(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn owner() -> AccountId {
    a("owner.test")
}
fn keeper() -> AccountId {
    a("keeper.test")
}
fn core() -> AccountId {
    a("core.test")
}
fn nvdax() -> AccountId {
    a("nvdax.test")
}
fn usdc() -> AccountId {
    a("usdc.test")
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

fn has_event(name: &str) -> bool {
    get_logs().iter().any(|l| l.starts_with("EVENT_JSON:") && l.contains(&format!("\"event\":\"{name}\"")))
}
fn event_with(name: &str, needle: &str) -> bool {
    get_logs().iter().any(|l| l.contains(&format!("\"event\":\"{name}\"")) && l.contains(needle))
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

fn ft(c: &mut Nectar, token: AccountId, sender: &str, amount: u128, msg: &str) -> u128 {
    set_ctx(token, 0, T0 + SEC);
    match c.ft_on_transfer(a(sender), U128(amount), msg.to_string()) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    }
}

/// P0 demo state (buyer1 $10k @250, buyer2 $5k @400, borrower 100 NVDAx, $11,250 debt), price crashed
/// to 140, quoter pinned with a 100-yocto deposit and vol 420.
fn demo_p1(pin: bool) -> Nectar {
    set_ctx(owner(), 0, T0);
    let mut c = Nectar::new(owner(), usdc(), keeper());
    c.upsert_collateral("NVDAx".into(), input());
    assert!(c.update_owner_price("NVDAx".into(), U128(180_000_000)));
    set_ctx(owner(), 1_000, T0);
    c.fund_gas_reserve();
    assert_eq!(ft(&mut c, usdc(), "lender.test", 50_000_000_000, r#""SupplyLendingLiquidity""#), 0);
    for (b, amt, d) in [("buyer1.test", 10_000_000_000u128, 250u16), ("buyer2.test", 5_000_000_000, 400)] {
        let m = format!(
            r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":{d},"notice_period_ns":"604800000000000","buyer_remote_recipient":null}}}}"#
        );
        assert_eq!(ft(&mut c, usdc(), b, amt, &m), 0);
    }
    let bm = r#"{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"11250000000","pre_liq_ltv_bps":7500}}"#;
    assert_eq!(ft(&mut c, nvdax(), "borrower.test", 100_000_000, bm), 0);
    set_ctx(owner(), 0, T0 + 2 * SEC);
    assert!(c.update_owner_price("NVDAx".into(), U128(155_000_000)));
    set_ctx(owner(), 0, T0 + 3 * SEC);
    assert!(c.update_owner_price("NVDAx".into(), U128(140_000_000)));
    if pin {
        c.set_quoter_config(U128(100), 100, U64(100_000_000), 128, 30);
        c.set_quoter_pin("owner.testnet/nectar-quoter".into(), "ab".repeat(32));
        c.set_vol_bps("NVDAx".into(), 420);
    }
    c
}

/// The exact stdin + sha the contract sends for position 0 (state unchanged between trigger and callback).
fn stdin_sha(c: &Nectar) -> (String, String) {
    let p = c.position(0).unwrap();
    let coll = c.coll("NVDAx").unwrap();
    let cands = c.select_quotes("NVDAx");
    let s = c.quoter_stdin(0, &p, &coll, &cands, 420);
    let h = hex(&env::sha256(s.as_bytes()));
    (s, h)
}

fn trigger(c: &mut Nectar) -> String {
    set_ctx(keeper(), 0, T0 + 4 * SEC);
    let (_, sha) = stdin_sha(c);
    c.trigger_preliquidation(U64(0));
    sha
}

fn callback(c: &mut Nectar, sha: &str, result: PromiseResult) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(core()).predecessor_account_id(core()).block_timestamp(T0 + 5 * SEC).prepaid_gas(Gas::from_tgas(200));
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
    c.on_quoter_result(U64(0), sha.to_string(), vec![U64(0), U64(1)]);
}

fn stdout(sha: &str, fills: &str) -> Vec<u8> {
    format!(
        r#"{{"v":1,"symbol":"NVDAx","position_id":"0","input_sha256":"{sha}","price_e6":"140000000","src":"oracle","depth_e6":"0","depth_src":"none","session_open":false,"vol_bps":420,"fills":[{fills}],"model":"as-v1"}}"#
    )
    .into_bytes()
}

fn settled_discs() -> Vec<String> {
    get_logs()
        .into_iter()
        .filter(|l| l.contains("\"event\":\"settled_near\""))
        .map(|l| l.split("\"disc_bps\":").nth(1).unwrap().split(',').next().unwrap().to_string())
        .collect()
}

// ------------------------------------------------------------------ version (v2: fresh deploy, no migrate)

/// v1 migrate coverage, v2 form: `new` writes layout 2 with the P1 defaults `migrate` used to set.
#[test]
fn new_writes_v2_layout_with_p1_defaults() {
    set_ctx(owner(), 0, T0);
    let c = Nectar::new(owner(), usdc(), keeper());
    assert_eq!(c.get_state_version(), 2);
    assert_eq!(env::storage_read(STATE_VERSION_KEY), Some(vec![2]));
    let q = c.get_quoter_config();
    assert!(!q.enabled);
    assert_eq!(q.outlayer_account, a("outlayer.testnet"));
    assert_eq!(q.max_conf_bps, 100);
    assert_eq!(c.get_config().origination_fee_bps, 30);
}

#[test]
fn contract_version_says_v2() {
    let c = demo_p1(false);
    assert_eq!(c.contract_version(), "2.0.0-v7");
}

/// v2 A2 helper: a calendar window around T0 so the session opens while the price is fresh.
fn open_window(c: &mut Nectar) {
    set_ctx(owner(), 0, T0);
    c.set_session_calendar(vec![[U64(T0 - 3_600 * SEC), U64(T0 + 6 * 3_600 * SEC)]]);
}

// ------------------------------------------------------------------ setters / views

#[test]
fn quoter_setters_and_views() {
    let mut c = demo_p1(false);
    set_ctx(owner(), 0, T0);
    assert!(!c.get_quoter_config().enabled);
    c.set_quoter_pin("p/q".into(), "v".into());
    c.set_quoter_config(U128(7), 120, U64(5), 64, 10);
    c.set_outlayer_account(a("stub.test"));
    c.set_max_conf_bps(250);
    let q = c.get_quoter_config();
    assert!(q.enabled);
    assert_eq!((q.project_id.as_str(), q.version_key.as_str()), ("p/q", "v"));
    assert_eq!((q.deposit_yocto, q.gas_tgas, q.max_instructions, q.max_memory_mb, q.max_execution_seconds), (U128(7), 120, U64(5), 64, 10));
    assert_eq!(q.outlayer_account, a("stub.test"));
    assert_eq!(q.max_conf_bps, 250);
    c.set_quoter_pin(String::new(), String::new());
    assert!(!c.get_quoter_config().enabled);
    assert_eq!(c.get_vol_bps("NVDAx".into()), 0);
    c.set_vol_bps("NVDAx".into(), 420);
    assert_eq!(c.get_vol_bps("NVDAx".into()), 420);
    c.set_vol_bps("NVDAx".into(), 0);
    assert_eq!(c.get_vol_bps("NVDAx".into()), 0);
    assert_eq!(c.get_oracle_source("NVDAx".into()), OracleSource::Owner);
    c.set_oracle_source("NVDAx".into(), OracleSource::Owner);
    assert_eq!(c.get_exit_capacity("NVDAx".into()).oracle_source, OracleSource::Owner);
}

#[test]
#[should_panic(expected = "set both or neither")]
fn quoter_pin_half_set() {
    let mut c = demo_p1(false);
    set_ctx(owner(), 0, T0);
    c.set_quoter_pin("p/q".into(), String::new());
}

#[test]
#[should_panic(expected = "owner only")]
fn quoter_pin_owner_only() {
    let mut c = demo_p1(false);
    set_ctx(keeper(), 0, T0);
    c.set_quoter_pin("p/q".into(), "v".into());
}

#[test]
#[should_panic(expected = "gas_tgas out of range")]
fn quoter_config_gas_bound() {
    let mut c = demo_p1(false);
    set_ctx(owner(), 0, T0);
    c.set_quoter_config(U128(1), 201, U64(1), 1, 1);
}

#[test]
#[should_panic(expected = "max_instructions out of range")]
fn quoter_config_instr_bound() {
    let mut c = demo_p1(false);
    set_ctx(owner(), 0, T0);
    c.set_quoter_config(U128(1), 100, U64(500_000_000_001), 1, 1);
}

#[test]
#[should_panic(expected = "owner only")]
fn outlayer_account_owner_only() {
    let mut c = demo_p1(false);
    set_ctx(keeper(), 0, T0);
    c.set_outlayer_account(a("x.test"));
}

#[test]
#[should_panic(expected = "vol_bps > 10000")]
fn vol_bound() {
    let mut c = demo_p1(false);
    set_ctx(owner(), 0, T0);
    c.set_vol_bps("NVDAx".into(), 10_001);
}

#[test]
#[should_panic(expected = "unknown collateral")]
fn vol_unknown_symbol() {
    let mut c = demo_p1(false);
    set_ctx(owner(), 0, T0);
    c.set_vol_bps("TSLAx".into(), 1);
}

#[test]
#[should_panic(expected = "max_conf_bps out of range")]
fn max_conf_bound() {
    let mut c = demo_p1(false);
    set_ctx(owner(), 0, T0);
    c.set_max_conf_bps(0);
}

// ------------------------------------------------------------------ trigger -> quoter

#[test]
fn trigger_with_pin_requests_execution() {
    let mut c = demo_p1(true);
    let (stdin, sha) = stdin_sha(&c);
    assert_eq!(
        stdin,
        r#"{"v":1,"symbol":"NVDAx","position_id":"0","oracle_price_usd_e6":"140000000","session_open":false,"seize_usd_e6":"11250000000","vol_bps":420,"quotes":[{"id":"0","max_discount_bps":250,"remaining_usd_e6":"10000000000"},{"id":"1","max_discount_bps":400,"remaining_usd_e6":"5000000000"}]}"#
    );
    trigger(&mut c);
    assert!(has_event("preliq_triggered"));
    assert!(event_with("quoter_requested", &sha));
    assert!(!has_event("settled_near"));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Settling);
    assert_eq!(c.get_config().gas_reserve_yocto, U128(900), "deposit taken from the reserve");
}

#[test]
fn trigger_without_vol_falls_back_to_static() {
    let mut c = demo_p1(true);
    set_ctx(owner(), 0, T0);
    c.set_vol_bps("NVDAx".into(), 0);
    trigger(&mut c);
    assert!(event_with("quoter_fallback", "vol_unset"));
    assert_eq!(settled_discs(), vec!["250", "400"]);
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Closed);
}

#[test]
#[should_panic(expected = "gas reserve empty")]
fn trigger_quoter_needs_deposit_in_reserve() {
    let mut c = demo_p1(true);
    set_ctx(owner(), 0, T0);
    c.set_quoter_config(U128(999), 100, U64(1), 1, 1);
    trigger(&mut c);
}

#[test]
#[should_panic(expected = "attach more gas")]
fn trigger_quoter_needs_gas() {
    let mut c = demo_p1(true);
    set_ctx(owner(), 0, T0);
    c.set_quoter_config(U128(100), 200, U64(1), 1, 1);
    let mut b = VMContextBuilder::new();
    b.current_account_id(core()).predecessor_account_id(keeper()).block_timestamp(T0 + 4 * SEC).prepaid_gas(Gas::from_tgas(250));
    testing_env!(b.build());
    c.trigger_preliquidation(U64(0));
}

#[test]
fn quoter_result_applies_discounts() {
    let mut c = demo_p1(true);
    let sha = trigger(&mut c);
    callback(&mut c, &sha, PromiseResult::Successful(stdout(&sha, r#"{"id":"0","disc_bps":65},{"id":"1","disc_bps":90}"#)));
    assert!(event_with("quoter_result", "\"quote_id\":\"0\",\"disc_bps\":65") || event_with("quoter_result", "\"disc_bps\":65"));
    assert_eq!(settled_discs(), vec!["65", "90"]);
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!(p.status, PositionStatus::Closed);
    assert_eq!(p.debt_usd_e6, U128(0));
}

#[test]
fn quoter_result_clamps_9999_to_max() {
    let mut c = demo_p1(true);
    let sha = trigger(&mut c);
    callback(&mut c, &sha, PromiseResult::Successful(stdout(&sha, r#"{"id":"0","disc_bps":9999},{"id":"1","disc_bps":-5}"#)));
    assert!(has_event("quoter_result"));
    // quote 1 clamps to 0 bps and now sorts first; quote 0 clamps to its 250 max
    assert_eq!(settled_discs(), vec!["0", "250"]);
}

#[test]
fn quoter_result_missing_fill_uses_max() {
    let mut c = demo_p1(true);
    let sha = trigger(&mut c);
    callback(&mut c, &sha, PromiseResult::Successful(stdout(&sha, r#"{"id":1,"disc_bps":10}"#)));
    assert_eq!(settled_discs(), vec!["10", "250"]);
}

fn fallback_case(result: PromiseResult, reason: &str) {
    let mut c = demo_p1(true);
    let sha = trigger(&mut c);
    callback(&mut c, &sha, result);
    assert!(event_with("quoter_fallback", &format!("\"reason\":\"{reason}\"")), "reason {reason}: {:?}", get_logs());
    assert_eq!(settled_discs(), vec!["250", "400"], "fallback = each quote's max_discount_bps");
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Closed);
}

#[test]
fn fallback_null() {
    fallback_case(PromiseResult::Successful(b"null".to_vec()), "null");
}

#[test]
fn fallback_failed_receipt() {
    fallback_case(PromiseResult::Failed, "failed");
}

#[test]
fn fallback_bad_hash() {
    fallback_case(PromiseResult::Successful(stdout(&"0".repeat(64), r#"{"id":"0","disc_bps":65}"#)), "input_sha256");
}

#[test]
fn fallback_unknown_quote_id() {
    let c = demo_p1(true);
    let (_, sha) = stdin_sha(&c);
    fallback_case(PromiseResult::Successful(stdout(&sha, r#"{"id":"0","disc_bps":65},{"id":"7","disc_bps":1}"#)), "unknown_quote");
}

#[test]
fn fallback_guest_error() {
    fallback_case(PromiseResult::Successful(br#"{"v":1,"error":"bad stdin"}"#.to_vec()), "error");
}

#[test]
fn fallback_unparseable() {
    fallback_case(PromiseResult::Successful(b"not json".to_vec()), "parse");
}

#[test]
fn fallback_too_long() {
    fallback_case(PromiseResult::Successful(vec![b' '; 4096]), "too_long");
}

#[test]
fn fallback_duplicate_fill() {
    let c = demo_p1(true);
    let (_, sha) = stdin_sha(&c);
    fallback_case(PromiseResult::Successful(stdout(&sha, r#"{"id":"0","disc_bps":65},{"id":"0","disc_bps":66}"#)), "duplicate_quote");
}

#[test]
fn callback_aborts_when_price_recovered() {
    let mut c = demo_p1(true);
    let sha = trigger(&mut c);
    set_ctx(owner(), 0, T0 + 4 * SEC);
    assert!(c.update_owner_price("NVDAx".into(), U128(160_000_000)));
    assert!(c.update_owner_price("NVDAx".into(), U128(180_000_000)));
    callback(&mut c, &sha, PromiseResult::Successful(stdout(&sha, r#"{"id":"0","disc_bps":65}"#)));
    assert!(event_with("settlement_aborted", "position healthy"));
    assert!(!has_event("settled_near"));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Open, "back to Open, re-triggerable");
}

#[test]
fn callback_aborts_when_paused() {
    let mut c = demo_p1(true);
    let sha = trigger(&mut c);
    set_ctx(owner(), 0, T0);
    c.pause();
    callback(&mut c, &sha, PromiseResult::Failed);
    assert!(event_with("settlement_aborted", "paused"));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Open);
}

#[test]
fn callback_ignores_non_settling_position() {
    let mut c = demo_p1(true);
    callback(&mut c, "x", PromiseResult::Failed);
    assert!(get_logs().is_empty());
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Open);
}

// ------------------------------------------------------------------ pure parser

#[test]
fn parse_rejects_wrong_fields() {
    let maxes = [(0u64, 250u16)];
    let ok_out = br#"{"v":1,"symbol":"NVDAx","position_id":"0","input_sha256":"h","fills":[{"id":"0","disc_bps":5}]}"#;
    set_ctx(owner(), 0, T0);
    assert_eq!(parse_quoter_output(ok_out, "NVDAx", 0, "h", &maxes), Ok(vec![(0, 5)]));
    assert_eq!(parse_quoter_output(ok_out, "TSLAx", 0, "h", &maxes), Err("symbol"));
    assert_eq!(parse_quoter_output(ok_out, "NVDAx", 1, "h", &maxes), Err("position"));
    assert_eq!(parse_quoter_output(ok_out, "NVDAx", 0, "g", &maxes), Err("input_sha256"));
    let v2 = br#"{"v":2,"symbol":"NVDAx","position_id":"0","input_sha256":"h","fills":[]}"#;
    assert_eq!(parse_quoter_output(v2, "NVDAx", 0, "h", &maxes), Err("version"));
    let nofills = br#"{"v":1,"symbol":"NVDAx","position_id":"0","input_sha256":"h"}"#;
    assert_eq!(parse_quoter_output(nofills, "NVDAx", 0, "h", &maxes), Err("fills"));
    let badfill = br#"{"v":1,"symbol":"NVDAx","position_id":"0","input_sha256":"h","fills":[{"id":"0","disc_bps":"5"}]}"#;
    assert_eq!(parse_quoter_output(badfill, "NVDAx", 0, "h", &maxes), Err("bad_fill"));
    assert_eq!(parse_quoter_output(b"[]", "NVDAx", 0, "h", &maxes), Err("parse"));
    assert_eq!(hex(&[0x00, 0xab, 0xff]), "00abff");
}

/// Shared vectors from WO-9 (quoter/tests/vectors.json). Each expected stdout is replayed through the
/// contract parser with the vector's own stdin quotes as `maxes`; every disc must be <= max.
#[test]
fn quoter_vectors_if_present() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../quoter/tests/vectors.json");
    let Ok(raw) = std::fs::read_to_string(path) else {
        println!("SKIP quoter_vectors_if_present: {path} not found (WO-9 not merged yet)");
        return;
    };
    set_ctx(owner(), 0, T0);
    let cases: serde_json::Value = serde_json::from_str(&raw).expect("vectors.json parses");
    let cases = cases.as_array().or_else(|| cases.get("cases").and_then(|c| c.as_array())).expect("array of cases");
    let mut checked = 0;
    for case in cases {
        let stdin = case["stdin"].as_str().map(str::to_string).unwrap_or_else(|| case["stdin"].to_string());
        let exp = &case["expected_stdout_fields"];
        if exp.get("error").is_some() || exp.get("fills").is_none() {
            continue;
        }
        let inp: serde_json::Value = serde_json::from_str(&stdin).expect("stdin json");
        let maxes: Vec<(u64, u16)> = inp["quotes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|q| (q["id"].as_str().unwrap().parse().unwrap(), q["max_discount_bps"].as_u64().unwrap() as u16))
            .collect();
        let sha = hex(&env::sha256(stdin.as_bytes()));
        let symbol = inp["symbol"].as_str().unwrap();
        let pid: u64 = inp["position_id"].as_str().unwrap().parse().unwrap();
        let out = serde_json::json!({ "v": 1, "symbol": symbol, "position_id": inp["position_id"],
                                      "input_sha256": sha, "fills": exp["fills"] });
        let got = parse_quoter_output(out.to_string().as_bytes(), symbol, pid, &sha, &maxes).expect("vector accepted");
        for (i, (id, d)) in got.iter().enumerate() {
            assert_eq!(*id, maxes[i].0);
            assert!(*d <= maxes[i].1, "disc <= max");
        }
        checked += 1;
    }
    println!("quoter vectors checked: {checked}");
}

// ------------------------------------------------------------------ WO-10b: Pyth source

use crate::p1::{check_pyth_price, pyth_to_usd_e6, valid_price_identifier, valid_profile};
use near_sdk::json_types::I64;

const PYTH_ID: &str = "B1073854ED24CBC755DC527418F52B7D271F6CC967BBF8D8129112B18860A593";

fn pyth_on(c: &mut Nectar) {
    set_ctx(owner(), 0, T0 + 3 * SEC);
    c.set_oracle_source("NVDAx".into(), OracleSource::Pyth { account: a("pyth.test"), price_identifier: PYTH_ID.into() });
}

fn px(price: i64, conf: u64, expo: i32, publish_time: i64) -> PythPrice {
    PythPrice { price: I64(price), conf: U64(conf), expo, publish_time }
}

/// 135.00 USD at T0+5 s, conf 0.01 USD.
fn good_px() -> PythPrice {
    px(13_500_000_000, 1_000_000, -8, ((T0 + 5 * SEC) / SEC) as i64)
}

fn px_json(p: &PythPrice) -> Vec<u8> {
    near_sdk::serde_json::to_vec(&Some(p.clone())).unwrap()
}

fn pyth_callback(c: &mut Nectar, result: PromiseResult) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(core()).predecessor_account_id(core()).block_timestamp(T0 + 5 * SEC).prepaid_gas(Gas::from_tgas(290));
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
    c.on_pyth_price(U64(0));
}

fn pyth_triggered(pin: bool) -> Nectar {
    let mut c = demo_p1(pin);
    pyth_on(&mut c);
    set_ctx(keeper(), 0, T0 + 4 * SEC);
    c.trigger_preliquidation(U64(0));
    c
}

#[test]
fn pyth_expo_to_usd_e6() {
    assert_eq!(pyth_to_usd_e6(18_000_000, -5), Ok(180_000_000));
    assert_eq!(pyth_to_usd_e6(18_000_000_199, -8), Ok(180_000_001), "floored, against the borrower");
    assert_eq!(pyth_to_usd_e6(180, 0), Ok(180_000_000));
    assert_eq!(pyth_to_usd_e6(18, 1), Ok(180_000_000));
    assert_eq!(pyth_to_usd_e6(180_000_000, -6), Ok(180_000_000));
    assert_eq!(pyth_to_usd_e6(0, -5), Err("non_positive"));
    assert_eq!(pyth_to_usd_e6(-5, -5), Err("non_positive"));
    assert_eq!(pyth_to_usd_e6(9, -7), Err("zero_price"));
    assert_eq!(pyth_to_usd_e6(i64::MAX, -100), Err("zero_price"));
    assert_eq!(pyth_to_usd_e6(i64::MAX, i32::MIN), Err("zero_price"));
    assert_eq!(pyth_to_usd_e6(i64::MAX, 30), Err("overflow"));
    assert_eq!(pyth_to_usd_e6(1, i32::MAX), Err("overflow"));
}

#[test]
fn pyth_acceptance_rules() {
    let now = T0 + 5 * SEC;
    let ok_ = check_pyth_price(&good_px(), now, 120 * SEC, 100, 140_000_000, 1500);
    assert_eq!(ok_, Ok((135_000_000, now)));
    // stale: 121 s > 120 s session max age; same price accepted with the closed-session max age
    let old = px(13_500_000_000, 1_000_000, -8, ((now - 121 * SEC) / SEC) as i64);
    assert_eq!(check_pyth_price(&old, now, 120 * SEC, 100, 0, 1500), Err("stale"));
    assert!(check_pyth_price(&old, now, 86_400 * SEC, 100, 0, 1500).is_ok());
    // conf: exactly 100 bps accepted, one unit more rejected
    let edge = px(13_500_000_000, 135_000_000, -8, (now / SEC) as i64);
    assert!(check_pyth_price(&edge, now, 120 * SEC, 100, 0, 1500).is_ok());
    let wide = px(13_500_000_000, 135_000_001, -8, (now / SEC) as i64);
    assert_eq!(check_pyth_price(&wide, now, 120 * SEC, 100, 0, 1500), Err("conf_too_wide"));
    // band: 15% of 140 = 21 -> 119 ok, 118.99 out; no last price -> band skipped
    let lo = px(11_900_000_000, 0, -8, (now / SEC) as i64);
    assert!(check_pyth_price(&lo, now, 120 * SEC, 100, 140_000_000, 1500).is_ok());
    let out = px(11_899_000_000, 0, -8, (now / SEC) as i64);
    assert_eq!(check_pyth_price(&out, now, 120 * SEC, 100, 140_000_000, 1500), Err("out_of_band"));
    assert!(check_pyth_price(&out, now, 120 * SEC, 100, 0, 1500).is_ok());
    // future publish time clamps to now; negative publish time rejected; negative price rejected
    let fut = px(13_500_000_000, 0, -8, (now / SEC + 30) as i64);
    assert_eq!(check_pyth_price(&fut, now, 120 * SEC, 100, 0, 1500), Ok((135_000_000, now)));
    assert_eq!(check_pyth_price(&px(13_500_000_000, 0, -8, -1), now, 120 * SEC, 100, 0, 1500), Err("bad_time"));
    assert_eq!(check_pyth_price(&px(-1, 0, -8, 1), now, 120 * SEC, 100, 0, 1500), Err("non_positive"));
}

#[test]
fn pyth_id_and_profile_validation() {
    assert!(valid_price_identifier(PYTH_ID));
    assert!(!valid_price_identifier(&format!("0x{}", &PYTH_ID[2..])));
    assert!(!valid_price_identifier("ab"));
    assert!(valid_profile("nectar-quoter_1"));
    assert!(!valid_profile(""));
    assert!(!valid_profile(&"a".repeat(65)));
    assert!(!valid_profile("bad profile"));
}

#[test]
fn pyth_source_set_view_and_clear() {
    let mut c = demo_p1(false);
    pyth_on(&mut c);
    assert!(has_event("oracle_source_set"));
    let want = OracleSource::Pyth { account: a("pyth.test"), price_identifier: PYTH_ID.to_ascii_lowercase() };
    assert_eq!(c.get_oracle_source("NVDAx".into()), want);
    assert_eq!(c.get_exit_capacity("NVDAx".into()).oracle_source, want);
    c.set_oracle_source("NVDAx".into(), OracleSource::Owner);
    assert_eq!(c.get_oracle_source("NVDAx".into()), OracleSource::Owner);
}

#[test]
#[should_panic(expected = "price_identifier must be 64 hex chars")]
fn pyth_source_bad_id() {
    let mut c = demo_p1(false);
    set_ctx(owner(), 0, T0);
    c.set_oracle_source("NVDAx".into(), OracleSource::Pyth { account: a("pyth.test"), price_identifier: "zz".repeat(32) });
}

#[test]
#[should_panic(expected = "owner only")]
fn pyth_source_owner_only() {
    let mut c = demo_p1(false);
    set_ctx(keeper(), 0, T0);
    c.set_oracle_source("NVDAx".into(), OracleSource::Pyth { account: a("pyth.test"), price_identifier: PYTH_ID.into() });
}

#[test]
fn trigger_pyth_requests_price_and_waits() {
    let c = pyth_triggered(false);
    assert!(has_event("preliq_triggered"));
    assert!(event_with("pyth_price_requested", &PYTH_ID.to_ascii_lowercase()));
    assert!(!has_event("settled_near"));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Settling);
}

#[test]
fn trigger_pyth_skips_stale_owner_price() {
    // owner price 24 h + 1 s old would make the owner path panic "oracle stale"; Pyth path still reads.
    let mut c = demo_p1(false);
    pyth_on(&mut c);
    set_ctx(keeper(), 0, T0 + 86_402 * SEC);
    c.trigger_preliquidation(U64(0));
    assert!(has_event("pyth_price_requested"));
}

#[test]
#[should_panic(expected = "attach more gas")]
fn trigger_pyth_needs_gas() {
    let mut c = demo_p1(true);
    pyth_on(&mut c);
    let mut b = VMContextBuilder::new();
    b.current_account_id(core()).predecessor_account_id(keeper()).block_timestamp(T0 + 4 * SEC).prepaid_gas(Gas::from_tgas(150));
    testing_env!(b.build());
    c.trigger_preliquidation(U64(0));
}

#[test]
fn pyth_accepted_then_static_settle() {
    let mut c = pyth_triggered(false);
    pyth_callback(&mut c, PromiseResult::Successful(px_json(&good_px())));
    assert!(event_with("oracle_updated", "\"source\":\"Pyth\""));
    assert_eq!(c.get_collateral("NVDAx".into()).unwrap().oracle_price_usd_e6, U128(135_000_000));
    assert!(!settled_discs().is_empty());
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Closed);
}

#[test]
fn pyth_accepted_then_quoter() {
    let mut c = pyth_triggered(true);
    pyth_callback(&mut c, PromiseResult::Successful(px_json(&good_px())));
    assert!(event_with("quoter_requested", "\"position_id\":\"0\""));
    assert!(event_with("quoter_requested", "135000000") || c.get_collateral("NVDAx".into()).unwrap().oracle_price_usd_e6 == U128(135_000_000));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Settling);
    assert_eq!(c.get_gas_reserve(), U128(900));
}

fn pyth_reject_case(result: PromiseResult, reason: &str) {
    let mut c = pyth_triggered(false);
    pyth_callback(&mut c, result);
    assert!(event_with("oracle_rejected", &format!("\"reason\":\"{reason}\"")), "{reason}: {:?}", get_logs());
    assert!(event_with("settlement_aborted", "oracle_rejected"));
    assert!(!has_event("settled_near"));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Open);
    assert_eq!(c.get_collateral("NVDAx".into()).unwrap().oracle_price_usd_e6, U128(140_000_000), "price untouched");
}

#[test]
fn pyth_rejects_stale_in_session() {
    let mut c = demo_p1(false);
    open_window(&mut c); // session open: 120 s max age
    pyth_on(&mut c);
    set_ctx(keeper(), 0, T0 + 4 * SEC);
    c.trigger_preliquidation(U64(0));
    let old = px(13_500_000_000, 1_000_000, -8, ((T0 + 5 * SEC - 121 * SEC) / SEC) as i64);
    pyth_callback(&mut c, PromiseResult::Successful(px_json(&old)));
    assert!(event_with("oracle_rejected", "\"reason\":\"stale\""));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Open);
}

#[test]
fn pyth_rejects_wide_conf() {
    pyth_reject_case(PromiseResult::Successful(px_json(&px(13_500_000_000, 200_000_000, -8, ((T0 + 5 * SEC) / SEC) as i64))), "conf_too_wide");
}

#[test]
fn pyth_rejects_out_of_band() {
    pyth_reject_case(PromiseResult::Successful(px_json(&px(9_000_000_000, 0, -8, ((T0 + 5 * SEC) / SEC) as i64))), "out_of_band");
}

#[test]
fn pyth_rejects_negative_price() {
    pyth_reject_case(PromiseResult::Successful(px_json(&px(-13_500_000_000, 0, -8, ((T0 + 5 * SEC) / SEC) as i64))), "non_positive");
}

#[test]
fn pyth_rejects_null() {
    pyth_reject_case(PromiseResult::Successful(b"null".to_vec()), "no_price");
}

#[test]
fn pyth_rejects_failed_receipt() {
    pyth_reject_case(PromiseResult::Failed, "failed");
}

#[test]
fn pyth_rejects_unparseable() {
    pyth_reject_case(PromiseResult::Successful(b"{\"price\":1}".to_vec()), "parse");
}

#[test]
fn pyth_rejects_too_long() {
    pyth_reject_case(PromiseResult::Successful(vec![b' '; 1024]), "too_long");
}

#[test]
fn pyth_price_recovered_aborts_healthy() {
    let mut c = pyth_triggered(false);
    // 160 USD: within band of 140, LTV 11250/16000 = 70% < 75% -> healthy
    pyth_callback(&mut c, PromiseResult::Successful(px_json(&px(16_000_000_000, 0, -8, ((T0 + 5 * SEC) / SEC) as i64))));
    assert!(event_with("settlement_aborted", "position healthy"));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Open);
}

#[test]
fn pyth_callback_aborts_when_paused() {
    let mut c = pyth_triggered(false);
    set_ctx(owner(), 0, T0 + 4 * SEC);
    c.pause();
    pyth_callback(&mut c, PromiseResult::Successful(px_json(&good_px())));
    assert!(event_with("settlement_aborted", "paused"));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Open);
}

#[test]
fn pyth_callback_ignores_cancelled() {
    let mut c = pyth_triggered(false);
    set_ctx(owner(), 0, T0 + 4 * SEC);
    c.cancel_settlement(U64(0));
    pyth_callback(&mut c, PromiseResult::Successful(px_json(&good_px())));
    assert!(!has_event("oracle_updated") && !has_event("settled_near"));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Open);
}

#[test]
fn pyth_callback_quoter_reserve_empty_aborts() {
    let mut c = pyth_triggered(true);
    set_ctx(owner(), 0, T0 + 4 * SEC);
    c.set_quoter_config(U128(10_000), 100, U64(100_000_000), 128, 30);
    pyth_callback(&mut c, PromiseResult::Successful(px_json(&good_px())));
    assert!(event_with("settlement_aborted", "gas reserve empty"));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Open);
}

// ------------------------------------------------------------------ WO-10b: cancel_settlement

#[test]
fn cancel_settlement_returns_to_open() {
    let mut c = demo_p1(true);
    trigger(&mut c);
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Settling);
    set_ctx(owner(), 0, T0 + 5 * SEC);
    c.cancel_settlement(U64(0));
    assert!(event_with("settlement_cancelled", "\"position_id\":\"0\""));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Open);
}

#[test]
#[should_panic(expected = "position not settling")]
fn cancel_settlement_requires_settling() {
    let mut c = demo_p1(false);
    set_ctx(owner(), 0, T0 + 5 * SEC);
    c.cancel_settlement(U64(0));
}

#[test]
#[should_panic(expected = "owner only")]
fn cancel_settlement_owner_only() {
    let mut c = demo_p1(true);
    trigger(&mut c);
    set_ctx(keeper(), 0, T0 + 5 * SEC);
    c.cancel_settlement(U64(0));
}

// ------------------------------------------------------------------ WO-10b: secrets_ref, gas reserve

#[test]
fn secrets_ref_in_request_args() {
    let mut c = demo_p1(true);
    set_ctx(owner(), 0, T0 + 3 * SEC);
    assert!(c.quoter_request_args("{}".into()).get("secrets_ref").is_none(), "absent by default");
    let sr = SecretsRef { profile: "nectar-quoter".into(), account_id: a("owner.testnet") };
    c.set_quoter_secrets_ref(Some(sr.clone()));
    assert!(has_event("quoter_secrets_ref_set"));
    assert_eq!(c.get_quoter_config().secrets_ref, Some(sr));
    let args = c.quoter_request_args("{}".into());
    assert_eq!(args["secrets_ref"], json!({ "profile": "nectar-quoter", "account_id": "owner.testnet" }));
    assert_eq!(args["input_data"], "{}");
    c.set_quoter_secrets_ref(None);
    assert_eq!(c.get_quoter_config().secrets_ref, None);
    assert!(c.quoter_request_args("{}".into()).get("secrets_ref").is_none(), "null clears");
}

#[test]
#[should_panic(expected = "profile must be 1-64 bytes")]
fn secrets_ref_bad_profile() {
    let mut c = demo_p1(false);
    set_ctx(owner(), 0, T0);
    c.set_quoter_secrets_ref(Some(SecretsRef { profile: "has space".into(), account_id: a("owner.testnet") }));
}

#[test]
#[should_panic(expected = "owner only")]
fn secrets_ref_owner_only() {
    let mut c = demo_p1(false);
    set_ctx(keeper(), 0, T0);
    c.set_quoter_secrets_ref(None);
}

#[test]
fn gas_reserve_view_tracks_quoter_deposit() {
    let mut c = demo_p1(true);
    assert_eq!(c.get_gas_reserve(), U128(1_000));
    trigger(&mut c);
    assert_eq!(c.get_gas_reserve(), U128(900));
    assert_eq!(c.get_gas_reserve(), c.get_config().gas_reserve_yocto);
}

// ------------------------------------------------------------------ WO-10c: get_price_no_older_than, 80 Tgas

#[test]
fn pyth_age_rounds_up_to_seconds() {
    use crate::p1::pyth_age_s;
    assert_eq!(pyth_age_s(120 * SEC), 120);
    assert_eq!(pyth_age_s(86_400 * SEC), 86_400);
    assert_eq!(pyth_age_s(1), 1, "never 0: Pyth would only accept the current second");
    assert_eq!(pyth_age_s(120 * SEC + 1), 121);
    assert_eq!(pyth_age_s(u64::MAX), u64::MAX.div_ceil(SEC));
}

#[test]
fn pyth_trigger_closed_session_age() {
    let _ = pyth_triggered(false);
    assert!(event_with("pyth_price_requested", r#""age_s":86400"#));
}

#[test]
fn pyth_trigger_open_session_age() {
    let mut c = demo_p1(false);
    pyth_on(&mut c);
    open_window(&mut c);
    set_ctx(keeper(), 0, T0 + 4 * SEC);

    c.trigger_preliquidation(U64(0));
    assert!(event_with("pyth_price_requested", r#""age_s":120"#));
}

#[test]
fn default_quoter_gas_is_80_tgas() {
    set_ctx(owner(), 0, T0);
    let c = Nectar::new(owner(), usdc(), keeper());
    assert_eq!(c.get_quoter_config().gas_tgas, 80);
}
