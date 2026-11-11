//! P2 + remote lifecycle unit tests (WO-15, WO-21): preimage golden vectors (tests/preimage_vectors.json),
//! validators, signature parsing, authority parsing (F-338/F-339), owner setters + views, and every remote
//! transition: reserve -> authority -> confirm (OutLayer) | keeper attestation -> Open -> settle sign requested ->
//! signed | sign failed -> relayed; repay -> release signed -> relayed; expiry; and every panic path.

use super::*;
use crate::chainsig::{self, PreimageInput};
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{PromiseResult, testing_env};

pub(crate) const T0: u64 = 1_700_000_000_000_000_000;
pub(crate) const SEC: u64 = 1_000_000_000;
pub(crate) const VAULT: &str = "Nectar1Vau1t11111111111111111111111111111111";
pub(crate) const RCPT: &str = "3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV";
pub(crate) const TX: &str = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
/// F-338 live answer for `solana-devnet/pos/0` (pred v2, domain 1).
pub(crate) const AUTH_B58: &str = "2fhY3GjCcp4LU75uiiChUqQg9fS6xCtptLYZUdKJibpN";
pub(crate) const DEPOSITOR: &str = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB48";
pub(crate) const RESERVE: u128 = 1_000;
pub(crate) const VR_DEPOSIT: u128 = 100;
pub(crate) const UNITS: u128 = 100_000_000;
pub(crate) const BORROW: u128 = 11_250_000_000;

pub(crate) fn a(s: &str) -> AccountId {
    s.parse().unwrap()
}
pub(crate) fn owner() -> AccountId {
    a("owner.test")
}
pub(crate) fn keeper() -> AccountId {
    a("keeper.test")
}
pub(crate) fn core() -> AccountId {
    a("core.test")
}
pub(crate) fn nvdax() -> AccountId {
    a("nvdax.test")
}
pub(crate) fn usdc() -> AccountId {
    a("usdc.test")
}
pub(crate) fn borrower() -> AccountId {
    a("borrower.test")
}
pub(crate) fn auth() -> String {
    format!("ed25519:{AUTH_B58}")
}

pub(crate) fn ctx_gas(pred: AccountId, deposit: u128, ts: u64, tgas: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(core())
        .predecessor_account_id(pred.clone())
        .signer_account_id(pred)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(ts)
        .prepaid_gas(Gas::from_tgas(tgas));
    testing_env!(b.build());
}
pub(crate) fn set_ctx(pred: AccountId, deposit: u128, ts: u64) {
    ctx_gas(pred, deposit, ts, 300);
}

/// Callback context: predecessor = this contract, one promise result.
pub(crate) fn cb_ctx(ts: u64, result: PromiseResult) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(core()).predecessor_account_id(core()).block_timestamp(ts).prepaid_gas(Gas::from_tgas(60));
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
}

pub(crate) fn callback(c: &mut Nectar, ts: u64, nonce: u64, result: PromiseResult) {
    cb_ctx(ts, result);
    c.on_signature(U64(0), U64(0), U64(nonce));
}

pub(crate) fn event_with(name: &str, needle: &str) -> bool {
    get_logs().iter().any(|l| l.contains(&format!("\"event\":\"{name}\"")) && l.contains(needle))
}

pub(crate) fn input() -> CollateralInput {
    CollateralInput {
        symbol: "NVDAx".into(),
        token: nvdax(),
        decimals: 6,
        price_feed_id: "TODO-G5".into(),
        base_ltv_bps: 4000,
        max_nectar_ltv_bps: 7000,
        base_haircut_bps: 1000,
        weekend_haircut_bps: 2500,
        limit_premium_bps: 300,
        pre_liq_min_bps: 6500,
        pre_liq_max_bps: 8000,
        price_kind: None,
        verified_dex_depth_usd_e6: U128(0),
        remote_chain: None,
    }
}

pub(crate) fn rc() -> RemoteChain {
    RemoteChain { chain_id: "solana-devnet".into(), vault_program: VAULT.into(), mpc_domain_id: 1 }
}

pub(crate) fn ft(c: &mut Nectar, token: AccountId, sender: &str, amount: u128, msg: &str) -> u128 {
    set_ctx(token, 0, T0 + SEC);
    match c.ft_on_transfer(a(sender), U128(amount), msg.to_string()) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    }
}

pub(crate) fn fund(c: &mut Nectar, buyer: &str, amt: u128, disc: u16, remote: bool) {
    let rr = if remote { format!("\"{RCPT}\"") } else { "null".into() };
    let m = format!(
        r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":{disc},"notice_period_ns":"604800000000000","buyer_remote_recipient":{rr}}}}}"#
    );
    assert_eq!(ft(c, usdc(), buyer, amt, &m), 0);
}

