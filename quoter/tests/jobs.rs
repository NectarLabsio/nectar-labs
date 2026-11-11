//! v7 OutLayer jobs (WO-24): every case in tests/jobs_vectors.json (built by tests/gen_job_vectors.py, an independent
//! Python model) runs through `run_with` with a recording HTTP mock that asserts the exact request bytes.
use nectar_quoter::jobs::{DEVNET_MINT, VaultReadReq, vault_read_pdas};
use nectar_quoter::solana::{b58_decode32, b58_encode};
use nectar_quoter::{MAX_STDOUT_BYTES, run, run_with};
use serde_json::Value;

fn doc(raw: &str) -> Value {
    serde_json::from_str(raw).expect("json parses")
}

fn cases() -> Vec<Value> {
    doc(include_str!("jobs_vectors.json"))["cases"].as_array().unwrap().clone()
}

fn run_case(case: &Value) -> (String, usize) {
    let stdin = case["stdin"].as_str().unwrap();
    let http = &case["http"];
    let mut calls = 0usize;
    let out = run_with(stdin.as_bytes(), |_| None, &mut |url: &str, body: &[u8]| {
        calls += 1;
        assert!(!http.is_null(), "{}: unexpected HTTP call to {url}", case["name"]);
        assert_eq!(url, http["url"].as_str().unwrap(), "{}: url", case["name"]);
        assert_eq!(std::str::from_utf8(body).unwrap(), http["body"].as_str().unwrap(), "{}: body", case["name"]);
        Ok(http["response"].as_str().unwrap().as_bytes().to_vec())
    });
    (out, calls)
}

#[test]
fn every_job_vector_matches_exactly() {
    let cases = cases();
    assert!(cases.len() >= 40, "{} cases", cases.len());
    for case in &cases {
        let name = case["name"].as_str().unwrap();
        let (out, calls) = run_case(case);
        assert_eq!(out, case["expected_stdout"].as_str().unwrap(), "case {name}");
        assert_eq!(out.len() as u64, case["stdout_bytes"].as_u64().unwrap(), "case {name}");
        assert_eq!(calls, usize::from(!case["http"].is_null()), "case {name}: HTTP call count");
        assert!(out.len() <= MAX_STDOUT_BYTES, "case {name}: {} bytes", out.len());
        assert!(!out.contains('\n'), "case {name}");
        serde_json::from_str::<Value>(&out).unwrap_or_else(|e| panic!("case {name}: not JSON: {e}"));
    }
}

#[test]
fn required_job_vectors_present() {
    let names: Vec<String> = cases().iter().map(|c| c["name"].as_str().unwrap().to_owned()).collect();
    for n in [
        "vault_read_found_contract_input",
        "vault_read_recorded_open_position",
        "vault_read_recorded_settled_not_open",
        "vault_read_recorded_released_not_open",
        "vault_read_depositor_mismatch",
        "vault_read_missing_account_live_recording",
        "vault_read_u64_max_widest_output",
        "calendar_dst_spring_monday_0000_edt",
        "calendar_dst_fall_monday_0000_est",
        "calendar_early_close_at_1300_est",
        "multiplier_dividend_1_02",
    ] {
        assert!(names.iter().any(|x| x == n), "missing {n}");
    }
}

/// The vault_read stdout parses the way contracts/nectar-core/src/remote.rs::parse_vault_read reads it.
#[test]
fn vault_read_output_matches_remote_rs_shape() {
    for case in cases().iter().filter(|c| {
        let name = c["name"].as_str().unwrap();
        name.starts_with("vault_read_found") || name == "vault_read_recorded_open_position"
    }) {
        let v: Value = serde_json::from_str(&run_case(case).0).unwrap();
        let stdin: Value = serde_json::from_str(case["stdin"].as_str().unwrap()).unwrap();
        let id = match &stdin["position_id"] {
            Value::String(s) => s.clone(),
            n => n.to_string(),
        };
        assert_eq!(v["position_id"].as_str().unwrap(), id);
        assert!(v["units"].as_str().unwrap().bytes().all(|b| b.is_ascii_digit()));
        // authority_matches(stored "ed25519:<b58>", reported): same prefix + base58 of 32 bytes
        let auth = v["authority"].as_str().unwrap().strip_prefix("ed25519:").unwrap();
        assert!(b58_decode32(auth).is_some());
        // valid_depositor (domain 1) = valid_base58_address: 32..=44 base58 chars
        let dep = v["depositor"].as_str().unwrap();
        assert!((32..=44).contains(&dep.len()) && b58_decode32(dep).is_some());
        // on_deposit_verified requires depositor == committed: the job echoes exactly what it was asked about (SR-8).
        assert_eq!(dep, stdin["depositor"].as_str().unwrap());
        assert!(v["slot_or_block"].is_u64());
        assert!(v.get("error").is_none());
    }
}

