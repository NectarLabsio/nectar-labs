//! P1 unit tests: migrate, quoter setters/views, trigger -> on_quoter_result (clamp, every fallback
//! reason, abort paths), parse_quoter_output, and quoter/tests/vectors.json when WO-9 is merged.

use super::*;
use crate::migrate::NectarV0;
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
        market_session_open: false,
        verified_dex_depth_usd_e6: U128(0),
        nectar_reserve_usd_e6: U128(0),
        remote_chain: None,
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

// ------------------------------------------------------------------ migrate / version

fn v0_from_new() -> NectarV0 {
    set_ctx(owner(), 0, T0);
    let n = Nectar::new(owner(), usdc(), keeper());
    NectarV0 {
        owner: n.owner,
        paused: n.paused,
        usdc_token: n.usdc_token,
        keeper: n.keeper,
        keeper_fee_bps: n.keeper_fee_bps,
        fee_split: n.fee_split,
        min_notice_period_ns: n.min_notice_period_ns,
        min_quote_usd_e6: n.min_quote_usd_e6,
        max_age_ns_session: n.max_age_ns_session,
        max_age_ns_closed: 7,
        band_bps: n.band_bps,
        available_usd_e6: 123,
        utilised_usd_e6: 0,
        treasury_usd_e6: 0,
        lenders_fees_usd_e6: 0,
        gas_reserve_yocto: 55,
        next_quote_id: 3,
        next_position_id: 2,
        collaterals: n.collaterals,
        token_to_symbol: n.token_to_symbol,
        quotes: n.quotes,
        quotes_by_collateral: n.quotes_by_collateral,
        positions: n.positions,
        lender_supplied: n.lender_supplied,
        pending_prices: n.pending_prices,
        owed_collateral: n.owed_collateral,
    }
}

#[test]
fn migrate_reads_p0_layout_and_defaults_v1() {
    let v0 = v0_from_new();
    env::storage_remove(STATE_VERSION_KEY);
    env::state_write(&v0);
    set_ctx(owner(), 0, T0);
    let c = Nectar::migrate();
    assert!(has_event("migrated"));
    let cfg = c.get_config();
    assert_eq!(cfg.max_age_ns_closed, U64(7));
    assert_eq!(cfg.gas_reserve_yocto, U128(55));
    assert_eq!(cfg.next_quote_id, U64(3));
    assert_eq!(c.get_pool().available_usd_e6, U128(123));
    assert_eq!(c.get_state_version(), 1);
    let q = c.get_quoter_config();
    assert!(!q.enabled);
    assert_eq!(q.outlayer_account, a("outlayer.testnet"));
    assert_eq!(q.max_conf_bps, 100);
}

#[test]
fn migrate_by_contract_account() {
    let v0 = v0_from_new();
    env::storage_remove(STATE_VERSION_KEY);
    env::state_write(&v0);
    set_ctx(core(), 0, T0);
    let _ = Nectar::migrate();
}

#[test]
#[should_panic(expected = "owner only")]
fn migrate_rejects_stranger() {
    let v0 = v0_from_new();
    env::storage_remove(STATE_VERSION_KEY);
    env::state_write(&v0);
    set_ctx(keeper(), 0, T0);
    let _ = Nectar::migrate();
}

#[test]
#[should_panic(expected = "already migrated")]
fn migrate_twice_rejected() {
    let v0 = v0_from_new(); // new() writes the version marker
    env::state_write(&v0);
    set_ctx(owner(), 0, T0);
    let _ = Nectar::migrate();
}

#[test]
#[should_panic(expected = "no P0 state")]
fn migrate_without_state() {
    set_ctx(owner(), 0, T0);
    env::storage_remove(STATE_VERSION_KEY);
    let _ = Nectar::migrate();
}

#[test]
fn contract_version_says_p1() {
    let c = demo_p1(false);
    assert!(c.contract_version().ends_with(" p1"));
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
#[should_panic(expected = "WO-10b")]
fn pyth_source_rejected_until_wo10b() {
    let mut c = demo_p1(false);
    set_ctx(owner(), 0, T0);
    c.set_oracle_source(
        "NVDAx".into(),
        OracleSource::Pyth { account: a("pyth-oracle.testnet"), price_identifier: "00".repeat(32) },
    );
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
