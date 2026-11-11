//! WO-23a sandbox tests (PRD §4.9, §4.10; OutLayer job hooks) against the real mock-ft wasm and the OutLayer stub. helpers as in sandbox_v7.rs; values from tests/model.csv (shield_* / self_* rows).
//! Gas lines: `GAS,<method>,<gas burnt>` (run with --nocapture).
#![allow(unused_must_use, dead_code)] // helpers shared with sandbox_v7.rs; owner_call returns the outcome for GAS lines

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use near_sdk::serde_json::{Value, json};
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, AccountId, Contract, Worker};

const UNITS: u128 = 100_000_000;
const E18: u128 = 1_000_000_000_000_000_000;
const SEC: u64 = 1_000_000_000;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn wasm(name: &str) -> Vec<u8> {
    static BUILT: OnceLock<()> = OnceLock::new();
    BUILT.get_or_init(|| {
        for c in ["nectar-core", "mock-ft", "test-stubs"] {
            let st = Command::new("cargo")
                .args(["near", "build", "non-reproducible-wasm"])
                .current_dir(root().join("contracts").join(c))
                .status()
                .expect("cargo near build");
            assert!(st.success(), "cargo near build failed for {c}");
        }
    });
    std::fs::read(root().join(format!("target/near/{name}/{name}.wasm"))).expect("wasm")
}

fn gas(label: &str, r: &ExecutionFinalResult) {
    println!("GAS,{label},{}", r.total_gas_burnt.as_gas());
}

fn model() -> HashMap<String, HashMap<String, String>> {
    let csv = std::fs::read_to_string(root().join("contracts/nectar-core/tests/model.csv")).unwrap();
    let mut lines = csv.lines();
    let header: Vec<String> = lines.next().unwrap().split(',').map(str::to_string).collect();
    lines
        .map(|l| {
            let row: HashMap<String, String> = header.iter().cloned().zip(l.split(',').map(str::to_string)).collect();
            (row["case"].clone(), row)
        })
        .collect()
}
fn m(rows: &HashMap<String, HashMap<String, String>>, case: &str, col: &str) -> u128 {
    rows[case][col].parse().unwrap()
}
/// Views must match the model within 1 unit (WO-19).
fn near(got: &Value, want: u128, what: &str) {
    let g: u128 = match got {
        Value::String(s) => s.parse().unwrap(),
        Value::Number(n) => n.as_u64().unwrap() as u128,
        v => panic!("{what}: {v:?}"),
    };
    assert!(g.abs_diff(want) <= 1, "{what}: view {g} model {want}");
}

struct Env {
    worker: Worker<Sandbox>,
    owner: Account,
    keeper: Account,
    core: Contract,
    usdc: Contract,
    nvdax: Contract,
}

async fn deploy_ft(worker: &Worker<Sandbox>, owner: &Account, symbol: &str) -> anyhow::Result<Contract> {
    let c = worker.dev_deploy(&wasm("mock_ft")).await?;
    c.call("new")
        .args_json(json!({ "owner": owner.id(), "name": format!("Mock {symbol}"), "symbol": symbol, "decimals": 6 }))
        .transact()
        .await?
        .into_result()?;
    Ok(c)
}