/// Collateral, price 180 @T0, gas reserve, $50k lender liquidity. `chain`: remote_chain + signer + vault_read.
pub(crate) fn base(chain: bool) -> Nectar {
    set_ctx(owner(), 0, T0);
    let mut c = Nectar::new(owner(), usdc(), keeper());
    c.upsert_collateral("NVDAx".into(), input());
    assert!(c.update_owner_price("NVDAx".into(), U128(180_000_000)));
    set_ctx(owner(), RESERVE, T0);
    c.fund_gas_reserve();
    if chain {
        set_ctx(owner(), 0, T0);
        c.set_remote_chain("NVDAx".into(), Some(rc()));
        c.set_signer_config(a("v1.signer-prod.testnet"), "solana-devnet-v1".into(), 15, 3600);
        c.set_vault_read_config("nectar.testnet/vault-read".into(), "ab".repeat(32), U128(VR_DEPOSIT), 50);
    }
    assert_eq!(ft(&mut c, usdc(), "lender.test", 50_000_000_000, r#""SupplyLendingLiquidity""#), 0);
    c
}

pub(crate) fn reserve(c: &mut Nectar, ts: u64) -> u64 {
    set_ctx(borrower(), crate::remote::RESERVE_DEPOSIT_YOCTO, ts);
    c.reserve_remote_position("NVDAx".into(), U128(UNITS), U128(BORROW), 7500, None, None, None, None, DEPOSITOR.into()).0
}

pub(crate) fn authority_cb(c: &mut Nectar, id: u64, result: PromiseResult) {
    cb_ctx(T0 + SEC, result);
    c.on_authority(U64(id));
}

pub(crate) fn key_result(k: &str) -> PromiseResult {
    PromiseResult::Successful(serde_json::to_vec(&k).unwrap())
}

pub(crate) fn vault_json(id: u64, units: u128, authority: &str, depositor: &str) -> PromiseResult {
    PromiseResult::Successful(
        format!(
            r#"{{"position_id":"{id}","units":"{units}","authority":"{authority}","depositor":"{depositor}","slot_or_block":412345678}}"#
        )
        .into_bytes(),
    )
}

pub(crate) fn confirm(c: &mut Nectar, id: u64, ts: u64) {
    set_ctx(a("anyone.test"), 0, ts);
    c.confirm_remote_deposit(U64(id));
}

pub(crate) fn verified(c: &mut Nectar, id: u64, ts: u64, result: PromiseResult) {
    cb_ctx(ts, result);
    c.on_deposit_verified(U64(id));
}

/// Reserved position 0 with its authority stored (AwaitingDeposit).
pub(crate) fn reserved() -> Nectar {
    let mut c = base(true);
    fund(&mut c, "buyer1.test", 15_000_000_000, 250, true);
    fund(&mut c, "buyer2.test", 5_000_000_000, 400, false);
    assert_eq!(reserve(&mut c, T0 + SEC), 0);
    authority_cb(&mut c, 0, key_result(&auth()));
    c
}

/// buyer1 $12k @250 (remote recipient when `r1`), buyer2 $5k @400 (remote when `r2`); remote position 0 with
/// 100 NVDAx / $11,250 confirmed through OutLayer at 180; price then 180 -> 155 -> 140 (unhealthy).
pub(crate) fn open_remote(r1: bool, r2: bool) -> Nectar {
    let mut c = base(true);
    fund(&mut c, "buyer1.test", 15_000_000_000, 250, r1);
    fund(&mut c, "buyer2.test", 5_000_000_000, 400, r2);
    assert_eq!(reserve(&mut c, T0 + SEC), 0);
    authority_cb(&mut c, 0, key_result(&auth()));
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 2 * SEC, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    assert_eq!(c.get_position(U64(0)).unwrap().remote.unwrap().status, RemoteStatus::Open);
    drop_price(&mut c);
    c
}

pub(crate) fn drop_price(c: &mut Nectar) {
    set_ctx(owner(), 0, T0 + 3 * SEC);
    assert!(c.update_owner_price("NVDAx".into(), U128(155_000_000)));
    set_ctx(owner(), 0, T0 + 4 * SEC);
    assert!(c.update_owner_price("NVDAx".into(), U128(140_000_000)));
}

pub(crate) fn trigger(c: &mut Nectar) {
    set_ctx(keeper(), 0, T0 + 5 * SEC);
    c.trigger_preliquidation(U64(0));
}

pub(crate) fn remote(c: &Nectar, id: u64) -> RemoteInfo {
    c.get_position(U64(id)).unwrap().remote.unwrap()
}

pub(crate) fn sig_json(byte: u8, n: usize) -> Vec<u8> {
    format!(r#"{{"scheme":"Ed25519","signature":{:?}}}"#, vec![byte; n]).into_bytes()
}

/// Remote position 0 fully repaid in USDC (debt 0, still Open, collateral in the vault).
pub(crate) fn repaid() -> Nectar {
    let mut c = base(true);
    fund(&mut c, "buyer9.test", 16_000_000_000, 400, true); // aggregate capacity (A1), fitting (SR-5)
    assert_eq!(reserve(&mut c, T0 + SEC), 0);
    authority_cb(&mut c, 0, key_result(&auth()));
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 2 * SEC, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    assert_eq!(ft(&mut c, usdc(), "borrower.test", BORROW, r#"{"Repay":{"position_id":"0"}}"#), 0);
    c
}

pub(crate) fn release(c: &mut Nectar, ts: u64) {
    set_ctx(a("anyone.test"), 0, ts);
    c.request_remote_release(U64(0));
}

pub(crate) fn release_cb(c: &mut Nectar, ts: u64, nonce: u64, result: PromiseResult) {
    cb_ctx(ts, result);
    c.on_release_signature(U64(0), U64(nonce));
}

// ------------------------------------------------------------------ pure helpers

// ------------------------------------------------------------------ pure helpers

#[derive(near_sdk::serde::Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct Vectors {
    test_public_key_hex: String,
    vectors: Vec<Vector>,
}
#[derive(near_sdk::serde::Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct Vector {
    chain_id: String,
    vault_program: String,
    position_id: String,
    quote_id: String,
    repay_e6: String,
    seize_units: String,
    recipient: String,
    nonce: String,
    expires: String,
    preimage: String,
    preimage_hex: String,
    signature_hex: String,
}

fn unhex(s: &str) -> Vec<u8> {
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}

#[test]
fn preimage_golden_vectors_byte_for_byte() {
    let v: Vectors = serde_json::from_str(include_str!("../tests/preimage_vectors.json")).unwrap();
    assert!(v.vectors.len() >= 3);
    let pk = ed25519_dalek::VerifyingKey::from_bytes(&unhex(&v.test_public_key_hex).try_into().unwrap()).unwrap();
    for x in v.vectors {
        let p = chainsig::build_preimage(&PreimageInput {
            chain_id: &x.chain_id,
            vault_program: &x.vault_program,
            position_id: x.position_id.parse().unwrap(),
            quote_id: x.quote_id.parse().unwrap(),
            repay_e6: x.repay_e6.parse().unwrap(),
            seize_units: x.seize_units.parse().unwrap(),
            recipient: &x.recipient,
            nonce: x.nonce.parse().unwrap(),
            expires: x.expires.parse().unwrap(),
        });
        assert_eq!(p, x.preimage);
        assert_eq!(chainsig::hex(p.as_bytes()), x.preimage_hex);
        assert!(p.len() <= chainsig::MAX_EDDSA_PAYLOAD);
        // JS (@noble) signature over the raw bytes verifies in Rust (dalek): no pre-hash on either side (D-016)
        let sig = ed25519_dalek::Signature::from_bytes(&unhex(&x.signature_hex).try_into().unwrap());
        pk.verify_strict(p.as_bytes(), &sig).unwrap();
    }
}

#[test]
fn validators_and_signature_parse() {
    assert!(chainsig::valid_base58_address(RCPT));
    assert!(!chainsig::valid_base58_address("0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl"));
    assert!(!chainsig::valid_base58_address("short"));
    assert!(!chainsig::valid_base58_address(&format!("{RCPT}|x")));
    assert!(chainsig::valid_tx_signature(TX));
    assert!(!chainsig::valid_tx_signature(RCPT));
    assert!(chainsig::valid_chain_id("solana-devnet"));
    assert!(!chainsig::valid_chain_id("Solana Devnet"));
    assert!(!chainsig::valid_chain_id(""));
    assert!(chainsig::valid_path("solana-devnet-v1"));
    assert!(!chainsig::valid_path("a b"));
    assert!(!chainsig::valid_path(&"x".repeat(65)));
    assert_eq!(chainsig::parse_signature_response(&sig_json(9, 64)), Ok([9u8; 64]));
    assert_eq!(chainsig::parse_signature_response(&sig_json(9, 63)), Err("bad_length"));
    assert_eq!(
        chainsig::parse_signature_response(br#"{"scheme":"Secp256k1","signature":[1]}"#),
        Err("bad_scheme")
    );
    assert_eq!(chainsig::parse_signature_response(b"null"), Err("bad_response"));
}

// ------------------------------------------------------------------ setters + views

#[test]
fn v2_preimage_kinds_release_and_path() {
    let i = PreimageInput {
        chain_id: "solana-devnet",
        vault_program: VAULT,
        position_id: 7,
        quote_id: 12,
        repay_e6: 1_250_000_000,
        seize_units: 9058,
        recipient: "11111111111111111111111111111111",
        nonce: 1,
        expires: 1_762_819_200,
    };
    let v1 = chainsig::build_preimage(&i);
    assert_eq!(chainsig::build_preimage_v2(&i, chainsig::KIND_PRELIQ).unwrap(), format!("{v1}|kind=PRELIQ"));
    assert_eq!(chainsig::build_preimage_v2(&i, chainsig::KIND_SELF).unwrap(), format!("{v1}|kind=SELF"));
    assert_eq!(chainsig::build_preimage_v2(&i, 0), None, "v2 never produces the legacy kind 0");
    // byte-identical to solana/programs/nectar_vault/src/preimage.rs `release_format`
    assert_eq!(
        chainsig::build_release_preimage("solana-devnet", VAULT, 7, RCPT, 9, 1_762_819_200),
        "NECTAR_RELEASE_V1|chain=solana-devnet|vault=Nectar1Vau1t11111111111111111111111111111111|pos=7|recipient=3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV|nonce=9|expires=1762819200"
    );
    assert_eq!(chainsig::position_path("solana-devnet", 42), "solana-devnet/pos/42");
    assert!(chainsig::valid_path(&chainsig::position_path("solana-devnet", u64::MAX)));
}

#[test]
fn base58_and_authority_parsing() {
    assert_eq!(chainsig::b58_decode("11111111111111111111111111111111"), Some(vec![0u8; 32]));
    assert_eq!(chainsig::b58_decode("112"), Some(vec![0, 0, 1]));
    assert_eq!(chainsig::b58_decode(""), None);
    assert_eq!(chainsig::b58_decode("0OIl"), None);
    assert_eq!(chainsig::b58_decode(AUTH_B58).unwrap().len(), 32);
    assert_eq!(chainsig::authority_from_derived_key(&auth(), 1), Ok(auth()));
    assert_eq!(chainsig::authority_from_derived_key(AUTH_B58, 1), Err("bad_curve"));
    assert_eq!(chainsig::authority_from_derived_key("ed25519:0OIl", 1), Err("bad_base58"));
    assert_eq!(chainsig::authority_from_derived_key("ed25519:112", 1), Err("bad_key_length"));
    assert_eq!(chainsig::authority_from_derived_key(&auth(), 7), Err("bad_domain"));
    // F-339 worked example: v2 `base-sepolia/pos/0` -> EVM address 0xbcb6eab973570cb1e5c16195696b8bddb4c7d8f7 (public)
    let secp = "secp256k1:64HT9SZmkJET5rHBHBR1pymtPgT6J74C8EoeRSmuTaE2Sgh1QHUGh3Aw76PCQuVtUpfrfwunKPL3aM5aCNBGBKJM";
    assert_eq!(chainsig::authority_from_derived_key(secp, 0), Ok("0xbcb6eab973570cb1e5c16195696b8bddb4c7d8f7".into()));
    assert_eq!(chainsig::authority_from_derived_key(&auth(), 0), Err("bad_curve"));
    assert_eq!(chainsig::authority_from_derived_key("secp256k1:112", 0), Err("bad_key_length"));
    assert!(chainsig::authority_matches(&auth(), AUTH_B58));
    assert!(chainsig::authority_matches(&auth(), &auth()));
    assert!(!chainsig::authority_matches(&auth(), RCPT));
    assert!(chainsig::authority_matches("0xbcb6eab973570cb1e5c16195696b8bddb4c7d8f7", "0xBCB6EAB973570CB1E5C16195696B8BDDB4C7D8F7"));
    assert!(!chainsig::authority_matches("0xbcb6", "0xbcb6"));
}

#[test]
fn vault_read_parsing() {
    use crate::remote::{VaultRead, parse_vault_read, valid_depositor, valid_tx_ref};
    let ok = br#"{"position_id":3,"units":100,"authority":"A","depositor":"D","slot_or_block":"77"}"#;
    assert_eq!(
        parse_vault_read(ok, 3),
        Ok(VaultRead { units: 100, authority: "A".into(), depositor: "D".into(), slot_or_block: "77".into() })
    );
    assert_eq!(parse_vault_read(ok, 4), Err("position_mismatch"));
    assert_eq!(parse_vault_read(b"null", 3), Err("no_result"));
    assert_eq!(parse_vault_read(b"{\"error\":\"rpc\"}", 3), Err("job_error"));
    assert_eq!(parse_vault_read(b"nope", 3), Err("parse"));
    assert_eq!(parse_vault_read(br#"{"position_id":"3","units":"x"}"#, 3), Err("bad_units"));
    assert_eq!(parse_vault_read(br#"{"position_id":"3","units":"1","authority":1}"#, 3), Err("bad_authority"));
    assert_eq!(parse_vault_read(br#"{"position_id":"3","units":"1","authority":"A"}"#, 3), Err("bad_depositor"));
    assert_eq!(
        parse_vault_read(br#"{"position_id":"3","units":"1","authority":"A","depositor":"D","slot_or_block":[]}"#, 3),
        Err("bad_slot")
    );
    let long = format!(r#"{{"position_id":"3","units":"1","authority":"{}","depositor":"D","slot_or_block":1}}"#, "a".repeat(200));
    assert_eq!(parse_vault_read(long.as_bytes(), 3), Err("too_long"));
    assert!(valid_depositor(DEPOSITOR, 1) && !valid_depositor("0xab", 1));
    assert!(valid_depositor("0xbcb6eab973570cb1e5c16195696b8bddb4c7d8f7", 0) && !valid_depositor(DEPOSITOR, 0));
    assert!(!valid_depositor(DEPOSITOR, 9));
    assert!(valid_tx_ref(TX) && !valid_tx_ref("") && !valid_tx_ref("a b") && !valid_tx_ref(&"x".repeat(129)));
}

// ------------------------------------------------------------------ setters + views

#[test]
fn signer_config_and_views() {
    let mut c = base(false);
    assert_eq!(c.get_signer_config(), None);
    assert_eq!(c.get_vault_authority_hint(U64(0)), None);
    assert_eq!(c.get_next_nonce(), U64(0));
    assert_eq!(c.get_pending_settlement(U64(0)), None);
    set_ctx(owner(), 0, T0);
    c.set_signer_config(a("v1.signer-prod.testnet"), "solana-devnet-v1".into(), 15, 3600);
    let s = c.get_signer_config().unwrap();
    assert_eq!((s.path.as_str(), s.gas_tgas, s.expiry_s), ("solana-devnet-v1", 15, 3600));
    assert_eq!(c.contract_version(), "2.2.0-v7");
    // the hint is per remote position: path `<chain>/pos/<id>`, never the global path
    let c = reserved();
    let h = c.get_vault_authority_hint(U64(0)).unwrap();
    assert_eq!((h.predecessor, h.signer_account), (core(), a("v1.signer-prod.testnet")));
    assert_eq!((h.path.as_str(), h.domain_id, h.authority), ("solana-devnet/pos/0", 1, Some(auth())));
}

#[test]
#[should_panic(expected = "owner only")]
fn signer_config_owner_only() {
    let mut c = base(false);
    set_ctx(keeper(), 0, T0);
    c.set_signer_config(a("v1.signer-prod.testnet"), "p".into(), 15, 3600);
}

#[test]
#[should_panic(expected = "gas_tgas out of range")]
fn signer_config_min_gas() {
    let mut c = base(false);
    set_ctx(owner(), 0, T0);
    c.set_signer_config(a("v1.signer-prod.testnet"), "p".into(), 14, 3600);
}

#[test]
#[should_panic(expected = "expiry_s out of range")]
fn signer_config_expiry() {
    let mut c = base(false);
    set_ctx(owner(), 0, T0);
    c.set_signer_config(a("v1.signer-prod.testnet"), "p".into(), 15, 10);
}

#[test]
#[should_panic(expected = "bad path")]
fn signer_config_bad_path() {
    let mut c = base(false);
    set_ctx(owner(), 0, T0);
    c.set_signer_config(a("v1.signer-prod.testnet"), "a b".into(), 15, 3600);
}

#[test]
fn set_remote_chain_and_clear() {
    let mut c = base(false);
    set_ctx(owner(), 0, T0);
    c.set_remote_chain("NVDAx".into(), Some(rc()));
    assert_eq!(c.get_collateral("NVDAx".into()).unwrap().remote_chain, Some(rc()));
    c.set_remote_chain("NVDAx".into(), None);
    assert_eq!(c.get_collateral("NVDAx".into()).unwrap().remote_chain, None);
}

#[test]
#[should_panic(expected = "bad remote_chain")]
fn set_remote_chain_rejects_secp_domain() {
    let mut c = base(false);
    set_ctx(owner(), 0, T0);
    c.set_remote_chain("NVDAx".into(), Some(RemoteChain { mpc_domain_id: 0, ..rc() }));
}

#[test]
#[should_panic(expected = "owner only")]
fn set_remote_chain_owner_only() {
    let mut c = base(false);
    set_ctx(keeper(), 0, T0);
    c.set_remote_chain("NVDAx".into(), Some(rc()));
}

#[test]
fn remote_config_setters_and_view() {
    let mut c = base(false);
    let v = c.get_remote_config();
    assert!(!v.allow_keeper_deposit_attestation && v.vault_read_project_id.is_none());
    assert_eq!(v.reservation_expiry_s, 1800);
    set_ctx(owner(), 0, T0);
    c.set_allow_keeper_deposit_attestation(true);
    c.set_vault_read_config("p".into(), "k".into(), U128(5), 40);
    let v = c.get_remote_config();
    assert!(v.allow_keeper_deposit_attestation);
    assert_eq!(
        (v.vault_read_project_id.as_deref(), v.vault_read_version_key.as_deref(), v.vault_read_deposit_yocto, v.vault_read_gas_tgas),
        (Some("p"), Some("k"), Some(U128(5)), Some(40))
    );
    assert!(event_with("vault_read_config_set", "\"gas_tgas\":40"));
    c.set_allow_keeper_deposit_attestation(false);
    assert!(!c.get_remote_config().allow_keeper_deposit_attestation);
}

#[test]
#[should_panic(expected = "owner only")]
fn allow_keeper_attestation_owner_only() {
    let mut c = base(false);
    set_ctx(keeper(), 0, T0);
    c.set_allow_keeper_deposit_attestation(true);
}

#[test]
#[should_panic(expected = "owner only")]
fn vault_read_config_owner_only() {
    let mut c = base(false);
    set_ctx(keeper(), 0, T0);
    c.set_vault_read_config("p".into(), "k".into(), U128(5), 40);
}

#[test]
#[should_panic(expected = "bad project pin")]
fn vault_read_config_empty_pin() {
    let mut c = base(false);
    set_ctx(owner(), 0, T0);
    c.set_vault_read_config(String::new(), "k".into(), U128(5), 40);
}

#[test]
#[should_panic(expected = "deposit must be > 0")]
fn vault_read_config_zero_deposit() {
    let mut c = base(false);
    set_ctx(owner(), 0, T0);
    c.set_vault_read_config("p".into(), "k".into(), U128(0), 40);
}

#[test]
#[should_panic(expected = "gas_tgas out of range")]
fn vault_read_config_gas() {
    let mut c = base(false);
    set_ctx(owner(), 0, T0);
    c.set_vault_read_config("p".into(), "k".into(), U128(5), 101);
}

// ------------------------------------------------------------------ NEAR-held: always settles on NEAR (v2)

#[test]
fn near_held_position_with_remote_quote_settles_on_near() {
    let mut c = base(true);
    fund(&mut c, "buyer1.test", 15_000_000_000, 250, true);
    fund(&mut c, "buyer9.test", 5_000_000_000, 400, false); // aggregate capacity (A1)
    let bm = r#"{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"11250000000","pre_liq_ltv_bps":7500}}"#;
    assert_eq!(ft(&mut c, nvdax(), "borrower.test", UNITS, bm), 0);
    drop_price(&mut c);
    trigger(&mut c);
    assert_eq!(c.get_pending_settlement(U64(0)), None, "no signature for NEAR-held collateral");
    assert!(event_with("settled_near", "\"quote_id\":\"0\""));
    assert!(!get_logs().iter().any(|l| l.contains("settlement_sign_requested")));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Closed);
    assert_eq!(c.get_next_nonce(), U64(0));
}

#[test]
fn lock_and_borrow_refuses_remote_path() {
    let mut c = base(true);
    let bm = r#"{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"1000000","pre_liq_ltv_bps":7500,"remote_path":"solana-devnet-v1"}}"#;
    assert_eq!(ft(&mut c, nvdax(), "borrower.test", UNITS, bm), UNITS, "full refund");
    assert!(get_logs().iter().any(|l| l.contains("remote_path removed in v2")));
    assert_eq!(c.get_position(U64(0)), None);
}

// ------------------------------------------------------------------ 1. reserve + authority + expiry

#[test]
fn reserve_creates_awaiting_position_without_locking_funds() {
    let mut c = base(true);
    fund(&mut c, "buyer1.test", 15_000_000_000, 250, true);
    let pool0 = c.get_pool();
    let id = reserve(&mut c, T0 + SEC);
    assert_eq!(id, 0);
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.units, p.debt_usd_e6, p.borrower.clone()), (PositionStatus::Open, U128(0), U128(0), borrower()));
    assert_eq!(p.remote_path.as_deref(), Some("solana-devnet/pos/0"));
    let r = p.remote.unwrap();
    assert_eq!(r.status, RemoteStatus::AwaitingDeposit);
    assert_eq!((r.path.as_str(), r.domain_id, r.vault_program.as_str()), ("solana-devnet/pos/0", 1, VAULT));
    assert_eq!((r.reserved_units, r.borrow_usd_e6, r.authority), (U128(UNITS), U128(BORROW), None));
    assert_eq!(r.expires_ns, U64(T0 + SEC + 1800 * SEC));
    assert_eq!((r.units, r.reserved_ns, r.paid_usd_e6), (U128(UNITS), U64(T0 + SEC), U128(0)));
    assert!(event_with("remote_reserved", "\"path\":\"solana-devnet/pos/0\""));
    assert_eq!(c.get_pool().available_usd_e6, pool0.available_usd_e6, "a reserve locks no pool funds");
    assert_eq!(c.get_config().next_position_id, U64(1));
    assert_eq!(reserve(&mut c, T0 + SEC), 1);
    assert_eq!(remote(&c, 1).path, "solana-devnet/pos/1");
}

#[test]
fn on_authority_stores_key_once() {
    let mut c = base(true);
    fund(&mut c, "buyer1.test", 15_000_000_000, 250, true);
    reserve(&mut c, T0 + SEC);
    authority_cb(&mut c, 0, key_result(&auth()));
    assert_eq!(remote(&c, 0).authority, Some(auth()));
    assert!(event_with("remote_authority_set", AUTH_B58));
    authority_cb(&mut c, 0, key_result(&format!("ed25519:{RCPT}")));
    assert_eq!(remote(&c, 0).authority, Some(auth()), "a second answer is ignored");
    authority_cb(&mut c, 9, key_result(&auth())); // unknown position: no-op
}

#[test]
fn on_authority_failure_ends_reservation() {
    for (res, reason) in [
        (PromiseResult::Failed, "failed"),
        (key_result("ed25519:0OIl"), "bad_base58"),
        (key_result("secp256k1:112"), "bad_curve"),
        (PromiseResult::Successful(b"42".to_vec()), "parse"),
    ] {
        let mut c = base(true);
        fund(&mut c, "buyer1.test", 15_000_000_000, 250, true);
        reserve(&mut c, T0 + SEC);
        authority_cb(&mut c, 0, res);
        let p = c.get_position(U64(0)).unwrap();
        assert_eq!((p.status, p.remote.unwrap().status), (PositionStatus::Closed, RemoteStatus::Expired));
        assert!(event_with("remote_reservation_failed", reason), "{reason}");
    }
}

#[test]
#[should_panic(expected = "paused")]
fn reserve_paused() {
    let mut c = base(true);
    set_ctx(owner(), 0, T0);
    c.pause();
    reserve(&mut c, T0 + SEC);
}

#[test]
#[should_panic(expected = "referrer_is_borrower")]
fn reserve_referrer_is_borrower() {
    let mut c = base(true);
    set_ctx(borrower(), 0, T0 + SEC);
    c.reserve_remote_position("NVDAx".into(), U128(UNITS), U128(BORROW), 7500, None, Some(borrower()), None, None, DEPOSITOR.into());
}

#[test]
#[should_panic(expected = "unknown collateral")]
fn reserve_unknown_collateral() {
    let mut c = base(true);
    set_ctx(borrower(), 0, T0 + SEC);
    c.reserve_remote_position("TSLAx".into(), U128(UNITS), U128(BORROW), 7500, None, None, None, None, DEPOSITOR.into());
}

#[test]
#[should_panic(expected = "no remote chain")]
fn reserve_without_remote_chain() {
    let mut c = base(false);
    reserve(&mut c, T0 + SEC);
}

#[test]
#[should_panic(expected = "no signer config")]
fn reserve_without_signer() {
    let mut c = base(false);
    set_ctx(owner(), 0, T0);
    c.set_remote_chain("NVDAx".into(), Some(rc()));
    reserve(&mut c, T0 + SEC);
}

#[test]
#[should_panic(expected = "units is zero")]
fn reserve_zero_units() {
    let mut c = base(true);
    set_ctx(borrower(), 0, T0 + SEC);
    c.reserve_remote_position("NVDAx".into(), U128(0), U128(BORROW), 7500, None, None, None, None, DEPOSITOR.into());
}

#[test]
#[should_panic(expected = "units exceed u64")]
fn reserve_units_above_u64() {
    let mut c = base(true);
    set_ctx(borrower(), 0, T0 + SEC);
    c.reserve_remote_position("NVDAx".into(), U128(u128::from(u64::MAX) + 1), U128(BORROW), 7500, None, None, None, None, DEPOSITOR.into());
}

#[test]
#[should_panic(expected = "borrow is zero")]
fn reserve_zero_borrow() {
    let mut c = base(true);
    set_ctx(borrower(), 0, T0 + SEC);
    c.reserve_remote_position("NVDAx".into(), U128(UNITS), U128(0), 7500, None, None, None, None, DEPOSITOR.into());
}

#[test]
#[should_panic(expected = "borrow exceeds u64")]
fn reserve_borrow_above_u64() {
    let mut c = base(true);
    set_ctx(borrower(), 0, T0 + SEC);
    c.reserve_remote_position("NVDAx".into(), U128(UNITS), U128(u128::from(u64::MAX) + 1), 7500, None, None, None, None, DEPOSITOR.into());
}

#[test]
#[should_panic(expected = "pre_liq_ltv_bps out of range")]
fn reserve_pre_liq_range() {
    let mut c = base(true);
    set_ctx(borrower(), 0, T0 + SEC);
    c.reserve_remote_position("NVDAx".into(), U128(UNITS), U128(BORROW), 9000, None, None, None, None, DEPOSITOR.into());
}

#[test]
#[should_panic(expected = "string too long")]
fn reserve_memo_too_long() {
    let mut c = base(true);
    set_ctx(borrower(), 0, T0 + SEC);
    let pay_to = PayTo { receiver_id: a("shop.test"), memo: Some("m".repeat(129)) };
    c.reserve_remote_position("NVDAx".into(), U128(UNITS), U128(BORROW), 7500, Some(pay_to), None, None, None, DEPOSITOR.into());
}

#[test]
#[should_panic(expected = "attach more gas")]
fn reserve_needs_gas() {
    let mut c = base(true);
    ctx_gas(borrower(), 0, T0 + SEC, 20);
    c.reserve_remote_position("NVDAx".into(), U128(UNITS), U128(BORROW), 7500, None, None, None, None, DEPOSITOR.into());
}

#[test]
fn expire_reservation_after_30_min() {
    let mut c = reserved();
    set_ctx(a("anyone.test"), 0, T0 + SEC + 1800 * SEC);
    c.expire_remote_reservation(U64(0));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.remote.unwrap().status), (PositionStatus::Closed, RemoteStatus::Expired));
    assert!(event_with("remote_reservation_expired", "\"position_id\":\"0\""));
}

#[test]
#[should_panic(expected = "reservation not expired")]
fn expire_too_early() {
    let mut c = reserved();
    set_ctx(a("anyone.test"), 0, T0 + 1800 * SEC);
    c.expire_remote_reservation(U64(0));
}

#[test]
#[should_panic(expected = "not a remote position")]
fn expire_near_position() {
    let mut c = base(true);
    fund(&mut c, "buyer9.test", 5_000_000_000, 400, false); // aggregate capacity (A1)
    let bm = r#"{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"1000000","pre_liq_ltv_bps":7500}}"#;
    assert_eq!(ft(&mut c, nvdax(), "borrower.test", UNITS, bm), 0);
    c.expire_remote_reservation(U64(0));
}

#[test]
#[should_panic(expected = "not awaiting deposit")]
fn expire_open_position() {
    let mut c = open_remote(true, false);
    set_ctx(a("anyone.test"), 0, T0 + 4000 * SEC);
    c.expire_remote_reservation(U64(0));
}

#[test]
#[should_panic(expected = "deposit check in flight")]
fn expire_while_confirming() {
    let mut c = reserved();
    confirm(&mut c, 0, T0 + 2 * SEC);
    set_ctx(a("anyone.test"), 0, T0 + 4000 * SEC);
    c.expire_remote_reservation(U64(0));
}

#[test]
#[should_panic(expected = "deposit recorded: request_remote_release")]
fn expire_with_recorded_deposit() {
    let mut c = reserved();
    // limits refuse (every price stale), the deposit is still recorded
    set_ctx(owner(), 0, T0);
    c.set_oracle_params(U64(1), U64(1), 1500);
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 2 * SEC, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    set_ctx(a("anyone.test"), 0, T0 + 4000 * SEC);
    c.expire_remote_reservation(U64(0));
}

// ------------------------------------------------------------------ 2. confirm (OutLayer) + keeper attestation

#[test]
fn confirm_requests_vault_read_from_gas_reserve() {
    let mut c = reserved();
    confirm(&mut c, 0, T0 + 2 * SEC);
    assert_eq!(c.get_gas_reserve(), U128(RESERVE - VR_DEPOSIT));
    let r = remote(&c, 0);
    assert!(r.confirming);
    assert_eq!(r.last_confirm_ns, U64(T0 + 2 * SEC));
    assert!(event_with(
        "remote_deposit_check_requested",
        r#"{\"job\":\"vault_read\",\"chain\":\"solana-devnet\",\"program\":\"Nectar1Vau1t11111111111111111111111111111111\",\"position_id\":\"0\",\"depositor\":\"4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB48\"}"#
    ));
}

#[test]
fn deposit_verified_pays_loan_and_opens() {
    let mut c = reserved();
    let pool0 = c.get_pool();
    let debt0 = c.get_collateral("NVDAx".into()).unwrap().total_debt_usd_e6.0;
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 3 * SEC, vault_json(0, UNITS + 5, &auth(), DEPOSITOR));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.units, p.debt_usd_e6), (PositionStatus::Open, U128(UNITS + 5), U128(BORROW)));
    assert!(p.premium_usd_e6.0 > 0);
    let r = p.remote.unwrap();
    assert_eq!((r.status, r.confirming), (RemoteStatus::Open, false));
    assert_eq!(r.units, U128(UNITS + 5));
    assert!(r.paid_usd_e6.0 > 0 && r.paid_usd_e6.0 < BORROW, "net of premium + origination");
    assert_eq!((r.depositor.as_deref(), r.source.as_deref(), r.deposit_ref.as_deref()), (Some(DEPOSITOR), Some("outlayer"), Some("412345678")));
    assert!(event_with("remote_deposit_confirmed", "\"source\":\"outlayer\""));
    assert!(event_with("remote_deposit_confirmed", "\"funded\":true"));
    assert!(event_with("position_opened", "\"remote\":true"));
    assert_eq!(c.get_pool().available_usd_e6.0, pool0.available_usd_e6.0 - BORROW);
    assert_eq!(c.get_collateral("NVDAx".into()).unwrap().total_debt_usd_e6.0, debt0 + BORROW);
    // a stale second callback is ignored
    verified(&mut c, 0, T0 + 4 * SEC, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    assert_eq!(c.get_position(U64(0)).unwrap().debt_usd_e6, U128(BORROW));
}

#[test]
fn deposit_verified_with_pay_to_and_referrer() {
    let mut c = base(true);
    fund(&mut c, "buyer1.test", 15_000_000_000, 250, true);
    set_ctx(owner(), 0, T0);
    c.register_referrer(a("ref.test"));
    set_ctx(borrower(), crate::remote::RESERVE_DEPOSIT_YOCTO, T0 + SEC);
    let pay_to = PayTo { receiver_id: a("shop.test"), memo: Some("inv-1".into()) };
    c.reserve_remote_position("NVDAx".into(), U128(UNITS), U128(5_000_000_000), 7500, Some(pay_to), Some(a("ref.test")), None, None, DEPOSITOR.into());
    authority_cb(&mut c, 0, key_result(&auth()));
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 2 * SEC, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    assert!(event_with("position_opened", "\"pay_to\":\"shop.test\""));
    assert!(event_with("referrer_paid", "\"referrer\":\"ref.test\""));
    assert!(c.get_claimable(a("ref.test")).0 > 0);
}

/// Forged attestation (GATE_FAIL_G11 note): a well-formed vault read whose authority is another valid key is refused,
/// pays nothing, and the genuine read after the cooldown still opens the loan.
#[test]
fn deposit_forged_authority_refused() {
    let mut c = reserved();
    let avail = c.get_pool().available_usd_e6;
    let forged = DEPOSITOR; // a real 32-byte base58 key, but not `remote.authority`
    assert_ne!(c.get_position(U64(0)).unwrap().remote.unwrap().authority.as_deref(), Some(forged));
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 3 * SEC, vault_json(0, UNITS, forged, DEPOSITOR));
    let p = c.get_position(U64(0)).unwrap();
    let r = p.remote.clone().unwrap();
    assert_eq!((r.status, r.confirming, r.depositor), (RemoteStatus::AwaitingDeposit, false, None));
    assert_eq!((p.debt_usd_e6, p.units), (U128(0), U128(0)));
    assert!(event_with("remote_deposit_rejected", "\"reason\":\"authority_mismatch\""));
    assert!(!event_with("remote_deposit_confirmed", ""));
    assert_eq!(c.get_pool().available_usd_e6, avail, "forged read pays nothing");
    // the genuine attestation is still accepted once the cooldown has passed
    let t = T0 + 2 * SEC + crate::remote::CONFIRM_COOLDOWN_S * SEC;
    confirm(&mut c, 0, t);
    verified(&mut c, 0, t, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6), (PositionStatus::Open, U128(BORROW)));
}

#[test]
fn deposit_rejections_keep_awaiting() {
    let cases: Vec<(PromiseResult, &str)> = vec![
        (vault_json(0, UNITS, RCPT, DEPOSITOR), "authority_mismatch"),
        (vault_json(0, u128::from(u64::MAX) + 1, AUTH_B58, DEPOSITOR), "units_exceed_u64"),
        (vault_json(0, UNITS, AUTH_B58, "0xabc"), "bad_depositor"),
        (vault_json(1, UNITS, AUTH_B58, DEPOSITOR), "position_mismatch"),
        (PromiseResult::Successful(b"null".to_vec()), "no_result"),
        (PromiseResult::Failed, "failed"),
    ];
    for (res, reason) in cases {
        let mut c = reserved();
        let avail = c.get_pool().available_usd_e6;
        confirm(&mut c, 0, T0 + 2 * SEC);
        verified(&mut c, 0, T0 + 3 * SEC, res);
        let p = c.get_position(U64(0)).unwrap();
        let r = p.remote.clone().unwrap();
        assert_eq!((r.status, r.confirming, r.depositor), (RemoteStatus::AwaitingDeposit, false, None), "{reason}");
        assert_eq!((p.debt_usd_e6, p.units), (U128(0), U128(0)));
        assert!(event_with("remote_deposit_rejected", reason), "{reason}");
        assert_eq!(c.get_pool().available_usd_e6, avail, "no fallback payout");
    }
}

#[test]
fn deposit_proven_but_limits_fail_records_depositor() {
    let mut c = reserved();
    set_ctx(owner(), 0, T0);
    c.set_oracle_params(U64(1), U64(1), 1500); // every price is stale now
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 2 * SEC, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    let p = c.get_position(U64(0)).unwrap();
    let r = p.remote.unwrap();
    assert_eq!((r.status, r.depositor.as_deref(), p.debt_usd_e6), (RemoteStatus::AwaitingDeposit, Some(DEPOSITOR), U128(0)));
    assert!(event_with("remote_loan_refused", "oracle stale"));
    assert!(event_with("remote_deposit_confirmed", "\"funded\":false"));
    // the collateral is releasable
    release(&mut c, T0 + 3 * SEC);
    assert_eq!(remote(&c, 0).status, RemoteStatus::Releasing);
}

#[test]
fn late_deposit_on_expired_reservation_is_releasable_without_loan() {
    let mut c = reserved();
    set_ctx(a("anyone.test"), 0, T0 + 2000 * SEC);
    c.expire_remote_reservation(U64(0));
    confirm(&mut c, 0, T0 + 2001 * SEC);
    verified(&mut c, 0, T0 + 2001 * SEC, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6, p.units), (PositionStatus::Open, U128(0), U128(UNITS)));
    assert_eq!(p.remote.unwrap().status, RemoteStatus::Open);
    assert!(event_with("remote_loan_refused", "reservation_expired"));
    release(&mut c, T0 + 2002 * SEC);
    assert!(c.get_pending_release(U64(0)).is_some());
}

#[test]
#[should_panic(expected = "paused")]
fn confirm_paused() {
    let mut c = reserved();
    set_ctx(owner(), 0, T0);
    c.pause();
    confirm(&mut c, 0, T0 + 2 * SEC);
}

#[test]
#[should_panic(expected = "not a remote position")]
fn confirm_near_position() {
    let mut c = base(true);
    fund(&mut c, "buyer9.test", 5_000_000_000, 400, false); // aggregate capacity (A1)
    let bm = r#"{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"1000000","pre_liq_ltv_bps":7500}}"#;
    assert_eq!(ft(&mut c, nvdax(), "borrower.test", UNITS, bm), 0);
    confirm(&mut c, 0, T0 + 2 * SEC);
}

#[test]
#[should_panic(expected = "not awaiting deposit")]
fn confirm_open_position() {
    let mut c = open_remote(true, false);
    confirm(&mut c, 0, T0 + 100 * SEC);
}

#[test]
#[should_panic(expected = "authority pending")]
fn confirm_before_authority() {
    let mut c = base(true);
    fund(&mut c, "buyer1.test", 15_000_000_000, 250, true);
    reserve(&mut c, T0 + SEC);
    confirm(&mut c, 0, T0 + 2 * SEC);
}

#[test]
#[should_panic(expected = "deposit check in flight")]
fn confirm_twice_in_flight() {
    let mut c = reserved();
    confirm(&mut c, 0, T0 + 2 * SEC);
    confirm(&mut c, 0, T0 + 100 * SEC);
}

#[test]
#[should_panic(expected = "confirm cooldown")]
fn confirm_cooldown() {
    let mut c = reserved();
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 3 * SEC, PromiseResult::Failed);
    confirm(&mut c, 0, T0 + 10 * SEC);
}

#[test]
#[should_panic(expected = "vault_read not configured")]
fn confirm_without_vault_read() {
    let mut c = base(false);
    fund(&mut c, "buyer1.test", 15_000_000_000, 250, true);
    set_ctx(owner(), 0, T0);
    c.set_remote_chain("NVDAx".into(), Some(rc()));
    c.set_signer_config(a("v1.signer-prod.testnet"), "p".into(), 15, 3600);
    reserve(&mut c, T0 + SEC);
    authority_cb(&mut c, 0, key_result(&auth()));
    confirm(&mut c, 0, T0 + 2 * SEC);
}

#[test]
#[should_panic(expected = "gas reserve empty")]
fn confirm_gas_reserve_empty() {
    let mut c = reserved();
    set_ctx(owner(), 0, T0);
    c.set_vault_read_config("p".into(), "k".into(), U128(RESERVE + 1), 50);
    confirm(&mut c, 0, T0 + 2 * SEC);
}

#[test]
#[should_panic(expected = "attach more gas")]
fn confirm_needs_gas() {
    let mut c = reserved();
    ctx_gas(a("anyone.test"), 0, T0 + 2 * SEC, 60);
    c.confirm_remote_deposit(U64(0));
}

#[test]
fn keeper_attestation_when_enabled() {
    let mut c = reserved();
    set_ctx(owner(), 0, T0);
    c.set_allow_keeper_deposit_attestation(true);
    set_ctx(keeper(), 0, T0 + 2 * SEC);
    c.keeper_attest_deposit(U64(0), TX.into(), DEPOSITOR.into());
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.units, p.debt_usd_e6), (U128(UNITS), U128(BORROW)));
    let r = p.remote.unwrap();
    assert_eq!((r.status, r.source.as_deref(), r.deposit_ref.as_deref()), (RemoteStatus::Open, Some("keeper"), Some(TX)));
    assert!(event_with("remote_deposit_confirmed", "\"source\":\"keeper\""));
}

