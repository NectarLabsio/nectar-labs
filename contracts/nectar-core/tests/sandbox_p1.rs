//! P1 sandbox tests (WO-10a, v2 layout per WO-19): the OutLayer quoter path against the stub in
//! contracts/test-stubs, every quoter outcome, and the 8-leg gas budget, on a fresh v2 deploy (`new`; v2 has no
//! migrate, PRD §6.11). The P0 / V1 fixtures (tests/fixtures/nectar_core_p0.wasm sha256 6bd1ec51...,
//! nectar_core_v1.wasm d617e192...) now prove that v2 code over v1 state fails closed.
//! Gas lines: `GAS,<label>,<receipt executor>,<gas burnt>` (run with --nocapture).

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use near_sdk::serde_json::{Value, json};
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, AccountId, Contract, Worker};

const P0_SHA256: &str = "6bd1ec5125806ad71e370953447ac635d9e86d4ce801100d03dc05eda15e2a46";
const DEPOSIT: u128 = 4_000_010_000_000_000_000_000; // F-046 estimate
const TGAS: u64 = 1_000_000_000_000;

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

fn p0_wasm() -> Vec<u8> {
    let w = std::fs::read(root().join("contracts/nectar-core/tests/fixtures/nectar_core_p0.wasm")).expect("p0 wasm");
    let h: String = near_sdk::env::sha256(&w).iter().map(|b| format!("{b:02x}")).collect();
    assert_eq!(h, P0_SHA256, "fixture is the G1 / testnet P0 wasm");
    w
}

