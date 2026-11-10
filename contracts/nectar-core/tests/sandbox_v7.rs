//! v2 sandbox tests (WO-19, interface-v7.md §A) against the real mock-ft wasm: aggregate debt (A1), weekend
//! guard (A2), multiplier + corporate action with mock-ft `update_multiplier` (A3), `pay_to` -> claimable (A4),
//! referrers + origination fee (A5). Values come from tests/model.csv (agg_* / mult_* rows).
//! Gas lines: `GAS,<method>,<gas burnt>` (run with --nocapture).

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use near_sdk::serde_json::{Value, json};
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, AccountId, Contract, Worker};

// WO-22 Position Notes + G11 setter gas rows (a subdirectory, so cargo does not build it as its own test target).
#[path = "v7/notes.rs"]
mod notes;

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

// ------------------------------------------------------------------ A1

/// Two borrowers cannot both draw the full aggregate capacity; repay frees headroom; settlement reduces debt.
#[tokio::test]
async fn aggregate_debt_two_borrowers_repay_settle() -> anyhow::Result<()> {
    let e = setup().await?;
    let rows = model();
    let alice = user(&e, 1_000_000_000, UNITS).await?;
    let bob = user(&e, 0, 3 * UNITS).await?;
    assert_eq!(borrow(&e, &alice, 10_500_000_000, "", "ft_transfer_call:LockCollateralAndBorrow(v2)").await?, 0);
    near(&cap(&e).await?["aggregate_headroom_usd_e6"], m(&rows, "agg_b_full", "aggregate_headroom_usd_e6"), "headroom");
    let p = view(&e, "preview_borrow", json!({ "symbol": "NVDAx", "units": UNITS.to_string(), "borrow_usd_e6": "11250000000" })).await?;
    assert_eq!((p["ok"].as_bool(), p["reason"].as_str()), (Some(false), Some("aggregate_limit")));
    near(&p["b_c_usd_e6"], m(&rows, "agg_b_full", "b_c_usd_e6"), "b_c after A");
    assert_eq!(borrow(&e, &bob, 11_250_000_000, "", "borrow(aggregate_limit)").await?, UNITS, "bob refused, full refund");
    assert_eq!(borrow(&e, &bob, 750_000_000, "", "borrow(headroom)").await?, 0);
    assert_eq!(borrow(&e, &bob, 1, "", "borrow(1 over)").await?, UNITS);
    near(&cap(&e).await?["total_debt_usd_e6"], 11_250_000_000, "total debt");
    // repay frees headroom
    ft_call(&e.usdc, &alice, e.core.id(), 500_000_000, r#"{"Repay":{"position_id":"0"}}"#).await?.into_result()?;
    near(&cap(&e).await?["aggregate_headroom_usd_e6"], m(&rows, "agg_after_repay", "aggregate_headroom_usd_e6"), "after repay");
    assert_eq!(borrow(&e, &bob, 500_000_000, "", "borrow(after repay)").await?, 0);
    // settlement reduces total debt
    for p in [155_000_000, 140_000_000, 130_000_000] {
        price(&e, p).await?;
    }
    let h = view(&e, "get_health", json!({ "position_id": "0" })).await?;
    near(&h["ltv_bps"], m(&rows, "agg_a_price_130", "ltv_bps"), "alice ltv");
    let r = e.keeper.call(e.core.id(), "trigger_preliquidation").args_json(json!({ "position_id": "0" })).gas(Gas::from_tgas(300)).transact().await?;
    gas("trigger_preliquidation(v2)", &r);
    assert!(r.is_success() && r.receipt_failures().is_empty(), "{:?}", r.failures());
    let c = cap(&e).await?;
    near(&c["total_debt_usd_e6"], m(&rows, "agg_after_settle", "total_debt_usd_e6"), "after settle");
    near(&c["aggregate_headroom_usd_e6"], m(&rows, "agg_after_settle", "aggregate_headroom_usd_e6"), "headroom after settle");
    Ok(())
}

// ------------------------------------------------------------------ A2

/// Empty calendar = closed; window = open; > 900 s old price = weekend parameters; forced closed; `false` never opens.
#[tokio::test]
async fn weekend_guard_calendar_stale_and_forced() -> anyhow::Result<()> {
    let e = setup().await?;
    owner_call(&e, "set_dex_depth", json!({ "symbol": "NVDAx", "depth_usd_e6": "5000000000" })).await?;
    let c = cap(&e).await?;
    assert_eq!((c["session_open"].as_bool(), c["session_reason"].as_str()), (Some(false), Some("no_calendar")));
    // gas worst case: 600 windows (the NYSE 2026-2027 calendar is ~500)
    let t = now_ns(&e).await?;
    let big: Vec<[String; 2]> = (0..600u64)
        .map(|i| [(t + (i + 1) * 86_400 * SEC).to_string(), (t + (i + 1) * 86_400 * SEC + 3_600 * SEC).to_string()])
        .collect();
    owner_call(&e, "set_session_calendar", json!({ "windows": big })).await?;
    assert_eq!(cap(&e).await?["session_reason"], "outside_hours");
    let page = view(&e, "get_session_calendar", json!({ "from_index": 599, "limit": 5 })).await?;
    assert_eq!(page.as_array().unwrap().len(), 1);
    // a window around now
    let w = json!({ "windows": [[(t - 3_600 * SEC).to_string(), (t + 6 * 3_600 * SEC).to_string()]] });
    owner_call(&e, "set_session_calendar", w).await?;
    price(&e, 181_000_000).await?;
    let c = cap(&e).await?;
    assert_eq!((c["session_open"].as_bool(), c["haircut_bps"].as_u64()), (Some(true), Some(1000)));
    assert_eq!(c["d_usd_e6"], "5000000000");
    owner_call(&e, "force_session_closed", json!({ "symbol": "NVDAx", "closed": true })).await?;
    assert_eq!(cap(&e).await?["session_reason"], "forced_closed");
    owner_call(&e, "force_session_closed", json!({ "symbol": "NVDAx", "closed": false })).await?;
    assert_eq!(cap(&e).await?["session_open"], true);
    // price older than 900 s -> weekend parameters, `false` cannot reopen
    advance(&e, 905).await?;
    let c = cap(&e).await?;
    assert_eq!((c["session_open"].as_bool(), c["session_reason"].as_str()), (Some(false), Some("stale_price")));
    assert_eq!((c["haircut_bps"].as_u64(), c["d_usd_e6"].as_str()), (Some(2500), Some("0")));
    near(&c["capacity_usd_e6"], 11_250_000_000, "weekend capacity");
    owner_call(&e, "force_session_closed", json!({ "symbol": "NVDAx", "closed": false })).await?;
    assert_eq!(cap(&e).await?["session_reason"], "stale_price");
    // borrows still work at weekend parameters
    let alice = user(&e, 0, UNITS).await?;
    assert_eq!(borrow(&e, &alice, 11_250_000_001, "", "borrow(weekend over)").await?, UNITS);
    assert_eq!(borrow(&e, &alice, 11_250_000_000, "", "borrow(weekend)").await?, 0);
    // outside the window `false` cannot open either
    owner_call(&e, "set_session_calendar", json!({ "windows": [[(t + 86_400 * SEC).to_string(), (t + 90_000 * SEC).to_string()]] })).await?;
    price(&e, 180_000_000).await?;
    owner_call(&e, "force_session_closed", json!({ "symbol": "NVDAx", "closed": false })).await?;
    assert_eq!(cap(&e).await?["session_reason"], "outside_hours");
    owner_fails(&e, "set_session_calendar", json!({ "windows": [["20", "30"], ["10", "15"]] }), "sorted").await?;
    let r = e.keeper.call(e.core.id(), "force_session_closed").args_json(json!({ "symbol": "NVDAx", "closed": true })).transact().await?;
    assert!(r.is_failure(), "owner only");
    Ok(())
}

// ------------------------------------------------------------------ A3

/// +5 % ok, +5.01 % refused, decrease refused, announcement < 1 h refused, borrow refused while pending,
/// 2-for-1 split (mock-ft M x2, apply halves the price) leaves V and LTV unchanged.
#[tokio::test]
async fn multiplier_bounds_announce_and_split() -> anyhow::Result<()> {
    let e = setup().await?;
    let rows = model();
    let alice = user(&e, 0, UNITS).await?;
    let bob = user(&e, 0, UNITS).await?;
    assert_eq!(borrow(&e, &alice, 10_000_000_000, "", "borrow(pre-split)").await?, 0);
    owner_call(&e, "set_multiplier", json!({ "symbol": "NVDAx", "multiplier_e18": "1050000000000000000" })).await?;
    owner_fails(&e, "set_multiplier", json!({ "symbol": "NVDAx", "multiplier_e18": "1102605000000000000" }), "above 5%").await?;
    owner_fails(&e, "set_multiplier", json!({ "symbol": "NVDAx", "multiplier_e18": "1000000000000000000" }), "decrease needs").await?;
    let before = view(&e, "get_health", json!({ "position_id": "0" })).await?;
    near(&before["value_usd_e6"], m(&rows, "mult_dividend_2pct", "value_usd_e6") * 105 / 102, "V at M 1.05");
    // 2-for-1 split: M 1.05 -> 2.10 through a corporate action (> +5 %)
    let t = now_ns(&e).await?;
    owner_fails(&e, "announce_corporate_action",
        json!({ "symbol": "NVDAx", "multiplier_e18": "2100000000000000000", "effective_ns": (t + 3_000 * SEC).to_string() }),
        "at least 1 h").await?;
    let eff = now_ns(&e).await? + 3_600 * SEC + 2 * SEC;
    let r = owner_call(&e, "announce_corporate_action",
        json!({ "symbol": "NVDAx", "multiplier_e18": "2100000000000000000", "effective_ns": eff.to_string() })).await?;
    assert!(r.logs().iter().any(|l| l.contains("corporate_action_announced")));
    assert_eq!(cap(&e).await?["ca_pending"], true);
    assert_eq!(borrow(&e, &bob, 1_000_000_000, "", "borrow(ca_pending)").await?, UNITS, "refused while pending");
    owner_fails(&e, "set_multiplier", json!({ "symbol": "NVDAx", "multiplier_e18": "1050000000000000000" }), "pending").await?;
    let stranger = e.worker.dev_create_account().await?;
    let r = stranger.call(e.core.id(), "apply_corporate_action").args_json(json!({ "symbol": "NVDAx" })).transact().await?;
    assert!(format!("{:?}", r.failures()).contains("not yet effective"));
    // the token's own multiplier (mock-ft, code-only upgrade on testnet)
    let r = e.owner.call(e.nvdax.id(), "update_multiplier").args_json(json!({ "multiplier_e18": (2 * E18).to_string() })).transact().await?;
    gas("mock-ft:update_multiplier", &r);
    r.into_result()?;
    let tm: String = e.nvdax.view("multiplier").await?.json()?;
    assert_eq!(tm, (2 * E18).to_string());
    advance(&e, 3_610).await?;
    price(&e, 180_000_000).await?; // keep the oracle fresh for the views below
    let r = stranger.call(e.core.id(), "apply_corporate_action").args_json(json!({ "symbol": "NVDAx" })).transact().await?;
    gas("apply_corporate_action", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let c = view(&e, "get_collateral", json!({ "symbol": "NVDAx" })).await?;
    // apply: M x2, price 180 -> 90 (old_M/new_M, floor)
    assert_eq!((c["multiplier_e18"].as_str(), c["oracle_price_usd_e6"].as_str()), (Some("2100000000000000000"), Some("90000000")));
    assert_eq!(c["ca_pending"], false);
    let after = view(&e, "get_health", json!({ "position_id": "0" })).await?;
    assert_eq!(after["value_usd_e6"], before["value_usd_e6"], "V unchanged by the split");
    assert_eq!(after["ltv_bps"], before["ltv_bps"], "LTV unchanged by the split");
    assert_eq!(m(&rows, "mult_pre_split", "ltv_bps"), m(&rows, "mult_post_split", "ltv_bps"));

    assert_eq!(view(&e, "get_position", json!({ "position_id": "0" })).await?["units"], UNITS.to_string());
    assert_eq!(borrow(&e, &bob, 1_000_000_000, "", "borrow(post-split)").await?, 0, "borrows resume");
    Ok(())
}

// ------------------------------------------------------------------ A4 + A5

/// pay_to to an account not registered on usdc-mock -> claimable_usdc[borrower] -> withdraw_claimable pays it;
/// referrer == borrower refused with the full refund; a registered referrer gets half the origination fee;
/// an unregistered referrer -> treasury.
#[tokio::test]
async fn pay_to_claimable_and_referrers() -> anyhow::Result<()> {
    let e = setup().await?;
    let rows = model();
    let r = e.owner.call(e.usdc.id(), "set_registration_required").args_json(json!({ "required": true })).transact().await?;
    gas("mock-ft:set_registration_required", &r);
    r.into_result()?;
    let alice = user(&e, 0, 2 * UNITS).await?;
    let merchant = e.worker.dev_create_account().await?; // never registered on usdc
    let extra = format!(r#","pay_to":{{"receiver_id":"{}","memo":"inv-42"}}"#, merchant.id());
    // alice must be registered to withdraw later; registration happens through storage_deposit
    alice.call(e.usdc.id(), "storage_deposit").args_json(json!({})).deposit(NearToken::from_millinear(2)).transact().await?.into_result()?;
    let before = bal(&e.usdc, alice.id()).await?;
    let ft = ft_call(&e.nvdax, &alice, e.core.id(), UNITS, &borrow_msg(5_000_000_000, &extra)).await?;
    gas("ft_transfer_call:LockCollateralAndBorrow(pay_to failed)", &ft);
    assert!(ft.logs().iter().any(|l| l.contains("pay_to_failed")), "{:?}", ft.logs());
    let net = 5_000_000_000 - 15_000_000;
    assert_eq!(bal(&e.usdc, merchant.id()).await?, 0);
    assert_eq!(view(&e, "get_claimable", json!({ "account_id": alice.id() })).await?, json!(net.to_string()));
    let r = alice.call(e.core.id(), "withdraw_claimable").deposit(NearToken::from_yoctonear(1)).gas(Gas::from_tgas(100)).transact().await?;
    gas("withdraw_claimable", &r);
    assert!(r.is_success() && r.receipt_failures().is_empty(), "{:?}", r.failures());
    assert_eq!(bal(&e.usdc, alice.id()).await? - before, net);
    assert_eq!(view(&e, "get_claimable", json!({ "account_id": alice.id() })).await?, json!("0"));
    let r = alice.call(e.core.id(), "withdraw_claimable").deposit(NearToken::from_yoctonear(1)).transact().await?;
    assert!(format!("{:?}", r.failures()).contains("nothing to withdraw"));

    // referrers
    let bob = user(&e, 0, 3 * UNITS).await?;
    bob.call(e.usdc.id(), "storage_deposit").args_json(json!({})).deposit(NearToken::from_millinear(2)).transact().await?.into_result()?;
    let referrer = user(&e, 1, 0).await?; // minted -> registered on usdc
    owner_call(&e, "register_referrer", json!({ "account_id": bob.id() })).await?;
    owner_call(&e, "register_referrer", json!({ "account_id": referrer.id() })).await?;
    assert_eq!(view(&e, "is_referrer", json!({ "account_id": referrer.id() })).await?, true);
    let self_ref = format!(r#","referrer":"{}""#, bob.id());
    assert_eq!(borrow(&e, &bob, 1_000_000_000, &self_ref, "borrow(referrer_is_borrower)").await?, UNITS, "full refund");
    let p = view(&e, "preview_borrow", json!({ "symbol": "NVDAx", "units": UNITS.to_string(), "borrow_usd_e6": "1000000000",
        "referrer": bob.id(), "borrower": bob.id() })).await?;
    assert_eq!(p["reason"], "referrer_is_borrower");
    let tre0: u128 = view(&e, "get_pool", json!({})).await?["treasury_usd_e6"].as_str().unwrap().parse()?;
    let with_ref = format!(r#","referrer":"{}""#, referrer.id());
    let p = view(&e, "preview_borrow", json!({ "symbol": "NVDAx", "units": UNITS.to_string(), "borrow_usd_e6": "1000000000",
        "referrer": referrer.id() })).await?;
    near(&p["origination_fee_usd_e6"], 3_000_000, "origination");
    near(&p["referrer_share_usd_e6"], 1_500_000, "share");
    let r = ft_call(&e.nvdax, &bob, e.core.id(), UNITS, &borrow_msg(1_000_000_000, &with_ref)).await?;
    gas("ft_transfer_call:LockCollateralAndBorrow(referrer)", &r);
    assert!(r.logs().iter().any(|l| l.contains("referrer_paid")));
    assert_eq!(view(&e, "get_claimable", json!({ "account_id": referrer.id() })).await?, json!("1500000"));
    let tre1: u128 = view(&e, "get_pool", json!({})).await?["treasury_usd_e6"].as_str().unwrap().parse()?;
    assert_eq!(tre1 - tre0, 1_500_000, "the other half to treasury (no premium below static)");
    let r = referrer.call(e.core.id(), "withdraw_claimable").deposit(NearToken::from_yoctonear(1)).gas(Gas::from_tgas(100)).transact().await?;
    assert!(r.is_success());
    assert_eq!(bal(&e.usdc, referrer.id()).await?, 1 + 1_500_000);
    owner_call(&e, "unregister_referrer", json!({ "account_id": referrer.id() })).await?;
    assert_eq!(borrow(&e, &bob, 1_000_000_000, &with_ref, "borrow(unregistered referrer)").await?, 0);
    let tre2: u128 = view(&e, "get_pool", json!({})).await?["treasury_usd_e6"].as_str().unwrap().parse()?;
    assert_eq!(tre2 - tre1, 3_000_000, "unregistered referrer: all origination to treasury");
    assert_eq!(view(&e, "get_claimable", json!({ "account_id": referrer.id() })).await?, json!("0"));
    owner_call(&e, "set_origination_fee_bps", json!({ "bps": 100 })).await?;
    owner_fails(&e, "set_origination_fee_bps", json!({ "bps": 101 }), "> 100").await?;
    near(&json!(m(&rows, "demo_borrow", "origination_fee_usd_e6").to_string()), 33_750_000, "model origination");
    // USDC conservation incl. claimable (all withdrawn) and pool
    let pool = view(&e, "get_pool", json!({})).await?;
    let held = bal(&e.usdc, e.core.id()).await?;
    let sum: u128 = ["available_usd_e6", "treasury_usd_e6", "lenders_fees_usd_e6"]
        .iter()
        .map(|k| pool[*k].as_str().unwrap().parse::<u128>().unwrap())
        .sum();
    assert_eq!(held, sum + 15_000_000_000, "pool + escrow (no premium paid, so no buyer fees)");
    Ok(())
}