#[test]
#[should_panic(expected = "keeper attestation disabled")]
fn keeper_attestation_refused_while_flag_off() {
    let mut c = reserved();
    set_ctx(keeper(), 0, T0 + 2 * SEC);
    c.keeper_attest_deposit(U64(0), TX.into(), DEPOSITOR.into());
}

fn attest(c: &mut Nectar, who: AccountId, tx_ref: &str, depositor: &str) {
    set_ctx(owner(), 0, T0);
    c.set_allow_keeper_deposit_attestation(true);
    set_ctx(who, 0, T0 + 2 * SEC);
    c.keeper_attest_deposit(U64(0), tx_ref.into(), depositor.into());
}

#[test]
#[should_panic(expected = "keeper only")]
fn keeper_attestation_keeper_only() {
    let mut c = reserved();
    attest(&mut c, borrower(), TX, DEPOSITOR);
}

#[test]
#[should_panic(expected = "bad tx_ref")]
fn keeper_attestation_bad_tx_ref() {
    let mut c = reserved();
    attest(&mut c, keeper(), "a b", DEPOSITOR);
}

#[test]
#[should_panic(expected = "bad depositor")]
fn keeper_attestation_bad_depositor() {
    let mut c = reserved();
    attest(&mut c, keeper(), TX, "0xabc");
}

