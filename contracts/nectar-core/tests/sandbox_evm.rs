//! WO-29a sandbox tests (Base spoke, interface-v7 §D): code-only upgrade over the live v2 layout
//! (tests/fixtures/nectar_core_v2.wasm = the wasm deployed on nectar-core-v2.nectar.testnet, sha256 252a6abe…), then
//! Base reserve -> keeper-attested confirm -> settle signed (Ecdsa, domain 0) -> relay, and Base reserve -> OutLayer
//! confirm (Base `vault_read` input) -> repay -> release signed -> relay. The signer stub answers domain 0 with a real
//! secp256k1 key per path (k256), so the stored r/s/v are ecrecovered off-chain back to the stored 0x authority.
//! Gas lines: `GAS,<label>,<receipt executor>,<gas burnt>` (run with --nocapture); every receipt < 100 Tgas.

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use ed25519_dalek::{Signature, VerifyingKey};
use k256::ecdsa::{RecoveryId, Signature as KSig, VerifyingKey as KVk};
use near_sdk::serde_json::{Value, json};
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, AccountId, Contract, Worker};

/// sha256 of the live nectar-core-v2 code (EVIDENCE G2b: view_code sha256 252a6abe…, code_hash 3W5bif…31ey).
const V2_SHA256: &str = "252a6abe1803b2628b0adadb7b5ec120853ddbd8e1f698dddf4f629a29e8937a";
/// sha256 of tests/fixtures/nectar_core_v21.wasm: 2.1.0-v7 built from main@1e7e440 before WO-34a.
const V21_SHA256: &str = "d2fbc44b0f0335834833d0318561c4a544a397b9ca31139986acbbc464251124";
const SEC: u64 = 1_000_000_000;
const TGAS: u64 = 1_000_000_000_000;
const VAULT: &str = "Nectar1Vau1t11111111111111111111111111111111";
const RCPT: &str = "3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV";
const TX: &str = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
const DEPOSITOR: &str = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB48";
const EVAULT: &str = "0x4E65637461725661756c74426173650000000001";
const ERCPT: &str = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const EDEP: &str = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const ETX: &str = "0x8f3a5b7c9d1e2f40516273849a5b6c7d8e9f00112233445566778899aabbccdd";
const RPC: &str = "https://sepolia.base.org";
const DEPOSIT: u128 = 4_000_010_000_000_000_000_000; // F-046 estimate
/// The live MPC needs 15 Tgas (F-034); the stub's k256 signing (no precomputed tables in wasm) burns ~10 Tgas in
/// `respond`, so the sandbox signer config attaches more. Only the stub needs it.
const SIGN_TGAS: u64 = 50;
const RESERVE_DEPOSIT: u128 = 50_000_000_000_000_000_000_000;
const UNITS: u128 = 100_000_000;
const BORROW: u128 = 11_250_000_000;

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
    let s = s.strip_prefix("0x").unwrap_or(s);
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}

fn v2_wasm() -> Vec<u8> {
    let w = std::fs::read(root().join("contracts/nectar-core/tests/fixtures/nectar_core_v2.wasm")).expect("v2 wasm");
    assert_eq!(hexs(&near_sdk::env::sha256(&w)), V2_SHA256, "fixture is the live nectar-core-v2 wasm (G2b)");
    w
}

