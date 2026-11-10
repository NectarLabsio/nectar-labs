//! P2 sandbox tests (WO-15): live V1c wasm (tests/fixtures/nectar_core_v1c.wasm, sha256 fa2bb4f1...) -> this
//! build with no migrate, then the Chain Signatures leg against the signer stub in contracts/test-stubs (yields
//! like `v1.signer-prod.testnet` and resumes with a real Ed25519 signature from a local test key over the exact
//! preimage bytes). The signature is verified off-chain here against the stub's public key.
//! Gas lines: `GAS,<label>,<receipt executor>,<gas burnt>` (run with --nocapture).

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use ed25519_dalek::{Signature, VerifyingKey};
use near_sdk::serde_json::{Value, json};
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, AccountId, Contract, Worker};

const V1C_SHA256: &str = "fa2bb4f18192eddb87320417a085b92912e1f16178fb61824f932d939be90f4e";
const TGAS: u64 = 1_000_000_000_000;
const VAULT: &str = "Nectar1Vau1t11111111111111111111111111111111";
const RCPT: &str = "3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV";
const TX: &str = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
const DEPOSIT: u128 = 4_000_010_000_000_000_000_000; // F-046 estimate
const PYTH_ID: &str = "B1073854ED24CBC755DC527418F52B7D271F6CC967BBF8D8129112B18860A593";
/// Live MPC requirement (F-034); the stub fits in it too.
const SIGN_TGAS: u64 = 15;

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

fn hexs(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}
fn unhex(s: &str) -> Vec<u8> {
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}

fn v1c_wasm() -> Vec<u8> {
    let w = std::fs::read(root().join("contracts/nectar-core/tests/fixtures/nectar_core_v1c.wasm")).expect("v1c wasm");
    assert_eq!(hexs(&near_sdk::env::sha256(&w)), V1C_SHA256, "fixture is the live testnet V1c wasm (WO-10c)");
    w
}

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

async fn owner_call(e: &Env, core: &Contract, method: &str, args: Value) -> anyhow::Result<()> {
    let r = e.owner.call(core.id(), method).args_json(args).transact().await?;
    assert!(r.is_success(), "{method}: {:?}", r.failures());
    Ok(())
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
        "pre_liq_max_bps": 8000, "market_session_open": false,
        "verified_dex_depth_usd_e6": "0", "nectar_reserve_usd_e6": "0", "remote_chain": null } }))
    .await?;
    price(e, &core, 180_000_000).await?;
    e.owner.call(core.id(), "fund_gas_reserve").deposit(NearToken::from_millinear(50)).transact().await?.into_result()?;
    Ok(core)
}