#[test]
#[should_panic(expected = "authority pending")]
fn keeper_attestation_before_authority() {
    let mut c = base(true);
    fund(&mut c, "buyer1.test", 15_000_000_000, 250, true);
    reserve(&mut c, T0 + SEC);
    attest(&mut c, keeper(), TX, DEPOSITOR);
}

#[test]
#[should_panic(expected = "not awaiting deposit")]
fn keeper_attestation_on_open() {
    let mut c = open_remote(true, false);
    attest(&mut c, keeper(), TX, DEPOSITOR);
}

#[test]
#[should_panic(expected = "deposit check in flight")]
fn keeper_attestation_while_confirming() {
    let mut c = reserved();
    confirm(&mut c, 0, T0 + 2 * SEC);
    attest(&mut c, keeper(), TX, DEPOSITOR);
}

#[test]
#[should_panic(expected = "paused")]
fn keeper_attestation_paused() {
    let mut c = reserved();
    set_ctx(owner(), 0, T0);
    c.pause();
    set_ctx(keeper(), 0, T0 + 2 * SEC);
    c.keeper_attest_deposit(U64(0), TX.into(), DEPOSITOR.into());
}

// ------------------------------------------------------------------ 3. remote settlement

#[test]
#[should_panic(expected = "remote position not open")]
fn trigger_refuses_awaiting_deposit() {
    let mut c = reserved();
    trigger(&mut c);
}

