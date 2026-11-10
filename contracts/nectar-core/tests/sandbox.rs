//! near-workspaces sandbox tests against the real mock-ft wasm (F-029).
//! Builds both contracts with `cargo near build non-reproducible-wasm` (F-027) once per run,
//! deploys them to a local sandbox and drives every ft_on_transfer msg variant plus a
//! pre-liquidation; balances are checked against tests/model.csv (demo_* rows).
//! Gas burnt per call is printed as `GAS,<method>,<gas>` lines (run with --nocapture).

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use near_sdk::serde_json::{Value, json};
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{AccessKey, Gas, KeyType, NearToken, SecretKey};
use near_workspaces::{Account, AccountId, Contract, Worker};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn wasm(crate_dir: &str, name: &str) -> Vec<u8> {
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
    let _ = crate_dir;
    std::fs::read(root().join(format!("target/near/{name}/{name}.wasm"))).expect("wasm")
}

/// A scoped-key call is refused either at tx validation (RPC error) or in execution (failed outcome).
fn refused(r: near_workspaces::Result<ExecutionFinalResult>, what: &str) {
    match r {
        Err(err) => println!("KEYSCOPE,{what},rejected-at-validation,{err}"),
        Ok(x) => {
            assert!(x.is_failure(), "{what}: expected failure");
            println!("KEYSCOPE,{what},failed-in-execution,{:?}", x.failures().first());
        }
    }
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
            let row: HashMap<String, String> =
                header.iter().cloned().zip(l.split(',').map(str::to_string)).collect();
            (row["case"].clone(), row)
        })
        .collect()
}

fn m(rows: &HashMap<String, HashMap<String, String>>, case: &str, col: &str) -> u128 {
    rows[case][col].parse().unwrap()
}

struct Env {
    worker: Worker<Sandbox>,
    owner: Account,
    keeper: Account,
    core: Contract,
    usdc: Contract,
    nvdax: Contract,
}

const PRICE_180: u128 = 180_000_000;
const UNITS: u128 = 100_000_000;

async fn deploy_ft(worker: &Worker<Sandbox>, owner: &Account, symbol: &str) -> anyhow::Result<Contract> {
    let c = worker.dev_deploy(&wasm("mock-ft", "mock_ft")).await?;
    let r = c
        .call("new")
        .args_json(json!({ "owner": owner.id(), "name": format!("Mock {symbol}"), "symbol": symbol, "decimals": 6 }))
        .transact()
        .await?;
    gas("mock-ft:new", &r);
    r.into_result()?;
    Ok(c)
}

async fn setup() -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let keeper = worker.dev_create_account().await?;
    let usdc = deploy_ft(&worker, &owner, "USDC").await?;
    let nvdax = deploy_ft(&worker, &owner, "NVDAx").await?;
    let core = worker.dev_deploy(&wasm("nectar-core", "nectar_core")).await?;
    let r = core
        .call("new")
        .args_json(json!({ "owner": owner.id(), "usdc_token": usdc.id(), "keeper": keeper.id() }))
        .transact()
        .await?;
    gas("new", &r);
    r.into_result()?;
    let r = owner
        .call(core.id(), "upsert_collateral")
        .args_json(json!({ "symbol": "NVDAx", "config": {
            "symbol": "NVDAx", "token": nvdax.id(), "decimals": 6, "price_feed_id": "TODO-G5",
            "base_ltv_bps": 4000, "max_nectar_ltv_bps": 7000, "base_haircut_bps": 1000,
            "weekend_haircut_bps": 2500, "limit_premium_bps": 300, "pre_liq_min_bps": 6500,
            "pre_liq_max_bps": 8000,
            "verified_dex_depth_usd_e6": "0", "nectar_reserve_usd_e6": "0", "remote_chain": null } }))
        .transact()
        .await?;
    gas("upsert_collateral", &r);
    r.into_result()?;
    price(&owner, &core, PRICE_180).await?;
    let r = owner.call(core.id(), "fund_gas_reserve").deposit(NearToken::from_millinear(10)).transact().await?;
    gas("fund_gas_reserve", &r);
    r.into_result()?;
    Ok(Env { worker, owner, keeper, core, usdc, nvdax })
}