/// Lender $50k, quotes $10k @250 + $5k @400 (weekend capacity 11,250), price 180.
async fn setup() -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let keeper = worker.dev_create_account().await?;
    let usdc = deploy_ft(&worker, &owner, "USDC").await?;
    let nvdax = deploy_ft(&worker, &owner, "NVDAx").await?;
    let core = worker.dev_deploy(&wasm("nectar_core")).await?;
    core.call("new")
        .args_json(json!({ "owner": owner.id(), "usdc_token": usdc.id(), "keeper": keeper.id() }))
        .transact()
        .await?
        .into_result()?;
    let e = Env { worker, owner, keeper, core, usdc, nvdax };
    owner_call(&e, "upsert_collateral", json!({ "symbol": "NVDAx", "config": {
        "symbol": "NVDAx", "token": e.nvdax.id(), "decimals": 6, "price_feed_id": "TODO-G5",
        "base_ltv_bps": 4000, "max_nectar_ltv_bps": 7000, "base_haircut_bps": 1000,
        "weekend_haircut_bps": 2500, "limit_premium_bps": 300, "pre_liq_min_bps": 6500,
        "pre_liq_max_bps": 8000, "verified_dex_depth_usd_e6": "0", "nectar_reserve_usd_e6": "0",
        "remote_chain": null } }))
    .await?;
    price(&e, 180_000_000).await?;
    let r = e.owner.call(e.core.id(), "fund_gas_reserve").deposit(NearToken::from_millinear(10)).transact().await?;
    r.into_result()?;
    let lender = user(&e, 50_000_000_000, 0).await?;
    ft_call(&e.usdc, &lender, e.core.id(), 50_000_000_000, r#""SupplyLendingLiquidity""#).await?.into_result()?;
    for (amt, d) in [(10_000_000_000u128, 250u16), (5_000_000_000, 400)] {
        let b = user(&e, amt, 0).await?;
        let msg = format!(r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":{d},"notice_period_ns":"604800000000000"}}}}"#);
        ft_call(&e.usdc, &b, e.core.id(), amt, &msg).await?.into_result()?;
    }
    Ok(e)
}

async fn owner_call(e: &Env, method: &str, args: Value) -> anyhow::Result<ExecutionFinalResult> {
    let r = e.owner.call(e.core.id(), method).args_json(args).gas(Gas::from_tgas(300)).transact().await?;
    gas(method, &r);
    assert!(r.is_success(), "{method}: {:?}", r.failures());
    Ok(r)
}
async fn owner_fails(e: &Env, method: &str, args: Value, why: &str) -> anyhow::Result<()> {
    let r = e.owner.call(e.core.id(), method).args_json(args).transact().await?;
    assert!(format!("{:?}", r.failures()).contains(why), "{method}: expected {why}, got {:?}", r.failures());
    Ok(())
}

async fn price(e: &Env, p: u128) -> anyhow::Result<()> {
    let r = owner_call(e, "update_owner_price", json!({ "symbol": "NVDAx", "price_usd_e6": p.to_string() })).await?;
    assert_eq!(r.json::<bool>()?, true, "price {p} accepted");
    Ok(())
}

async fn user(e: &Env, mint_usdc: u128, mint_nvdax: u128) -> anyhow::Result<Account> {
    let a = e.worker.dev_create_account().await?;
    for (t, amt) in [(&e.usdc, mint_usdc), (&e.nvdax, mint_nvdax)] {
        if amt > 0 {
            e.owner
                .call(t.id(), "mint")
                .args_json(json!({ "account_id": a.id(), "amount": amt.to_string() }))
                .transact()
                .await?
                .into_result()?;
        }
    }
    Ok(a)
}

async fn ft_call(token: &Contract, from: &Account, to: &AccountId, amount: u128, msg: &str) -> anyhow::Result<ExecutionFinalResult> {
    Ok(from
        .call(token.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": to, "amount": amount.to_string(), "msg": msg }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(300))
        .transact()
        .await?)
}

async fn bal(token: &Contract, a: &AccountId) -> anyhow::Result<u128> {
    let v: String = token.view("ft_balance_of").args_json(json!({ "account_id": a })).await?.json()?;
    Ok(v.parse()?)
}
async fn view(e: &Env, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(e.core.view(method).args_json(args).await?.json()?)
}
async fn cap(e: &Env) -> anyhow::Result<Value> {
    view(e, "get_exit_capacity", json!({ "symbol": "NVDAx" })).await
}

fn borrow_msg(borrow: u128, extra: &str) -> String {
    format!(r#"{{"LockCollateralAndBorrow":{{"collateral":"NVDAx","borrow_usd_e6":"{borrow}","pre_liq_ltv_bps":7500{extra}}}}}"#)
}

/// Borrow; returns the nvdax refunded to the borrower (0 = accepted).
async fn borrow(e: &Env, who: &Account, amount: u128, extra: &str, label: &str) -> anyhow::Result<u128> {
    let before = bal(&e.nvdax, who.id()).await?;
    let r = ft_call(&e.nvdax, who, e.core.id(), UNITS, &borrow_msg(amount, extra)).await?;
    gas(label, &r);
    assert!(r.is_success(), "{label}: {:?}", r.failures());
    Ok(bal(&e.nvdax, who.id()).await? + UNITS - before)
}

async fn now_ns(e: &Env) -> anyhow::Result<u64> {
    Ok(e.worker.view_block().await?.timestamp())
}
/// Advance the sandbox clock by at least `secs` (fast_forward in chunks, F-132).
async fn advance(e: &Env, secs: u64) -> anyhow::Result<()> {
    let t0 = now_ns(e).await?;
    for _ in 0..60 {
        e.worker.fast_forward(500).await?;
        if now_ns(e).await? >= t0 + secs * SEC {
            return Ok(());
        }
    }
    anyhow::bail!("sandbox clock did not advance {secs} s")
}

// ------------------------------------------------------------------ WO-23a

fn events(r: &ExecutionFinalResult, name: &str) -> Vec<Value> {
    r.logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .filter_map(|j| near_sdk::serde_json::from_str::<Value>(j).ok())
        .filter(|v| v["event"] == name)
        .map(|v| v["data"][0].clone())
        .collect()
}
fn shield(kind: &str, end: u64) -> String {
    format!(r#","shield":{{"kind":"{kind}","window_end_ns":"{end}"}}"#)
}
async fn borrow_units(e: &Env, who: &Account, units: u128, amount: u128, extra: &str, label: &str) -> anyhow::Result<u128> {
    let before = bal(&e.nvdax, who.id()).await?;
    let r = ft_call(&e.nvdax, who, e.core.id(), units, &borrow_msg(amount, extra)).await?;
    gas(label, &r);
    assert!(r.is_success(), "{label}: {:?}", r.failures());
    Ok(bal(&e.nvdax, who.id()).await? + units - before)
}
async fn self_settle(e: &Env, who: &Account, id: u64) -> anyhow::Result<ExecutionFinalResult> {
    let r = who
        .call(e.core.id(), "self_settle")
        .args_json(json!({ "position_id": id.to_string() }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(300))
        .transact()
        .await?;
    Ok(r)
}
fn treasury(v: &Value) -> u128 {
    v["treasury_usd_e6"].as_str().unwrap().parse().unwrap()
}

/// §4.9: in session (calendar open, fresh price, D = $5k) a Shield is still sized at weekend parameters
/// (capacity 11,250 instead of 18,000), its 15 bps fee replaces the premium (model `shield_weekend_10k`), and the
/// 6th Shield open of the day is refused.
#[tokio::test]
async fn shield_weekend_sizing_fee_and_daily_limit() -> anyhow::Result<()> {
    let rows = model();
    let e = setup().await?;
    owner_call(&e, "set_dex_depth", json!({ "symbol": "NVDAx", "depth_usd_e6": "5000000000" })).await?;
    let now = now_ns(&e).await?;
    let next = now + 20 * 3_600 * SEC;
    owner_call(&e, "set_session_calendar", json!({ "windows": [
        [(now - 3_600 * SEC).to_string(), (now + 6 * 3_600 * SEC).to_string()],
        [next.to_string(), (next + 6 * 3_600 * SEC).to_string()] ] })).await?;
    price(&e, 180_000_000).await?;
    let c = cap(&e).await?;
    assert_eq!(c["session_open"], true);
    near(&c["capacity_usd_e6"], 18_000_000_000, "in-session capacity");

    let x = user(&e, 0, UNITS).await?;
    let over = m(&rows, "shield_weekend_over", "borrow_usd_e6");
    assert_eq!(m(&rows, "shield_weekend_over", "borrow_ok"), 0);
    assert_eq!(borrow(&e, &x, over, &shield("Weekend", next), "shield_over_weekend_capacity").await?, UNITS, "refused");
    let p = view(&e, "preview_borrow", json!({ "symbol": "NVDAx", "units": UNITS.to_string(), "borrow_usd_e6": over.to_string() })).await?;
    assert_eq!(p["ok"], true, "the same borrow without a Shield fits the in-session capacity");

    let a = user(&e, 0, UNITS + 5_000_000).await?;
    let b = m(&rows, "shield_weekend_10k", "borrow_usd_e6");
    price(&e, 180_000_000).await?;
    assert_eq!(borrow(&e, &a, b, &shield("Weekend", next), "LockCollateralAndBorrow(shield)").await?, 0);
    assert_eq!(bal(&e.usdc, a.id()).await?, m(&rows, "shield_weekend_10k", "net_proceeds_usd_e6"));
    let pos = view(&e, "get_position", json!({ "position_id": "0" })).await?;
    near(&pos["premium_usd_e6"], m(&rows, "shield_weekend_10k", "premium_usd_e6"), "shield fee replaces the premium");
    assert_eq!((pos["shield"]["kind"].clone(), pos["shield"]["window_end_ns"].clone()), (json!("Weekend"), json!(next.to_string())));
    let sv = view(&e, "get_shield", json!({ "position_id": "0" })).await?;
    assert_eq!((sv["active"].clone(), sv["committed_buyers_only"].clone()), (json!(true), json!(true)));
    let pool = view(&e, "get_pool", json!({})).await?;
    near(&pool["lenders_fees_usd_e6"], m(&rows, "shield_weekend_10k", "lenders_fee_usd_e6"), "same split");

    let min = m(&rows, "shield_min_5usd", "borrow_usd_e6");
    for i in 0..4 {
        price(&e, 180_000_000).await?;
        assert_eq!(borrow_units(&e, &a, 1_000_000, min, &shield("Weekend", next), &format!("shield_open_{}", i + 2)).await?, 0);
    }
    assert_eq!(view(&e, "get_shield_opens_today", json!({ "account_id": a.id() })).await?, json!(5));
    let r = ft_call(&e.nvdax, &a, e.core.id(), 1_000_000, &borrow_msg(min, &shield("Weekend", next))).await?;
    assert!(r.logs().iter().any(|l| *l == "refund: shield daily limit"), "6th Shield of the day refused");
    assert_eq!(bal(&e.nvdax, a.id()).await?, 1_000_000, "full refund");
    let fs = view(&e, "get_fee_stack", json!({ "symbol": "NVDAx" })).await?;
    assert_eq!((fs["shield_weekend_fee_bps"].clone(), fs["profit_lock_fee_bps"].clone()), (json!(15), json!(50)));
    Ok(())
}

/// §4.10: refused without opted-in capacity, above the daily cap, with health < 1; the happy path keeps the exact
/// units of model `self_near_10k` (buyer gets Q_repaid, borrower keeps the rest, treasury +50 bps).
#[tokio::test]
async fn self_settle_refusals_and_exact_units() -> anyhow::Result<()> {
    let rows = model();
    let e = setup().await?;
    let alice = user(&e, 0, UNITS).await?;
    let debt = m(&rows, "self_near_10k", "debt_usd_e6");
    assert_eq!(borrow(&e, &alice, debt, "", "borrow_alice").await?, 0);
    owner_call(&e, "set_max_voluntary_fill", json!({ "symbol": "NVDAx", "max_usd_e6_per_day": "20000000000" })).await?;
    let r = self_settle(&e, &alice, 0).await?;
    assert!(format!("{:?}", r.failures()).contains("no voluntary capacity"), "{:?}", r.failures());

    let b3 = user(&e, 12_000_000_000, 0).await?;
    let msg = r#"{"FundPappusQuote":{"collateral":"NVDAx","max_discount_bps":200,"notice_period_ns":"604800000000000","accepts_voluntary_fills":true}}"#;
    let r = ft_call(&e.usdc, &b3, e.core.id(), 12_000_000_000, msg).await?;
    gas("FundPappusQuote(accepts_voluntary_fills)", &r);
    assert!(events(&r, "quote_funded")[0]["accepts_voluntary_fills"] == json!(true));
    owner_call(&e, "set_max_voluntary_fill", json!({ "symbol": "NVDAx", "max_usd_e6_per_day": "10000000000" })).await?;
    let r = self_settle(&e, &alice, 0).await?;
    assert!(format!("{:?}", r.failures()).contains("voluntary daily cap"), "{:?}", r.failures());
    owner_call(&e, "set_max_voluntary_fill", json!({ "symbol": "NVDAx", "max_usd_e6_per_day": "20000000000" })).await?;

    let bob = user(&e, 0, 10_000_000).await?;
    assert_eq!(borrow_units(&e, &bob, 10_000_000, 1_200_000_000, "", "borrow_bob").await?, 0);

    let pre = view(&e, "preview_self_settle", json!({ "position_id": "0" })).await?;
    assert_eq!(pre["ok"], true, "{pre}");
    let q = m(&rows, "self_near_10k", "buyer_units");
    let kept = m(&rows, "self_near_10k", "units_kept");
    near(&pre["units_repaid"], q, "preview Q_repaid");
    let t0 = treasury(&view(&e, "get_pool", json!({})).await?);
    let r = self_settle(&e, &alice, 0).await?;
    gas("self_settle(near)", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(bal(&e.nvdax, b3.id()).await?, q, "buyer receives exactly Q_repaid");
    assert_eq!(bal(&e.nvdax, alice.id()).await?, kept, "borrower keeps the rest debt-free");
    assert_eq!(treasury(&view(&e, "get_pool", json!({})).await?) - t0, m(&rows, "self_near_10k", "pl_fee_usd_e6"));
    let p = view(&e, "get_position", json!({ "position_id": "0" })).await?;
    assert_eq!((p["status"].clone(), p["debt_usd_e6"].clone()), (json!("Closed"), json!("0")));
    let ev = &events(&r, "self_settled")[0];
    near(&ev["fill_usd_e6"], m(&rows, "self_near_10k", "fill_usd_e6"), "fill");

    price(&e, 155_000_000).await?;
    let r = self_settle(&e, &bob, 1).await?;
    assert!(format!("{:?}", r.failures()).contains("health below 1"), "{:?}", r.failures());
    Ok(())
}

async fn stub(e: &Env) -> anyhow::Result<Contract> {
    let s = e.worker.dev_deploy(&wasm("test_stubs")).await?;
    s.call("new").transact().await?.into_result()?;
    owner_call(e, "set_outlayer_account", json!({ "account_id": s.id() })).await?;
    owner_call(e, "set_vault_read_config", json!({ "project_id": "nectar.testnet/quoter",
        "version_key": "ab".repeat(32), "deposit_yocto": "1000000000000000000000", "gas_tgas": 50 })).await?;
    Ok(s)
}
async fn job(e: &Env, s: &Contract, method: &str, body: &str) -> anyhow::Result<ExecutionFinalResult> {
    s.call("set_mode").args_json(json!({ "mode": "raw", "body": body })).transact().await?.into_result()?;
    Ok(e.keeper.call(e.core.id(), method).args_json(json!({ "symbol": "NVDAx" })).gas(Gas::from_tgas(150)).transact().await?)
}

/// OutLayer job hooks: the calendar job's `force_closed:false` cannot open a forced-closed session, `true` closes an
/// open one, the 60 s cooldown holds; the multiplier job applies ≤ +5 % and only suggests a larger change.
#[tokio::test]
async fn outlayer_calendar_cannot_open_and_multiplier_bounded() -> anyhow::Result<()> {
    let e = setup().await?;
    let s = stub(&e).await?;
    let now = now_ns(&e).await?;
    owner_call(&e, "set_session_calendar", json!({ "windows": [
        [(now - 3_600 * SEC).to_string(), (now + 6 * 3_600 * SEC).to_string()] ] })).await?;
    // SR-6: a job spends the gas reserve, so a stranger cannot ask
    let stranger = e.worker.dev_create_account().await?;
    let r = stranger.call(e.core.id(), "request_session_check").args_json(json!({ "symbol": "NVDAx" })).gas(Gas::from_tgas(150)).transact().await?;
    assert!(format!("{:?}", r.failures()).contains("keeper or owner only"), "{:?}", r.failures());
    owner_call(&e, "force_session_closed", json!({ "symbol": "NVDAx", "closed": true })).await?;
    let r = job(&e, &s, "request_session_check", r#"{"force_closed":false,"reason":"open"}"#).await?;
    gas("request_session_check+calendar", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(events(&r, "session_check_result")[0]["applied"], false);
    let c = cap(&e).await?;
    assert_eq!((c["forced_closed"].clone(), c["session_open"].clone()), (json!(true), json!(false)), "cannot open");
    let last: Value = near_sdk::serde_json::from_str(view_s(&s, "get_last_request").await?.as_str())?;
    let inp: Value = near_sdk::serde_json::from_str(last["input_data"].as_str().unwrap())?;
    assert_eq!((inp["job"].clone(), inp["symbol"].clone()), (json!("calendar"), json!("NVDAx")));

    owner_call(&e, "force_session_closed", json!({ "symbol": "NVDAx", "closed": false })).await?;
    let r = job(&e, &s, "request_session_check", r#"{"force_closed":true,"reason":"halt"}"#).await?;
    assert!(format!("{:?}", r.failures()).contains("job cooldown"));
    advance(&e, 61).await?;
    price(&e, 180_000_000).await?;
    assert_eq!(cap(&e).await?["session_open"], true);
    let r = job(&e, &s, "request_session_check", r#"{"force_closed":true,"reason":"halt"}"#).await?;
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(events(&r, "session_forced_closed")[0]["source"], "outlayer");
    assert_eq!(cap(&e).await?["forced_closed"], true);
    assert_eq!(view(&e, "get_collateral", json!({ "symbol": "NVDAx" })).await?["forced_closed"], false, "SR-13: never latched");
    assert_ne!(view(&e, "get_outlayer_closed_until", json!({ "symbol": "NVDAx" })).await?, json!("0"));

    owner_call(&e, "set_multiplier_source", json!({ "symbol": "NVDAx", "rpc_url": "https://sepolia.base.org",
        "token": "0x1111111111111111111111111111111111111111" })).await?;
    let r = job(&e, &s, "request_multiplier_read", r#"{"multiplier_e18":"1030000000000000000"}"#).await?;
    gas("request_multiplier_read+multiplier", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(cap(&e).await?["multiplier_e18"], "1030000000000000000", "+3% applied");
    advance(&e, 61).await?;
    let r = job(&e, &s, "request_multiplier_read", &format!(r#"{{"multiplier_e18":"{}"}}"#, 2 * E18)).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(events(&r, "corporate_action_suggested")[0]["multiplier_e18"], (2 * E18).to_string());
    let coll = view(&e, "get_collateral", json!({ "symbol": "NVDAx" })).await?;
    assert_eq!(coll["multiplier_e18"], "1030000000000000000", "a 2x read is never applied by the job");
    assert_eq!(coll["ca_suggested_multiplier_e18"], (2 * E18).to_string());

    // SR-13: the answer expires by itself; no owner call, and the session opens again inside the same calendar window
    advance(&e, 3_601).await?;
    price(&e, 180_000_000).await?;
    let c = cap(&e).await?;
    assert_eq!((c["forced_closed"].clone(), c["session_open"].clone()), (json!(false), json!(true)), "{c}");
    Ok(())
}

/// G11 (GATE_FAIL_G11): gas rows for the two WO-23a owner setters; each < 100 Tgas.
#[tokio::test]
async fn shield_and_job_setters_gas() -> anyhow::Result<()> {
    let e = setup().await?;
    let window_end = now_ns(&e).await? + 3600 * SEC;
    let r = owner_call(&e, "set_shield_params", json!({ "symbol": "NVDAx", "weekend_fee_bps": 150, "event_fee_bps": 300,
        "event_window_end_ns": window_end.to_string() })).await?;
    assert!(r.total_gas_burnt.as_gas() < Gas::from_tgas(100).as_gas(), "set_shield_params >= 100 Tgas");
    let shield = &view(&e, "get_collateral", json!({ "symbol": "NVDAx" })).await?["shield"];
    assert_eq!((shield["weekend_fee_bps"].as_u64(), shield["event_fee_bps"].as_u64()), (Some(150), Some(300)));
    assert_eq!(shield["event_window_end_ns"], window_end.to_string());

    for job in ["calendar", "multiplier"] {
        let r = owner_call(&e, "set_job_config", json!({ "job": job, "project_id": format!("nectar.testnet/{job}"),
            "version_key": "cd".repeat(32), "deposit_yocto": "10000000000000000000000", "gas_tgas": 40 })).await?;
        assert!(r.total_gas_burnt.as_gas() < Gas::from_tgas(100).as_gas(), "set_job_config >= 100 Tgas");
        let v = view(&e, "get_job_config", json!({ "job": job })).await?;
        assert_eq!((v["source"].as_str(), v["gas_tgas"].as_u64()), (Some("job"), Some(40)), "{job}");
        assert_eq!(v["project_id"], format!("nectar.testnet/{job}"));
    }
    Ok(())
}

async fn view_s(c: &Contract, method: &str) -> anyhow::Result<String> {
    Ok(c.view(method).args_json(json!({})).await?.json::<String>()?)
}