#[test]
fn trigger_signs_with_position_path_and_kind_preliq() {
    let mut c = open_remote(true, false);
    let avail0 = c.get_pool().available_usd_e6.0;
    let reserve0 = c.get_gas_reserve().0;
    trigger(&mut c);
    let d = c.get_pending_settlement(U64(0)).unwrap();
    assert_eq!(d.status, PendingStatus::AwaitingSignature);
    assert_eq!((d.quote_id, d.nonce, d.repay_usd_e6, d.keeper_units), (U64(0), U64(0), U128(BORROW), U128(0)));
    let expires = T0 / SEC + 5 + 3600;
    assert_eq!(d.expires, U64(expires));
    let want = chainsig::build_preimage_v2(
        &PreimageInput {
            chain_id: "solana-devnet",
            vault_program: VAULT,
            position_id: 0,
            quote_id: 0,
            repay_e6: BORROW,
            seize_units: d.seize_units.0,
            recipient: RCPT,
            nonce: 0,
            expires,
        },
        chainsig::KIND_PRELIQ,
    )
    .unwrap();
    assert_eq!(d.preimage, want);
    assert!(d.preimage.ends_with("|kind=PRELIQ"));
    assert!(event_with("settlement_sign_requested", "\"path\":\"solana-devnet/pos/0\""));
    assert!(!get_logs().iter().any(|l| l.contains("settled_near")));
    assert_eq!(c.get_next_nonce(), U64(1));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6, p.units.0), (PositionStatus::Settling, U128(0), UNITS - d.seize_units.0));
    assert_eq!(p.remote.unwrap().status, RemoteStatus::Settling);
    assert_eq!(c.get_quote(U64(0)).unwrap().remaining_usd_e6, U128(15_000_000_000 - BORROW));
    assert_eq!(c.get_pool().available_usd_e6.0, avail0, "pool credit waits for the signature");
    assert_eq!(c.get_gas_reserve().0, reserve0 - 1, "1 yocto sign deposit only");
}

