//! WO-23b sandbox tests (PRD §4.8 Nectar Reserve) against the real mock-ft wasm. Values from tests/model.csv (res_* rows).
//! Gas lines: `GAS,<method>,<gas burnt>` (run with --nocapture).
#![allow(unused_must_use, dead_code)]

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
const SEC: u64 = 1_000_000_000;
const JOIN: &str = r#"{"JoinNectarReserve":{"collateral":"NVDAx"}}"#;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn wasm(name: &str) -> Vec<u8> {
    static BUILT: OnceLock<()> = OnceLock::new();
    BUILT.get_or_init(|| {
        for c in ["nectar-core", "mock-ft"] {
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
    for o in r.receipt_outcomes() {
        assert!(o.gas_burnt.as_gas() < 100_000_000_000_000, "{label}: a receipt burnt >= 100 Tgas");
    }
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
fn u(v: &Value) -> u128 {
    match v {
        Value::String(s) => s.parse().unwrap(),
        Value::Number(n) => n.as_u64().unwrap() as u128,
        v => panic!("{v:?}"),
    }
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

/// Lender $50k, one quote $10k @250, price 180, Reserve enabled at 1000 bps with a 60 s notice (testnet param).
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
        "pre_liq_max_bps": 8000, "verified_dex_depth_usd_e6": "0", "remote_chain": null } }))
    .await?;
    price(&e, 180_000_000).await?;
    let r = e.owner.call(e.core.id(), "fund_gas_reserve").deposit(NearToken::from_millinear(10)).transact().await?;
    r.into_result()?;
    let lender = user(&e, 50_000_000_000, 0).await?;
    ft_call(&e.usdc, &lender, e.core.id(), 50_000_000_000, r#""SupplyLendingLiquidity""#).await?.into_result()?;
    let b = user(&e, 10_000_000_000, 0).await?;
    let msg = r#"{"FundPappusQuote":{"collateral":"NVDAx","max_discount_bps":250,"notice_period_ns":"604800000000000"}}"#;
    ft_call(&e.usdc, &b, e.core.id(), 10_000_000_000, msg).await?.into_result()?;
    owner_call(&e, "set_reserve_params", json!({ "symbol": "NVDAx", "discount_bps": 1000, "notice_ns": (60 * SEC).to_string() }))
        .await?;
    Ok(e)
}