async fn price(owner: &Account, core: &Contract, p: u128) -> anyhow::Result<()> {
    let r = owner
        .call(core.id(), "update_owner_price")
        .args_json(json!({ "symbol": "NVDAx", "price_usd_e6": p.to_string() }))
        .transact()
        .await?;
    gas("update_owner_price", &r);
    assert_eq!(r.into_result()?.json::<bool>()?, true, "price {p} accepted");
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

async fn ft_call(
    token: &Contract,
    from: &Account,
    to: &AccountId,
    amount: u128,
    msg: &str,
) -> anyhow::Result<ExecutionFinalResult> {
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

async fn view(core: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(core.view(method).args_json(args).await?.json()?)
}

fn fund_msg(disc: u16, notice_ns: &str) -> String {
    format!(r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":{disc},"notice_period_ns":"{notice_ns}","buyer_remote_recipient":null}}}}"#)
}
const WEEK_NS: &str = "604800000000000";

fn borrow_msg(borrow: u128, pre_liq: u16) -> String {
    format!(r#"{{"LockCollateralAndBorrow":{{"collateral":"NVDAx","borrow_usd_e6":"{borrow}","pre_liq_ltv_bps":{pre_liq}}}}}"#)
}

/// Supply + 2 quotes + borrow at B_c + price crash + keeper pre-liquidation + claim_fees.
/// Also the F-027 check: the cargo-near (Rust 1.95) wasm deploys and executes on the sandbox VM.
#[tokio::test]
async fn demo_flow_matches_model() -> anyhow::Result<()> {
    let e = setup().await?;
    let rows = model();
    let v: String = e.core.view("contract_version").await?.json()?;
    assert_eq!(v, "2.0.0-v7", "F-027: wasm runs on the sandbox VM ({v})");

    let lender = user(&e, 50_000_000_000, 0).await?;
    let buyer1 = user(&e, 10_000_000_000, 0).await?;
    let buyer2 = user(&e, 5_000_000_000, 0).await?;
    let borrower = user(&e, 0, UNITS).await?;

    let r = ft_call(&e.usdc, &lender, e.core.id(), 50_000_000_000, r#""SupplyLendingLiquidity""#).await?;
    gas("ft_transfer_call:SupplyLendingLiquidity", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let r = ft_call(&e.usdc, &buyer1, e.core.id(), 10_000_000_000, &fund_msg(250, WEEK_NS)).await?;
    gas("ft_transfer_call:FundPappusQuote", &r);
    assert!(r.logs().iter().any(|l| l.contains("quote_funded")));
    ft_call(&e.usdc, &buyer2, e.core.id(), 5_000_000_000, &fund_msg(400, WEEK_NS)).await?.into_result()?;

    let borrow = m(&rows, "demo_borrow", "b_c_usd_e6");
    let premium = m(&rows, "demo_borrow", "premium_usd_e6");
    let r = ft_call(&e.nvdax, &borrower, e.core.id(), UNITS, &borrow_msg(borrow, 7500)).await?;
    gas("ft_transfer_call:LockCollateralAndBorrow", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(bal(&e.nvdax, borrower.id()).await?, 0, "collateral locked");
    let net = m(&rows, "demo_borrow", "net_proceeds_usd_e6");
    let orig = m(&rows, "demo_borrow", "origination_fee_usd_e6");
    assert_eq!(net, borrow - premium - orig);
    assert_eq!(bal(&e.usdc, borrower.id()).await?, net, "proceeds net of premium and origination (v2 A5)");
    let pos = view(&e.core, "get_position", json!({ "position_id": "0" })).await?;
    assert_eq!(pos["position_id"], "0");
    assert_eq!(pos["status"], "Open");
    assert_eq!(pos["debt_usd_e6"], borrow.to_string());
    let pool = view(&e.core, "get_pool", json!({})).await?;
    assert_eq!(pool["treasury_usd_e6"], (m(&rows, "demo_borrow", "treasury_fee_usd_e6") + orig).to_string());

    price(&e.owner, &e.core, 155_000_000).await?;
    let h = view(&e.core, "get_health", json!({ "position_id": "0" })).await?;
    assert_eq!(h["triggerable"], false);
    assert_eq!(h["ltv_bps"], m(&rows, "demo_price_155", "ltv_bps") as u64);
    price(&e.owner, &e.core, 140_000_000).await?;
    let h = view(&e.core, "get_health", json!({ "position_id": "0" })).await?;
    assert_eq!(h["triggerable"], true);
    assert_eq!(h["ltv_bps"], m(&rows, "demo_price_140", "ltv_bps") as u64);

    // non-keeper refused; deposit refused (not payable)
    let r = buyer1.call(e.core.id(), "trigger_preliquidation").args_json(json!({ "position_id": "0" })).transact().await?;
    assert!(r.is_failure());
    let r = e
        .keeper
        .call(e.core.id(), "trigger_preliquidation")
        .args_json(json!({ "position_id": "0" }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    assert!(r.is_failure(), "keeper method is not payable");

    // PRD §6.10 key scope: the keeper signs with a function-call key limited to the keeper methods
    // on nectar-core (F-015, F-020). `relay_settlement_result` is P2-only (absent from this build).
    let sk = SecretKey::from_random(KeyType::ED25519);
    let ak = AccessKey::function_call_access(
        e.core.id(),
        &["trigger_preliquidation", "relay_settlement_result"],
        Some(NearToken::from_near(1)),
    );
    e.keeper.batch(e.keeper.id()).add_key(sk.public_key(), ak).transact().await?.into_result()?;
    let keeper_fc = Account::from_secret_key(e.keeper.id().clone(), sk, &e.worker);
    // (b) the scoped key cannot sign a token transfer (wrong receiver, and FC keys cannot attach the 1 yocto)
    let r = keeper_fc
        .call(e.usdc.id(), "ft_transfer")
        .args_json(json!({ "receiver_id": e.keeper.id(), "amount": "1" }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await;
    refused(r, "FC key refused for usdc.ft_transfer");
    let r = keeper_fc
        .call(e.usdc.id(), "ft_transfer")
        .args_json(json!({ "receiver_id": e.keeper.id(), "amount": "1" }))
        .transact()
        .await;
    refused(r, "FC key refused for usdc (receiver not in scope)");
    // ... nor a nectar-core method outside its method list
    let r = keeper_fc.call(e.core.id(), "pause").transact().await;
    refused(r, "FC key refused for unlisted method");
    assert_eq!(view(&e.core, "get_config", json!({})).await?["paused"], false, "not paused");
    // (a) trigger works with the scoped key
    let r = keeper_fc
        .call(e.core.id(), "trigger_preliquidation")
        .args_json(json!({ "position_id": "0" }))
        .gas(Gas::from_tgas(300))
        .transact()
        .await?;
    gas("trigger_preliquidation(2 legs)", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    assert!(r.receipt_failures().is_empty(), "all transfers succeed: {:?}", r.receipt_failures());

    let b1 = m(&rows, "demo_leg_1", "buyer_units");
    let b2 = m(&rows, "demo_leg_2", "buyer_units");
    let k = m(&rows, "demo_leg_1", "keeper_units") + m(&rows, "demo_leg_2", "keeper_units");
    assert_eq!(bal(&e.nvdax, buyer1.id()).await?, b1);
    assert_eq!(bal(&e.nvdax, buyer2.id()).await?, b2);
    assert_eq!(bal(&e.nvdax, e.keeper.id()).await?, k);
    assert_eq!(bal(&e.nvdax, borrower.id()).await?, UNITS - b1 - b2 - k, "borrower keeps the remainder");
    assert_eq!(bal(&e.nvdax, e.core.id()).await?, 0);
    let pos = view(&e.core, "get_position", json!({ "position_id": "0" })).await?;
    assert_eq!(pos["status"], "Closed");
    let q1 = view(&e.core, "get_quote", json!({ "quote_id": "1" })).await?;
    assert_eq!(q1["quote_id"], "1");
    let rem2 = 5_000_000_000 - m(&rows, "demo_leg_2", "repay_usd_e6");
    assert_eq!(q1["remaining_usd_e6"], rem2.to_string());

    // buyer1 fee share: 10k/15k of the 70 % buyer slice
    let before = bal(&e.usdc, buyer1.id()).await?;
    let r = buyer1
        .call(e.core.id(), "claim_fees")
        .args_json(json!({ "quote_id": "0" }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;
    gas("claim_fees", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let fee = m(&rows, "demo_borrow", "buyers_fee_usd_e6") * 10 / 15;
    assert_eq!(bal(&e.usdc, buyer1.id()).await? - before, fee);

    // USDC conservation: contract holds pool + escrow + fees
    let pool = view(&e.core, "get_pool", json!({})).await?;
    let held = bal(&e.usdc, e.core.id()).await?;
    let avail: u128 = pool["available_usd_e6"].as_str().unwrap().parse()?;
    let tre: u128 = pool["treasury_usd_e6"].as_str().unwrap().parse()?;
    let lf: u128 = pool["lenders_fees_usd_e6"].as_str().unwrap().parse()?;
    let fee2 = m(&rows, "demo_borrow", "buyers_fee_usd_e6") - fee;
    assert_eq!(held, avail + tre + lf + rem2 + fee2);
    Ok(())
}

/// TopUpQuote + exit through notice (time travel) + Repay (partial, overpay refund, collateral release).
#[tokio::test]
async fn topup_exit_and_repay() -> anyhow::Result<()> {
    let e = setup().await?;
    let r = e
        .owner
        .call(e.core.id(), "set_quote_params")
        .args_json(json!({ "min_notice_period_ns": "1000000000", "min_quote_usd_e6": "100000000" }))
        .transact()
        .await?;
    gas("set_quote_params", &r);
    r.into_result()?;
    let lender = user(&e, 20_000_000_000, 0).await?;
    let buyer = user(&e, 20_000_000_000, 0).await?;
    let borrower = user(&e, 1_000_000_000, UNITS).await?;
    ft_call(&e.usdc, &lender, e.core.id(), 20_000_000_000, r#""SupplyLendingLiquidity""#).await?.into_result()?;
    ft_call(&e.usdc, &buyer, e.core.id(), 5_000_000_000, &fund_msg(250, "5000000000")).await?.into_result()?;
    let r = ft_call(&e.usdc, &buyer, e.core.id(), 5_000_000_000, r#"{"TopUpQuote":{"quote_id":"0"}}"#).await?;
    gas("ft_transfer_call:TopUpQuote", &r);
    assert!(r.logs().iter().any(|l| l.contains("quote_topped_up")));
    let q = view(&e.core, "get_quote", json!({ "quote_id": "0" })).await?;
    assert_eq!(q["remaining_usd_e6"], "10000000000");

    // borrow 5,000 against 100 NVDAx (V = 18k, B_c = min(12.6k, 7.5k))
    ft_call(&e.nvdax, &borrower, e.core.id(), UNITS, &borrow_msg(5_000_000_000, 7500)).await?.into_result()?;
    let r = ft_call(&e.usdc, &borrower, e.core.id(), 1_000_000_000, r#"{"Repay":{"position_id":"0"}}"#).await?;
    gas("ft_transfer_call:Repay(partial)", &r);
    assert!(r.is_success());
    // 5,000 - 15 origination (no premium below static) - 1,000 repaid + 1,000 minted
    let usdc_before = bal(&e.usdc, borrower.id()).await?;
    assert_eq!(usdc_before, 4_985_000_000);
    // repay the exact remainder: position closes, collateral released
    let r = ft_call(&e.usdc, &borrower, e.core.id(), 4_000_000_000, r#"{"Repay":{"position_id":"0"}}"#).await?;
    assert!(r.is_success());
    assert_eq!(bal(&e.usdc, borrower.id()).await?, 985_000_000);
    e.owner.call(e.usdc.id(), "mint").args_json(json!({ "account_id": borrower.id(), "amount": "7" })).transact().await?.into_result()?;
    let pos = view(&e.core, "get_position", json!({ "position_id": "0" })).await?;
    assert_eq!(pos["status"], "Closed");
    assert_eq!(bal(&e.nvdax, borrower.id()).await?, UNITS, "collateral released on full repay");
    let r = ft_call(&e.usdc, &borrower, e.core.id(), 7, r#"{"Repay":{"position_id":"0"}}"#).await?;
    gas("ft_transfer_call:Repay(refund)", &r);
    assert_eq!(bal(&e.usdc, borrower.id()).await?, 985_000_007, "closed position: unused returned via ft_resolve_transfer");

    // exit
    let r = buyer
        .call(e.core.id(), "initiate_quote_withdrawal")
        .args_json(json!({ "quote_id": "0" }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    gas("initiate_quote_withdrawal", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let early = buyer
        .call(e.core.id(), "complete_quote_withdrawal")
        .args_json(json!({ "quote_id": "0" }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(early.is_failure(), "notice period not over");
    e.worker.fast_forward(200).await?;
    let r = buyer
        .call(e.core.id(), "complete_quote_withdrawal")
        .args_json(json!({ "quote_id": "0" }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;
    gas("complete_quote_withdrawal", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(bal(&e.usdc, buyer.id()).await?, 20_000_000_000);
    Ok(())
}

/// Refund paths with the real token: invalid msg, unknown token, stale oracle, paused; private callback.
#[tokio::test]
async fn refunds_and_guards() -> anyhow::Result<()> {
    let e = setup().await?;
    let lender = user(&e, 1_000_000_000, 0).await?;
    let r = ft_call(&e.usdc, &lender, e.core.id(), 1_000, "garbage").await?;
    gas("ft_transfer_call:invalid", &r);
    assert_eq!(bal(&e.usdc, lender.id()).await?, 1_000_000_000, "invalid msg refunded");

    let fake = deploy_ft(&e.worker, &e.owner, "FAKE").await?;
    e.owner.call(fake.id(), "mint").args_json(json!({ "account_id": lender.id(), "amount": "1000" })).transact().await?.into_result()?;
    let r = ft_call(&fake, &lender, e.core.id(), 1_000, r#""SupplyLendingLiquidity""#).await?;
    assert!(!r.receipt_failures().is_empty(), "unknown token panics in ft_on_transfer");
    assert_eq!(bal(&fake, lender.id()).await?, 1_000, "unknown token refunded by resolve");

    // stale oracle: shrink closed-session max age to 1 ns
    let r = e
        .owner
        .call(e.core.id(), "set_oracle_params")
        .args_json(json!({ "max_age_ns_session": "1", "max_age_ns_closed": "1", "band_bps": 1500 }))
        .transact()
        .await?;
    gas("set_oracle_params", &r);
    r.into_result()?;
    let borrower = user(&e, 0, UNITS).await?;
    ft_call(&e.nvdax, &borrower, e.core.id(), UNITS, &borrow_msg(1_000_000, 7500)).await?.into_result()?;
    assert_eq!(bal(&e.nvdax, borrower.id()).await?, UNITS, "stale oracle blocks borrow");

    let r = e.owner.call(e.core.id(), "pause").transact().await?;
    gas("pause", &r);
    r.into_result()?;
    ft_call(&e.usdc, &lender, e.core.id(), 1_000, r#""SupplyLendingLiquidity""#).await?.into_result()?;
    assert_eq!(bal(&e.usdc, lender.id()).await?, 1_000_000_000, "paused refuses money paths");
    let r = e.owner.call(e.core.id(), "unpause").transact().await?;
    gas("unpause", &r);
    r.into_result()?;

    let r = lender
        .call(e.core.id(), "on_payout")
        .args_json(json!({ "payout": { "Fees": { "quote_id": "0" } }, "account_id": lender.id(), "amount": "1" }))
        .transact()
        .await?;
    assert!(r.is_failure(), "on_payout is #[private]");
    // keeper cannot move the contract's tokens
    let r = e
        .keeper
        .call(e.usdc.id(), "ft_transfer")
        .args_json(json!({ "receiver_id": e.keeper.id(), "amount": "1" }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    assert!(r.is_failure(), "keeper has no claim on contract balances");
    Ok(())
}

/// Worst case: 8 distinct buyers + keeper + borrower release in one trigger (≤ 8 quotes per settlement).
#[tokio::test]
async fn preliq_eight_buyers_gas() -> anyhow::Result<()> {
    let e = setup().await?;
    let lender = user(&e, 50_000_000_000, 0).await?;
    ft_call(&e.usdc, &lender, e.core.id(), 50_000_000_000, r#""SupplyLendingLiquidity""#).await?.into_result()?;
    let mut buyers = Vec::new();
    for i in 0..10u16 {
        let b = user(&e, 1_500_000_000, 0).await?;
        ft_call(&e.usdc, &b, e.core.id(), 1_500_000_000, &fund_msg(200 + i * 10, WEEK_NS)).await?.into_result()?;
        buyers.push(b);
    }
    let borrower = user(&e, 0, UNITS).await?;
    ft_call(&e.nvdax, &borrower, e.core.id(), UNITS, &borrow_msg(11_250_000_000, 7500)).await?.into_result()?;
    price(&e.owner, &e.core, 155_000_000).await?;
    price(&e.owner, &e.core, 140_000_000).await?;
    let r = e
        .keeper
        .call(e.core.id(), "trigger_preliquidation")
        .args_json(json!({ "position_id": "0" }))
        .gas(Gas::from_tgas(300))
        .transact()
        .await?;
    gas("trigger_preliquidation(8 legs)", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    assert!(r.receipt_failures().is_empty(), "{:?}", r.receipt_failures());
    for (i, b) in buyers.iter().enumerate() {
        let got = bal(&e.nvdax, b.id()).await?;
        assert_eq!(got > 0, i < 8, "buyer {i} settled iff among the 8 cheapest");
    }
    let pos = view(&e.core, "get_position", json!({ "position_id": "0" })).await?;
    assert_eq!(pos["status"], "Closed");
    let list = view(&e.core, "list_positions", json!({ "from_index": 0, "limit": 10 })).await?;
    assert_eq!(list[0]["position_id"], "0");
    Ok(())
}

/// Gas rows for the owner setters and the two-step price override, plus standalone mock-ft calls
/// (G1: every public non-view method of the default build has a measurement).
#[tokio::test]
async fn owner_setters_and_ft_gas() -> anyhow::Result<()> {
    let e = setup().await?;
    async fn owner_call(e: &Env, method: &str, args: Value) -> anyhow::Result<()> {
        let r = e.owner.call(e.core.id(), method).args_json(args).transact().await?;
        gas(method, &r);
        assert!(r.is_success(), "{method}: {:?}", r.failures());
        Ok(())
    }
    let new_keeper = e.worker.dev_create_account().await?;
    owner_call(&e, "set_keeper", json!({ "keeper": new_keeper.id() })).await?;
    owner_call(&e, "set_fee_split", json!({ "buyers_bps": 6000, "lenders_bps": 3000, "treasury_bps": 1000 })).await?;
    owner_call(&e, "force_session_closed", json!({ "symbol": "NVDAx", "closed": true })).await?;
    owner_call(&e, "set_dex_depth", json!({ "symbol": "NVDAx", "depth_usd_e6": "2500000000" })).await?;
    owner_call(&e, "set_reserve", json!({ "symbol": "NVDAx", "reserve_usd_e6": "1000000000" })).await?;
    // 300 is outside the oracle band from 180: update_owner_price refuses, propose/apply overrides
    owner_call(&e, "propose_price", json!({ "symbol": "NVDAx", "price_usd_e6": "300000000" })).await?;
    e.worker.fast_forward(1).await?;
    owner_call(&e, "apply_price", json!({ "symbol": "NVDAx" })).await?;
    let cfg = view(&e.core, "get_config", json!({})).await?;
    assert_eq!(cfg["keeper"], new_keeper.id().to_string());
    assert_eq!(cfg["fee_split"]["buyers_bps"], 6000);
    let c = view(&e.core, "get_collateral", json!({ "symbol": "NVDAx" })).await?;
    assert_eq!(c["forced_closed"], true);

    assert_eq!(c["verified_dex_depth_usd_e6"], "2500000000");
    assert_eq!(c["nectar_reserve_usd_e6"], "1000000000");
    assert_eq!(c["oracle_price_usd_e6"], "300000000");
    // non-owner refused
    let r = e.keeper.call(e.core.id(), "set_keeper").args_json(json!({ "keeper": e.keeper.id() })).transact().await?;
    assert!(r.is_failure(), "set_keeper is owner-only");

    let a = e.worker.dev_create_account().await?;
    let b = e.worker.dev_create_account().await?;
    let r = e.owner.call(e.usdc.id(), "mint").args_json(json!({ "account_id": a.id(), "amount": "5000000" })).transact().await?;
    gas("mock-ft:mint", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let r = b
        .call(e.usdc.id(), "storage_deposit")
        .args_json(json!({ "account_id": b.id(), "registration_only": true }))
        .deposit(NearToken::from_millinear(2))
        .transact()
        .await?;
    gas("mock-ft:storage_deposit", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let r = a
        .call(e.usdc.id(), "ft_transfer")
        .args_json(json!({ "receiver_id": b.id(), "amount": "2000000" }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    gas("mock-ft:ft_transfer", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(bal(&e.usdc, a.id()).await?, 3_000_000);
    assert_eq!(bal(&e.usdc, b.id()).await?, 2_000_000);
    Ok(())
}