fn v21_wasm() -> Vec<u8> {
    let w = std::fs::read(root().join("contracts/nectar-core/tests/fixtures/nectar_core_v21.wasm")).expect("v21 wasm");
    assert_eq!(hexs(&near_sdk::env::sha256(&w)), V21_SHA256, "fixture is the 2.1.0-v7 wasm");
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
    gas(method, &r);
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
    let r = e.owner.call(core.id(), "update_owner_price")
        .args_json(json!({ "symbol": "NVDAx", "price_usd_e6": p.to_string() })).transact().await?;
    assert!(r.is_success(), "price: {:?}", r.failures());
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

async fn ft_call(token: &Contract, from: &Account, to: &AccountId, amount: u128, msg: &str) -> anyhow::Result<ExecutionFinalResult> {
    let r = from
        .call(token.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": to, "amount": amount.to_string(), "msg": msg }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(300))
        .transact()
        .await?;
    assert!(r.is_success(), "ft_transfer_call {msg}: {:?}", r.failures());
    Ok(r)
}

fn fund_msg(disc: u16, rcpt: Option<&str>) -> String {
    let r = rcpt.map_or("null".into(), |x| format!("\"{x}\""));
    format!(r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":{disc},"notice_period_ns":"604800000000000","buyer_remote_recipient":{r}}}}}"#)
}

async fn view(c: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(c.view(method).args_json(args).await?.json()?)
}
async fn bal(token: &Contract, a: &AccountId) -> anyhow::Result<u128> {
    let v: String = token.view("ft_balance_of").args_json(json!({ "account_id": a })).await?.json()?;
    Ok(v.parse()?)
}
async fn position(core: &Contract, id: u64) -> anyhow::Result<Value> {
    view(core, "get_position", json!({ "position_id": id.to_string() })).await
}

async fn stub(e: &Env) -> anyhow::Result<Contract> {
    let s = e.worker.dev_deploy(&wasm("test_stubs")).await?;
    s.call("new").transact().await?.into_result()?;
    Ok(s)
}

/// Solana primary chain + signer + OutLayer (one stub wasm plays both).
async fn chain(e: &Env, core: &Contract, s: &Contract) -> anyhow::Result<()> {
    owner_call(e, core, "set_remote_chain", json!({ "symbol": "NVDAx",
        "remote_chain": { "chain_id": "solana-devnet", "vault_program": VAULT, "mpc_domain_id": 1 } })).await?;
    owner_call(e, core, "set_signer_config", json!({ "account": s.id(), "path": "solana-devnet-v1",
        "gas_tgas": SIGN_TGAS, "expiry_s": 3600 })).await?;
    owner_call(e, core, "set_outlayer_account", json!({ "account_id": s.id() })).await?;
    owner_call(e, core, "set_vault_read_config", json!({ "project_id": "nectar.testnet/vault-read",
        "version_key": "ab".repeat(32), "deposit_yocto": DEPOSIT.to_string(), "gas_tgas": 50 })).await
}

async fn base_chain(e: &Env, core: &Contract) -> anyhow::Result<()> {
    owner_call(e, core, "set_extra_remote_chain", json!({ "symbol": "NVDAx",
        "remote_chain": { "chain_id": "base-sepolia", "vault_program": EVAULT, "mpc_domain_id": 0 }, "rpc_url": RPC })).await
}

/// Lender $100k; buyer1 $15k @250 Solana recipient; buyer2 $15k @400 0x recipient (SR-5 sizing).
async fn seed(e: &Env, core: &Contract) -> anyhow::Result<()> {
    let lender = user(e, 100_000_000_000, 0).await?;
    ft_call(&e.usdc, &lender, core.id(), 100_000_000_000, r#""SupplyLendingLiquidity""#).await?;
    let b1 = user(e, 15_000_000_000, 0).await?;
    let b2 = user(e, 15_000_000_000, 0).await?;
    ft_call(&e.usdc, &b1, core.id(), 15_000_000_000, &fund_msg(250, Some(RCPT))).await?;
    ft_call(&e.usdc, &b2, core.id(), 15_000_000_000, &fund_msg(400, Some(ERCPT))).await?;
    Ok(())
}

async fn reserve(core: &Contract, borrower: &Account, chain: Option<&str>) -> anyhow::Result<(u64, ExecutionFinalResult)> {
    let mut args = json!({ "collateral": "NVDAx", "units": UNITS.to_string(), "borrow_usd_e6": BORROW.to_string(),
                           "pre_liq_ltv_bps": 7500, "depositor": if chain.is_some() { EDEP } else { DEPOSITOR } });
    if let Some(c) = chain {
        args["chain"] = json!(c);
    }
    let r = borrower
        .call(core.id(), "reserve_remote_position")
        .args_json(args)
        .gas(Gas::from_tgas(100))
        .deposit(NearToken::from_yoctonear(RESERVE_DEPOSIT))
        .transact()
        .await?;
    assert!(r.is_success() && r.failures().is_empty(), "reserve: {:?}", r.failures());
    let id: String = r.clone().json()?;
    Ok((id.parse()?, r))
}

fn vault_body(id: u64, authority: &str, depositor: &str) -> String {
    format!(r#"{{"position_id":"{id}","units":"{UNITS}","authority":"{authority}","depositor":"{depositor}","slot_or_block":412345678}}"#)
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

/// Trigger, then wait for the detached sign chain (yield/resume outlives broadcast_tx_commit).
async fn trigger(e: &Env, core: &Contract, pos: u64) -> anyhow::Result<ExecutionFinalResult> {
    let st = e.keeper
        .call(core.id(), "trigger_preliquidation")
        .args_json(json!({ "position_id": pos.to_string() }))
        .gas(Gas::from_tgas(300))
        .transact_async()
        .await?;
    for _ in 0..120 {
        let d = view(core, "get_pending_settlement", json!({ "position_id": pos.to_string() })).await?;
        if !d.is_null() && d["status"] != "AwaitingSignature" {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    std::thread::sleep(std::time::Duration::from_secs(4));
    Ok(st.await?)
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

async fn relay(e: &Env, core: &Contract, method: &str, pos: u64, tx: &str) -> anyhow::Result<ExecutionFinalResult> {
    Ok(e.keeper.call(core.id(), method).args_json(json!({ "position_id": pos.to_string(), "solana_tx_sig": tx })).transact().await?)
}

/// 0x address the stub's domain-0 key for `path` (predecessor = core) maps to (F-339).
async fn stub_evm_address(s: &Contract, core: &Contract, path: &str) -> anyhow::Result<String> {
    let k: String = view(s, "derived_public_key", json!({ "path": path, "predecessor": core.id(), "domain_id": 0 })).await?
        .as_str()
        .unwrap()
        .into();
    assert!(k.starts_with("secp256k1:"));
    Ok(nectar_core::chainsig::authority_from_derived_key(&k, 0).unwrap())
}

/// ecrecover(digest, v, r, s) -> 0x address, as the vault does it.
fn ecrecover(digest: &str, r: &str, s: &str, v: u8) -> String {
    let mut rs = unhex(r);
    rs.extend_from_slice(&unhex(s));
    let sig = KSig::from_slice(&rs).unwrap();
    let vk = KVk::recover_from_prehash(&unhex(digest), &sig, RecoveryId::from_byte(v - 27).unwrap()).unwrap();
    let p = vk.to_encoded_point(false);
    format!("0x{}", hexs(&near_sdk::env::keccak256_array(&p.as_bytes()[1..])[12..]))
}

async fn last_sign_request(s: &Contract) -> anyhow::Result<Value> {
    Ok(near_sdk::serde_json::from_str(view(s, "get_last_sign_request", json!({})).await?.as_str().unwrap())?)
}

/// Base reserve -> authority (0x, = the stub key's address) -> keeper-attested confirm -> settle: only the 0x quote fills,
/// the MPC is asked for an Ecdsa signature over the EIP-712 digest with the position path (domain 0); r/s/v ecrecover to
/// the authority -> relay with an EVM tx hash -> Closed.
#[tokio::test]
async fn base_reserve_attest_settle_signed_ecrecover_relay() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    seed(&e, &core).await?;
    let s = stub(&e).await?;
    chain(&e, &core, &s).await?;
    base_chain(&e, &core).await?;
    let chains = view(&core, "get_remote_chains", json!({ "symbol": "NVDAx" })).await?;
    assert_eq!((chains[1]["chain_id"].clone(), chains[1]["evm_chain_id"].clone()), (json!("base-sepolia"), json!(84532)));
    let borrower = user(&e, 0, 0).await?;
    let (id, r) = reserve(&core, &borrower, Some("base-sepolia")).await?;
    gas("reserve_remote_position(base)+derived_public_key", &r);
    let p = position(&core, id).await?;
    assert_eq!((p["remote"]["path"].clone(), p["remote"]["domain_id"].clone()), (json!("base-sepolia/pos/0"), json!(0)));
    let auth = p["remote"]["authority"].as_str().expect("authority set").to_string();
    assert_eq!(auth, stub_evm_address(&s, &core, "base-sepolia/pos/0").await?);

    owner_call(&e, &core, "set_allow_keeper_deposit_attestation", json!({ "allow": true })).await?;
    let r = e.keeper.call(core.id(), "keeper_attest_deposit")
        .args_json(json!({ "position_id": id.to_string(), "tx_ref": ETX, "depositor": EDEP }))
        .gas(Gas::from_tgas(100)).transact().await?;
    gas("keeper_attest_deposit(base)+payout", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(events(&r, "remote_deposit_confirmed")[0]["source"], "keeper");
    assert!(bal(&e.usdc, borrower.id()).await? > 0, "borrow paid");

    price(&e, &core, 155_000_000).await?;
    price(&e, &core, 140_000_000).await?;
    let r = trigger(&e, &core, id).await?;
    gas("trigger+sign(base, Ecdsa)", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    let d = view(&core, "get_pending_settlement_evm", json!({ "position_id": id.to_string() })).await?;
    assert_eq!(d["status"], "Signed", "{d}");
    assert_eq!((d["recipient"].clone(), d["quoteId"].clone(), d["kind"].clone()), (json!(ERCPT), json!("1"), json!(1)));
    assert_eq!((d["chainId"].clone(), d["verifyingContract"].clone()), (json!(84532), json!(EVAULT)));
    let digest = d["digest"].as_str().unwrap();
    let last = last_sign_request(&s).await?;
    assert_eq!((last["path"].clone(), last["domain_id"].clone()), (json!("base-sepolia/pos/0"), json!(0)));
    assert_eq!(last["payload_v2"]["Ecdsa"], json!(digest.trim_start_matches("0x")), "the digest itself (F-331)");
    let v = d["v"].as_u64().unwrap() as u8;
    assert_eq!(ecrecover(digest, d["r"].as_str().unwrap(), d["s"].as_str().unwrap(), v), auth, "ecrecover == authority");

    let bad = relay(&e, &core, "relay_settlement_result", id, TX).await?;
    assert!(format!("{:?}", bad.failures()).contains("bad solana_tx_sig"));
    let r = relay(&e, &core, "relay_settlement_result", id, ETX).await?;
    gas("relay_settlement_result(base)", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let p = position(&core, id).await?;
    assert_eq!((p["status"].clone(), p["remote"]["status"].clone()), (json!("Closed"), json!("Closed")));
    let d = view(&core, "get_pending_settlement_evm", json!({ "position_id": id.to_string() })).await?;
    assert_eq!((d["status"].clone(), d["txHash"].clone()), (json!("Relayed"), json!(ETX)));
    Ok(())
}

/// Base reserve -> OutLayer confirm (`vault_read` input carries vault + rpc_url; 0x authority/depositor) -> repay ->
/// release signed over the EIP-712 Release digest to the depositor; ecrecover == authority -> relay -> Closed.
#[tokio::test]
async fn base_confirm_repay_release_signed_ecrecover() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    seed(&e, &core).await?;
    let s = stub(&e).await?;
    chain(&e, &core, &s).await?;
    base_chain(&e, &core).await?;
    let borrower = user(&e, 0, 0).await?;
    let (id, _) = reserve(&core, &borrower, Some("base-sepolia")).await?;
    let auth = position(&core, id).await?["remote"]["authority"].as_str().unwrap().to_string();
    let r = confirm(&e, &core, &s, id, &vault_body(id, &auth.to_uppercase().replacen("0X", "0x", 1), EDEP)).await?;
    gas("confirm_remote_deposit(base)+vault_read+payout", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    let input: Value = near_sdk::serde_json::from_str(events(&r, "remote_deposit_check_requested")[0]["input"].as_str().unwrap())?;
    assert_eq!(input, json!({ "job": "vault_read", "chain": "base-sepolia", "vault": EVAULT, "position_id": id.to_string(),
                               "rpc_url": RPC, "depositor": EDEP }));
    assert_eq!(events(&r, "remote_deposit_confirmed")[0]["depositor"], EDEP);

    e.owner.call(e.usdc.id(), "mint").args_json(json!({ "account_id": borrower.id(), "amount": BORROW.to_string() }))
        .transact().await?.into_result()?;
    ft_call(&e.usdc, &borrower, core.id(), BORROW, &format!(r#"{{"Repay":{{"position_id":"{id}"}}}}"#)).await?;
    let r = release(&e, &core, id).await?;
    gas("request_remote_release(base)+sign", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    let d = view(&core, "get_pending_release_evm", json!({ "position_id": id.to_string() })).await?;
    assert_eq!((d["status"].clone(), d["recipient"].clone()), (json!("Signed"), json!(EDEP)), "{d}");
    let digest = d["digest"].as_str().unwrap();
    assert_eq!(last_sign_request(&s).await?["payload_v2"]["Ecdsa"], json!(digest.trim_start_matches("0x")));
    assert_eq!(ecrecover(digest, d["r"].as_str().unwrap(), d["s"].as_str().unwrap(), d["v"].as_u64().unwrap() as u8), auth);
    let r = relay(&e, &core, "relay_release_result", id, ETX).await?;
    gas("relay_release_result(base)", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let p = position(&core, id).await?;
    assert_eq!((p["status"].clone(), p["remote"]["status"].clone()), (json!("Closed"), json!("Closed")));
    Ok(())
}

async fn snapshot(core: &Contract) -> anyhow::Result<Vec<Value>> {
    let mut out = Vec::new();
    for (m, a) in [
        ("get_config", json!({})),
        ("get_pool", json!({})),
        ("get_collateral", json!({ "symbol": "NVDAx" })),
        ("list_collaterals", json!({})),
        ("list_quotes", json!({ "symbol": "NVDAx" })),
        ("list_positions", json!({})),
        ("get_position", json!({ "position_id": "0" })),
        ("get_position", json!({ "position_id": "1" })),
        ("get_remote_config", json!({})),
        ("get_signer_config", json!({})),
        ("get_next_nonce", json!({})),
        ("get_vault_authority_hint", json!({ "position_id": "1" })),
        ("get_gas_reserve", json!({})),
    ] {
        let mut v = view(core, m, a).await.map_err(|err| anyhow::anyhow!("{m}: {err}"))?;
        if m == "get_config" {
            v.as_object_mut().unwrap().remove("contract_version"); // the one intended difference
        }
        out.push(v);
    }
    Ok(out)
}

/// Code-only upgrade over the live v2 layout: the deployed v2 wasm with a NEAR-held position (#0) and a confirmed
/// Solana remote position (#1); redeploy the new code (no migrate); every view reads the same; then both flows work:
/// NEAR repay + a fresh NEAR borrow, Solana settle signed with the position path (Ed25519) + relay, a reservation made
/// before the upgrade (no depositor commitment) confirmed after it, and a full Base settle.
#[tokio::test]
async fn code_only_upgrade_over_live_v2_state() -> anyhow::Result<()> {
    upgrade_flow(&v2_wasm(), "2.0.0-v7").await
}

/// WO-34a: the same flows over the live 2.1.0-v7 layout.
#[tokio::test]
async fn code_only_upgrade_over_live_v21_state() -> anyhow::Result<()> {
    upgrade_flow(&v21_wasm(), "2.1.0-v7").await
}

async fn upgrade_flow(old: &[u8], old_version: &str) -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, old).await?;
    assert_eq!(view(&core, "contract_version", json!({})).await?, json!(old_version));
    seed(&e, &core).await?;
    let s = stub(&e).await?;
    chain(&e, &core, &s).await?;
    // #0 NEAR-held: 100 NVDAx, $5,000
    let alice = user(&e, 0, UNITS).await?;
    let lock = r#"{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"5000000000","pre_liq_ltv_bps":7500}}"#;
    ft_call(&e.nvdax, &alice, core.id(), UNITS, lock).await?;
    assert_eq!(position(&core, 0).await?["debt_usd_e6"], "5000000000");
    // #1 Solana remote, confirmed through OutLayer
    let borrower = user(&e, 0, 0).await?;
    let (id, _) = reserve(&core, &borrower, None).await?;
    assert_eq!(id, 1);
    let auth = position(&core, id).await?["remote"]["authority"].as_str().unwrap().to_string();
    let r = confirm(&e, &core, &s, id, &vault_body(id, &auth, DEPOSITOR)).await?;
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    // #2 Solana, reserved on the old code (so no depositor commitment), confirmed after the upgrade
    let (legacy, _) = reserve(&core, &borrower, None).await?;
    assert_eq!(legacy, 2);
    let legacy_auth = position(&core, legacy).await?["remote"]["authority"].as_str().unwrap().to_string();
    let before = snapshot(&core).await?;

    // upgrade: code only
    let r = core.as_account().deploy(&wasm("nectar_core")).await?;
    assert!(r.is_success(), "deploy new code");
    assert_eq!(view(&core, "contract_version", json!({})).await?, json!("2.2.0-v7"));
    assert_eq!(view(&core, "get_state_version", json!({})).await?, json!(2), "state version unchanged");
    let after = snapshot(&core).await?;
    for (i, (b, a)) in before.iter().zip(after.iter()).enumerate() {
        assert_eq!(b, a, "view #{i} reads the same after the code-only upgrade");
    }
    assert_eq!(view(&core, "get_remote_chains", json!({ "symbol": "NVDAx" })).await?.as_array().unwrap().len(), 1);
    assert!(view(&core, "get_pending_settlement_evm", json!({ "position_id": "1" })).await?.is_null());
    assert!(position(&core, legacy).await?["remote"].get("committed_depositor").is_none(), "no commitment before 2.2");
    let r = confirm(&e, &core, &s, legacy, &vault_body(legacy, &legacy_auth, RCPT)).await?;
    gas("confirm_remote_deposit(legacy reservation, after upgrade)", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(position(&core, legacy).await?["remote"]["depositor"], RCPT, "any valid depositor: nothing was committed");

    // NEAR flow: repay #0 in full, then a fresh NEAR borrow
    e.owner.call(e.usdc.id(), "mint").args_json(json!({ "account_id": alice.id(), "amount": "5000000000" }))
        .transact().await?.into_result()?;
    let r = ft_call(&e.usdc, &alice, core.id(), 5_000_000_000, r#"{"Repay":{"position_id":"0"}}"#).await?;
    gas("ft_transfer_call:Repay(after upgrade)", &r);
    assert_eq!(position(&core, 0).await?["debt_usd_e6"], "0");
    let bob = user(&e, 0, UNITS).await?;
    let r = ft_call(&e.nvdax, &bob, core.id(), UNITS, lock).await?;
    gas("ft_transfer_call:LockCollateralAndBorrow(after upgrade)", &r);
    assert!(bal(&e.usdc, bob.id()).await? > 0, "NEAR borrow paid after upgrade");

    // Solana flow: settle #1 signed with its own path, relay
    price(&e, &core, 155_000_000).await?;
    price(&e, &core, 140_000_000).await?;
    let r = trigger(&e, &core, id).await?;
    gas("trigger+sign(solana, after upgrade)", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    let d = view(&core, "get_pending_settlement", json!({ "position_id": id.to_string() })).await?;
    assert_eq!(d["status"], "Signed");
    let pre = d["preimage"].as_str().unwrap();
    assert!(pre.contains(&format!("|recipient={RCPT}|")) && pre.ends_with("|kind=PRELIQ"), "{pre}");
    let k: String = view(&s, "derived_public_key", json!({ "path": "solana-devnet/pos/1", "predecessor": core.id(), "domain_id": 1 }))
        .await?.as_str().unwrap().into();
    let pk = VerifyingKey::from_bytes(&nectar_core::chainsig::b58_decode(k.strip_prefix("ed25519:").unwrap()).unwrap().try_into().unwrap())?;
    pk.verify_strict(pre.as_bytes(), &Signature::from_bytes(&unhex(d["signature_hex"].as_str().unwrap()).try_into().unwrap()))
        .expect("Ed25519 over the raw preimage");
    let r = relay(&e, &core, "relay_settlement_result", id, TX).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(position(&core, id).await?["remote"]["status"], "Closed");

    // Base on the upgraded state: reserve (committed) -> attest -> settle signed -> relay
    base_chain(&e, &core).await?;
    for p in [155_000_000, 175_000_000, 180_000_000] {
        price(&e, &core, p).await?;
    }
    assert_eq!(view(&core, "get_collateral", json!({ "symbol": "NVDAx" })).await?["oracle_price_usd_e6"], "180000000");
    let b3 = user(&e, 10_000_000_000, 0).await?;
    ft_call(&e.usdc, &b3, core.id(), 10_000_000_000, &fund_msg(450, Some(ERCPT))).await?;
    let (bid, _) = reserve(&core, &borrower, Some("base-sepolia")).await?;
    let p = position(&core, bid).await?;
    assert_eq!(p["remote"]["authority"].as_str().unwrap(), stub_evm_address(&s, &core, &format!("base-sepolia/pos/{bid}")).await?);
    assert_eq!(p["remote"]["committed_depositor"], EDEP);
    owner_call(&e, &core, "set_allow_keeper_deposit_attestation", json!({ "allow": true })).await?;
    let r = e.keeper.call(core.id(), "keeper_attest_deposit")
        .args_json(json!({ "position_id": bid.to_string(), "tx_ref": ETX, "depositor": EDEP }))
        .gas(Gas::from_tgas(100)).transact().await?;
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(events(&r, "remote_deposit_confirmed")[0]["funded"], true);
    price(&e, &core, 155_000_000).await?;
    price(&e, &core, 140_000_000).await?;
    let r = trigger(&e, &core, bid).await?;
    gas("trigger+sign(base, after upgrade)", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(view(&core, "get_pending_settlement_evm", json!({ "position_id": bid.to_string() })).await?["status"], "Signed");
    let r = relay(&e, &core, "relay_settlement_result", bid, ETX).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(position(&core, bid).await?["remote"]["status"], "Closed");
    Ok(())
}

// ------------------------------------------------------------------ WO-34a (2.2.0-v7)

/// Advance the sandbox clock by at least `secs` (fast_forward in chunks, F-132).
async fn advance(e: &Env, secs: u64) -> anyhow::Result<()> {
    let t0 = e.worker.view_block().await?.timestamp();
    for _ in 0..60 {
        e.worker.fast_forward(500).await?;
        if e.worker.view_block().await?.timestamp() >= t0 + secs * SEC {
            return Ok(());
        }
    }
    anyhow::bail!("clock did not advance")
}

/// Re-sign, then wait for the detached sign chain.
async fn resign(core: &Contract, who: &Account, pos: u64, old_nonce: &Value) -> anyhow::Result<ExecutionFinalResult> {
    let st = who
        .call(core.id(), "resign_remote_settlement")
        .args_json(json!({ "position_id": pos.to_string() }))
        .gas(Gas::from_tgas(150))
        .transact_async()
        .await?;
    for _ in 0..120 {
        let d = view(core, "get_pending_settlement", json!({ "position_id": pos.to_string() })).await?;
        if d["nonce"] != *old_nonce && d["status"] != "AwaitingSignature" {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    std::thread::sleep(std::time::Duration::from_secs(4));
    Ok(st.await?)
}

/// SR-3 on the live layout: a leg signed by 2.1.0-v7 expires unrelayed; after the code-only upgrade anyone re-signs the
/// identical leg with a fresh nonce, with no second pool credit, and the keeper relays it.
#[tokio::test]
async fn sr3_leg_signed_on_v21_resigned_after_upgrade() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &v21_wasm()).await?;
    seed(&e, &core).await?;
    let s = stub(&e).await?;
    chain(&e, &core, &s).await?;
    owner_call(&e, &core, "set_signer_config", json!({ "account": s.id(), "path": "solana-devnet-v1",
        "gas_tgas": SIGN_TGAS, "expiry_s": 60 })).await?;
    let borrower = user(&e, 0, 0).await?;
    let (id, _) = reserve(&core, &borrower, None).await?;
    let auth = position(&core, id).await?["remote"]["authority"].as_str().unwrap().to_string();
    let r = confirm(&e, &core, &s, id, &vault_body(id, &auth, DEPOSITOR)).await?;
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    price(&e, &core, 155_000_000).await?;
    price(&e, &core, 140_000_000).await?;
    let r = trigger(&e, &core, id).await?;
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    let args = json!({ "position_id": id.to_string() });
    let first = view(&core, "get_pending_settlement", args.clone()).await?;
    assert_eq!(first["status"], "Signed");
    let pool = view(&core, "get_pool", json!({})).await?;

    assert!(core.as_account().deploy(&wasm("nectar_core")).await?.is_success(), "deploy new code");
    let anyone = e.worker.dev_create_account().await?;
    let early = anyone.call(core.id(), "resign_remote_settlement").args_json(args.clone()).gas(Gas::from_tgas(150)).transact().await?;
    assert!(early.is_failure(), "refused before expiry");
    advance(&e, 61).await?;
    let r = resign(&core, &anyone, id, &first["nonce"]).await?;
    gas("resign_remote_settlement+sign", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    let d = view(&core, "get_pending_settlement", args.clone()).await?;
    assert_eq!(d["status"], "Signed");
    assert_ne!(d["nonce"], first["nonce"]);
    for k in ["quote_id", "repay_usd_e6", "seize_units", "recipient", "kind"] {
        assert_eq!(d[k], first[k], "{k} is identical");
    }
    let pre = d["preimage"].as_str().unwrap();
    let k: String = view(&s, "derived_public_key", json!({ "path": format!("solana-devnet/pos/{id}"), "predecessor": core.id(), "domain_id": 1 }))
        .await?.as_str().unwrap().into();
    let pk = VerifyingKey::from_bytes(&nectar_core::chainsig::b58_decode(k.strip_prefix("ed25519:").unwrap()).unwrap().try_into().unwrap())?;
    pk.verify_strict(pre.as_bytes(), &Signature::from_bytes(&unhex(d["signature_hex"].as_str().unwrap()).try_into().unwrap()))
        .expect("Ed25519 over the fresh preimage");
    assert_eq!(view(&core, "get_pool", json!({})).await?, pool, "no second pool credit");
    let r = relay(&e, &core, "relay_settlement_result", id, TX).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(position(&core, id).await?["remote"]["status"], "Closed");
    Ok(())
}

/// SR-8 then SR-18: a squatter's slot is rejected, and a short deposit from the committed depositor is recorded,
/// refused and released.
#[tokio::test]
async fn sr8_sr18_committed_depositor_and_short_deposit() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    seed(&e, &core).await?;
    let s = stub(&e).await?;
    chain(&e, &core, &s).await?;
    let borrower = user(&e, 0, 0).await?;
    let (id, _) = reserve(&core, &borrower, None).await?;
    let p = position(&core, id).await?;
    assert_eq!(p["remote"]["committed_depositor"], DEPOSITOR);
    let auth = p["remote"]["authority"].as_str().unwrap().to_string();

    let r = confirm(&e, &core, &s, id, &vault_body(id, &auth, RCPT)).await?;
    gas("confirm_remote_deposit(squatted)", &r);
    assert!(events(&r, "remote_deposit_check_requested")[0]["input"].as_str().unwrap().contains(DEPOSITOR), "vault_read gets the depositor");
    assert_eq!(events(&r, "remote_deposit_rejected")[0]["reason"], "depositor_mismatch");
    assert!(position(&core, id).await?["remote"]["depositor"].is_null());

    advance(&e, 31).await?; // confirm cooldown
    let short = format!(r#"{{"position_id":"{id}","units":"{}","authority":"{auth}","depositor":"{DEPOSITOR}","slot_or_block":412345678}}"#, UNITS - 1);
    let r = confirm(&e, &core, &s, id, &short).await?;
    gas("confirm_remote_deposit(short)", &r);
    assert_eq!(events(&r, "remote_loan_refused")[0]["reason"], "units_below_reserved");
    let p = position(&core, id).await?;
    assert_eq!((p["remote"]["status"].clone(), p["remote"]["depositor"].clone(), p["units"].clone(), p["debt_usd_e6"].clone()),
        (json!("Open"), json!(DEPOSITOR), json!((UNITS - 1).to_string()), json!("0")));
    assert_eq!(bal(&e.usdc, borrower.id()).await?, 0, "no loan");

    let r = release(&e, &core, id).await?;
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    let d = view(&core, "get_pending_release", json!({ "position_id": id.to_string() })).await?;
    assert_eq!((d["status"].clone(), d["recipient"].clone()), (json!("Signed"), json!(DEPOSITOR)));
    Ok(())
}

/// SR-5: the live seed shape once the large quote drops its recipient: Q_c is large, but only $1k can settle a Solana loan.
#[tokio::test]
async fn sr5_remote_loan_refused_without_fitting_capacity() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    let lender = user(&e, 100_000_000_000, 0).await?;
    ft_call(&e.usdc, &lender, core.id(), 100_000_000_000, r#""SupplyLendingLiquidity""#).await?;
    let b = user(&e, 21_000_000_000, 0).await?;
    ft_call(&e.usdc, &b, core.id(), 20_000_000_000, &fund_msg(250, Some(RCPT))).await?;
    ft_call(&e.usdc, &b, core.id(), 1_000_000_000, &fund_msg(300, Some(RCPT))).await?;
    let s = stub(&e).await?;
    chain(&e, &core, &s).await?;
    let borrower = user(&e, 0, 0).await?;
    let (id, _) = reserve(&core, &borrower, None).await?;
    let auth = position(&core, id).await?["remote"]["authority"].as_str().unwrap().to_string();
    let r = b.call(core.id(), "set_quote_remote_recipient").args_json(json!({ "quote_id": "0", "recipient": null })).transact().await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let r = confirm(&e, &core, &s, id, &vault_body(id, &auth, DEPOSITOR)).await?;
    assert_eq!(events(&r, "remote_loan_refused")[0]["reason"], "aggregate_limit");
    assert_eq!(bal(&e.usdc, borrower.id()).await?, 0);
    assert_eq!(position(&core, id).await?["remote"]["depositor"], DEPOSITOR, "still releasable");
    Ok(())
}

/// SR-5 gas: 64 fitting quotes (the per-asset cap), each able to settle alone.
#[tokio::test]
async fn sr5_gas_with_64_fitting_quotes() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    let lender = user(&e, 100_000_000_000, 0).await?;
    ft_call(&e.usdc, &lender, core.id(), 100_000_000_000, r#""SupplyLendingLiquidity""#).await?;
    let b = user(&e, 64 * 12_000_000_000, 0).await?;
    for _ in 0..64 {
        ft_call(&e.usdc, &b, core.id(), 12_000_000_000, &fund_msg(250, Some(RCPT))).await?;
    }
    let s = stub(&e).await?;
    chain(&e, &core, &s).await?;
    let borrower = user(&e, 0, 0).await?;
    let (id, r) = reserve(&core, &borrower, None).await?;
    gas("reserve_remote_position(64 fitting quotes)", &r);
    let auth = position(&core, id).await?["remote"]["authority"].as_str().unwrap().to_string();
    // close to the minimum the contract accepts (50 + 85 + 5 Tgas + its own burn): anyone chooses the attached gas, and
    // the callback must still finish at the 64-quote worst case, or `confirming` would stay set
    s.call("set_mode").args_json(json!({ "mode": "raw", "body": vault_body(id, &auth, DEPOSITOR) })).transact().await?.into_result()?;
    let r = e.keeper.call(core.id(), "confirm_remote_deposit").args_json(json!({ "position_id": id.to_string() }))
        .gas(Gas::from_tgas(145)).transact().await?;
    gas("confirm_remote_deposit(64 fitting quotes)", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(position(&core, id).await?["remote"]["confirming"], false);
    assert_eq!(events(&r, "remote_deposit_confirmed")[0]["funded"], true);
    price(&e, &core, 155_000_000).await?;
    price(&e, &core, 140_000_000).await?;
    let r = trigger(&e, &core, id).await?;
    gas("trigger+sign(64 fitting quotes)", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(view(&core, "get_pending_settlement", json!({ "position_id": id.to_string() })).await?["status"], "Signed");
    Ok(())
}

/// SR-7 through the real mock-ft: funding with a recipient no vault can pay is refunded in full.
#[tokio::test]
async fn sr7_bad_recipient_refunded_and_refused() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    let b = user(&e, 2_000_000_000, 0).await?;
    for bad in ["3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqi", "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T", "0x0000000000000000000000000000000000000000"] {
        ft_call(&e.usdc, &b, core.id(), 1_000_000_000, &fund_msg(250, Some(bad))).await?;
        assert_eq!(bal(&e.usdc, b.id()).await?, 2_000_000_000, "{bad} refunded");
    }
    assert!(view(&core, "list_quotes", json!({ "symbol": "NVDAx" })).await?.as_array().unwrap().is_empty());
    ft_call(&e.usdc, &b, core.id(), 1_000_000_000, &fund_msg(250, None)).await?;
    let r = b.call(core.id(), "set_quote_remote_recipient")
        .args_json(json!({ "quote_id": "0", "recipient": "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T" })).transact().await?;
    assert!(r.is_failure(), "off-curve recipient refused");
    let r = b.call(core.id(), "set_quote_remote_recipient").args_json(json!({ "quote_id": "0", "recipient": RCPT })).transact().await?;
    assert!(r.is_success(), "{:?}", r.failures());
    Ok(())
}

/// SR-17 through the real mock-ft: an unregistered buyer's settlement transfer fails and is owed; a claim while still
/// unregistered restores it; after registering, the claim pays.
#[tokio::test]
async fn sr17_owed_collateral_claim_round_trip() -> anyhow::Result<()> {
    let e = env().await?;
    let core = init_core(&e, &wasm("nectar_core")).await?;
    let lender = user(&e, 100_000_000_000, 0).await?;
    ft_call(&e.usdc, &lender, core.id(), 100_000_000_000, r#""SupplyLendingLiquidity""#).await?;
    let buyer = user(&e, 15_000_000_000, 0).await?;
    ft_call(&e.usdc, &buyer, core.id(), 15_000_000_000, &fund_msg(250, None)).await?;
    let alice = user(&e, 0, UNITS).await?;
    let lock = format!(r#"{{"LockCollateralAndBorrow":{{"collateral":"NVDAx","borrow_usd_e6":"{BORROW}","pre_liq_ltv_bps":7500}}}}"#);
    ft_call(&e.nvdax, &alice, core.id(), UNITS, &lock).await?;
    e.owner.call(e.nvdax.id(), "set_registration_required").args_json(json!({ "required": true })).transact().await?.into_result()?;
    price(&e, &core, 155_000_000).await?;
    price(&e, &core, 140_000_000).await?;
    let r = e.keeper.call(core.id(), "trigger_preliquidation").args_json(json!({ "position_id": "0" })).gas(Gas::from_tgas(300)).transact().await?;
    gas("trigger_preliquidation(unregistered buyer)", &r);
    let args = json!({ "account_id": buyer.id(), "symbol": "NVDAx" });
    let owed: String = view(&core, "get_owed_collateral", args.clone()).await?.as_str().unwrap().into();
    let owed: u128 = owed.parse()?;
    assert!(owed > 0, "the failed transfer is owed");
    assert_eq!(bal(&e.nvdax, buyer.id()).await?, 0);

    let claim = || buyer.call(core.id(), "claim_owed_collateral").args_json(json!({ "symbol": "NVDAx" }))
        .deposit(NearToken::from_yoctonear(1)).gas(Gas::from_tgas(100)).transact();
    let r = claim().await?;
    gas("claim_owed_collateral(still unregistered)", &r);
    assert_eq!(view(&core, "get_owed_collateral", args.clone()).await?, json!(owed.to_string()), "restored by on_payout");

    buyer.call(e.nvdax.id(), "storage_deposit").args_json(json!({})).deposit(NearToken::from_millinear(10)).transact().await?.into_result()?;
    let r = claim().await?;
    gas("claim_owed_collateral", &r);
    assert!(r.is_success() && r.failures().is_empty(), "{:?}", r.failures());
    assert_eq!(bal(&e.nvdax, buyer.id()).await?, owed);
    assert_eq!(view(&core, "get_owed_collateral", args).await?, json!("0"));
    Ok(())
}
