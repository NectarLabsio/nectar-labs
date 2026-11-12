//! WO-61 sandbox (near-workspaces, F-029): the CURRENTLY DEPLOYED code of usdc-mock.nectar.testnet (RPC `view_code`,
//! saved as tests/fixtures/mock-ft-deployed.wasm) takes a code-only upgrade to this crate's wasm with balances,
//! total_supply, metadata and storage_balance_of intact; then `set_faucet` + `faucet_mint` work (disabled by default,
//! cooldown, cap, exact storage charge, refund, registration) and `ft_transfer_call` still works.
//! Rows (run with --nocapture): `GAS,<method>,<tx total gas>`, `RECEIPT_GAS,<method>,<gas of the method receipt>`,
//! `WASM,<deployed|new>,<bytes>,<sha256>`.

use std::path::PathBuf;
use std::process::Command;

use near_sdk::serde_json::{Map, Value, json};
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, AccountId, Contract};

/// sha256 of tests/fixtures/mock-ft-deployed.wasm = `view_code` of usdc-mock.nectar.testnet at block 277406854
/// (2026-11-12T19:34Z UTC, code_hash HnZj9etbxgugrD5dHNH7pzrFZTw673nFxXqb78Uk4TrM; nvdax-mock.nectar.testnet runs the
/// same code hash at block 277406857).
const DEPLOYED_SHA256: &str = "f96721a600e5902fb5907ace675f70400524996a5d914564c670f328c9dca59e";
const DEPLOYED_BYTES: usize = 158_465;
const BYTE: u128 = 10_000_000_000_000_000_000; // near-sdk env::storage_byte_cost()

/// Minimal NEP-141 receiver, hand-assembled (no wat dependency): `ft_on_transfer` returns `"0"` (uses everything).
/// Imports env.value_return(value_len: u64, value_ptr: u64) (near-sys 0.4.1 lib.rs:87); data `"0"` at offset 0.
const RECEIVER_WASM: &[u8] = &[
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic, version 1
    0x01, 0x09, 0x02, 0x60, 0x02, 0x7e, 0x7e, 0x00, 0x60, 0x00, 0x00, // types: (i64,i64)->(), ()->()
    0x02, 0x14, 0x01, 0x03, b'e', b'n', b'v', 0x0c, b'v', b'a', b'l', b'u', b'e', b'_', b'r', b'e', b't', b'u', b'r', b'n',
    0x00, 0x00, // import env.value_return : type 0
    0x03, 0x02, 0x01, 0x01, // one function of type 1
    0x05, 0x03, 0x01, 0x00, 0x01, // memory, min 1 page
    0x07, 0x1b, 0x02, 0x0e, b'f', b't', b'_', b'o', b'n', b'_', b't', b'r', b'a', b'n', b's', b'f', b'e', b'r', 0x00, 0x01,
    0x06, b'm', b'e', b'm', b'o', b'r', b'y', 0x02, 0x00, // exports
    0x0a, 0x0a, 0x01, 0x08, 0x00, 0x42, 0x03, 0x42, 0x00, 0x10, 0x00, 0x0b, // value_return(3, 0)
    0x0b, 0x09, 0x01, 0x00, 0x41, 0x00, 0x0b, 0x03, b'"', b'0', b'"', // data "0" at 0
];

fn new_wasm() -> Vec<u8> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let st = Command::new("cargo")
        .args(["near", "build", "non-reproducible-wasm"])
        .current_dir(&dir)
        .status()
        .expect("cargo near build");
    assert!(st.success(), "cargo near build failed");
    std::fs::read(dir.join("../../target/near/mock_ft/mock_ft.wasm")).expect("wasm")
}

fn sha256_hex(b: &[u8]) -> String {
    near_sdk::env::sha256(b).iter().map(|x| format!("{x:02x}")).collect()
}

fn gas(label: &str, r: &ExecutionFinalResult) {
    println!("GAS,{label},{}", r.total_gas_burnt.as_gas());
    if let Some(o) = r.receipt_outcomes().first() {
        println!("RECEIPT_GAS,{label},{}", o.gas_burnt.as_gas());
    }
}

fn fails_with(r: ExecutionFinalResult, needle: &str) {
    assert!(r.is_failure(), "expected failure containing {needle:?}");
    let msg = format!("{:?}", r.failures());
    assert!(msg.contains(needle), "{needle:?} not in {msg}");
}

/// Bytes of one record `[prefix] ++ borsh(account)` + value + 40 (near-parameters 0.38.0 parameters.yaml:37).
fn rec(a: &AccountId, value: u128) -> u128 {
    (1 + 4 + a.as_str().len() as u128 + value + 40) * BYTE
}

async fn sub(root: &Account, name: &str, near: u128) -> anyhow::Result<Account> {
    Ok(root.create_subaccount(name).initial_balance(NearToken::from_near(near)).transact().await?.into_result()?)
}

async fn view(ft: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(ft.view(method).args_json(args).await?.json()?)
}