async fn price(e: &Env, core: &Contract, p: u128) -> anyhow::Result<()> {
    owner_call(e, core, "update_owner_price", json!({ "symbol": "NVDAx", "price_usd_e6": p.to_string() })).await
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

fn fund_msg(disc: u16, remote: bool) -> String {
    let r = if remote { format!("\"{RCPT}\"") } else { "null".into() };
    format!(r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":{disc},"notice_period_ns":"604800000000000","buyer_remote_recipient":{r}}}}}"#)
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
async fn status(core: &Contract, pos: u64) -> anyhow::Result<Value> {
    Ok(view(core, "get_position", json!({ "position_id": pos.to_string() })).await?["status"].clone())
}
async fn pending(core: &Contract, pos: u64) -> anyhow::Result<Value> {
    view(core, "get_pending_settlement", json!({ "position_id": pos.to_string() })).await
}

async fn trigger(e: &Env, core: &Contract, pos: u64) -> anyhow::Result<ExecutionFinalResult> {
    let st = e.keeper
        .call(core.id(), "trigger_preliquidation")
        .args_json(json!({ "position_id": pos.to_string() }))
        .gas(Gas::from_tgas(300))
        // async + poll: the yield/resume chain outlives broadcast_tx_commit, whose timeout makes
        // near-workspaces re-send the trigger (the re-sent tx then fails "position not open")
        .transact_async()
        .await?;
    // the tx status is final once the trigger receipt is; wait for the detached sign chain, then read it
    for _ in 0..120 {
        let d = view(core, "get_pending_settlement", json!({ "position_id": pos.to_string() })).await?;
        if d["status"] != "AwaitingSignature" && !(d.is_null() && settling(core, pos).await?) {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    std::thread::sleep(std::time::Duration::from_secs(4)); // keeper ft_transfer + on_payout after on_signature
    Ok(st.await?)
}
async fn settling(core: &Contract, pos: u64) -> anyhow::Result<bool> {
    Ok(view(core, "get_position", json!({ "position_id": pos.to_string() })).await?["status"] == "Settling")
}
async fn relay(e: &Env, core: &Contract, pos: u64, sig: &str) -> anyhow::Result<ExecutionFinalResult> {
    Ok(e.keeper
        .call(core.id(), "relay_settlement_result")
        .args_json(json!({ "position_id": pos.to_string(), "solana_tx_sig": sig }))
        .transact()
        .await?)
}

async fn stub(e: &Env) -> anyhow::Result<Contract> {
    let s = e.worker.dev_deploy(&wasm("test_stubs")).await?;
    s.call("new").transact().await?.into_result()?;
    Ok(s)
}

async fn chain(e: &Env, core: &Contract, signer: &Contract) -> anyhow::Result<()> {
    owner_call(e, core, "set_remote_chain", json!({ "symbol": "NVDAx",
        "remote_chain": { "chain_id": "solana-devnet", "vault_program": VAULT, "mpc_domain_id": 1 } })).await?;
    owner_call(e, core, "set_signer_config", json!({ "account": signer.id(), "path": "solana-devnet-v1",
        "gas_tgas": SIGN_TGAS, "expiry_s": 3600 })).await
}

/// buyer1 $10k @250 remote, buyer2 $5k @400 NEAR, borrower 100 NVDAx / $11,250.
async fn seed(e: &Env, core: &Contract) -> anyhow::Result<(Account, Account, Account)> {
    let lender = user(e, 100_000_000_000, 0).await?;
    ft_call(&e.usdc, &lender, core.id(), 100_000_000_000, r#""SupplyLendingLiquidity""#).await?;
    let b1 = user(e, 10_000_000_000, 0).await?;
    let b2 = user(e, 5_000_000_000, 0).await?;
    ft_call(&e.usdc, &b1, core.id(), 10_000_000_000, &fund_msg(250, true)).await?;
    ft_call(&e.usdc, &b2, core.id(), 5_000_000_000, &fund_msg(400, false)).await?;
    let borrower = user(e, 0, 100_000_000).await?;
    ft_call(&e.nvdax, &borrower, core.id(), 100_000_000, &borrow_msg(11_250_000_000)).await?;
    Ok((b1, b2, borrower))
}

async fn snapshot(core: &Contract) -> anyhow::Result<Value> {
    let mut cfg = view(core, "get_config", json!({})).await?;
    cfg.as_object_mut().unwrap().remove("contract_version");
    let mut cap = view(core, "get_exit_capacity", json!({ "symbol": "NVDAx" })).await?;
    cap.as_object_mut().unwrap().remove("oracle_age_s");
    Ok(json!({
        "config": cfg, "capacity": cap,
        "collateral": view(core, "get_collateral", json!({ "symbol": "NVDAx" })).await?,
        "quotes": view(core, "list_quotes", json!({ "symbol": "NVDAx" })).await?,
        "positions": view(core, "list_positions", json!({})).await?,
        "health": view(core, "get_health", json!({ "position_id": "0" })).await?,
        "pool": view(core, "get_pool", json!({})).await?,
        "quoter": view(core, "get_quoter_config", json!({})).await?,
        "oracle": view(core, "get_oracle_source", json!({ "symbol": "NVDAx" })).await?,
    }))
}

fn verify(pk_hex: &str, d: &Value) {
    let pk = VerifyingKey::from_bytes(&unhex(pk_hex).try_into().unwrap()).unwrap();
    let sig = Signature::from_bytes(&unhex(d["signature_hex"].as_str().unwrap()).try_into().unwrap());
    pk.verify_strict(d["preimage"].as_str().unwrap().as_bytes(), &sig).expect("Ed25519 over the raw preimage");
}

/// v1 `upgrade_v1c_then_remote_leg_signed_and_relayed`, v2 form: the live V1c fixture state cannot be read by
/// v2 code (fresh deploy, PRD §6.11); then on a fresh v2: trigger -> sign -> on_signature -> relay.
#[tokio::test]
async fn v2_remote_leg_signed_and_relayed() -> anyhow::Result<()> {
    let e = env().await?;
    let old = init_core(&e, &v1c_wasm()).await?;
    old.as_account().deploy(&wasm("nectar_core")).await?.into_result()?;
    assert!(old.view("get_config").await.is_err(), "v2 code over V1c state fails closed");
    let core = init_core(&e, &wasm("nectar_core")).await?;
    let (b1, b2, borrower) = seed(&e, &core).await?;
    let _ = snapshot(&core).await?;
    assert_eq!(view(&core, "get_state_version", json!({})).await?, json!(2));
    let v: String = view(&core, "contract_version", json!({})).await?.as_str().unwrap().into();
    assert_eq!(v, "2.0.0-v7");


    let signer = stub(&e).await?;
    chain(&e, &core, &signer).await?;
    let hint = view(&core, "get_vault_authority_hint", json!({})).await?;
    assert_eq!(hint["path"], "solana-devnet-v1");
    assert_eq!(hint["predecessor"], json!(core.id()));
    price(&e, &core, 155_000_000).await?;
    price(&e, &core, 140_000_000).await?;

    let r = trigger(&e, &core, 0).await?;
    gas("trigger+sign(1 remote, 1 near)", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(events(&r, "settled_near").len(), 1);
    let req = events(&r, "settlement_sign_requested");
    let signed = events(&r, "settlement_signed");
    assert_eq!((req.len(), signed.len()), (1, 1));
    let d = pending(&core, 0).await?;
    assert_eq!(d["status"], "Signed");
    assert_eq!(d["preimage"], req[0]["preimage"]);
    assert_eq!(d["signature_hex"], signed[0]["signature_hex"]);
    assert!(d["preimage"].as_str().unwrap().contains(&format!("|recipient={RCPT}|nonce=0|")));
    let pk: String = view(&signer, "signer_public_key_hex", json!({})).await?.as_str().unwrap().into();
    verify(&pk, &d);
    let last: Value = near_sdk::serde_json::from_str(view(&signer, "get_last_sign_request", json!({})).await?.as_str().unwrap())?;
    assert_eq!(last["path"], "solana-devnet-v1");
    assert_eq!(last["domain_id"], 1);
    assert_eq!(last["payload_v2"]["Eddsa"], json!(hexs(d["preimage"].as_str().unwrap().as_bytes())), "raw preimage, no pre-hash (D-016)");
    assert_eq!(status(&core, 0).await?, "Settling");
    assert_eq!(bal(&e.nvdax, b1.id()).await?, 0, "remote leg: no NVDAx on NEAR");
    assert!(bal(&e.nvdax, b2.id()).await? > 0);
    assert!(bal(&e.nvdax, e.keeper.id()).await? > 0);
    assert!(bal(&e.nvdax, borrower.id()).await? > 0, "residual released");
    assert_eq!(view(&core, "get_next_nonce", json!({})).await?, json!("1"));

    let r = relay(&e, &core, 0, TX).await?;
    gas("relay_settlement_result", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(events(&r, "settlement_relayed").len(), 1);
    assert_eq!(status(&core, 0).await?, "Closed");
    assert_eq!(pending(&core, 0).await?["solana_tx_sig"], TX);
    let r = relay(&e, &core, 0, TX).await?;
    assert!(format!("{:?}", r.failures()).contains("settlement not signed"));
    Ok(())
}

/// Sign failure (stub resumes with the timeout marker) rolls the leg back; retry signs with nonce 1;
/// owner cancel of a signed leg keeps the signature and the relay still records.
#[tokio::test]
async fn sign_failure_rolls_back_then_retry_and_cancel() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    let (b1, _b2, _borrower) = seed(&e, &core).await?;
    let signer = stub(&e).await?;
    chain(&e, &core, &signer).await?;
    price(&e, &core, 155_000_000).await?;
    price(&e, &core, 140_000_000).await?;
    signer.call("set_signer_mode").args_json(json!({ "mode": "fail" })).transact().await?.into_result()?;

    let r = trigger(&e, &core, 0).await?;
    gas("trigger+sign_failed", &r);
    let failed = events(&r, "settlement_sign_failed");
    assert_eq!(failed.len(), 1, "{:?}", r.logs());
    assert_eq!(failed[0]["reason"], "failed");
    assert_eq!(status(&core, 0).await?, "Open");
    assert_eq!(pending(&core, 0).await?["status"], "SignFailed");
    assert_eq!(view(&core, "get_quote", json!({ "quote_id": "0" })).await?["remaining_usd_e6"], "10000000000");
    let p = view(&core, "get_position", json!({ "position_id": "0" })).await?;
    assert_eq!(p["debt_usd_e6"], "10000000000");
    assert_eq!(bal(&e.nvdax, b1.id()).await?, 0);

    signer.call("set_signer_mode").args_json(json!({ "mode": "ok" })).transact().await?.into_result()?;
    let r = trigger(&e, &core, 0).await?;
    gas("retrigger+sign", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let d = pending(&core, 0).await?;
    assert_eq!((d["status"].clone(), d["nonce"].clone()), (json!("Signed"), json!("1")));
    let pk: String = view(&signer, "signer_public_key_hex", json!({})).await?.as_str().unwrap().into();
    verify(&pk, &d);

    owner_call(&e, &core, "cancel_settlement", json!({ "position_id": "0" })).await?;
    assert_eq!(status(&core, 0).await?, "Open");
    assert_eq!(pending(&core, 0).await?["status"], "Signed");
    let r = relay(&e, &core, 0, TX).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(status(&core, 0).await?, "Closed");
    Ok(())
}

/// Pyth + OutLayer quoter + MPC sign + callbacks in one 300 Tgas trigger (D-015 budget + sign leg), 4 legs.
#[tokio::test]
async fn gas_trigger_pyth_quoter_sign() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    let lender = user(&e, 50_000_000_000, 0).await?;
    ft_call(&e.usdc, &lender, core.id(), 50_000_000_000, r#""SupplyLendingLiquidity""#).await?;
    for i in 0..5u16 {
        let b = user(&e, 3_000_000_000, 0).await?;
        ft_call(&e.usdc, &b, core.id(), 3_000_000_000, &fund_msg(200 + i * 10, i == 0)).await?;
    }
    let borrower = user(&e, 0, 100_000_000).await?;
    ft_call(&e.nvdax, &borrower, core.id(), 100_000_000, &borrow_msg(11_250_000_000)).await?;
    let s = stub(&e).await?; // one stub wasm plays OutLayer, Pyth and the MPC signer
    owner_call(&e, &core, "set_outlayer_account", json!({ "account_id": s.id() })).await?;
    owner_call(&e, &core, "set_quoter_config", json!({ "deposit_yocto": DEPOSIT.to_string(), "gas_tgas": 80,
        "max_instructions": "100000000", "max_memory_mb": 128, "max_execution_seconds": 30 })).await?;
    owner_call(&e, &core, "set_quoter_pin", json!({ "project_id": "nectar.testnet/nectar-quoter", "version_key": "ab".repeat(32) })).await?;
    owner_call(&e, &core, "set_vol_bps", json!({ "symbol": "NVDAx", "vol_bps": 420 })).await?;
    s.call("set_mode").args_json(json!({ "mode": "echo", "disc_bps": 65 })).transact().await?.into_result()?;
    owner_call(&e, &core, "set_oracle_source", json!({ "symbol": "NVDAx",
        "source": { "Pyth": { "account": s.id(), "price_identifier": PYTH_ID } } })).await?;
    chain(&e, &core, &s).await?;
    price(&e, &core, 155_000_000).await?;
    let t = (e.worker.view_block().await?.timestamp() / 1_000_000_000) as i64;
    let px = format!(r#"{{"price":"14000000000","conf":"1000000","expo":-8,"publish_time":{t}}}"#);
    s.call("set_pyth_body").args_json(json!({ "body": px })).transact().await?.into_result()?;

    let r = trigger(&e, &core, 0).await?;
    gas("trigger+pyth+quoter+sign+4legs", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(events(&r, "quoter_result").len(), 1);
    assert_eq!(events(&r, "settled_near").len(), 3);
    assert_eq!(events(&r, "settlement_signed").len(), 1);
    assert_eq!(status(&core, 0).await?, "Settling");
    println!("GAS,trigger+pyth+quoter+sign+4legs,attached,{}", 300 * TGAS);
    Ok(())
}
