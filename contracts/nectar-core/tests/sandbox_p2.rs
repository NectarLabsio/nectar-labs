//! P2 sandbox tests (WO-15, WO-21 remote lifecycle): live V1c wasm fails closed under v2, then the remote lifecycle
//! (reserve, derived_public_key, OutLayer vault_read, keeper attestation, settle and release signed with the position
//! path) against contracts/test-stubs (MPC signer stub with per-path keys, yield/resume, real Ed25519; OutLayer stub).
//! Signatures are verified off-chain against the key the stub derives for `solana-devnet/pos/<id>` over the exact
//! bytes the vault rebuilds.
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
/// Live MPC requirement (F-034); the stub fits in it too.
const SIGN_TGAS: u64 = 15;
/// WO-23a: 0.05 NEAR reservation deposit (refunded).
const RESERVE_DEPOSIT: u128 = 50_000_000_000_000_000_000_000;

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

async fn view(c: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(c.view(method).args_json(args).await?.json()?)
}
async fn bal(token: &Contract, a: &AccountId) -> anyhow::Result<u128> {
    let v: String = token.view("ft_balance_of").args_json(json!({ "account_id": a })).await?.json()?;
    Ok(v.parse()?)
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


const SEC: u64 = 1_000_000_000;
const DEPOSITOR: &str = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const UNITS: u128 = 100_000_000;
const BORROW: u128 = 11_250_000_000;

async fn stub(e: &Env) -> anyhow::Result<Contract> {
    let s = e.worker.dev_deploy(&wasm("test_stubs")).await?;
    s.call("new").transact().await?.into_result()?;
    Ok(s)
}

/// One stub wasm plays the MPC signer and OutLayer (`vault_read` answers = `raw` body).
async fn chain(e: &Env, core: &Contract, s: &Contract) -> anyhow::Result<()> {
    owner_call(e, core, "set_remote_chain", json!({ "symbol": "NVDAx",
        "remote_chain": { "chain_id": "solana-devnet", "vault_program": VAULT, "mpc_domain_id": 1 } })).await?;
    owner_call(e, core, "set_signer_config", json!({ "account": s.id(), "path": "solana-devnet-v1",
        "gas_tgas": SIGN_TGAS, "expiry_s": 3600 })).await?;
    owner_call(e, core, "set_outlayer_account", json!({ "account_id": s.id() })).await?;
    owner_call(e, core, "set_vault_read_config", json!({ "project_id": "nectar.testnet/vault-read",
        "version_key": "ab".repeat(32), "deposit_yocto": DEPOSIT.to_string(), "gas_tgas": 50 })).await
}

/// Lender $100k; buyer1 $12k @250 with a Solana recipient; buyer2 $5k @400 NEAR-only.
async fn seed(e: &Env, core: &Contract) -> anyhow::Result<Account> {
    let lender = user(e, 100_000_000_000, 0).await?;
    ft_call(&e.usdc, &lender, core.id(), 100_000_000_000, r#""SupplyLendingLiquidity""#).await?;
    let b1 = user(e, 12_000_000_000, 0).await?;
    let b2 = user(e, 5_000_000_000, 0).await?;
    ft_call(&e.usdc, &b1, core.id(), 12_000_000_000, &fund_msg(250, true)).await?;
    ft_call(&e.usdc, &b2, core.id(), 5_000_000_000, &fund_msg(400, false)).await?;
    Ok(b1)
}

async fn reserve(_e: &Env, core: &Contract, borrower: &Account) -> anyhow::Result<(u64, ExecutionFinalResult)> {
    let r = borrower
        .call(core.id(), "reserve_remote_position")
        .args_json(json!({ "collateral": "NVDAx", "units": UNITS.to_string(), "borrow_usd_e6": BORROW.to_string(),
                           "pre_liq_ltv_bps": 7500 }))
        .gas(Gas::from_tgas(100))
        .deposit(NearToken::from_yoctonear(RESERVE_DEPOSIT))
        .transact()
        .await?;
    assert!(r.is_success() && r.failures().is_empty(), "reserve: {:?}", r.failures());
    let id: String = r.clone().json()?;
    Ok((id.parse()?, r))
}

fn vault_body(id: u64, units: u128, authority: &str) -> String {
    format!(r#"{{"position_id":"{id}","units":"{units}","authority":"{authority}","depositor":"{DEPOSITOR}","slot_or_block":412345678}}"#)
}

async fn confirm(e: &Env, core: &Contract, s: &Contract, id: u64, body: &str) -> anyhow::Result<ExecutionFinalResult> {
    s.call("set_mode").args_json(json!({ "mode": "raw", "body": body })).transact().await?.into_result()?;
    Ok(e.keeper
        .call(core.id(), "confirm_remote_deposit")
        .args_json(json!({ "position_id": id.to_string() }))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?)
}

async fn position(core: &Contract, id: u64) -> anyhow::Result<Value> {
    view(core, "get_position", json!({ "position_id": id.to_string() })).await
}

/// Key the signer derives for `path` with nectar-core as predecessor (the stub's per-path derivation).
async fn derived_key(s: &Contract, core: &Contract, path: &str) -> anyhow::Result<VerifyingKey> {
    let k: String = view(s, "derived_public_key", json!({ "path": path, "predecessor": core.id(), "domain_id": 1 })).await?
        .as_str()
        .unwrap()
        .into();
    let b = nectar_core::chainsig::b58_decode(k.strip_prefix("ed25519:").unwrap()).unwrap();
    Ok(VerifyingKey::from_bytes(&b.try_into().unwrap())?)
}

/// Off-chain check: the signature verifies against the position key over the exact message bytes.
fn verify_with(pk: &VerifyingKey, message: &str, sig_hex: &str) {
    let sig = Signature::from_bytes(&unhex(sig_hex).try_into().unwrap());
    pk.verify_strict(message.as_bytes(), &sig).expect("Ed25519 over the raw message");
}

/// reserve -> authority; confirm through OutLayer (borrow paid). Returns (core, stub, borrower, id).
async fn open_remote(e: &Env) -> anyhow::Result<(Contract, Contract, Account, u64)> {
    let core = init_core(e, &wasm("nectar_core")).await?;
    seed(e, &core).await?;
    let s = stub(e).await?;
    chain(e, &core, &s).await?;
    let borrower = user(e, 0, 0).await?;
    let (id, r) = reserve(e, &core, &borrower).await?;
    gas("reserve_remote_position+derived_public_key", &r);
    let auth = position(&core, id).await?["remote"]["authority"].as_str().unwrap().to_string();
    assert!(auth.starts_with("ed25519:"));
    let r = confirm(e, &core, &s, id, &vault_body(id, UNITS, &auth)).await?;
    gas("confirm_remote_deposit+vault_read+payout", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(events(&r, "remote_deposit_confirmed")[0]["source"], "outlayer");
    Ok((core, s, borrower, id))
}

async fn release(e: &Env, core: &Contract, id: u64) -> anyhow::Result<ExecutionFinalResult> {
    let st = e.keeper
        .call(core.id(), "request_remote_release")
        .args_json(json!({ "position_id": id.to_string() }))
        .gas(Gas::from_tgas(100))
        .transact_async()
        .await?;
    for _ in 0..120 {
        let d = view(core, "get_pending_release", json!({ "position_id": id.to_string() })).await?;
        if !d.is_null() && d["status"] != "AwaitingSignature" {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    Ok(st.await?)
}

/// v2 code over the live V1c state fails closed; then the happy path on a fresh v2: reserve -> confirm (borrow
/// paid) -> price drop -> settle signed with the position's path (`|kind=PRELIQ`) -> relay -> Closed.
#[tokio::test]
async fn remote_reserve_confirm_borrow_settle_signed_with_position_path() -> anyhow::Result<()> {
    let e = env().await?;
    let old = init_core(&e, &v1c_wasm()).await?;
    old.as_account().deploy(&wasm("nectar_core")).await?.into_result()?;
    assert!(old.view("get_config").await.is_err(), "v2 code over V1c state fails closed");
    let (core, s, borrower, id) = open_remote(&e).await?;
    assert_eq!(view(&core, "contract_version", json!({})).await?, json!("2.1.0-v7"));
    let p = position(&core, id).await?;
    assert_eq!((p["remote"]["status"].clone(), p["debt_usd_e6"].clone()), (json!("Open"), json!(BORROW.to_string())));
    assert!(bal(&e.usdc, borrower.id()).await? > 0, "borrow paid after the attested read");
    let hint = view(&core, "get_vault_authority_hint", json!({ "position_id": id.to_string() })).await?;
    assert_eq!(hint["path"], "solana-devnet/pos/0");

    price(&e, &core, 155_000_000).await?;
    price(&e, &core, 140_000_000).await?;
    let r = trigger(&e, &core, id).await?;
    gas("trigger+sign(remote position)", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert!(events(&r, "settled_near").is_empty());
    let d = pending(&core, id).await?;
    assert_eq!(d["status"], "Signed");
    let pre = d["preimage"].as_str().unwrap();
    assert!(pre.starts_with(&format!("NECTAR_SETTLE_V1|chain=solana-devnet|program={VAULT}|pos=0|quote=0|repay_e6={BORROW}|")));
    assert!(pre.ends_with("|kind=PRELIQ") && pre.contains(&format!("|recipient={RCPT}|nonce=0|")));
    let last: Value = near_sdk::serde_json::from_str(view(&s, "get_last_sign_request", json!({})).await?.as_str().unwrap())?;
    assert_eq!((last["path"].clone(), last["domain_id"].clone()), (json!("solana-devnet/pos/0"), json!(1)));
    assert_eq!(last["payload_v2"]["Eddsa"], json!(hexs(pre.as_bytes())), "raw preimage, no pre-hash (D-016)");
    let pk = derived_key(&s, &core, "solana-devnet/pos/0").await?;
    verify_with(&pk, pre, d["signature_hex"].as_str().unwrap());
    let global: String = view(&s, "signer_public_key_hex", json!({})).await?.as_str().unwrap().into();
    assert_ne!(hexs(pk.as_bytes()), global, "not the v1 global path key");
    assert_eq!(position(&core, id).await?["remote"]["status"], "Settling");

    let r = relay(&e, &core, id, TX).await?;
    gas("relay_settlement_result", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let p = position(&core, id).await?;
    assert_eq!((p["status"].clone(), p["remote"]["status"].clone()), (json!("Closed"), json!("Closed")));
    Ok(())
}

/// reserve -> confirm -> release before repay refused -> repay -> release signed (verified off-chain over the
/// vault's exact string) -> relay -> a replayed release request and a replayed relay are refused.
#[tokio::test]
async fn remote_repay_then_release_signed_and_replay_refused() -> anyhow::Result<()> {
    let e = env().await?;
    let (core, s, borrower, id) = open_remote(&e).await?;
    let r = e.keeper.call(core.id(), "request_remote_release").args_json(json!({ "position_id": "0" }))
        .gas(Gas::from_tgas(100)).transact().await?;
    assert!(format!("{:?}", r.failures()).contains("debt outstanding"));

    e.owner.call(e.usdc.id(), "mint").args_json(json!({ "account_id": borrower.id(), "amount": BORROW.to_string() }))
        .transact().await?.into_result()?;
    ft_call(&e.usdc, &borrower, core.id(), BORROW, r#"{"Repay":{"position_id":"0"}}"#).await?;
    let p = position(&core, id).await?;
    assert_eq!((p["debt_usd_e6"].clone(), p["status"].clone()), (json!("0"), json!("Open")));
    assert_eq!(bal(&e.nvdax, borrower.id()).await?, 0, "remote collateral is not released on NEAR");

    let r = release(&e, &core, id).await?;
    gas("request_remote_release+sign", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    let d = view(&core, "get_pending_release", json!({ "position_id": "0" })).await?;
    assert_eq!(d["status"], "Signed");
    let msg = d["message"].as_str().unwrap();
    let want = format!("NECTAR_RELEASE_V1|chain=solana-devnet|vault={VAULT}|pos=0|recipient={DEPOSITOR}|nonce=0|expires={}",
        d["expires"].as_str().unwrap());
    assert_eq!(msg, want);
    verify_with(&derived_key(&s, &core, "solana-devnet/pos/0").await?, msg, d["signature_hex"].as_str().unwrap());
    let last: Value = near_sdk::serde_json::from_str(view(&s, "get_last_sign_request", json!({})).await?.as_str().unwrap())?;
    assert_eq!(last["path"], "solana-devnet/pos/0");
    let again = e.keeper.call(core.id(), "request_remote_release").args_json(json!({ "position_id": "0" }))
        .gas(Gas::from_tgas(100)).transact().await?;
    assert!(format!("{:?}", again.failures()).contains("release pending"));

    let relay_rel = |sig: &'static str| {
        e.keeper.call(core.id(), "relay_release_result").args_json(json!({ "position_id": "0", "solana_tx_sig": sig })).transact()
    };
    let r = relay_rel(TX).await?;
    gas("relay_release_result", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let p = position(&core, id).await?;
    assert_eq!((p["status"].clone(), p["remote"]["status"].clone()), (json!("Closed"), json!("Closed")));
    assert!(format!("{:?}", relay_rel(TX).await?.failures()).contains("release not signed"));
    let again = e.keeper.call(core.id(), "request_remote_release").args_json(json!({ "position_id": "0" }))
        .gas(Gas::from_tgas(100)).transact().await?;
    assert!(format!("{:?}", again.failures()).contains("remote position closed"));
    Ok(())
}

/// Forged attestation (wrong authority) and units below reserved are refused with no payout; keeper attestation
/// is refused while the flag is off, accepted once on; an unconfirmed reservation expires after 30 min.
#[tokio::test]
async fn remote_refusals_attestation_and_expiry() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    seed(&e, &core).await?;
    let s = stub(&e).await?;
    chain(&e, &core, &s).await?;
    let borrower = user(&e, 0, 0).await?;
    let (id, _) = reserve(&e, &core, &borrower).await?;
    let auth = position(&core, id).await?["remote"]["authority"].as_str().unwrap().to_string();

    let r = confirm(&e, &core, &s, id, &vault_body(id, UNITS, &format!("ed25519:{RCPT}"))).await?;
    assert_eq!(events(&r, "remote_deposit_rejected")[0]["reason"], "authority_mismatch");
    assert_eq!(bal(&e.usdc, borrower.id()).await?, 0, "forged attestation pays nothing");
    advance(&e, 31).await?;
    let r = confirm(&e, &core, &s, id, &vault_body(id, UNITS - 1, &auth)).await?;
    gas("confirm_remote_deposit(rejected)", &r);
    assert_eq!(events(&r, "remote_deposit_rejected")[0]["reason"], "units_below_reserved");
    assert_eq!(position(&core, id).await?["remote"]["status"], "AwaitingDeposit");

    let attest = || {
        e.keeper.call(core.id(), "keeper_attest_deposit")
            .args_json(json!({ "position_id": id.to_string(), "tx_ref": TX, "depositor": DEPOSITOR }))
            .gas(Gas::from_tgas(100))
            .transact()
    };
    assert!(format!("{:?}", attest().await?.failures()).contains("keeper attestation disabled"));
    owner_call(&e, &core, "set_allow_keeper_deposit_attestation", json!({ "allow": true })).await?;
    let r = attest().await?;
    gas("keeper_attest_deposit+payout", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(events(&r, "remote_deposit_confirmed")[0]["source"], "keeper");
    assert!(bal(&e.usdc, borrower.id()).await? > 0);

    // a second reservation nobody deposits for: expiry refused early, accepted after 30 min
    let (id2, _) = reserve(&e, &core, &borrower).await?;
    let expire = || e.worker.dev_create_account();
    let anyone = expire().await?;
    let r = anyone.call(core.id(), "expire_remote_reservation").args_json(json!({ "position_id": id2.to_string() })).transact().await?;
    assert!(format!("{:?}", r.failures()).contains("reservation not expired"));
    advance(&e, 1801).await?;
    let r = anyone.call(core.id(), "expire_remote_reservation").args_json(json!({ "position_id": id2.to_string() })).transact().await?;
    gas("expire_remote_reservation", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let p = position(&core, id2).await?;
    assert_eq!((p["status"].clone(), p["remote"]["status"].clone()), (json!("Closed"), json!("Expired")));
    Ok(())
}

async fn near_balance(a: &Account) -> anyhow::Result<u128> {
    Ok(a.view_account().await?.balance.as_yoctonear())
}

/// WO-23a: a reservation needs 0.05 NEAR (less refused); it is refunded exactly on confirm and on expiry. Then a
/// Profit-Lock on the confirmed remote position signs `|kind=SELF` with the position path (model `self_remote_11250`),
/// verified off-chain, and the treasury receives the 50 bps fee once signed.
#[tokio::test]
async fn remote_reservation_deposit_refunds_and_self_settle_kind_self() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    seed(&e, &core).await?;
    let s = stub(&e).await?;
    chain(&e, &core, &s).await?;
    let borrower = user(&e, 0, 0).await?;
    let r = borrower.call(core.id(), "reserve_remote_position")
        .args_json(json!({ "collateral": "NVDAx", "units": UNITS.to_string(), "borrow_usd_e6": BORROW.to_string(),
                           "pre_liq_ltv_bps": 7500 }))
        .deposit(NearToken::from_yoctonear(RESERVE_DEPOSIT - 1)).gas(Gas::from_tgas(100)).transact().await?;
    assert!(format!("{:?}", r.failures()).contains("attach the reservation deposit"));

    let (id, _) = reserve(&e, &core, &borrower).await?;
    let auth = position(&core, id).await?["remote"]["authority"].as_str().unwrap().to_string();
    let before = near_balance(&borrower).await?;
    let r = confirm(&e, &core, &s, id, &vault_body(id, UNITS, &auth)).await?;
    gas("confirm_remote_deposit+refund", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(events(&r, "reservation_deposit_refunded")[0]["reason"], "confirmed");
    assert_eq!(events(&r, "reservation_deposit_refunded")[0]["amount_yocto"], RESERVE_DEPOSIT.to_string());
    // >=: the reserve tx gas refund (to its signer, the borrower) can land in the same window
    assert!(near_balance(&borrower).await? - before >= RESERVE_DEPOSIT, "refunded on confirm");

    let other = user(&e, 0, 0).await?;
    let (id2, _) = reserve(&e, &core, &other).await?;
    advance(&e, 1801).await?;
    let before = near_balance(&other).await?;
    let r = e.keeper.call(core.id(), "expire_remote_reservation").args_json(json!({ "position_id": id2.to_string() }))
        .transact().await?;
    gas("expire_remote_reservation+refund", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(events(&r, "reservation_deposit_refunded")[0]["account_id"], other.id().to_string());
    assert!(near_balance(&other).await? - before >= RESERVE_DEPOSIT, "refunded on expiry (to the borrower)");

    // Profit-Lock on the remote position (price refreshed after the clock advance)
    price(&e, &core, 180_000_000).await?;
    let b3 = user(&e, 12_000_000_000, 0).await?;
    let m = format!(r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":200,"notice_period_ns":"604800000000000","buyer_remote_recipient":"{RCPT}","accepts_voluntary_fills":true}}}}"#);
    ft_call(&e.usdc, &b3, core.id(), 12_000_000_000, &m).await?;
    owner_call(&e, &core, "set_max_voluntary_fill", json!({ "symbol": "NVDAx", "max_usd_e6_per_day": "20000000000" })).await?;
    let t0: u128 = view(&core, "get_pool", json!({})).await?["treasury_usd_e6"].as_str().unwrap().parse()?;
    let st = borrower.call(core.id(), "self_settle").args_json(json!({ "position_id": id.to_string() }))
        .deposit(NearToken::from_yoctonear(1)).gas(Gas::from_tgas(300)).transact_async().await?;
    for _ in 0..120 {
        let d = pending(&core, id).await?;
        if !d.is_null() && d["status"] != "AwaitingSignature" {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    let r = st.await?;
    gas("self_settle(remote)+sign", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    let d = pending(&core, id).await?;
    assert_eq!((d["status"].clone(), d["kind"].clone()), (json!("Signed"), json!(2)));
    let pre = d["preimage"].as_str().unwrap();
    assert!(pre.ends_with("|kind=SELF"), "{pre}");
    // model row self_remote_11250: fill 11,306.25, Q_repaid 64,094,388
    assert!(pre.contains(&format!("|repay_e6={BORROW}|seize_units=64094388|recipient={RCPT}|")), "{pre}");
    verify_with(&derived_key(&s, &core, &format!("solana-devnet/pos/{id}")).await?, pre, d["signature_hex"].as_str().unwrap());
    let t1: u128 = view(&core, "get_pool", json!({})).await?["treasury_usd_e6"].as_str().unwrap().parse()?;
    assert_eq!(t1 - t0, 56_250_000, "Profit-Lock fee to treasury once signed");
    Ok(())
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