#[test]
#[should_panic(expected = "no remote quote capacity")]
fn remote_position_needs_a_remote_quote() {
    // SR-5: a loan needs fitting capacity at confirmation; here the buyer drops the recipient afterwards
    let mut c = open_remote(true, false);
    set_ctx(a("buyer1.test"), 0, T0 + 4 * SEC);
    c.set_quote_remote_recipient(U64(0), None);
    trigger(&mut c);
}

#[test]
#[should_panic(expected = "no remote quote capacity")]
fn partial_remote_quote_is_skipped() {
    // the only remote quote left ($5k) cannot repay the $11,250 debt in one leg; the vault closes on settle
    let mut c = open_remote(true, true);
    set_ctx(a("buyer1.test"), 0, T0 + 4 * SEC);
    c.set_quote_remote_recipient(U64(0), None);
    trigger(&mut c);
}

#[test]
fn signature_success_then_relay_closes_remote() {
    let mut c = open_remote(true, false);
    let avail0 = c.get_pool().available_usd_e6.0;
    trigger(&mut c);
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Successful(sig_json(0xab, 64)));
    let d = c.get_pending_settlement(U64(0)).unwrap();
    assert_eq!((d.status, d.signature_hex.clone()), (PendingStatus::Signed, Some("ab".repeat(64))));
    assert!(event_with("settlement_signed", &"ab".repeat(64)));
    assert!(event_with("settlement_signed", &format!("\"pubkey\":\"{}\"", auth())));
    assert_eq!(c.get_pool().available_usd_e6.0, avail0 + BORROW);
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Settling);
    set_ctx(keeper(), 0, T0 + 9 * SEC);
    c.relay_settlement_result(U64(0), TX.into());
    let d = c.get_pending_settlement(U64(0)).unwrap();
    assert_eq!((d.status, d.solana_tx_sig.as_deref()), (PendingStatus::Relayed, Some(TX)));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.units), (PositionStatus::Closed, U128(0)));
    assert_eq!(p.remote.unwrap().status, RemoteStatus::Closed);
    assert!(event_with("settlement_relayed", TX));
}

#[test]
#[should_panic(expected = "keeper only")]
fn relay_keeper_only() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Successful(sig_json(1, 64)));
    set_ctx(owner(), 0, T0 + 9 * SEC);
    c.relay_settlement_result(U64(0), TX.into());
}

#[test]
#[should_panic(expected = "settlement not signed")]
fn relay_requires_signature() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    set_ctx(keeper(), 0, T0 + 9 * SEC);
    c.relay_settlement_result(U64(0), TX.into());
}

#[test]
#[should_panic(expected = "no pending settlement")]
fn relay_without_pending() {
    let mut c = open_remote(true, false);
    set_ctx(keeper(), 0, T0 + 9 * SEC);
    c.relay_settlement_result(U64(0), TX.into());
}

#[test]
#[should_panic(expected = "bad solana_tx_sig")]
fn relay_rejects_bad_tx_sig() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Successful(sig_json(1, 64)));
    set_ctx(keeper(), 0, T0 + 9 * SEC);
    c.relay_settlement_result(U64(0), "x|y".into());
}