/// Per-receipt gas; asserts every receipt burnt < 100 Tgas.
fn gas(label: &str, r: &ExecutionFinalResult) {
    println!("GAS,{label},total,{}", r.total_gas_burnt.as_gas());
    for o in r.receipt_outcomes() {
        println!("GAS,{label},{},{}", o.executor_id, o.gas_burnt.as_gas());
        assert!(o.gas_burnt.as_gas() < 100 * TGAS, "{label}: receipt on {} burnt >= 100 Tgas", o.executor_id);
    }
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

struct Env {
    worker: Worker<Sandbox>,
    owner: Account,
    keeper: Account,
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

async fn env() -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let keeper = worker.dev_create_account().await?;
    let usdc = deploy_ft(&worker, &owner, "USDC").await?;
    let nvdax = deploy_ft(&worker, &owner, "NVDAx").await?;
    Ok(Env { worker, owner, keeper, usdc, nvdax })
}

async fn init_core(e: &Env, code: &[u8]) -> anyhow::Result<Contract> {
    let core = e.worker.dev_deploy(code).await?;
    core.call("new")
        .args_json(json!({ "owner": e.owner.id(), "usdc_token": e.usdc.id(), "keeper": e.keeper.id() }))
        .transact()
        .await?
        .into_result()?;
    owner_call(e, &core, "upsert_collateral", json!({ "symbol": "NVDAx", "config": {
        "symbol": "NVDAx", "token": e.nvdax.id(), "decimals": 6, "price_feed_id": "TODO-G5",
        "base_ltv_bps": 4000, "max_nectar_ltv_bps": 7000, "base_haircut_bps": 1000,
        "weekend_haircut_bps": 2500, "limit_premium_bps": 300, "pre_liq_min_bps": 6500,
        "pre_liq_max_bps": 8000, "market_session_open": false, // ignored by v2 (A2); required by the p0/v1 fixtures
        "verified_dex_depth_usd_e6": "0", "nectar_reserve_usd_e6": "0", "remote_chain": null } }))
    .await?;
    price(e, &core, 180_000_000).await?;
    e.owner
        .call(core.id(), "fund_gas_reserve")
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?
        .into_result()?;
    Ok(core)
}

async fn owner_call(e: &Env, core: &Contract, method: &str, args: Value) -> anyhow::Result<()> {
    let r = e.owner.call(core.id(), method).args_json(args).transact().await?;
    assert!(r.is_success(), "{method}: {:?}", r.failures());
    Ok(())
}

async fn price(e: &Env, core: &Contract, p: u128) -> anyhow::Result<()> {
    owner_call(e, core, "update_owner_price", json!({ "symbol": "NVDAx", "price_usd_e6": p.to_string() })).await?;
    Ok(())
}

async fn user(e: &Env, usdc: u128, nvdax: u128) -> anyhow::Result<Account> {
    let a = e.worker.dev_create_account().await?;
    for (t, amt) in [(&e.usdc, usdc), (&e.nvdax, nvdax)] {
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

async fn ft_call(token: &Contract, from: &Account, to: &AccountId, amount: u128, msg: &str) -> anyhow::Result<()> {
    let r = from
        .call(token.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": to, "amount": amount.to_string(), "msg": msg }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(300))
        .transact()
        .await?;
    assert!(r.is_success(), "ft_transfer_call {msg}: {:?}", r.failures());
    Ok(())
}

fn fund_msg(disc: u16) -> String {
    format!(r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":{disc},"notice_period_ns":"604800000000000","buyer_remote_recipient":null}}}}"#)
}
fn borrow_msg(borrow: u128) -> String {
    format!(r#"{{"LockCollateralAndBorrow":{{"collateral":"NVDAx","borrow_usd_e6":"{borrow}","pre_liq_ltv_bps":7500}}}}"#)
}

async fn view(c: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(c.view(method).args_json(args).await?.json()?)
}

async fn bal(token: &Contract, a: &AccountId) -> anyhow::Result<u128> {
    let v: String = token.view("ft_balance_of").args_json(json!({ "account_id": a })).await?.json()?;
    Ok(v.parse()?)
}

/// Every P0 view, normalised: `contract_version` (p0 -> p1), `oracle_age_s` (clock) and the additive
/// `oracle_source` field are removed.
async fn p0_views(core: &Contract, n_pos: u64) -> anyhow::Result<Value> {
    let mut cfg = view(core, "get_config", json!({})).await?;
    cfg.as_object_mut().unwrap().remove("contract_version");
    let mut cap = view(core, "get_exit_capacity", json!({ "symbol": "NVDAx" })).await?;
    cap.as_object_mut().unwrap().remove("oracle_age_s");
    cap.as_object_mut().unwrap().remove("oracle_source");
    let mut positions = Vec::new();
    for i in 0..n_pos {
        positions.push(view(core, "get_position", json!({ "position_id": i.to_string() })).await?);
        positions.push(view(core, "get_health", json!({ "position_id": i.to_string() })).await?);
    }
    Ok(json!({
        "config": cfg,
        "collateral": view(core, "get_collateral", json!({ "symbol": "NVDAx" })).await?,
        "collaterals": view(core, "list_collaterals", json!({})).await?,
        "capacity": cap,
        "quotes": view(core, "list_quotes", json!({ "symbol": "NVDAx" })).await?,
        "quote0": view(core, "get_quote", json!({ "quote_id": "0" })).await?,
        "positions_list": view(core, "list_positions", json!({})).await?,
        "positions": positions,
        "pool": view(core, "get_pool", json!({})).await?,
        "preview": view(core, "preview_borrow", json!({ "symbol": "NVDAx", "units": "1000000", "borrow_usd_e6": "50000000" })).await?,
        "owed": view(core, "get_owed_collateral", json!({ "account_id": "nobody.test.near", "symbol": "NVDAx" })).await?,
    }))
}

async fn trigger(e: &Env, core: &Contract, pos: u64) -> anyhow::Result<ExecutionFinalResult> {
    Ok(e.keeper
        .call(core.id(), "trigger_preliquidation")
        .args_json(json!({ "position_id": pos.to_string() }))
        .gas(Gas::from_tgas(300))
        .transact()
        .await?)
}

async fn stub(e: &Env) -> anyhow::Result<Contract> {
    let s = e.worker.dev_deploy(&wasm("test_stubs")).await?;
    s.call("new").transact().await?.into_result()?;
    Ok(s)
}

async fn mode(s: &Contract, m: &str, disc: i64) -> anyhow::Result<()> {
    s.call("set_mode").args_json(json!({ "mode": m, "disc_bps": disc })).transact().await?.into_result()?;
    Ok(())
}

async fn pin(e: &Env, core: &Contract, s: &Contract) -> anyhow::Result<()> {
    owner_call(e, core, "set_outlayer_account", json!({ "account_id": s.id() })).await?;
    owner_call(e, core, "set_quoter_config", json!({ "deposit_yocto": DEPOSIT.to_string(), "gas_tgas": 100,
        "max_instructions": "100000000", "max_memory_mb": 128, "max_execution_seconds": 30 })).await?;
    owner_call(e, core, "set_quoter_pin", json!({ "project_id": "nectar.testnet/nectar-quoter", "version_key": "ab".repeat(32) })).await?;
    owner_call(e, core, "set_vol_bps", json!({ "symbol": "NVDAx", "vol_bps": 420 })).await?;
    Ok(())
}

/// v1 `migrate_p0_state_then_quoter_outcomes`, v2 form: fresh v2, seed 7 positions, every P0 view answers,
/// then one trigger per quoter outcome.
#[tokio::test]
async fn v2_seed_then_quoter_outcomes() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    let v: String = core.view("contract_version").await?.json()?;
    assert_eq!(v, "2.1.0-v7");

    let lender = user(&e, 100_000_000_000, 0).await?;
    ft_call(&e.usdc, &lender, core.id(), 100_000_000_000, r#""SupplyLendingLiquidity""#).await?;
    let buyer1 = user(&e, 30_000_000_000, 0).await?;
    let buyer2 = user(&e, 20_000_000_000, 0).await?;
    ft_call(&e.usdc, &buyer1, core.id(), 30_000_000_000, &fund_msg(250)).await?;
    ft_call(&e.usdc, &buyer2, core.id(), 20_000_000_000, &fund_msg(400)).await?;
    let mut borrowers = Vec::new();
    for _ in 0..7 {
        let b = user(&e, 0, 20_000_000).await?;
        ft_call(&e.nvdax, &b, core.id(), 20_000_000, &borrow_msg(2_250_000_000)).await?;
        borrowers.push(b);
    }
    let views = p0_views(&core, 7).await?;
    assert_eq!(views["collateral"]["total_debt_usd_e6"], "15750000000", "A1: 7 x 2,250");
    assert_eq!(view(&core, "get_state_version", json!({})).await?, json!(2));
    let r = core.call("migrate").transact().await?;
    assert!(r.is_failure(), "v2 has no migrate");
    let qc = view(&core, "get_quoter_config", json!({})).await?;
    assert_eq!(qc["enabled"], false);
    assert_eq!(view(&core, "get_exit_capacity", json!({ "symbol": "NVDAx" })).await?["oracle_source"], "Owner");

    // P1: pin the quoter (stub), crash the price
    let s = stub(&e).await?;
    pin(&e, &core, &s).await?;
    price(&e, &core, 155_000_000).await?;
    price(&e, &core, 140_000_000).await?;

    // position 0: echo 65 bps -> quoter_result, legs at 65
    mode(&s, "echo", 65).await?;
    let r = trigger(&e, &core, 0).await?;
    gas("trigger+quoter(echo)", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let req = &events(&r, "quoter_requested")[0];
    let res = &events(&r, "quoter_result")[0];
    assert_eq!(req["input_sha256"], res["input_sha256"]);
    let legs = events(&r, "settled_near");
    assert!(!legs.is_empty() && legs.iter().all(|l| l["disc_bps"] == 65), "{legs:?}");
    assert_eq!(view(&core, "get_position", json!({ "position_id": "0" })).await?["status"], "Closed");
    assert!(bal(&e.nvdax, buyer1.id()).await? > 0);
    let last: Value = near_sdk::serde_json::from_str(&s.view("get_last_request").await?.json::<String>()?)?;
    assert_eq!(last["deposit"], DEPOSIT.to_string());
    assert_eq!(last["response_format"], "Json");
    assert_eq!(last["payer_account_id"], core.id().to_string());
    assert_eq!(last["source"]["Project"]["project_id"], "nectar.testnet/nectar-quoter");
    assert_eq!(last["resource_limits"]["max_instructions"], 100_000_000);
    assert_eq!(last["prepaid_gas"], 100 * TGAS);

    // positions 1..6: clamp and every fallback reason; legs always settle, position always leaves Settling
    let cases: [(&str, i64, Option<&str>, u64); 6] = [
        ("echo", 9_999, None, 250),
        ("null", 0, Some("null"), 250),
        ("badhash", 65, Some("input_sha256"), 250),
        ("unknown", 65, Some("unknown_quote"), 250),
        ("panic", 0, Some("failed"), 250),
        ("error", 0, Some("error"), 250),
    ];
    for (i, (m, d, reason, first_disc)) in cases.iter().enumerate() {
        let pos = i as u64 + 1;
        mode(&s, m, *d).await?;
        let r = trigger(&e, &core, pos).await?;
        gas(&format!("trigger+quoter({m})"), &r);
        assert!(r.is_success() || *m == "panic", "{m}: {:?}", r.failures());
        match reason {
            Some(why) => {
                let fb = events(&r, "quoter_fallback");
                assert_eq!(fb.len(), 1, "{m}");
                assert_eq!(fb[0]["reason"], *why, "{m}");
            }
            None => assert_eq!(events(&r, "quoter_result").len(), 1, "{m}"),
        }
        let legs = events(&r, "settled_near");
        assert_eq!(legs[0]["disc_bps"], *first_disc, "{m}: clamp/fallback uses max_discount_bps");
        let st = view(&core, "get_position", json!({ "position_id": pos.to_string() })).await?;
        assert_eq!(st["status"], "Closed", "{m}");
    }
    let _ = (borrowers, buyer2);
    Ok(())
}

/// Fresh V1 deploy: trigger with 8 distinct buyers -> quoter -> 8 legs + keeper + borrower release.
/// Budget: 300 Tgas attached by the keeper, every receipt < 100 Tgas burnt.
#[tokio::test]
async fn gas_trigger_quoter_eight_legs() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    assert_eq!(view(&core, "get_state_version", json!({})).await?, json!(2));
    owner_call(&e, &core, "set_reserve_params", json!({ "symbol": "NVDAx", "discount_bps": 1000 })).await?;
    let rs = user(&e, 20_000_000_000, 0).await?; // WO-23b: R_c from a real Reserve deposit
    ft_call(&e.usdc, &rs, core.id(), 20_000_000_000, r#"{"JoinNectarReserve":{"collateral":"NVDAx"}}"#).await?;
    let lender = user(&e, 50_000_000_000, 0).await?;
    ft_call(&e.usdc, &lender, core.id(), 50_000_000_000, r#""SupplyLendingLiquidity""#).await?;
    for i in 0..8u16 {
        let b = user(&e, 300_000_000, 0).await?;
        ft_call(&e.usdc, &b, core.id(), 300_000_000, &fund_msg(200 + i * 10)).await?;
    }
    let borrower = user(&e, 0, 20_000_000).await?;
    ft_call(&e.nvdax, &borrower, core.id(), 20_000_000, &borrow_msg(2_250_000_000)).await?;
    let s = stub(&e).await?;
    pin(&e, &core, &s).await?;
    mode(&s, "echo", 65).await?;
    price(&e, &core, 155_000_000).await?;
    price(&e, &core, 140_000_000).await?;

    let r = trigger(&e, &core, 0).await?;
    gas("trigger+quoter+8legs", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    assert!(r.failures().is_empty(), "every receipt succeeded: {:?}", r.failures());
    assert_eq!(events(&r, "settled_near").len(), 8);
    assert_eq!(view(&core, "get_position", json!({ "position_id": "0" })).await?["status"], "Closed");
    assert!(bal(&e.nvdax, borrower.id()).await? > 0, "release reached the borrower");
    assert!(bal(&e.nvdax, e.keeper.id()).await? > 0, "keeper fee paid");
    println!("GAS,trigger+quoter+8legs,attached,{}", 300 * TGAS);
    Ok(())
}

// ------------------------------------------------------------------ WO-10b

/// Live testnet V1 (code_hash FQjNLgawvz9KmeLioJs6fdd5GdB5JAVeEfSSZfEGTFfB).
const V1_SHA256: &str = "d617e19238877f6e2f8d6aa015c8fe0f690b174763989dbd059f114fda7b963e";
const PYTH_ID: &str = "B1073854ED24CBC755DC527418F52B7D271F6CC967BBF8D8129112B18860A593";

fn v1_wasm() -> Vec<u8> {
    let w = std::fs::read(root().join("contracts/nectar-core/tests/fixtures/nectar_core_v1.wasm")).expect("v1 wasm");
    let h: String = near_sdk::env::sha256(&w).iter().map(|b| format!("{b:02x}")).collect();
    assert_eq!(h, V1_SHA256, "fixture is the live testnet V1 wasm");
    w
}

async fn now_s(e: &Env) -> anyhow::Result<i64> {
    Ok((e.worker.view_block().await?.timestamp() / 1_000_000_000) as i64)
}

async fn pyth_body(s: &Contract, body: &str) -> anyhow::Result<()> {
    s.call("set_pyth_body").args_json(json!({ "body": body })).transact().await?.into_result()?;
    Ok(())
}

fn pyth_px(price: i64, conf: u64, expo: i32, t: i64) -> String {
    format!(r#"{{"price":"{price}","conf":"{conf}","expo":{expo},"publish_time":{t}}}"#)
}

async fn status(core: &Contract, pos: u64) -> anyhow::Result<Value> {
    Ok(view(core, "get_position", json!({ "position_id": pos.to_string() })).await?["status"].clone())
}

/// v1 `upgrade_v1_then_pyth_secrets_cancel`, v2 form (fresh v2): every Pyth outcome, quoter with secrets_ref,
/// and cancel_settlement on a position held in Settling by a never-resumed OutLayer yield.
#[tokio::test]
async fn v2_pyth_secrets_cancel() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    let lender = user(&e, 100_000_000_000, 0).await?;
    ft_call(&e.usdc, &lender, core.id(), 100_000_000_000, r#""SupplyLendingLiquidity""#).await?;
    let buyer1 = user(&e, 30_000_000_000, 0).await?;
    let buyer2 = user(&e, 20_000_000_000, 0).await?;
    ft_call(&e.usdc, &buyer1, core.id(), 30_000_000_000, &fund_msg(250)).await?;
    ft_call(&e.usdc, &buyer2, core.id(), 20_000_000_000, &fund_msg(400)).await?;
    for _ in 0..4 {
        let b = user(&e, 0, 20_000_000).await?;
        ft_call(&e.nvdax, &b, core.id(), 20_000_000, &borrow_msg(2_250_000_000)).await?;
    }
    let _ = p0_views(&core, 4).await?;
    let qc = view(&core, "get_quoter_config", json!({})).await?;
    assert_eq!(qc["secrets_ref"], Value::Null);
    assert_eq!(qc["enabled"], false);

    let pyth = stub(&e).await?;
    owner_call(&e, &core, "set_oracle_source", json!({ "symbol": "NVDAx",
        "source": { "Pyth": { "account": pyth.id(), "price_identifier": PYTH_ID } } })).await?;
    price(&e, &core, 155_000_000).await?;
    price(&e, &core, 140_000_000).await?;

    // rejections: position 0 stays Open every time
    let t = now_s(&e).await?;
    let cases = [
        // closed session, 25 h old: Pyth `get_price_no_older_than(age=86400)` returns null (F-173)
        (pyth_px(13_500_000_000, 1_000_000, -8, t - 90_000), "no_price"),
        (pyth_px(13_500_000_000, 200_000_000, -8, t), "conf_too_wide"),
        (pyth_px(9_000_000_000, 0, -8, t), "out_of_band"),
        (pyth_px(-13_500_000_000, 0, -8, t), "non_positive"),
        ("null".to_string(), "no_price"),
        ("panic".to_string(), "failed"),
    ];
    for (body, reason) in cases.iter() {
        pyth_body(&pyth, body).await?;
        let r = trigger(&e, &core, 0).await?;
        gas(&format!("trigger+pyth({reason})"), &r);
        let rej = events(&r, "oracle_rejected");
        assert_eq!(rej.len(), 1, "{reason}: {:?}", r.logs());
        assert_eq!(rej[0]["reason"], *reason);
        assert_eq!(events(&r, "settlement_aborted")[0]["reason"], "oracle_rejected");
        assert!(events(&r, "settled_near").is_empty());
        assert_eq!(status(&core, 0).await?, "Open", "{reason}");
    }
    assert_eq!(pyth.view("get_pyth_last_id").await?.json::<String>()?, PYTH_ID.to_ascii_lowercase());
    assert_eq!(pyth.view("get_pyth_last_age").await?.json::<u64>()?, 86_400, "closed-session age");

    // open session, 3 min old: rejected by age=120 (D-015), position stays Open
    // (v2 A2: the session opens from a calendar window around now while the stored price is fresh)
    price(&e, &core, 140_100_000).await?;
    let t = now_s(&e).await? as u64;
    owner_call(&e, &core, "set_session_calendar", json!({ "windows": [[
        ((t - 3_600) * 1_000_000_000).to_string(), ((t + 3_600) * 1_000_000_000).to_string()]] })).await?;
    assert_eq!(view(&core, "get_exit_capacity", json!({ "symbol": "NVDAx" })).await?["session_open"], true);
    let t = now_s(&e).await?;
    pyth_body(&pyth, &pyth_px(13_500_000_000, 1_000_000, -8, t - 180)).await?;
    let r = trigger(&e, &core, 0).await?;
    gas("trigger+pyth(open,180s)", &r);
    assert_eq!(events(&r, "oracle_rejected")[0]["reason"], "no_price", "{:?}", r.logs());
    assert_eq!(pyth.view("get_pyth_last_age").await?.json::<u64>()?, 120, "open-session age");
    assert_eq!(status(&core, 0).await?, "Open");
    owner_call(&e, &core, "set_session_calendar", json!({ "windows": [] })).await?;


    // accepted: closed session, 2 h old (expo -8 -> 135.000000), static settle
    let t = now_s(&e).await?;
    pyth_body(&pyth, &pyth_px(13_500_000_099, 1_000_000, -8, t - 7_200)).await?;
    let r = trigger(&e, &core, 0).await?;
    gas("trigger+pyth(ok)+static", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(events(&r, "oracle_updated")[0]["source"], "Pyth");
    assert!(!events(&r, "settled_near").is_empty());
    assert_eq!(status(&core, 0).await?, "Closed");
    assert_eq!(view(&core, "get_collateral", json!({ "symbol": "NVDAx" })).await?["oracle_price_usd_e6"], "135000000");

    // accepted -> quoter with secrets_ref
    let outl = stub(&e).await?;
    pin(&e, &core, &outl).await?;
    mode(&outl, "echo", 65).await?;
    owner_call(&e, &core, "set_quoter_secrets_ref",
        json!({ "secrets_ref": { "profile": "nectar-quoter", "account_id": e.owner.id() } })).await?;
    let t = now_s(&e).await?;
    pyth_body(&pyth, &pyth_px(13_500_000_000, 1_000_000, -8, t)).await?;
    let r = trigger(&e, &core, 1).await?;
    gas("trigger+pyth(ok)+quoter", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(events(&r, "quoter_result").len(), 1);
    assert!(events(&r, "settled_near").iter().all(|l| l["disc_bps"] == 65));
    assert_eq!(status(&core, 1).await?, "Closed");
    let last: Value = near_sdk::serde_json::from_str(&outl.view("get_last_request").await?.json::<String>()?)?;
    assert_eq!(last["secrets_ref"], json!({ "profile": "nectar-quoter", "account_id": e.owner.id() }));
    let reserve = view(&core, "get_gas_reserve", json!({})).await?;
    assert_eq!(reserve, view(&core, "get_config", json!({})).await?["gas_reserve_yocto"]);

    // cancel_settlement: OutLayer stub yields and never resumes -> position 2 held in Settling
    let r = e.owner.call(core.id(), "cancel_settlement").args_json(json!({ "position_id": "2" })).transact().await?;
    assert!(format!("{:?}", r.failures()).contains("position not settling"));
    mode(&outl, "hang", 0).await?;
    let t = now_s(&e).await?;
    pyth_body(&pyth, &pyth_px(13_500_000_000, 1_000_000, -8, t)).await?;
    let _pending = e.keeper.call(core.id(), "trigger_preliquidation").args_json(json!({ "position_id": "2" }))
        .gas(Gas::from_tgas(300)).transact_async().await?;
    let mut seen = false;
    for _ in 0..20 {
        e.worker.fast_forward(2).await?;
        if status(&core, 2).await? == "Settling" {
            seen = true;
            break;
        }
    }
    assert!(seen, "position 2 reached Settling");
    e.worker.fast_forward(5).await?;
    assert_eq!(status(&core, 2).await?, "Settling", "held by the unresumed yield");
    let stranger = e.worker.dev_create_account().await?;
    let r = stranger.call(core.id(), "cancel_settlement").args_json(json!({ "position_id": "2" })).transact().await?;
    assert!(format!("{:?}", r.failures()).contains("owner only"));
    let r = e.owner.call(core.id(), "cancel_settlement").args_json(json!({ "position_id": "2" })).transact().await?;
    gas("cancel_settlement", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(events(&r, "settlement_cancelled")[0]["position_id"], "2");
    assert_eq!(status(&core, 2).await?, "Open");
    e.worker.fast_forward(250).await?; // past any yield timeout: the late callback must not move it
    assert_eq!(status(&core, 2).await?, "Open");
    Ok(())
}

/// Pyth read + quoter + 8 distinct buyers (10 transfers) within 300 Tgas at the default 80 Tgas quoter
/// gas (D-015; at 100 Tgas the trigger's own budget check needs > 300 Tgas).
#[tokio::test]
async fn gas_trigger_pyth_quoter_eight_legs() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    owner_call(&e, &core, "set_reserve_params", json!({ "symbol": "NVDAx", "discount_bps": 1000 })).await?;
    let rs = user(&e, 20_000_000_000, 0).await?; // WO-23b: R_c from a real Reserve deposit
    ft_call(&e.usdc, &rs, core.id(), 20_000_000_000, r#"{"JoinNectarReserve":{"collateral":"NVDAx"}}"#).await?;
    let lender = user(&e, 50_000_000_000, 0).await?;
    ft_call(&e.usdc, &lender, core.id(), 50_000_000_000, r#""SupplyLendingLiquidity""#).await?;
    for i in 0..8u16 {
        let b = user(&e, 300_000_000, 0).await?;
        ft_call(&e.usdc, &b, core.id(), 300_000_000, &fund_msg(200 + i * 10)).await?;
    }
    let borrower = user(&e, 0, 20_000_000).await?;
    ft_call(&e.nvdax, &borrower, core.id(), 20_000_000, &borrow_msg(2_250_000_000)).await?;
    let default_gas = view(&core, "get_quoter_config", json!({})).await?["gas_tgas"].clone();
    assert_eq!(default_gas, json!(80), "default quoter gas (D-015)");
    let s = stub(&e).await?;
    pin(&e, &core, &s).await?; // pin() sets 100 for the P0-migration test; restore the default
    owner_call(&e, &core, "set_quoter_config", json!({ "deposit_yocto": DEPOSIT.to_string(), "gas_tgas": default_gas,
        "max_instructions": "100000000", "max_memory_mb": 128, "max_execution_seconds": 30 })).await?;
    mode(&s, "echo", 65).await?;
    let pyth = stub(&e).await?;
    owner_call(&e, &core, "set_oracle_source", json!({ "symbol": "NVDAx",
        "source": { "Pyth": { "account": pyth.id(), "price_identifier": PYTH_ID } } })).await?;
    price(&e, &core, 155_000_000).await?;
    let t = now_s(&e).await?;
    pyth_body(&pyth, &pyth_px(14_000_000_000, 1_000_000, -8, t)).await?;

    let r = trigger(&e, &core, 0).await?;
    gas("trigger+pyth+quoter+8legs", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(events(&r, "settled_near").len(), 8);
    assert_eq!(status(&core, 0).await?, "Closed");
    assert!(bal(&e.nvdax, borrower.id()).await? > 0);
    println!("GAS,trigger+pyth+quoter+8legs,attached,{}", 300 * TGAS);
    Ok(())
}

/// v2 is a fresh deploy (PRD §6.11, no migrate): v2 code over P0 / V1 state never misreads it.
#[tokio::test]
async fn v2_code_over_v1_state_fails_closed() -> anyhow::Result<()> {
    let e = env().await?;
    for (label, code) in [("p0", p0_wasm()), ("v1", v1_wasm())] {
        let core = init_core(&e, &code).await?;
        let lender = user(&e, 1_000_000_000, 0).await?;
        ft_call(&e.usdc, &lender, core.id(), 1_000_000_000, r#""SupplyLendingLiquidity""#).await?;
        core.as_account().deploy(&wasm("nectar_core")).await?.into_result()?;
        assert!(core.view("get_config").await.is_err(), "{label}: v2 cannot read the v1 root");
        let r = core
            .call("new")
            .args_json(json!({ "owner": e.owner.id(), "usdc_token": e.usdc.id(), "keeper": e.keeper.id() }))
            .transact()
            .await?;
        assert!(r.is_failure(), "{label}: new refuses an initialised account");
        println!("V2_OVER_V1,{label},views_fail,true,new_refused,true");
    }
    Ok(())
}