/// find_program_address agrees with @solana/kit on 204 v2 positions (two vaults, two depositors; tests/pda_kit.json);
/// the bumps go well below 255, so the on-curve rejection path is exercised many times.
#[test]
fn pdas_match_solana_kit() {
    let kit = doc(include_str!("pda_kit.json"));
    let program = b58_decode32(kit["program"].as_str().unwrap()).unwrap();
    let mut checked = 0;
    for v in kit["vaults"].as_array().unwrap() {
        let mint = b58_decode32(v["mint"].as_str().unwrap()).unwrap();
        let (vault, bump) =
            nectar_quoter::solana::find_program_address(&[b"vault", &mint], &program).expect("vault pda");
        assert_eq!(b58_encode(&vault), v["vault"].as_str().unwrap());
        assert_eq!(u64::from(bump), v["vault_bump"].as_u64().unwrap());
        for p in v["positions"].as_array().unwrap() {
            let id: u64 = p["id"].as_str().unwrap().parse().unwrap();
            let depositor = b58_decode32(p["depositor"].as_str().unwrap()).unwrap();
            let (pda, bump) = nectar_quoter::solana::find_program_address(
                &[b"pos", &vault, &id.to_le_bytes(), &depositor],
                &program,
            )
            .unwrap();
            assert_eq!(b58_encode(&pda), p["pda"].as_str().unwrap(), "id {id}");
            assert_eq!(u64::from(bump), p["bump"].as_u64().unwrap(), "id {id}");
            let req = VaultReadReq { program, mint, position_id: id, depositor, rpc_url: String::new() };
            assert_eq!(vault_read_pdas(&req).unwrap(), (vault, pda));
            checked += 1;
        }
    }
    assert_eq!(checked, 204);
}

/// The embedded copies agree with packages/config (drift guard; the wasm must be rebuilt when they change).
#[test]
fn embedded_config_matches_packages_config() {
    let here = env!("CARGO_MANIFEST_DIR");
    let cfg_cal = std::fs::read_to_string(format!("{here}/../packages/config/nyse-calendar.json")).unwrap();
    assert_eq!(nectar_quoter::calendar::CALENDAR_JSON, cfg_cal, "quoter/data/nyse-calendar.json is stale");
    let yaml = std::fs::read_to_string(format!("{here}/../packages/config/config.yaml")).unwrap();
    let solana = yaml.split("\nsolana:\n").nth(1).expect("solana: block");
    let mint = solana.lines().find_map(|l| l.trim().strip_prefix("mint: ")).expect("solana.mint");
    assert_eq!(mint.trim(), DEVNET_MINT);
}

/// Without a `job` field the quote job runs exactly as before (vectors.json is unchanged and still passes in
/// tests/vectors.rs); `run` has no HTTP, so chain jobs report it instead of guessing.
#[test]
fn quote_path_unchanged_and_run_has_no_http() {
    let quote = r#"{"v":1,"symbol":"NVDAx","position_id":"0","oracle_price_usd_e6":"1","session_open":false,"seize_usd_e6":"1","vol_bps":40,"quotes":[]}"#;
    let a = run(quote.as_bytes(), |_| None);
    let b = run_with(quote.as_bytes(), |_| None, &mut |_: &str, _: &[u8]| panic!("quote job made an HTTP call"));
    assert_eq!(a, b);
    assert!(a.starts_with(r#"{"v":1,"symbol":"NVDAx""#));
    let vr = r#"{"job":"vault_read","chain":"solana-devnet","program":"ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW","position_id":"1","depositor":"6x5SYnLroiN7WYq8NQYU9KHcH4YjpBbwpUfVu3EB7ieH"}"#;
    assert_eq!(run(vr.as_bytes(), |_| None), r#"{"v":1,"error":"http_unavailable"}"#);
    // an HTTP failure is a job error, never a guess
    let out = run_with(vr.as_bytes(), |_| None, &mut |_: &str, _: &[u8]| Err("http_status"));
    assert_eq!(out, r#"{"v":1,"error":"http_status"}"#);
}