async fn balance(ft: &Contract, a: &AccountId) -> anyhow::Result<u128> {
    Ok(view(ft, "ft_balance_of", json!({ "account_id": a })).await?.as_str().unwrap().parse()?)
}

async fn snapshot(ft: &Contract, ids: &[&AccountId]) -> anyhow::Result<Value> {
    let mut m = Map::new();
    for id in ids {
        m.insert(format!("balance:{id}"), view(ft, "ft_balance_of", json!({ "account_id": id })).await?);
        m.insert(format!("storage:{id}"), view(ft, "storage_balance_of", json!({ "account_id": id })).await?);
    }
    for v in ["ft_total_supply", "ft_metadata", "owner", "multiplier", "free_registrations", "registration_required"] {
        m.insert(v.to_string(), view(ft, v, json!({})).await?);
    }
    Ok(Value::Object(m))
}

async fn faucet(ft: &Contract, who: &Account, deposit: u128) -> anyhow::Result<ExecutionFinalResult> {
    Ok(who.call(ft.id(), "faucet_mint").deposit(NearToken::from_yoctonear(deposit)).max_gas().transact().await?)
}

async fn set_faucet(ft: &Contract, who: &Account, amount: u128, cap: u128, cooldown_s: u64) -> anyhow::Result<ExecutionFinalResult> {
    let args = json!({ "amount_per_claim": amount.to_string(), "cap_per_account": cap.to_string(), "cooldown_s": cooldown_s, "enabled": true });
    Ok(who.call(ft.id(), "set_faucet").args_json(args).max_gas().transact().await?)
}

