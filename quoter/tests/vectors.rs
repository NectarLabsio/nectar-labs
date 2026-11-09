//! Runs every case in tests/vectors.json (the contract shared with contracts/, WO-10) through the library.
//! vectors.json is produced by tests/gen_vectors.py, an independent integer reference model.
use nectar_quoter::{run, MAX_STDOUT_BYTES};
use serde_json::Value;
use std::collections::BTreeMap;

fn cases() -> Vec<Value> {
    let raw = include_str!("vectors.json");
    let doc: Value = serde_json::from_str(raw).expect("vectors.json parses");
    doc["cases"].as_array().expect("cases array").clone()
}

fn run_case(case: &Value) -> String {
    let stdin = case["stdin"].as_str().expect("stdin string");
    let env: BTreeMap<String, String> = case["env"]
        .as_object()
        .expect("env object")
        .iter()
        .map(|(k, v)| (k.clone(), v.as_str().expect("env value string").to_owned()))
        .collect();
    run(stdin.as_bytes(), |name| env.get(name).cloned())
}

#[test]
fn at_least_20_cases_with_required_edges() {
    let cases = cases();
    assert!(cases.len() >= 20, "{} cases", cases.len());
    let names: Vec<&str> = cases.iter().map(|c| c["name"].as_str().unwrap()).collect();
    for required in [
        "missing_all_secrets_uses_max",
        "q_zero_gives_vol",
        "gamma_10000_q_10000_doubles_vol",
        "vol_zero_gives_zero",
        "eight_quotes_mixed",
        "malformed_json",
        "unknown_v",
    ] {
        assert!(names.contains(&required), "missing vector {required}");
    }
}

#[test]
fn every_vector_matches_exactly() {
    for case in cases() {
        let name = case["name"].as_str().unwrap();
        let out = run_case(&case);
        assert_eq!(out, case["expected_stdout"].as_str().unwrap(), "case {name}");
        assert_eq!(out.len() as u64, case["stdout_bytes"].as_u64().unwrap(), "case {name} byte count");
        let parsed: Value = serde_json::from_str(&out).unwrap_or_else(|e| panic!("case {name}: stdout not JSON: {e}"));
        let expected = case["expected_stdout_fields"].as_object().unwrap();
        for (k, v) in expected {
            assert_eq!(&parsed[k], v, "case {name} field {k}");
        }
        assert!(out.len() <= MAX_STDOUT_BYTES, "case {name}: {} bytes", out.len());
        assert!(!out.contains('\n'), "case {name}: single line");
    }
}

#[test]
fn disc_never_exceeds_quote_cap() {
    for case in cases() {
        let out: Value = serde_json::from_str(&run_case(&case)).unwrap();
        let Some(fills) = out["fills"].as_array() else { continue };
        let stdin: Value = serde_json::from_str(case["stdin"].as_str().unwrap()).unwrap();
        for (fill, quote) in fills.iter().zip(stdin["quotes"].as_array().unwrap()) {
            assert_eq!(fill["id"], quote["id"]);
            assert!(fill["disc_bps"].as_u64().unwrap() <= quote["max_discount_bps"].as_u64().unwrap());
        }
    }
}

#[test]
fn eight_fill_case_fits_900_bytes() {
    for name in ["eight_quotes_mixed", "eight_quotes_widest_values"] {
        let case = cases().into_iter().find(|c| c["name"] == name).unwrap();
        let out = run_case(&case);
        let fills = serde_json::from_str::<Value>(&out).unwrap()["fills"].as_array().unwrap().len();
        assert_eq!(fills, 8, "{name}");
        assert!(out.len() <= MAX_STDOUT_BYTES, "{name}: {} bytes", out.len());
        println!("{name}: stdout {} bytes", out.len());
    }
}

#[test]
fn deterministic_and_input_bound() {
    for case in cases() {
        assert_eq!(run_case(&case), run_case(&case));
    }
    // Byte-level change in stdin (whitespace) changes input_sha256 but not the fills.
    let a = r#"{"v":1,"symbol":"NVDAx","position_id":"0","oracle_price_usd_e6":"1","session_open":false,"seize_usd_e6":"1","vol_bps":40,"quotes":[]}"#;
    let b = format!("{a} ");
    let (oa, ob) = (run(a.as_bytes(), |_| None), run(b.as_bytes(), |_| None));
    let (pa, pb): (Value, Value) = (serde_json::from_str(&oa).unwrap(), serde_json::from_str(&ob).unwrap());
    assert_ne!(pa["input_sha256"], pb["input_sha256"]);
    assert_eq!(pa["fills"], pb["fills"]);
}