async fn owner_call(e: &Env, method: &str, args: Value) -> anyhow::Result<ExecutionFinalResult> {
    let r = e.owner.call(e.core.id(), method).args_json(args).gas(Gas::from_tgas(300)).transact().await?;
    gas(method, &r);
    assert!(r.is_success(), "{method}: {:?}", r.failures());
    Ok(r)
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
async fn reserve(e: &Env) -> anyhow::Result<Value> {
    view(e, "get_reserve", json!({ "symbol": "NVDAx" })).await
}
async fn rnote(e: &Env, id: &str) -> anyhow::Result<Value> {
    view(e, "get_reserve_note", json!({ "note_id": id })).await
}
async fn status(e: &Env, id: u64) -> anyhow::Result<String> {
    Ok(view(e, "get_position", json!({ "position_id": id.to_string() })).await?["status"].as_str().unwrap().to_string())
}

async fn yocto(who: &Account, e: &Env, method: &str, args: Value) -> anyhow::Result<ExecutionFinalResult> {
    Ok(who.call(e.core.id(), method).args_json(args).deposit(NearToken::from_yoctonear(1)).gas(Gas::from_tgas(100)).transact().await?)
}

async fn trigger(e: &Env, id: u64) -> anyhow::Result<ExecutionFinalResult> {
    let r = e
        .keeper
        .call(e.core.id(), "trigger_preliquidation")
        .args_json(json!({ "position_id": id.to_string() }))
        .gas(Gas::from_tgas(300))
        .transact()
        .await?;
    gas("trigger_preliquidation(reserve)", &r);
    assert!(r.is_success(), "trigger: {:?}", r.failures());
    Ok(r)
}

async fn now_ns(e: &Env) -> anyhow::Result<u64> {
    Ok(e.worker.view_block().await?.timestamp())
}
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

fn events(r: &ExecutionFinalResult, name: &str) -> Vec<Value> {
    r.logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .filter_map(|j| near_sdk::serde_json::from_str::<Value>(j).ok())
        .filter(|v| v["event"] == name)
        .map(|v| v["data"][0].clone())
        .collect()
}
fn first_log(r: &ExecutionFinalResult, name: &str) -> usize {
    r.logs().iter().position(|l| l.contains(&format!(r#""event":"{name}""#))).unwrap_or(usize::MAX)
}

/// $9.99 refused; join; borrow at B_c; crash; the Reserve fills only after the quote; a late depositor gets nothing
/// earlier; a Note transfer moves the claim; exit after the notice pays the exact model amounts.
#[tokio::test]
async fn reserve_waterfall_late_depositor_transfer_and_exit() -> anyhow::Result<()> {
    let e = setup().await?;
    let rows = model();
    let alice = user(&e, 5_010_000_000, 0).await?;
    // $9.99 refused (full refund, no Note)
    let r = ft_call(&e.usdc, &alice, e.core.id(), 9_990_000, JOIN).await?;
    assert!(r.is_success());
    assert_eq!(bal(&e.usdc, alice.id()).await?, 5_010_000_000);
    assert!(rnote(&e, "r-NVDAx-0").await?.is_null());
    // wrong token refunded
    let w = user(&e, 0, 10_000_000).await?;
    ft_call(&e.nvdax, &w, e.core.id(), 10_000_000, JOIN).await?;
    assert_eq!(bal(&e.nvdax, w.id()).await?, 10_000_000);
    // join $5,000
    let r = ft_call(&e.usdc, &alice, e.core.id(), 5_000_000_000, JOIN).await?;
    gas("ft_transfer_call(JoinNectarReserve)", &r);
    assert_eq!(events(&r, "reserve_joined")[0]["note_id"], "r-NVDAx-0");
    let tok = view(&e, "nft_token", json!({ "token_id": "r-NVDAx-0" })).await?;
    assert_eq!(tok["owner_id"], alice.id().to_string());
    assert_eq!(u(&view(&e, "get_exit_capacity", json!({ "symbol": "NVDAx" })).await?["r_usd_e6"]), 5_000_000_000);
    // borrow at B_c: capacity (Q 10k + R 5k) * 0.75 = 11,250
    let borrower = user(&e, 0, UNITS).await?;
    let msg = r#"{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"11250000000","pre_liq_ltv_bps":7500}}"#;
    let r = ft_call(&e.nvdax, &borrower, e.core.id(), UNITS, msg).await?;
    assert!(r.is_success() && bal(&e.nvdax, borrower.id()).await? == 0, "{:?}", r.failures());
    let rv = reserve(&e).await?;
    assert_eq!(u(&rv["fees_7d_usd_e6"]), m(&rows, "res_premium_split", "reserve_fee_usd_e6"));
    assert_eq!(u(&rv["acc_fee_per_share_e18"]), m(&rows, "res_premium_split", "reserve_acc_increment_e18"));
    // crash and settle: quote leg first, then the Reserve
    price(&e, 155_000_000).await?;
    price(&e, 140_000_000).await?;
    let r = trigger(&e, 0).await?;
    assert!(first_log(&r, "settled_near") < first_log(&r, "settled_reserve"), "Reserve only after every quote");
    let s = &events(&r, "settled_reserve")[0];
    assert_eq!(u(&s["repay_usd_e6"]), m(&rows, "res_leg_after_quote", "repay_usd_e6"));
    assert_eq!(u(&s["seize_units"]), m(&rows, "res_leg_after_quote", "buyer_units"));
    assert_eq!(status(&e, 0).await?, "Closed");
    let leg_units = m(&rows, "res_leg_after_quote", "buyer_units");
    assert_eq!(u(&reserve(&e).await?["units"]), leg_units);
    // late depositor: 3,750 at R_c 3,750 for 5e9 shares
    let carol = user(&e, 3_750_000_000, 0).await?;
    let r = ft_call(&e.usdc, &carol, e.core.id(), 3_750_000_000, JOIN).await?;
    assert_eq!(u(&events(&r, "reserve_joined")[0]["shares"]), m(&rows, "res_late_deposit", "minted_shares"));
    let late = rnote(&e, "r-NVDAx-1").await?;
    assert_eq!((u(&late["claimable_units"]), u(&late["claimable_fees_usd_e6"])), (0, 0));
    // a Note transfer moves the claim
    let bob = user(&e, 0, 0).await?;
    let r = yocto(&alice, &e, "nft_transfer", json!({ "receiver_id": bob.id(), "token_id": "r-NVDAx-0" })).await?;
    gas("nft_transfer(reserve)", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let n = rnote(&e, "r-NVDAx-0").await?;
    assert_eq!(n["note"]["owner"], bob.id().to_string());
    assert_eq!(u(&n["claimable_units"]), leg_units);
    let fees = u(&n["claimable_fees_usd_e6"]);
    assert_eq!(fees, m(&rows, "res_premium_split", "reserve_fee_usd_e6"));
    assert!(yocto(&alice, &e, "initiate_reserve_exit", json!({ "note_id": "r-NVDAx-0" })).await?.is_failure());
    // exit: value 5e9/1e10 of R_c 7,500 = 3,750
    let r = yocto(&bob, &e, "initiate_reserve_exit", json!({ "note_id": "r-NVDAx-0" })).await?;
    gas("initiate_reserve_exit", &r);
    assert_eq!(u(&events(&r, "reserve_exiting")[0]["usdc_e6"]), 3_750_000_000);
    assert_eq!(u(&reserve(&e).await?["r_usd_e6"]), 3_750_000_000);
    let early = yocto(&bob, &e, "complete_reserve_exit", json!({ "note_id": "r-NVDAx-0" })).await?;
    assert!(format!("{:?}", early.failures()).contains("notice period not over"));
    advance(&e, 61).await?;
    let r = yocto(&bob, &e, "complete_reserve_exit", json!({ "note_id": "r-NVDAx-0" })).await?;
    gas("complete_reserve_exit", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(bal(&e.usdc, bob.id()).await?, 3_750_000_000 + fees);
    assert_eq!(bal(&e.nvdax, bob.id()).await?, leg_units);
    let rv = reserve(&e).await?;
    assert_eq!((u(&rv["usdc_e6"]), u(&rv["notice_usdc_e6"]), u(&rv["units"])), (3_750_000_000, 0, 0));
    assert_eq!(rnote(&e, "r-NVDAx-0").await?["note"]["exited"], true);
    Ok(())
}

/// Quotes and Reserve exhausted: the position stays Settling, Reserve Note transfers are refused until the owner
/// cancels.
#[tokio::test]
async fn reserve_shortfall_stays_settling_and_locks_transfers() -> anyhow::Result<()> {
    let e = setup().await?;
    let alice = user(&e, 10_000_000_000, 0).await?;
    let bob = user(&e, 10_000_000, 0).await?;
    ft_call(&e.usdc, &alice, e.core.id(), 10_000_000_000, JOIN).await?.into_result()?;
    ft_call(&e.usdc, &bob, e.core.id(), 10_000_000, JOIN).await?.into_result()?;
    let borrower = user(&e, 0, UNITS).await?;
    // Q 10k + R 10,010 -> capacity 15,007.5; LTV cap 12,600 against 100 NVDAx ($18k)
    let msg = r#"{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"12600000000","pre_liq_ltv_bps":7500}}"#;
    ft_call(&e.nvdax, &borrower, e.core.id(), UNITS, msg).await?.into_result()?;
    assert_eq!(bal(&e.nvdax, borrower.id()).await?, 0);
    // alice leaves R_c at once: $10 stays
    let r = yocto(&alice, &e, "initiate_reserve_exit", json!({ "note_id": "r-NVDAx-0" })).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(u(&reserve(&e).await?["r_usd_e6"]), 10_000_000);
    price(&e, 155_000_000).await?;
    price(&e, 140_000_000).await?;
    let r = trigger(&e, 0).await?;
    assert_eq!(u(&events(&r, "settled_reserve")[0]["repay_usd_e6"]), 10_000_000);
    assert_eq!(status(&e, 0).await?, "Settling");
    assert_eq!(u(&reserve(&e).await?["r_usd_e6"]), 0);
    assert_eq!(view(&e, "nft_transfer_locked", json!({ "token_id": "r-NVDAx-1" })).await?, json!(true));
    let carol = user(&e, 0, 0).await?;
    let t = yocto(&bob, &e, "nft_transfer", json!({ "receiver_id": carol.id(), "token_id": "r-NVDAx-1" })).await?;
    assert!(format!("{:?}", t.failures()).contains("note_locked"), "{:?}", t.failures());
    owner_call(&e, "cancel_settlement", json!({ "position_id": "0" })).await?;
    assert_eq!(status(&e, 0).await?, "Open");
    let t = yocto(&bob, &e, "nft_transfer", json!({ "receiver_id": carol.id(), "token_id": "r-NVDAx-1" })).await?;
    assert!(t.is_success(), "{:?}", t.failures());

    // SR-22: the depleted Reserve reopens at 1:1; the old Note keeps its claim and has no share of the new pool
    let old = rnote(&e, "r-NVDAx-1").await?;
    assert!(u(&old["claimable_units"]) > 0);
    let dave = user(&e, 20_000_000, 0).await?;
    ft_call(&e.usdc, &dave, e.core.id(), 20_000_000, JOIN).await?.into_result()?;
    assert_eq!(bal(&e.usdc, dave.id()).await?, 0, "not refunded");
    let rv = reserve(&e).await?;
    assert_eq!((u(&rv["shares"]), u(&rv["r_usd_e6"])), (20_000_000, 20_000_000));
    let after = rnote(&e, "r-NVDAx-1").await?;
    assert_eq!((u(&after["value_usd_e6"]), after["claimable_units"].clone()), (0, old["claimable_units"].clone()));
    assert_eq!(u(&rnote(&e, "r-NVDAx-2").await?["value_usd_e6"]), 20_000_000);
    Ok(())
}