#[tokio::test]
async fn deployed_mock_ft_upgrades_code_only_and_faucet_works() -> anyhow::Result<()> {
    let old = std::fs::read(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/mock-ft-deployed.wasm"))?;
    assert_eq!(old.len(), DEPLOYED_BYTES);
    assert_eq!(sha256_hex(&old), DEPLOYED_SHA256, "fixture = deployed usdc-mock code");
    let new = new_wasm();
    println!("WASM,deployed,{},{}", old.len(), DEPLOYED_SHA256);
    println!("WASM,new,{},{}", new.len(), sha256_hex(&new));

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let owner = sub(&root, "owner", 20).await?;
    let alice = sub(&root, "alice", 20).await?;
    let bob = sub(&root, "bob", 20).await?;
    let carol = sub(&root, "carol", 20).await?;
    let dave = sub(&root, "dave", 20).await?;
    let token = sub(&root, "usdc", 30).await?;

    // 1. Deployed code + state.
    let ft = token.deploy(&old).await?.into_result()?;
    assert_eq!(ft.view_code().await?, old, "sandbox runs the deployed code");
    let init = json!({ "owner": owner.id(), "name": "Mock USDC", "symbol": "USDC", "decimals": 6 });
    ft.call("new").args_json(init).transact().await?.into_result()?;
    let mint = json!({ "account_id": alice.id(), "amount": "1000000000" });
    owner.call(ft.id(), "mint").args_json(mint).transact().await?.into_result()?;
    bob.call(ft.id(), "storage_deposit").args_json(json!({})).deposit(NearToken::from_millinear(10)).transact().await?.into_result()?;
    let tr = json!({ "receiver_id": bob.id(), "amount": "250000000" });
    alice.call(ft.id(), "ft_transfer").args_json(tr).deposit(NearToken::from_yoctonear(1)).transact().await?.into_result()?;
    let ids = [alice.id(), bob.id(), carol.id()];
    let before = snapshot(&ft, &ids).await?;
    assert_eq!(before["storage:".to_string() + carol.id().as_str()], Value::Null);

    // 2. Code-only upgrade (no init call): state survives.
    let up = token.deploy(&new).await?;
    assert!(up.is_success(), "code-only upgrade");
    assert_eq!(ft.view_code().await?, new);
    assert_eq!(snapshot(&ft, &ids).await?, before, "balances/supply/metadata/storage_balance_of unchanged");

    // 3. Faucet: disabled by default, owner-only setter.
    assert_eq!(
        view(&ft, "faucet_config", json!({})).await?,
        json!({ "enabled": false, "amount_per_claim": "0", "cap_per_account": "0", "cooldown_s": 0 })
    );
    fails_with(faucet(&ft, &carol, BYTE * 1_000).await?, "faucet disabled");
    fails_with(set_faucet(&ft, &carol, 500_000_000, 1_000_000_000, 3_600).await?, "owner only");
    let r = set_faucet(&ft, &owner, 500_000_000, 1_000_000_000, 3_600).await?;
    gas("set_faucet", &r);
    r.into_result()?;
    assert_eq!(
        view(&ft, "faucet_config", json!({})).await?,
        json!({ "enabled": true, "amount_per_claim": "500000000", "cap_per_account": "1000000000", "cooldown_s": 3600 })
    );

    // 4. New account: the prediction is exact (cost - 1 refused, cost accepted).
    let st = view(&ft, "faucet_status", json!({ "account_id": carol.id() })).await?;
    let cost = rec(carol.id(), 16) + rec(carol.id(), 24);
    assert_eq!(st, json!({ "claimed": "0", "next_claim_at_ns": "0", "can_claim": true, "storage_cost_yocto": cost.to_string() }));
    fails_with(faucet(&ft, &carol, cost - 1).await?, &format!("attach the storage cost: {cost}"));
    let r = faucet(&ft, &carol, cost).await?;
    gas("faucet_mint", &r);
    assert!(
        r.logs().iter().any(|l| *l
            == format!(
                r#"EVENT_JSON:{{"standard":"nep141","version":"1.0.0","event":"ft_mint","data":[{{"owner_id":"{}","amount":"500000000","memo":"faucet"}}]}}"#,
                carol.id()
            )),
        "ft_mint event"
    );
    r.into_result()?;
    assert_eq!(balance(&ft, carol.id()).await?, 500_000_000);
    assert!(!view(&ft, "storage_balance_of", json!({ "account_id": carol.id() })).await?.is_null(), "claim registers");
    let st = view(&ft, "faucet_status", json!({ "account_id": carol.id() })).await?;
    assert_eq!(st["claimed"], "500000000");
    assert_eq!(st["can_claim"], false);
    assert_eq!(st["storage_cost_yocto"], "0");
    assert_ne!(st["next_claim_at_ns"], "0");

    // 5. Cooldown, then cap; an existing claimant gets the whole attachment back.
    fails_with(faucet(&ft, &carol, 0).await?, "faucet cooldown");
    set_faucet(&ft, &owner, 500_000_000, 1_000_000_000, 0).await?.into_result()?;
    let near_before = carol.view_account().await?.balance.as_yoctonear();
    let r = faucet(&ft, &carol, NearToken::from_near(1).as_yoctonear()).await?;
    gas("faucet_mint(existing_claimant)", &r);
    r.into_result()?;
    let spent = near_before - carol.view_account().await?.balance.as_yoctonear();
    assert!(spent < NearToken::from_millinear(10).as_yoctonear(), "1 NEAR refunded, only gas spent ({spent})");
    assert_eq!(balance(&ft, carol.id()).await?, 1_000_000_000);
    fails_with(faucet(&ft, &carol, 0).await?, "faucet cap reached");

    // 6. Registered account that never claimed pays the claim record only.
    let cost_a = rec(alice.id(), 24);
    let st = view(&ft, "faucet_status", json!({ "account_id": alice.id() })).await?;
    assert_eq!(st["storage_cost_yocto"], cost_a.to_string());
    fails_with(faucet(&ft, &alice, cost_a - 1).await?, &format!("attach the storage cost: {cost_a}"));
    let r = faucet(&ft, &alice, cost_a).await?;
    gas("faucet_mint(registered_account)", &r);
    r.into_result()?;
    assert_eq!(balance(&ft, alice.id()).await?, 1_250_000_000);

    // 7. A faucet claim counts as registration under registration_required.
    owner.call(ft.id(), "set_registration_required").args_json(json!({ "required": true })).transact().await?.into_result()?;
    faucet(&ft, &dave, BYTE * 1_000).await?.into_result()?;
    let tr = json!({ "receiver_id": dave.id(), "amount": "1" });
    alice.call(ft.id(), "ft_transfer").args_json(tr).deposit(NearToken::from_yoctonear(1)).transact().await?.into_result()?;
    assert_eq!(balance(&ft, dave.id()).await?, 500_000_001);
    owner.call(ft.id(), "set_registration_required").args_json(json!({ "required": false })).transact().await?.into_result()?;
    let supply: String = ft.view("ft_total_supply").await?.json()?;
    assert_eq!(supply, "3000000000", "1000 minted + 4 claims of 500");

    // 8. ft_transfer_call still works: a receiver that uses everything, and one without code (full refund).
    let recv = sub(&root, "recv", 5).await?;
    recv.deploy(RECEIVER_WASM).await?.into_result()?;
    let args = json!({ "receiver_id": recv.id(), "amount": "100000000", "msg": "" });
    let r = alice.call(ft.id(), "ft_transfer_call").args_json(args).deposit(NearToken::from_yoctonear(1)).max_gas().transact().await?;
    gas("mock-ft:ft_transfer_call(used)", &r);
    assert_eq!(r.into_result()?.json::<String>()?, "100000000");
    assert_eq!(balance(&ft, recv.id()).await?, 100_000_000);
    assert_eq!(balance(&ft, alice.id()).await?, 1_149_999_999);
    let args = json!({ "receiver_id": bob.id(), "amount": "1000", "msg": "" });
    let r = alice.call(ft.id(), "ft_transfer_call").args_json(args).deposit(NearToken::from_yoctonear(1)).max_gas().transact().await?;
    assert_eq!(r.into_result()?.json::<String>()?, "0", "no ft_on_transfer on bob: refunded");
    assert_eq!(balance(&ft, alice.id()).await?, 1_149_999_999);
    Ok(())
}