#[test]
fn sign_failure_rolls_back_remote_leg() {
    let mut c = open_remote(true, false);
    let avail0 = c.get_pool().available_usd_e6.0;
    let q_c0 = c.get_collateral("NVDAx".into()).unwrap().active_committed_q_usd_e6.0;
    let debt0 = c.get_collateral("NVDAx".into()).unwrap().total_debt_usd_e6.0;
    trigger(&mut c);
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Failed);
    assert_eq!(c.get_pending_settlement(U64(0)).unwrap().status, PendingStatus::SignFailed);
    assert!(event_with("settlement_sign_failed", "\"reason\":\"failed\""));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6, p.units), (PositionStatus::Open, U128(BORROW), U128(UNITS)));
    assert_eq!(p.remote.unwrap().status, RemoteStatus::Open);
    assert_eq!(c.get_quote(U64(0)).unwrap().remaining_usd_e6, U128(15_000_000_000));
    assert_eq!(c.get_pool().available_usd_e6.0, avail0);
    let cd = c.get_collateral("NVDAx".into()).unwrap();
    assert_eq!((cd.active_committed_q_usd_e6.0, cd.total_debt_usd_e6.0), (q_c0, debt0));
    // a later callback with the same nonce is ignored; the next trigger uses nonce 1
    callback(&mut c, T0 + 7 * SEC, 0, PromiseResult::Successful(sig_json(1, 64)));
    assert_eq!(c.get_pending_settlement(U64(0)).unwrap().status, PendingStatus::SignFailed);
    trigger(&mut c);
    assert_eq!(c.get_pending_settlement(U64(0)).unwrap().nonce, U64(1));
}

#[test]
fn emptied_quote_is_relisted_on_rollback() {
    let mut c = base(true);
    fund(&mut c, "buyer1.test", BORROW, 250, true);
    fund(&mut c, "buyer9.test", 5_000_000_000, 400, true); // aggregate capacity (A1), fitting (SR-5)
    reserve(&mut c, T0 + SEC);
    authority_cb(&mut c, 0, key_result(&auth()));
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 2 * SEC, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    drop_price(&mut c);
    trigger(&mut c);
    assert!(!c.list_quotes("NVDAx".into(), None, None).iter().any(|q| q.quote_id == U64(0)), "emptied quote delisted");
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Failed);
    assert!(c.list_quotes("NVDAx".into(), None, None).iter().any(|q| q.quote_id == U64(0)), "re-listed");
}

#[test]
fn malformed_signature_is_a_failure() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Successful(br#"{"scheme":"Secp256k1","signature":[]}"#.to_vec()));
    assert_eq!(c.get_pending_settlement(U64(0)).unwrap().status, PendingStatus::SignFailed);
    assert!(event_with("settlement_sign_failed", "bad_scheme"));
}

#[test]
fn stale_nonce_callback_ignored() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    callback(&mut c, T0 + 6 * SEC, 5, PromiseResult::Failed);
    assert_eq!(c.get_pending_settlement(U64(0)).unwrap().status, PendingStatus::AwaitingSignature);
}

#[test]
#[should_panic(expected = "signature pending until expiry")]
fn cancel_unsigned_before_expiry_refused() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    set_ctx(owner(), 0, T0 + 100 * SEC);
    c.cancel_settlement(U64(0));
}

#[test]
fn cancel_unsigned_after_expiry_rolls_back_and_late_signature_is_ignored() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    set_ctx(owner(), 0, T0 + 3_606 * SEC);
    c.cancel_settlement(U64(0));
    assert_eq!(c.get_pending_settlement(U64(0)).unwrap().status, PendingStatus::Cancelled);
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6), (PositionStatus::Open, U128(BORROW)));
    assert_eq!(p.remote.unwrap().status, RemoteStatus::Open);
    callback(&mut c, T0 + 3_607 * SEC, 0, PromiseResult::Successful(sig_json(1, 64)));
    assert_eq!(c.get_pending_settlement(U64(0)).unwrap().status, PendingStatus::Cancelled);
    assert_eq!(c.get_quote(U64(0)).unwrap().remaining_usd_e6, U128(15_000_000_000));
}

#[test]
fn cancel_signed_is_refused_keeps_signature_and_relay_still_records() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Successful(sig_json(2, 64)));
    set_ctx(owner(), 0, T0 + 10 * SEC);
    // SR-3: cancel used to flip the position to Open while the remote status stayed Settling
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.cancel_settlement(U64(0)))).is_err());
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.remote.unwrap().status), (PositionStatus::Settling, RemoteStatus::Settling));
    assert_eq!(c.get_pending_settlement(U64(0)).unwrap().status, PendingStatus::Signed);
    set_ctx(keeper(), 0, T0 + 11 * SEC);
    c.relay_settlement_result(U64(0), TX.into());
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Closed);
}

#[test]
#[should_panic(expected = "remote settlement in flight")]
fn release_refused_while_signed_settlement_unrelayed() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Successful(sig_json(2, 64)));
    release(&mut c, T0 + 11 * SEC);
}

#[test]
#[should_panic(expected = "remote settle: domain not supported")]
fn settle_remote_refuses_unknown_domain() {
    let mut c = open_remote(true, false);
    let mut p = c.get_position(U64(0)).unwrap();
    p.remote.as_mut().unwrap().domain_id = 7;
    c.put_position(p);
    trigger(&mut c);
}

#[test]
#[should_panic(expected = "attach more gas")]
fn settle_remote_needs_sign_gas() {
    let mut c = open_remote(true, false);
    ctx_gas(keeper(), 0, T0 + 5 * SEC, 20);
    c.trigger_preliquidation(U64(0));
}

#[test]
#[should_panic(expected = "gas reserve empty")]
fn settle_remote_needs_reserve() {
    let mut c = open_remote(true, false);
    c.gas_reserve_yocto = 0;
    trigger(&mut c);
}

#[test]
fn settle_remote_hooks_without_signer_and_in_flight() {
    let mut c = open_remote(true, false);
    let p = c.get_position(U64(0)).unwrap();
    let cd = c.get_collateral("NVDAx".into()).unwrap();
    let cands = c.select_quotes("NVDAx");
    env::storage_remove(crate::p2::SIGNER_CONFIG_KEY);
    assert_eq!(c.settle_remote(U64(0), p.clone(), cd.clone(), &cands), Err("no signer config"));
    let mut np = p.clone();
    np.remote = None;
    assert_eq!(c.settle_remote(U64(0), np, cd.clone(), &cands), Err("not a remote position"));
    let mut sp = p.clone();
    sp.remote.as_mut().unwrap().status = RemoteStatus::Settling;
    assert_eq!(c.settle_remote(U64(0), sp, cd, &cands), Err("remote position not open"));
    assert_eq!(c.remote_extra_gas(&p), 0, "no signer config -> no sign leg");
}

#[test]
fn bad_debt_remote_leg_seizes_all_units() {
    // price collapses: one remote quote takes every unit and the rest of the debt stays (units 0)
    let mut c = open_remote(true, false);
    set_ctx(owner(), 0, T0 + 4 * SEC);
    c.set_oracle_params(U64(120 * SEC), U64(86_400 * SEC), 9000);
    set_ctx(owner(), 0, T0 + 5 * SEC);
    assert!(c.update_owner_price("NVDAx".into(), U128(100_000_000)));
    trigger(&mut c);
    let d = c.get_pending_settlement(U64(0)).unwrap();
    assert_eq!(d.seize_units, U128(UNITS));
    assert!(d.repay_usd_e6.0 < BORROW);
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Successful(sig_json(3, 64)));
    set_ctx(keeper(), 0, T0 + 9 * SEC);
    c.relay_settlement_result(U64(0), TX.into());
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.units), (PositionStatus::Open, U128(0)));
    assert!(p.debt_usd_e6.0 > 0);
    assert_eq!(p.remote.unwrap().status, RemoteStatus::Closed);
}

// ------------------------------------------------------------------ repay on a remote position

#[test]
fn repay_to_zero_keeps_collateral_in_vault() {
    let c = repaid();
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6, p.units), (PositionStatus::Open, U128(0), U128(UNITS)));
    assert_eq!(p.remote.unwrap().status, RemoteStatus::Open);
    assert_eq!(c.get_owed_collateral(borrower(), "NVDAx".into()), U128(0));
}

#[test]
fn failed_borrow_payout_on_remote_does_not_record_owed_units() {
    let mut c = open_remote(true, false);
    cb_ctx(T0 + 6 * SEC, PromiseResult::Failed);
    assert!(!c.on_payout(Payout::BorrowProceeds { position_id: U64(0) }, borrower(), U128(BORROW)));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6, p.units), (PositionStatus::Open, U128(0), U128(UNITS)));
    assert_eq!(c.get_owed_collateral(borrower(), "NVDAx".into()), U128(0));
}

// ------------------------------------------------------------------ 4. release

