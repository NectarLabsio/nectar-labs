//! WO-22 sandbox tests (included by tests/sandbox_v7.rs so G11's `--test sandbox_v7` runs them): Position Notes
//! against the real mock-ft and test-stubs wasm. Authority follows the transfer, transfer refused while Settling,
//! transfer clears the remote recipient, residual collateral to the Loan Note owner, `nft_token_svg` < 30 Tgas
//! with XML escaping, and the G11 gas rows for the owner setters of remote.rs / p1.rs / p2.rs.

use super::*;

const TGAS: u64 = 1_000_000_000_000;
const RCPT: &str = "3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV";
const VAULT: &str = "Nectar1Vau1t11111111111111111111111111111111";

async fn xfer(e: &Env, from: &Account, to: &AccountId, id: &str) -> anyhow::Result<ExecutionFinalResult> {
    Ok(from
        .call(e.core.id(), "nft_transfer")
        .args_json(json!({ "receiver_id": to, "token_id": id }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?)
}
async fn yocto_call(e: &Env, who: &Account, method: &str, args: Value) -> anyhow::Result<ExecutionFinalResult> {
    Ok(who.call(e.core.id(), method).args_json(args).deposit(NearToken::from_yoctonear(1)).gas(Gas::from_tgas(100)).transact().await?)
}
async fn note_owner(e: &Env, id: &str) -> anyhow::Result<String> {
    let t = view(e, "nft_token", json!({ "token_id": id })).await?;
    Ok(t["owner_id"].as_str().unwrap_or_default().to_string())
}
async fn status(e: &Env, id: u64) -> anyhow::Result<String> {
    let p = view(e, "get_position", json!({ "position_id": id.to_string() })).await?;
    Ok(p["status"].as_str().unwrap_or_default().to_string())
}
fn fails_with(r: &ExecutionFinalResult, why: &str) {
    assert!(r.is_failure() && format!("{:?}", r.failures()).contains(why), "expected {why}, got {:?}", r.failures());
}
fn logs_contain(r: &ExecutionFinalResult, needle: &str) -> bool {
    r.logs().iter().any(|l| l.contains(needle))
}

/// A new owner withdraws the quote and the old owner is refused; the transfer clears the remote recipient;
/// `nft_transfer_call` to an account without code returns the Note; `nft_resolve_transfer` is private.
#[tokio::test]
async fn notes_authority_follows_transfer() -> anyhow::Result<()> {
    let e = setup().await?;
    owner_call(&e, "set_quote_params", json!({ "min_notice_period_ns": SEC.to_string(), "min_quote_usd_e6": "100000000" })).await?;
    let buyer = user(&e, 1_000_000_000, 0).await?;
    let msg = format!(
        r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":300,"notice_period_ns":"{}","buyer_remote_recipient":"{RCPT}"}}}}"#,
        2 * SEC
    );
    let r = ft_call(&e.usdc, &buyer, e.core.id(), 1_000_000_000, &msg).await?;
    gas("FundPappusQuote+nft_mint", &r);
    assert!(r.is_success() && logs_contain(&r, r#""standard":"nep171","version":"1.0.0","event":"nft_mint""#), "{:?}", r.logs());
    assert_eq!(note_owner(&e, "q-2").await?, buyer.id().as_str());
    assert_eq!(view(&e, "nft_total_supply", json!({})).await?, json!("3"));
    let meta = view(&e, "nft_metadata", json!({})).await?;
    assert_eq!(meta["spec"], "nft-1.0.0");

    let bob = e.worker.dev_create_account().await?;
    let r = xfer(&e, &buyer, bob.id(), "q-2").await?;
    gas("nft_transfer", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    assert!(logs_contain(&r, r#""event":"nft_transfer""#) && logs_contain(&r, "quote_remote_recipient_cleared"));
    let q = view(&e, "get_quote", json!({ "quote_id": "2" })).await?;
    assert_eq!((q["buyer"].as_str(), &q["buyer_remote_recipient"]), (Some(bob.id().as_str()), &Value::Null));
    assert_eq!(view(&e, "nft_supply_for_owner", json!({ "account_id": bob.id() })).await?, json!("1"));
    let owned = view(&e, "nft_tokens_for_owner", json!({ "account_id": bob.id() })).await?;
    assert_eq!(owned[0]["token_id"], "q-2");

    // the old owner is refused everywhere; the transfer itself is owner-only
    fails_with(&yocto_call(&e, &buyer, "initiate_quote_withdrawal", json!({ "quote_id": "2" })).await?, "buyer only");
    fails_with(&xfer(&e, &buyer, buyer.id(), "q-2").await?, "note owner only");

    // the new owner sets a recipient, then a transfer_call to an account without code comes back
    let r = bob
        .call(e.core.id(), "set_quote_remote_recipient")
        .args_json(json!({ "quote_id": "2", "recipient": RCPT }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    gas("set_quote_remote_recipient", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let carol = e.worker.dev_create_account().await?;
    let r = yocto_call(&e, &bob, "nft_transfer_call", json!({ "receiver_id": carol.id(), "token_id": "q-2", "msg": "" })).await?;
    gas("nft_transfer_call(returned)", &r);
    assert_eq!(note_owner(&e, "q-2").await?, bob.id().as_str(), "receiver call failed -> Note returned");
    let r = carol
        .call(e.core.id(), "nft_resolve_transfer")
        .args_json(json!({ "previous_owner_id": bob.id(), "receiver_id": carol.id(), "token_id": "q-2" }))
        .transact()
        .await?;
    fails_with(&r, "Method nft_resolve_transfer is private");

    // the new owner withdraws principal
    let r = yocto_call(&e, &bob, "initiate_quote_withdrawal", json!({ "quote_id": "2" })).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    advance(&e, 3).await?;
    let r = yocto_call(&e, &bob, "complete_quote_withdrawal", json!({ "quote_id": "2" })).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(bal(&e.usdc, bob.id()).await?, 1_000_000_000, "principal to the Note owner");
    assert_eq!(bal(&e.usdc, buyer.id()).await?, 0);
    Ok(())
}

/// Anyone repays; the residual collateral goes to the Loan Note owner, not the original borrower.
#[tokio::test]
async fn notes_residual_collateral_to_loan_note_owner() -> anyhow::Result<()> {
    let e = setup().await?;
    let alice = user(&e, 0, UNITS).await?;
    assert_eq!(borrow(&e, &alice, 10_000_000_000, "", "LockCollateralAndBorrow+nft_mint").await?, 0);
    assert_eq!(note_owner(&e, "p-0").await?, alice.id().as_str());
    let carol = e.worker.dev_create_account().await?;
    let r = xfer(&e, &alice, carol.id(), "p-0").await?;
    gas("nft_transfer(loan)", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    let payer = user(&e, 10_000_000_000, 0).await?;
    let r = ft_call(&e.usdc, &payer, e.core.id(), 10_000_000_000, r#"{"Repay":{"position_id":"0"}}"#).await?;
    gas("Repay(full)->note owner", &r);
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(bal(&e.nvdax, carol.id()).await?, UNITS, "residual collateral to the Loan Note owner");
    assert_eq!(bal(&e.nvdax, alice.id()).await?, 0);
    assert_eq!(status(&e, 0).await?, "Closed");
    Ok(())
}

/// Transfer refused while Settling (OutLayer yield never resumed): the Loan Note and the candidate Quote Notes are
/// locked; `cancel_settlement` unlocks them.
#[tokio::test]
async fn notes_transfer_refused_while_settling() -> anyhow::Result<()> {
    let e = setup().await?;
    let alice = user(&e, 0, UNITS).await?;
    assert_eq!(borrow(&e, &alice, 10_000_000_000, "", "borrow").await?, 0);
    for p in [155_000_000, 140_000_000, 125_000_000] {
        price(&e, p).await?;
    }
    let s = e.worker.dev_deploy(&wasm("test_stubs")).await?;
    s.call("new").transact().await?.into_result()?;
    s.call("set_mode").args_json(json!({ "mode": "hang", "disc_bps": 0 })).transact().await?.into_result()?;
    owner_call(&e, "set_outlayer_account", json!({ "account_id": s.id() })).await?;
    owner_call(&e, "set_quoter_config", json!({ "deposit_yocto": "1000", "gas_tgas": 100,
        "max_instructions": "100000000", "max_memory_mb": 128, "max_execution_seconds": 30 })).await?;
    owner_call(&e, "set_quoter_pin", json!({ "project_id": "nectar.testnet/nectar-quoter", "version_key": "ab".repeat(32) })).await?;
    owner_call(&e, "set_vol_bps", json!({ "symbol": "NVDAx", "vol_bps": 420 })).await?;
    let _pending = e
        .keeper
        .call(e.core.id(), "trigger_preliquidation")
        .args_json(json!({ "position_id": "0" }))
        .gas(Gas::from_tgas(300))
        .transact_async()
        .await?;
    let mut seen = false;
    for _ in 0..20 {
        e.worker.fast_forward(2).await?;
        if status(&e, 0).await? == "Settling" {
            seen = true;
            break;
        }
    }
    assert!(seen, "position 0 reached Settling");
    let bob = e.worker.dev_create_account().await?;
    let r = xfer(&e, &alice, bob.id(), "p-0").await?;
    fails_with(&r, "note_locked: pending settlement");
    for id in ["p-0", "q-0", "q-1"] {
        assert_eq!(view(&e, "nft_transfer_locked", json!({ "token_id": id })).await?, json!(true), "{id}");
    }
    assert!(view(&e, "nft_token_svg", json!({ "token_id": "p-0" })).await?.as_str().unwrap().contains(">SETTLING<"));
    let r = e.owner.call(e.core.id(), "cancel_settlement").args_json(json!({ "position_id": "0" })).transact().await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(view(&e, "nft_transfer_locked", json!({ "token_id": "q-0" })).await?, json!(false));
    let r = xfer(&e, &alice, bob.id(), "p-0").await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(note_owner(&e, "p-0").await?, bob.id().as_str());
    Ok(())
}

/// `nft_token_svg` (called as a transaction to measure it) stays under 30 Tgas; the asset symbol is XML-escaped.
#[tokio::test]
async fn notes_svg_gas_and_xml_escaping() -> anyhow::Result<()> {
    let e = setup().await?;
    let alice = user(&e, 0, UNITS).await?;
    assert_eq!(borrow(&e, &alice, 10_000_000_000, "", "borrow").await?, 0);
    for (method, args) in [
        ("nft_token_svg", json!({ "token_id": "p-0" })),
        ("nft_token_svg(quote)", json!({ "token_id": "q-0" })),
        ("nft_token", json!({ "token_id": "p-0" })),
        ("nft_tokens", json!({})),
        ("nft_tokens_for_owner", json!({ "account_id": alice.id() })),
        ("nft_transfer_locked", json!({ "token_id": "p-0" })),
    ] {
        let m = method.split('(').next().unwrap();
        let r = alice.call(e.core.id(), m).args_json(args).gas(Gas::from_tgas(300)).transact().await?;
        gas(method, &r);
        assert!(r.is_success(), "{method}: {:?}", r.failures());
        if m == "nft_token_svg" {
            assert!(r.total_gas_burnt.as_gas() < 30 * TGAS, "{method} burnt {}", r.total_gas_burnt.as_gas());
        }
    }
    let svg = view(&e, "nft_token_svg", json!({ "token_id": "p-0" })).await?;
    let svg = svg.as_str().unwrap();
    assert!(svg.starts_with("<svg") && !svg.contains("{{") && svg.contains(e.core.id().as_str()) && svg.contains(">LOAN p-0<"));
    let tok = view(&e, "nft_token", json!({ "token_id": "p-0" })).await?;
    assert!(tok["metadata"]["media"].as_str().unwrap().starts_with("data:image/svg+xml;base64,PHN2Zy"));

    let odd = deploy_ft(&e.worker, &e.owner, "ODD").await?;
    owner_call(&e, "upsert_collateral", json!({ "symbol": "N<&>'", "config": {
        "symbol": "N<&>'", "token": odd.id(), "decimals": 6, "price_feed_id": "TODO-G5",
        "base_ltv_bps": 4000, "max_nectar_ltv_bps": 7000, "base_haircut_bps": 1000,
        "weekend_haircut_bps": 2500, "limit_premium_bps": 300, "pre_liq_min_bps": 6500,
        "pre_liq_max_bps": 8000, "verified_dex_depth_usd_e6": "0", "nectar_reserve_usd_e6": "0",
        "remote_chain": null } }))
    .await?;
    let b = user(&e, 100_000_000, 0).await?;
    let msg = r#"{"FundPappusQuote":{"collateral":"N<&>'","max_discount_bps":300,"notice_period_ns":"604800000000000"}}"#;
    ft_call(&e.usdc, &b, e.core.id(), 100_000_000, msg).await?.into_result()?;
    let id = format!("q-{}", view(&e, "nft_total_supply", json!({})).await?.as_str().unwrap().parse::<u64>()? - 2);
    let s = view(&e, "nft_token_svg", json!({ "token_id": id })).await?;
    let s = s.as_str().unwrap();
    assert!(s.contains(">N&lt;&amp;&gt;&apos;<") && !s.contains("N<&>"), "{s}");
    Ok(())
}

/// G11 prep: one gas row per owner setter that had none (2 in remote.rs, 8 in p1.rs / p2.rs); each < 100 Tgas.
#[tokio::test]
async fn gas_rows_g11_owner_setters() -> anyhow::Result<()> {
    let e = setup().await?;
    let calls = [
        ("set_allow_keeper_deposit_attestation", json!({ "allow": true })),
        ("set_vault_read_config", json!({ "project_id": "nectar.testnet/vault-read", "version_key": "ab".repeat(32),
            "deposit_yocto": "100", "gas_tgas": 50 })),
        ("set_quoter_secrets_ref", json!({ "secrets_ref": { "profile": "nectar-quoter", "account_id": e.owner.id() } })),
        ("set_quoter_pin", json!({ "project_id": "nectar.testnet/nectar-quoter", "version_key": "ab".repeat(32) })),
        ("set_outlayer_account", json!({ "account_id": e.keeper.id() })),
        ("set_vol_bps", json!({ "symbol": "NVDAx", "vol_bps": 420 })),
        ("set_oracle_source", json!({ "symbol": "NVDAx", "source": "Owner" })),
        ("set_max_conf_bps", json!({ "max_conf_bps": 100 })),
        ("set_signer_config", json!({ "account": e.keeper.id(), "path": "solana-devnet-v1", "gas_tgas": 15, "expiry_s": 3600 })),
        ("set_remote_chain", json!({ "symbol": "NVDAx",
            "remote_chain": { "chain_id": "solana-devnet", "vault_program": VAULT, "mpc_domain_id": 1 } })),
    ];
    for (method, args) in calls {
        let r = owner_call(&e, method, args).await?; // prints GAS,<method>,<gas>
        assert!(r.total_gas_burnt.as_gas() < 100 * TGAS, "{method}");
    }
    Ok(())
}