#[test]
fn release_signs_exact_message_with_position_path() {
    let mut c = repaid();
    let reserve0 = c.get_gas_reserve().0;
    release(&mut c, T0 + 10 * SEC);
    let d = c.get_pending_release(U64(0)).unwrap();
    let expires = T0 / SEC + 10 + 3600;
    let want = format!("NECTAR_RELEASE_V1|chain=solana-devnet|vault={VAULT}|pos=0|recipient={DEPOSITOR}|nonce=0|expires={expires}");
    assert_eq!((d.message.as_str(), d.nonce, d.expires, d.status), (want.as_str(), U64(0), U64(expires), ReleaseStatus::AwaitingSignature));
    assert_eq!(d.recipient, DEPOSITOR);
    assert_eq!(remote(&c, 0).status, RemoteStatus::Releasing);
    assert!(event_with("remote_release_requested", "\"path\":\"solana-devnet/pos/0\""));
    assert_eq!(c.get_next_nonce(), U64(1), "one counter for settle and release");
    assert_eq!(c.get_gas_reserve().0, reserve0 - 1);
    release_cb(&mut c, T0 + 11 * SEC, 0, PromiseResult::Successful(sig_json(0xcd, 64)));
    let d = c.get_pending_release(U64(0)).unwrap();
    assert_eq!((d.status, d.signature_hex.clone()), (ReleaseStatus::Signed, Some("cd".repeat(64))));
    assert!(event_with("remote_release_signed", &"cd".repeat(64)));
    assert!(event_with("remote_release_signed", &format!("\"pubkey\":\"{}\"", auth())));
    set_ctx(keeper(), 0, T0 + 12 * SEC);
    c.relay_release_result(U64(0), TX.into());
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.units, p.remote.unwrap().status), (PositionStatus::Closed, U128(0), RemoteStatus::Closed));
    assert_eq!(c.get_pending_release(U64(0)).unwrap().status, ReleaseStatus::Relayed);
    assert!(event_with("remote_release_relayed", TX));
}

#[test]
fn release_nonce_follows_settle_nonces() {
    let mut c = repaid();
    env::storage_write(crate::p2::NEXT_NONCE_KEY, &7u64.to_le_bytes());
    release(&mut c, T0 + 10 * SEC);
    assert!(c.get_pending_release(U64(0)).unwrap().message.contains("|nonce=7|"));
    assert_eq!(c.get_next_nonce(), U64(8));
}

#[test]
fn release_sign_failure_then_rerequest_with_fresh_nonce() {
    let mut c = repaid();
    release(&mut c, T0 + 10 * SEC);
    release_cb(&mut c, T0 + 11 * SEC, 0, PromiseResult::Failed);
    assert_eq!(c.get_pending_release(U64(0)).unwrap().status, ReleaseStatus::SignFailed);
    assert!(event_with("remote_release_sign_failed", "\"reason\":\"failed\""));
    release_cb(&mut c, T0 + 11 * SEC, 0, PromiseResult::Successful(sig_json(1, 64))); // stale: ignored
    assert_eq!(c.get_pending_release(U64(0)).unwrap().status, ReleaseStatus::SignFailed);
    release(&mut c, T0 + 12 * SEC);
    assert_eq!(c.get_pending_release(U64(0)).unwrap().nonce, U64(1));
    release_cb(&mut c, T0 + 13 * SEC, 0, PromiseResult::Successful(sig_json(1, 64))); // old nonce: ignored
    assert_eq!(c.get_pending_release(U64(0)).unwrap().status, ReleaseStatus::AwaitingSignature);
}

#[test]
fn signed_release_rerequestable_only_after_expiry() {
    let mut c = repaid();
    release(&mut c, T0 + 10 * SEC);
    release_cb(&mut c, T0 + 11 * SEC, 0, PromiseResult::Successful(sig_json(1, 64)));
    release(&mut c, T0 + 10 * SEC + 3600 * SEC);
    assert_eq!(c.get_pending_release(U64(0)).unwrap().nonce, U64(1));
}

#[test]
#[should_panic(expected = "release pending")]
fn replayed_release_request_refused_while_signed() {
    let mut c = repaid();
    release(&mut c, T0 + 10 * SEC);
    release_cb(&mut c, T0 + 11 * SEC, 0, PromiseResult::Successful(sig_json(1, 64)));
    release(&mut c, T0 + 12 * SEC);
}

#[test]
#[should_panic(expected = "release pending")]
fn release_request_refused_while_awaiting_signature() {
    let mut c = repaid();
    release(&mut c, T0 + 10 * SEC);
    release(&mut c, T0 + 11 * SEC);
}

#[test]
#[should_panic(expected = "remote position closed")]
fn release_after_relay_refused() {
    let mut c = repaid();
    release(&mut c, T0 + 10 * SEC);
    release_cb(&mut c, T0 + 11 * SEC, 0, PromiseResult::Successful(sig_json(1, 64)));
    set_ctx(keeper(), 0, T0 + 12 * SEC);
    c.relay_release_result(U64(0), TX.into());
    release(&mut c, T0 + 5000 * SEC);
}

#[test]
#[should_panic(expected = "release not signed")]
fn replayed_release_relay_refused() {
    let mut c = repaid();
    release(&mut c, T0 + 10 * SEC);
    release_cb(&mut c, T0 + 11 * SEC, 0, PromiseResult::Successful(sig_json(1, 64)));
    set_ctx(keeper(), 0, T0 + 12 * SEC);
    c.relay_release_result(U64(0), TX.into());
    c.relay_release_result(U64(0), TX.into());
}

#[test]
#[should_panic(expected = "debt outstanding")]
fn release_before_full_repay_refused() {
    let mut c = open_remote(true, false);
    release(&mut c, T0 + 10 * SEC);
}

#[test]
#[should_panic(expected = "no deposit recorded")]
fn release_without_deposit_refused() {
    let mut c = reserved();
    release(&mut c, T0 + 10 * SEC);
}

#[test]
#[should_panic(expected = "not a remote position")]
fn release_near_position_refused() {
    let mut c = base(true);
    fund(&mut c, "buyer9.test", 5_000_000_000, 400, false); // aggregate capacity (A1)
    let bm = r#"{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"1000000","pre_liq_ltv_bps":7500}}"#;
    assert_eq!(ft(&mut c, nvdax(), "borrower.test", UNITS, bm), 0);
    release(&mut c, T0 + 10 * SEC);
}

#[test]
#[should_panic(expected = "deposit check in flight")]
fn release_while_confirming_refused() {
    let mut c = reserved();
    set_ctx(owner(), 0, T0);
    c.set_oracle_params(U64(1), U64(1), 1500);
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 2 * SEC, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    confirm(&mut c, 0, T0 + 40 * SEC);
    release(&mut c, T0 + 41 * SEC);
}

#[test]
#[should_panic(expected = "remote position settling")]
fn release_while_settling_refused() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    callback(&mut c, T0 + 6 * SEC, 0, PromiseResult::Successful(sig_json(2, 64)));
    set_ctx(keeper(), 0, T0 + 9 * SEC);
    c.relay_settlement_result(U64(0), TX.into());
    // simulate a pending record cleared: Settling status alone refuses
    let mut p = c.get_position(U64(0)).unwrap();
    p.remote.as_mut().unwrap().status = RemoteStatus::Settling;
    c.put_position(p);
    release(&mut c, T0 + 10 * SEC);
}

#[test]
#[should_panic(expected = "paused")]
fn release_paused() {
    let mut c = repaid();
    set_ctx(owner(), 0, T0);
    c.pause();
    release(&mut c, T0 + 10 * SEC);
}

#[test]
#[should_panic(expected = "no signer config")]
fn release_without_signer() {
    let mut c = repaid();
    env::storage_remove(crate::p2::SIGNER_CONFIG_KEY);
    release(&mut c, T0 + 10 * SEC);
}

#[test]
#[should_panic(expected = "gas reserve empty")]
fn release_needs_reserve() {
    let mut c = repaid();
    c.gas_reserve_yocto = 0;
    release(&mut c, T0 + 10 * SEC);
}

#[test]
#[should_panic(expected = "attach more gas")]
fn release_needs_gas() {
    let mut c = repaid();
    ctx_gas(a("anyone.test"), 0, T0 + 10 * SEC, 20);
    c.request_remote_release(U64(0));
}

#[test]
#[should_panic(expected = "release: domain not supported")]
fn release_refuses_unknown_domain() {
    let mut c = repaid();
    let mut p = c.get_position(U64(0)).unwrap();
    p.remote.as_mut().unwrap().domain_id = 7;
    c.put_position(p);
    release(&mut c, T0 + 10 * SEC);
}

#[test]
#[should_panic(expected = "keeper only")]
fn relay_release_keeper_only() {
    let mut c = repaid();
    release(&mut c, T0 + 10 * SEC);
    release_cb(&mut c, T0 + 11 * SEC, 0, PromiseResult::Successful(sig_json(1, 64)));
    set_ctx(owner(), 0, T0 + 12 * SEC);
    c.relay_release_result(U64(0), TX.into());
}

#[test]
#[should_panic(expected = "bad solana_tx_sig")]
fn relay_release_bad_tx_sig() {
    let mut c = repaid();
    set_ctx(keeper(), 0, T0 + 12 * SEC);
    c.relay_release_result(U64(0), "nope".into());
}

#[test]
#[should_panic(expected = "no pending release")]
fn relay_release_without_request() {
    let mut c = repaid();
    set_ctx(keeper(), 0, T0 + 12 * SEC);
    c.relay_release_result(U64(0), TX.into());
}
