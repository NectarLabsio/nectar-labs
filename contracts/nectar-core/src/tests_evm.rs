//! WO-29a Base spoke unit tests: EIP-712 digests against tests/eip712_vectors.json (Foundry cast), Secp256k1 response
//! parsing (F-332) incl. high-s normalisation, extra remote chains (owner + view), Base reserve -> authority (F-338/F-339
//! live vector) -> confirm (`vault_read` Base input) | keeper attestation -> settle signed with a real k256 key
//! (ecrecover == authority) -> relay (0x tx hash); repay -> release signed -> relay; recipient routing; panic paths.

use super::*;
use crate::evm;
use crate::tests_p2::*;
use k256::ecdsa::{RecoveryId, Signature as KSig, SigningKey as KSk, VerifyingKey as KVk};
use near_sdk::PromiseResult;
use near_sdk::serde_json::Value;
use near_sdk::test_utils::get_logs;

const EVAULT: &str = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ERCPT: &str = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const EDEP: &str = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const ETX: &str = "0x8f3a5b7c9d1e2f40516273849a5b6c7d8e9f00112233445566778899aabbccdd";
const RPC: &str = "https://sepolia.base.org";
/// F-338 live answer for `base-sepolia/pos/0`, pred `nectar-core-v2.nectar.testnet`, domain 0; F-339 address.
const SECP_V2: &str = "secp256k1:64HT9SZmkJET5rHBHBR1pymtPgT6J74C8EoeRSmuTaE2Sgh1QHUGh3Aw76PCQuVtUpfrfwunKPL3aM5aCNBGBKJM";
const ADDR_V2: &str = "0xbcb6eab973570cb1e5c16195696b8bddb4c7d8f7";
const BUYER2_QID: u64 = 1;

fn brc() -> RemoteChain {
    RemoteChain { chain_id: "base-sepolia".into(), vault_program: EVAULT.into(), mpc_domain_id: 0 }
}

fn with_base(c: &mut Nectar) {
    set_ctx(owner(), 0, T0);
    c.set_extra_remote_chain("NVDAx".into(), brc(), RPC.into());
}

fn fund_rcpt(c: &mut Nectar, buyer: &str, amt: u128, disc: u16, rcpt: &str) {
    let m = format!(
        r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":{disc},"notice_period_ns":"604800000000000","buyer_remote_recipient":"{rcpt}"}}}}"#
    );
    set_ctx(usdc(), 0, T0 + SEC);
    match c.ft_on_transfer(a(buyer), U128(amt), m) {
        PromiseOrValue::Value(v) => assert_eq!(v.0, 0),
        PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    }
}

fn reserve_on(c: &mut Nectar, ts: u64, chain: Option<&str>) -> u64 {
    set_ctx(borrower(), crate::remote::RESERVE_DEPOSIT_YOCTO, ts);
    c.reserve_remote_position("NVDAx".into(), U128(UNITS), U128(BORROW), 7500, None, None, None, chain.map(String::from)).0
}

fn b58_encode(bytes: &[u8]) -> String {
    const B58: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let mut digits: Vec<u8> = Vec::new();
    for &b in bytes {
        let mut carry = u32::from(b);
        for d in digits.iter_mut() {
            carry += u32::from(*d) << 8;
            *d = (carry % 58) as u8;
            carry /= 58;
        }
        while carry > 0 {
            digits.push((carry % 58) as u8);
            carry /= 58;
        }
    }
    let zeros = bytes.iter().take_while(|b| **b == 0).count();
    let mut s: String = std::iter::repeat_n('1', zeros).collect();
    s.extend(digits.iter().rev().map(|d| B58[*d as usize] as char));
    s
}

/// The test MPC key (k256) for Base positions and its `derived_public_key` answer.
fn test_sk() -> KSk {
    KSk::from_bytes(&[9u8; 32].into()).unwrap()
}
fn test_key_string() -> String {
    let p = test_sk().verifying_key().to_encoded_point(false);
    format!("secp256k1:{}", b58_encode(&p.as_bytes()[1..]))
}
fn addr_of(vk: &KVk) -> String {
    let p = vk.to_encoded_point(false);
    evm::hex0x(&env::keccak256_array(&p.as_bytes()[1..])[12..])
}

/// F-332 response for `digest` signed by the test key; `high` answers the high-s twin.
fn ecdsa_result(digest: &[u8; 32], high: bool) -> Vec<u8> {
    let (sig, rid) = test_sk().sign_prehash_recoverable(digest).unwrap();
    let b = sig.to_bytes();
    let mut s: [u8; 32] = b[32..].try_into().unwrap();
    let mut odd = rid.is_y_odd();
    if high {
        s = evm::sub_from_n(&s);
        odd = !odd;
    }
    let mut big_r = vec![if odd { 3u8 } else { 2u8 }];
    big_r.extend_from_slice(&b[..32]);
    json!({ "scheme": "Secp256k1", "big_r": { "affine_point": chainsig::hex(&big_r) },
            "s": { "scalar": chainsig::hex(&s) }, "recovery_id": u8::from(odd) })
    .to_string()
    .into_bytes()
}

fn unhex32(s: &str) -> [u8; 32] {
    evm::unhex(s.strip_prefix("0x").unwrap()).unwrap().try_into().unwrap()
}

/// ecrecover(digest, v, r, s) as the vault does it.
fn recover(digest: &str, r: &str, s: &str, v: u8) -> String {
    let mut rs = unhex32(r).to_vec();
    rs.extend_from_slice(&unhex32(s));
    let sig = KSig::from_slice(&rs).unwrap();
    let vk = KVk::recover_from_prehash(&unhex32(digest), &sig, RecoveryId::from_byte(v - 27).unwrap()).unwrap();
    addr_of(&vk)
}

/// Base chain + quotes: buyer1 $12k @250 base58 recipient, buyer2 $12k @400 0x recipient. Base position 0 reserved
/// with the test key as authority (AwaitingDeposit).
fn base_reserved() -> Nectar {
    let mut c = base(true);
    with_base(&mut c);
    fund_rcpt(&mut c, "buyer1.test", 12_000_000_000, 250, RCPT);
    fund_rcpt(&mut c, "buyer2.test", 12_000_000_000, 400, ERCPT);
    assert_eq!(reserve_on(&mut c, T0 + SEC, Some("base-sepolia")), 0);
    authority_cb(&mut c, 0, key_result(&test_key_string()));
    c
}

/// Base position 0 confirmed through OutLayer (authority reported upper-case), price then 180 -> 155 -> 140.
fn base_open() -> Nectar {
    let mut c = base_reserved();
    confirm(&mut c, 0, T0 + 2 * SEC);
    let auth = remote(&c, 0).authority.unwrap().to_uppercase().replacen("0X", "0x", 1);
    verified(&mut c, 0, T0 + 2 * SEC, vault_json(0, UNITS, &auth, EDEP));
    assert_eq!(remote(&c, 0).status, RemoteStatus::Open);
    drop_price(&mut c);
    c
}

fn sign_cb(c: &mut Nectar, result: PromiseResult) {
    cb_ctx(T0 + 6 * SEC, result);
    c.on_signature(U64(0), U64(BUYER2_QID), U64(0));
}

/// Base position settled and signed (nonce 0).
fn base_signed() -> Nectar {
    let mut c = base_open();
    trigger(&mut c);
    let d = c.get_pending_settlement_evm(U64(0)).unwrap();
    sign_cb(&mut c, PromiseResult::Successful(ecdsa_result(&unhex32(&d.digest), false)));
    c
}

/// Base position fully repaid (debt 0, Open).
fn base_repaid() -> Nectar {
    let mut c = base(true);
    with_base(&mut c);
    fund_rcpt(&mut c, "buyer9.test", 16_000_000_000, 400, ERCPT);
    assert_eq!(reserve_on(&mut c, T0 + SEC, Some("base-sepolia")), 0);
    authority_cb(&mut c, 0, key_result(&test_key_string()));
    set_ctx(owner(), 0, T0 + SEC);
    c.set_allow_keeper_deposit_attestation(true);
    set_ctx(keeper(), 0, T0 + 2 * SEC);
    c.keeper_attest_deposit(U64(0), ETX.into(), EDEP.into());
    assert_eq!(remote(&c, 0).source.as_deref(), Some("keeper"));
    assert_eq!(ft(&mut c, usdc(), "borrower.test", BORROW, r#"{"Repay":{"position_id":"0"}}"#), 0);
    c
}

// ------------------------------------------------------------------ pure helpers

#[test]
fn eip712_digests_match_cast_vectors() {
    let v: Value = serde_json::from_str(include_str!("../tests/eip712_vectors.json")).unwrap();
    let h = |s: &str| evm::hex0x(&env::keccak256_array(s.as_bytes()));
    assert_eq!(h(evm::DOMAIN_TYPE), v["domainTypehash"]);
    assert_eq!(h(evm::DOMAIN_NAME), v["nameHash"]);
    assert_eq!(h(evm::DOMAIN_VERSION), v["versionHash"]);
    assert_eq!(h(evm::SETTLE_TYPE), v["settleTypehash"]);
    assert_eq!(h(evm::RELEASE_TYPE), v["releaseTypehash"]);
    let dom = &v["domain"];
    assert_eq!(dom["chainId"].as_u64(), Some(evm::BASE_SEPOLIA_CHAIN_ID));
    let vault = evm::parse_address(dom["verifyingContract"].as_str().unwrap()).unwrap();
    let ds = evm::domain_separator(evm::BASE_SEPOLIA_CHAIN_ID, &vault);
    assert_eq!(evm::hex0x(&ds), v["domainSeparator"]);
    let n = |x: &Value| x.as_str().unwrap().parse::<u128>().unwrap();
    for s in v["settle"].as_array().unwrap() {
        let f = evm::SettleFields {
            position_id: n(&s["positionId"]) as u64,
            quote_id: n(&s["quoteId"]) as u64,
            repay_e6: n(&s["repayE6"]),
            seize_raw: n(&s["seizeRaw"]),
            recipient: evm::parse_address(s["recipient"].as_str().unwrap()).unwrap(),
            nonce: n(&s["nonce"]) as u64,
            expires: n(&s["expires"]) as u64,
            kind: s["kind"].as_u64().unwrap() as u8,
        };
        let sh = evm::settle_struct_hash(&f);
        assert_eq!(evm::hex0x(&sh), s["structHash"]);
        assert_eq!(evm::hex0x(&evm::typed_digest(&ds, &sh)), s["digest"]);
        // the record builder over a RemoteInfo gives the same digest
        let mut r = remote_info_base();
        r.vault_program = dom["verifyingContract"].as_str().unwrap().into();
        let (d, rec) = evm::settle_digest_for(&r, &f).unwrap();
        assert_eq!((evm::hex0x(&d), rec.chain_id), (s["digest"].as_str().unwrap().to_string(), 84_532));
    }
    for s in v["release"].as_array().unwrap() {
        let to = evm::parse_address(s["recipient"].as_str().unwrap()).unwrap();
        let sh = evm::release_struct_hash(n(&s["positionId"]) as u64, &to, n(&s["nonce"]) as u64, n(&s["expires"]) as u64);
        assert_eq!(evm::hex0x(&sh), s["structHash"]);
        assert_eq!(evm::hex0x(&evm::typed_digest(&ds, &sh)), s["digest"]);
        let mut r = remote_info_base();
        r.vault_program = dom["verifyingContract"].as_str().unwrap().into();
        let (d, _) = evm::release_digest_for(&r, n(&s["positionId"]) as u64, s["recipient"].as_str().unwrap(),
            n(&s["nonce"]) as u64, n(&s["expires"]) as u64).unwrap();
        assert_eq!(evm::hex0x(&d), s["digest"].as_str().unwrap());
    }
}

fn remote_info_base() -> RemoteInfo {
    RemoteInfo {
        chain_id: "base-sepolia".into(),
        vault_program: EVAULT.into(),
        domain_id: 0,
        path: "base-sepolia/pos/0".into(),
        authority: None,
        status: RemoteStatus::Open,
        reserved_units: U128(1),
        units: U128(1),
        borrow_usd_e6: U128(1),
        paid_usd_e6: U128(0),
        reserved_ns: U64(0),
        pay_to: None,
        referrer: None,
        expires_ns: U64(0),
        depositor: None,
        source: None,
        deposit_ref: None,
        confirming: false,
        last_confirm_ns: U64(0),
        deposit_yocto: U128(0),
    }
}

#[test]
fn digest_builders_refuse_bad_inputs() {
    let f = evm::SettleFields { position_id: 0, quote_id: 0, repay_e6: 1, seize_raw: 1, recipient: [1; 20], nonce: 0, expires: 1, kind: 1 };
    let mut r = remote_info_base();
    r.chain_id = "eth-mainnet".into();
    assert_eq!(evm::settle_digest_for(&r, &f).unwrap_err(), evm::ERR_UNKNOWN_CHAIN);
    assert_eq!(evm::release_digest_for(&r, 0, ERCPT, 0, 1).unwrap_err(), evm::ERR_UNKNOWN_CHAIN);
    let mut r = remote_info_base();
    r.vault_program = VAULT.into();
    assert_eq!(evm::settle_digest_for(&r, &f).unwrap_err(), "bad vault");
    assert_eq!(evm::release_digest_for(&r, 0, ERCPT, 0, 1).unwrap_err(), "bad vault");
    assert_eq!(evm::release_digest_for(&remote_info_base(), 0, DEPOSITOR, 0, 1).unwrap_err(), "bad recipient");
}

#[test]
fn evm_validators_and_scalars() {
    assert!(chainsig::valid_evm_address(ERCPT) && chainsig::valid_evm_address(&ERCPT.to_lowercase()));
    assert!(!chainsig::valid_evm_address("0x70997970C51812dc3A010C7d01b50e0d17dc79C") && !chainsig::valid_evm_address(RCPT));
    assert!(!chainsig::valid_evm_address("0xZZ997970C51812dc3A010C7d01b50e0d17dc79C8"));
    assert_eq!(evm::parse_address(EVAULT).unwrap()[0], 0x5f);
    assert!(evm::parse_address(VAULT).is_none());
    assert!(chainsig::recipient_fits(0, ERCPT) && !chainsig::recipient_fits(0, RCPT));
    assert!(chainsig::recipient_fits(1, RCPT) && !chainsig::recipient_fits(1, ERCPT) && !chainsig::recipient_fits(7, RCPT));
    assert!(evm::valid_tx_hash(ETX) && !evm::valid_tx_hash(TX) && !evm::valid_tx_hash(&ETX[..65]));
    assert!(evm::valid_relay_tx(0, ETX) && !evm::valid_relay_tx(0, TX) && evm::valid_relay_tx(1, TX) && !evm::valid_relay_tx(1, ETX));
    assert_eq!(evm::evm_chain_id("base-sepolia"), Some(84_532));
    assert_eq!(evm::evm_chain_id("solana-devnet"), None);
    assert!(evm::valid_rpc_url(RPC) && evm::valid_rpc_url("http://127.0.0.1:8545"));
    assert!(!evm::valid_rpc_url("ftp://x") && !evm::valid_rpc_url("https://a b") && !evm::valid_rpc_url(&format!("https://{}", "a".repeat(128))));
    assert!(evm::valid_extra_chain(&brc()) && evm::valid_extra_chain(&rc()));
    assert!(!evm::valid_extra_chain(&RemoteChain { mpc_domain_id: 0, ..rc() }));
    assert!(!evm::valid_extra_chain(&RemoteChain { chain_id: "eth-mainnet".into(), ..brc() }));
    assert!(!evm::valid_extra_chain(&RemoteChain { mpc_domain_id: 1, ..brc() }));
    // scalars: 0 and >= n are not signable digests; n - 1 is
    assert!(!evm::digest_is_scalar(&[0; 32]) && !evm::digest_is_scalar(&evm::N) && !evm::digest_is_scalar(&[0xff; 32]));
    let mut n1 = evm::N;
    n1[31] -= 1;
    assert!(evm::digest_is_scalar(&n1));
    let mut one = [0u8; 32];
    one[31] = 1;
    assert_eq!(evm::sub_from_n(&one), n1);
    assert_eq!(evm::sub_from_n(&n1), one);
    let args: Value = serde_json::from_str(&evm::ecdsa_sign_args("base-sepolia/pos/0", &one, 0)).unwrap();
    assert_eq!(args["request"]["payload_v2"]["Ecdsa"].as_str().unwrap().len(), 64);
    assert_eq!((args["request"]["domain_id"].clone(), args["request"]["path"].clone()), (json!(0), json!("base-sepolia/pos/0")));
    assert_eq!(evm::unhex("0g"), None);
    assert_eq!(evm::unhex("abc"), None);
}

#[test]
fn ecdsa_response_parsing_and_high_s_normalisation() {
    let digest = env::keccak256_array(b"nectar");
    let want = addr_of(test_sk().verifying_key());
    for high in [false, true] {
        let sig = evm::parse_ecdsa_response(&ecdsa_result(&digest, high)).unwrap();
        assert_eq!(sig.normalised, high);
        assert!(sig.v == 27 || sig.v == 28);
        assert!(!(evm::HALF_N < sig.s), "stored s is low");
        assert_eq!(recover(&evm::hex0x(&digest), &evm::hex0x(&sig.r), &evm::hex0x(&sig.s), sig.v), want);
        let (hex, es) = evm::parse_sign_result(&ecdsa_result(&digest, high), 0).unwrap();
        assert_eq!((hex.len(), es.unwrap().rsv()[64]), (130, sig.v));
    }
    let r = format!("02{}", "11".repeat(32));
    let s = "22".repeat(32);
    let mk = |scheme: &str, r: &str, s: &str, rid: u64| {
        format!(r#"{{"scheme":"{scheme}","big_r":{{"affine_point":"{r}"}},"s":{{"scalar":"{s}"}},"recovery_id":{rid}}}"#).into_bytes()
    };
    assert_eq!(evm::parse_ecdsa_response(&mk("Secp256k1", &r, &s, 0)).unwrap().v, 27);
    assert_eq!(evm::parse_ecdsa_response(&mk("Secp256k1", &format!("03{}", "11".repeat(32)), &s, 1)).unwrap().v, 28);
    assert_eq!(evm::parse_ecdsa_response(b"nope"), Err("bad_response"));
    assert_eq!(evm::parse_ecdsa_response(&mk("Ed25519", &r, &s, 0)), Err("bad_scheme"));
    assert_eq!(evm::parse_ecdsa_response(&mk("Secp256k1", "zz", &s, 0)), Err("bad_hex"));
    assert_eq!(evm::parse_ecdsa_response(&mk("Secp256k1", &r[..64], &s, 0)), Err("bad_length"));
    assert_eq!(evm::parse_ecdsa_response(&mk("Secp256k1", &r, &s, 2)), Err("bad_recovery_id"));
    assert_eq!(evm::parse_ecdsa_response(&mk("Secp256k1", &r, &s, 1)), Err("bad_parity"));
    assert_eq!(evm::parse_ecdsa_response(&mk("Secp256k1", &format!("02{}", "00".repeat(32)), &s, 0)), Err("bad_scalar"));
    assert_eq!(evm::parse_ecdsa_response(&mk("Secp256k1", &r, &"ff".repeat(32), 0)), Err("bad_scalar"));
    assert_eq!(
        evm::parse_ecdsa_response(br#"{"scheme":"Secp256k1","big_r":{"affine_point":"02"},"s":{"scalar":"22"}}"#),
        Err("bad_response")
    );
    // an Ed25519 answer for an EVM position (and vice versa) is refused
    assert_eq!(evm::parse_sign_result(&sig_json(1, 64), 0).unwrap_err(), "bad_scheme");
    assert_eq!(evm::parse_sign_result(&mk("Secp256k1", &r, &s, 0), 1).unwrap_err(), "bad_response");
}

// ------------------------------------------------------------------ owner + views

#[test]
fn extra_remote_chain_set_view_replace_remove() {
    let mut c = base(true);
    with_base(&mut c);
    assert!(get_logs().iter().any(|l| l.contains("extra_remote_chain_set") && l.contains(RPC)));
    let v = c.get_remote_chains("NVDAx".into());
    assert_eq!(v.len(), 2);
    assert!(v[0].primary && v[0].chain_id == "solana-devnet" && v[0].rpc_url.is_none() && v[0].evm_chain_id.is_none());
    assert!(!v[1].primary && v[1].chain_id == "base-sepolia" && v[1].evm_chain_id == Some(84_532) && v[1].mpc_domain_id == 0);
    // replace keeps one entry
    set_ctx(owner(), 0, T0);
    c.set_extra_remote_chain("NVDAx".into(), brc(), "http://127.0.0.1:8545".into());
    let v = c.get_remote_chains("NVDAx".into());
    assert_eq!((v.len(), v[1].rpc_url.clone()), (2, Some("http://127.0.0.1:8545".into())));
    assert_eq!(c.chain_rpc_url("NVDAx", "base-sepolia").as_deref(), Some("http://127.0.0.1:8545"));
    c.remove_extra_remote_chain("NVDAx".into(), "base-sepolia".into());
    assert!(get_logs().iter().any(|l| l.contains("extra_remote_chain_removed")));
    assert_eq!(c.get_remote_chains("NVDAx".into()).len(), 1);
    assert!(c.get_remote_chains("TSLAx".into()).is_empty());
    // a Solana extra chain is allowed too (other vault)
    let other = RemoteChain { chain_id: "solana-other".into(), ..rc() };
    c.set_extra_remote_chain("NVDAx".into(), other, RPC.into());
    assert_eq!(c.get_remote_chains("NVDAx".into())[1].evm_chain_id, None);
}

#[test]
#[should_panic(expected = "owner only")]
fn extra_remote_chain_owner_only() {
    let mut c = base(true);
    set_ctx(borrower(), 0, T0);
    c.set_extra_remote_chain("NVDAx".into(), brc(), RPC.into());
}

#[test]
#[should_panic(expected = "owner only")]
fn remove_extra_remote_chain_owner_only() {
    let mut c = base(true);
    with_base(&mut c);
    set_ctx(borrower(), 0, T0);
    c.remove_extra_remote_chain("NVDAx".into(), "base-sepolia".into());
}

#[test]
#[should_panic(expected = "unknown collateral")]
fn extra_remote_chain_unknown_collateral() {
    let mut c = base(true);
    set_ctx(owner(), 0, T0);
    c.set_extra_remote_chain("TSLAx".into(), brc(), RPC.into());
}

#[test]
#[should_panic(expected = "bad remote_chain")]
fn extra_remote_chain_bad_chain() {
    let mut c = base(true);
    set_ctx(owner(), 0, T0);
    c.set_extra_remote_chain("NVDAx".into(), RemoteChain { vault_program: VAULT.into(), ..brc() }, RPC.into());
}

#[test]
#[should_panic(expected = "bad rpc_url")]
fn extra_remote_chain_bad_rpc() {
    let mut c = base(true);
    set_ctx(owner(), 0, T0);
    c.set_extra_remote_chain("NVDAx".into(), brc(), "sepolia.base.org".into());
}

#[test]
#[should_panic(expected = "chain is the primary remote chain")]
fn extra_remote_chain_not_primary() {
    let mut c = base(true);
    set_ctx(owner(), 0, T0);
    c.set_extra_remote_chain("NVDAx".into(), rc(), RPC.into());
}

#[test]
#[should_panic(expected = "too many remote chains")]
fn extra_remote_chain_bounded() {
    let mut c = base(true);
    set_ctx(owner(), 0, T0);
    for i in 0..5 {
        c.set_extra_remote_chain("NVDAx".into(), RemoteChain { chain_id: format!("solana-x{i}"), ..rc() }, RPC.into());
    }
}

#[test]
#[should_panic(expected = "unknown remote chain")]
fn remove_unknown_extra_chain() {
    let mut c = base(true);
    set_ctx(owner(), 0, T0);
    c.remove_extra_remote_chain("NVDAx".into(), "base-sepolia".into());
}

// ------------------------------------------------------------------ reserve / authority / confirm

#[test]
fn base_reserve_selects_chain_and_stores_evm_authority() {
    let mut c = base(true);
    with_base(&mut c);
    assert_eq!(reserve_on(&mut c, T0 + SEC, Some("base-sepolia")), 0);
    let r = remote(&c, 0);
    assert_eq!((r.chain_id.as_str(), r.domain_id, r.path.as_str(), r.vault_program.as_str()), ("base-sepolia", 0, "base-sepolia/pos/0", EVAULT));
    assert!(get_logs().iter().any(|l| l.contains("remote_reserved") && l.contains("\"domain_id\":0")));
    // F-338 live key for base-sepolia/pos/0 (pred v2) -> F-339 address
    authority_cb(&mut c, 0, key_result(SECP_V2));
    assert_eq!(remote(&c, 0).authority.as_deref(), Some(ADDR_V2));
    // explicit primary id and no id both pick Solana
    assert_eq!(reserve_on(&mut c, T0 + 2 * SEC, Some("solana-devnet")), 1);
    assert_eq!(remote(&c, 1).domain_id, 1);
    assert_eq!(reserve_on(&mut c, T0 + 3 * SEC, None), 2);
    assert_eq!(remote(&c, 2).chain_id, "solana-devnet");
    let hint = c.get_vault_authority_hint(U64(0)).unwrap();
    assert_eq!((hint.domain_id, hint.path.as_str()), (0, "base-sepolia/pos/0"));
}

#[test]
fn base_authority_malformed_key_ends_reservation() {
    let mut c = base(true);
    with_base(&mut c);
    reserve_on(&mut c, T0 + SEC, Some("base-sepolia"));
    authority_cb(&mut c, 0, key_result(&format!("ed25519:{AUTH_B58}")));
    assert_eq!(remote(&c, 0).status, RemoteStatus::Expired);
    assert!(get_logs().iter().any(|l| l.contains("remote_reservation_failed") && l.contains("bad_curve")));
}

#[test]
#[should_panic(expected = "unknown remote chain")]
fn reserve_unknown_chain() {
    let mut c = base(true);
    with_base(&mut c);
    reserve_on(&mut c, T0 + SEC, Some("eth-mainnet"));
}

#[test]
#[should_panic(expected = "unknown remote chain")]
fn reserve_base_without_extra_chain() {
    let mut c = base(true);
    reserve_on(&mut c, T0 + SEC, Some("base-sepolia"));
}

#[test]
fn base_confirm_sends_vault_read_with_vault_and_rpc_then_opens() {
    let mut c = base_reserved();
    confirm(&mut c, 0, T0 + 2 * SEC);
    let line = get_logs().into_iter().find(|l| l.contains("remote_deposit_check_requested")).unwrap();
    assert!(line.contains(r#"\"chain\":\"base-sepolia\""#) && line.contains(&format!(r#"\"vault\":\"{EVAULT}\""#)), "{line}");
    assert!(line.contains(&format!(r#"\"rpc_url\":\"{RPC}\""#)) && !line.contains("program"), "{line}");
    let auth = remote(&c, 0).authority.unwrap();
    verified(&mut c, 0, T0 + 2 * SEC, vault_json(0, UNITS, &auth.to_uppercase().replacen("0X", "0x", 1), EDEP));
    let r = remote(&c, 0);
    assert_eq!((r.status, r.depositor.as_deref()), (RemoteStatus::Open, Some(EDEP)));
    assert_eq!(c.get_position(U64(0)).unwrap().debt_usd_e6, U128(BORROW));
}

#[test]
fn base_confirm_rejects_solana_depositor_and_foreign_authority() {
    let mut c = base_reserved();
    confirm(&mut c, 0, T0 + 2 * SEC);
    let auth = remote(&c, 0).authority.unwrap();
    verified(&mut c, 0, T0 + 2 * SEC, vault_json(0, UNITS, &auth, DEPOSITOR));
    assert!(get_logs().iter().any(|l| l.contains("remote_deposit_rejected") && l.contains("bad_depositor")));
    confirm(&mut c, 0, T0 + 40 * SEC);
    verified(&mut c, 0, T0 + 40 * SEC, vault_json(0, UNITS, ADDR_V2, EDEP));
    assert!(get_logs().iter().any(|l| l.contains("remote_deposit_rejected") && l.contains("authority_mismatch")));
    assert_eq!(remote(&c, 0).status, RemoteStatus::AwaitingDeposit);
}

#[test]
#[should_panic(expected = "no rpc_url for chain")]
fn base_confirm_needs_rpc_url() {
    let mut c = base_reserved();
    set_ctx(owner(), 0, T0 + SEC);
    c.remove_extra_remote_chain("NVDAx".into(), "base-sepolia".into());
    confirm(&mut c, 0, T0 + 2 * SEC);
}

#[test]
#[should_panic(expected = "bad depositor")]
fn base_keeper_attest_needs_evm_depositor() {
    let mut c = base_reserved();
    set_ctx(owner(), 0, T0 + SEC);
    c.set_allow_keeper_deposit_attestation(true);
    set_ctx(keeper(), 0, T0 + 2 * SEC);
    c.keeper_attest_deposit(U64(0), ETX.into(), DEPOSITOR.into());
}

// ------------------------------------------------------------------ settle

#[test]
fn base_settle_fills_only_0x_quote_and_signs_eip712_digest() {
    let mut c = base_open();
    trigger(&mut c);
    let d = c.get_pending_settlement(U64(0)).unwrap();
    assert_eq!((d.quote_id, d.recipient.as_str(), d.status), (U64(BUYER2_QID), ERCPT, PendingStatus::AwaitingSignature));
    assert!(d.preimage.starts_with("0x") && d.preimage.len() == 66);
    let e = c.get_pending_settlement_evm(U64(0)).unwrap();
    assert_eq!((e.digest.as_str(), e.r.clone(), e.chain_id, e.verifying_contract.as_str()), (d.preimage.as_str(), None, 84_532, EVAULT));
    // the digest is the EIP-712 Settle hash of the stored typed fields
    let f = evm::SettleFields {
        position_id: 0,
        quote_id: BUYER2_QID,
        repay_e6: e.repay_e6.0,
        seize_raw: e.seize_raw.0,
        recipient: evm::parse_address(ERCPT).unwrap(),
        nonce: e.nonce.0,
        expires: e.expires.0,
        kind: 1,
    };
    assert_eq!(evm::hex0x(&evm::settle_digest_for(&remote(&c, 0), &f).unwrap().0), e.digest);
    assert_eq!((e.repay_e6, e.kind), (U128(BORROW), 1));
    assert!(get_logs().iter().any(|l| l.contains("settlement_sign_requested") && l.contains("\"chain\":\"base-sepolia\"")));
    // signature: stored r/s/v ecrecover to the stored authority
    sign_cb(&mut c, PromiseResult::Successful(ecdsa_result(&unhex32(&e.digest), false)));
    let e = c.get_pending_settlement_evm(U64(0)).unwrap();
    assert_eq!(e.status, PendingStatus::Signed);
    let auth = remote(&c, 0).authority.unwrap();
    assert_eq!(recover(&e.digest, e.r.as_ref().unwrap(), e.s.as_ref().unwrap(), e.v.unwrap()), auth);
    assert!(get_logs().iter().any(|l| l.contains("settlement_signed") && l.contains("\"v\":")));
    let sig_hex = c.get_pending_settlement(U64(0)).unwrap().signature_hex.unwrap();
    assert_eq!(sig_hex.len(), 130);
    assert_eq!(c.get_pending_settlement_evm(U64(0)).unwrap().tx_hash, None);
}

#[test]
fn base_settle_high_s_signature_is_normalised() {
    let mut c = base_open();
    trigger(&mut c);
    let e = c.get_pending_settlement_evm(U64(0)).unwrap();
    sign_cb(&mut c, PromiseResult::Successful(ecdsa_result(&unhex32(&e.digest), true)));
    let e = c.get_pending_settlement_evm(U64(0)).unwrap();
    assert_eq!(recover(&e.digest, e.r.as_ref().unwrap(), e.s.as_ref().unwrap(), e.v.unwrap()), remote(&c, 0).authority.unwrap());
    assert!(get_logs().iter().any(|l| l.contains("settlement_signed") && l.contains("\"s_normalised\":true")));
}

#[test]
fn base_settle_ed25519_answer_rolls_back() {
    let mut c = base_open();
    trigger(&mut c);
    sign_cb(&mut c, PromiseResult::Successful(sig_json(1, 64)));
    assert_eq!(c.get_pending_settlement(U64(0)).unwrap().status, PendingStatus::SignFailed);
    assert!(get_logs().iter().any(|l| l.contains("settlement_sign_failed") && l.contains("bad_scheme")));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, p.debt_usd_e6, remote(&c, 0).status), (PositionStatus::Open, U128(BORROW), RemoteStatus::Open));
    assert_eq!(c.get_pending_settlement_evm(U64(0)).unwrap().r, None);
}

#[test]
#[should_panic(expected = "no remote quote capacity")]
fn base_settle_ignores_base58_quotes() {
    let mut c = base(true);
    with_base(&mut c);
    fund_rcpt(&mut c, "buyer1.test", 12_000_000_000, 250, RCPT);
    fund(&mut c, "buyer2.test", 5_000_000_000, 400, false);
    reserve_on(&mut c, T0 + SEC, Some("base-sepolia"));
    authority_cb(&mut c, 0, key_result(&test_key_string()));
    set_ctx(owner(), 0, T0 + SEC);
    c.set_allow_keeper_deposit_attestation(true);
    set_ctx(keeper(), 0, T0 + 2 * SEC);
    c.keeper_attest_deposit(U64(0), ETX.into(), EDEP.into());
    drop_price(&mut c);
    trigger(&mut c);
}

#[test]
#[should_panic(expected = "no remote quote capacity")]
fn solana_settle_ignores_0x_quotes() {
    let mut c = base(true);
    fund_rcpt(&mut c, "buyer1.test", 12_000_000_000, 250, ERCPT);
    fund(&mut c, "buyer2.test", 5_000_000_000, 400, false);
    assert_eq!(reserve(&mut c, T0 + SEC), 0);
    authority_cb(&mut c, 0, key_result(&auth()));
    confirm(&mut c, 0, T0 + 2 * SEC);
    verified(&mut c, 0, T0 + 2 * SEC, vault_json(0, UNITS, AUTH_B58, DEPOSITOR));
    drop_price(&mut c);
    trigger(&mut c);
}

#[test]
fn base_relay_takes_evm_tx_hash() {
    let mut c = base_signed();
    set_ctx(keeper(), 0, T0 + 7 * SEC);
    c.relay_settlement_result(U64(0), ETX.into());
    let e = c.get_pending_settlement_evm(U64(0)).unwrap();
    assert_eq!((e.status, e.tx_hash.as_deref()), (PendingStatus::Relayed, Some(ETX)));
    let p = c.get_position(U64(0)).unwrap();
    assert_eq!((p.status, remote(&c, 0).status), (PositionStatus::Closed, RemoteStatus::Closed));
}

#[test]
#[should_panic(expected = "bad solana_tx_sig")]
fn base_relay_refuses_solana_signature() {
    let mut c = base_signed();
    set_ctx(keeper(), 0, T0 + 7 * SEC);
    c.relay_settlement_result(U64(0), TX.into());
}

#[test]
fn evm_views_none_for_solana_positions() {
    let mut c = open_remote(true, false);
    trigger(&mut c);
    assert!(c.get_pending_settlement(U64(0)).is_some());
    assert!(c.get_pending_settlement_evm(U64(0)).is_none());
    assert!(c.get_pending_release_evm(U64(0)).is_none());
}

// ------------------------------------------------------------------ release

#[test]
fn base_release_signs_eip712_release_and_relays() {
    let mut c = base_repaid();
    release(&mut c, T0 + 10 * SEC);
    let d = c.get_pending_release(U64(0)).unwrap();
    let e = c.get_pending_release_evm(U64(0)).unwrap();
    assert_eq!((e.digest.as_str(), e.recipient.as_str(), e.status), (d.message.as_str(), EDEP, ReleaseStatus::AwaitingSignature));
    let to = evm::parse_address(EDEP).unwrap();
    let ds = evm::domain_separator(84_532, &evm::parse_address(EVAULT).unwrap());
    assert_eq!(evm::hex0x(&evm::typed_digest(&ds, &evm::release_struct_hash(0, &to, e.nonce.0, e.expires.0))), e.digest);
    assert!(get_logs().iter().any(|l| l.contains("remote_release_requested") && l.contains("\"chain\":\"base-sepolia\"")));
    release_cb(&mut c, T0 + 11 * SEC, e.nonce.0, PromiseResult::Successful(ecdsa_result(&unhex32(&e.digest), false)));
    let e = c.get_pending_release_evm(U64(0)).unwrap();
    assert_eq!(e.status, ReleaseStatus::Signed);
    assert_eq!(recover(&e.digest, e.r.as_ref().unwrap(), e.s.as_ref().unwrap(), e.v.unwrap()), remote(&c, 0).authority.unwrap());
    assert!(get_logs().iter().any(|l| l.contains("remote_release_signed") && l.contains("\"digest\"")));
    set_ctx(keeper(), 0, T0 + 12 * SEC);
    c.relay_release_result(U64(0), ETX.into());
    let e = c.get_pending_release_evm(U64(0)).unwrap();
    assert_eq!((e.status, e.tx_hash.as_deref()), (ReleaseStatus::Relayed, Some(ETX)));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Closed);
}

#[test]
fn base_release_bad_answer_marks_sign_failed() {
    let mut c = base_repaid();
    release(&mut c, T0 + 10 * SEC);
    let n = c.get_pending_release(U64(0)).unwrap().nonce.0;
    release_cb(&mut c, T0 + 11 * SEC, n, PromiseResult::Successful(sig_json(1, 64)));
    assert_eq!(c.get_pending_release(U64(0)).unwrap().status, ReleaseStatus::SignFailed);
    assert!(get_logs().iter().any(|l| l.contains("remote_release_sign_failed") && l.contains("bad_scheme")));
}

#[test]
#[should_panic(expected = "bad solana_tx_sig")]
fn base_relay_release_refuses_solana_signature() {
    let mut c = base_repaid();
    release(&mut c, T0 + 10 * SEC);
    let e = c.get_pending_release_evm(U64(0)).unwrap();
    release_cb(&mut c, T0 + 11 * SEC, e.nonce.0, PromiseResult::Successful(ecdsa_result(&unhex32(&e.digest), false)));
    set_ctx(keeper(), 0, T0 + 12 * SEC);
    c.relay_release_result(U64(0), TX.into());
}

/// WO-27 vectors (evm/test/eip712_vectors.json @ ef44e58, copied to tests/fixtures/): domain separator (84532 and the
/// 8453 negative), structHash and digest byte for byte; the MPC-shaped answer parses to the vault's r/s/v and recovers
/// to the vectors' signer.
#[test]
fn eip712_matches_wo27_vault_vectors() {
    let v: Value = serde_json::from_str(include_str!("../tests/fixtures/evm_eip712_vectors.json")).unwrap();
    let n = |x: &Value| x.as_str().unwrap().parse::<u128>().unwrap();
    let dom = &v["domain"];
    let vault = evm::parse_address(dom["verifyingContract"].as_str().unwrap()).unwrap();
    let ds = evm::domain_separator(n(&dom["chainId"]) as u64, &vault);
    assert_eq!(evm::hex0x(&ds), dom["separator"]);
    assert_eq!(evm::hex0x(&env::keccak256_array(evm::SETTLE_TYPE.as_bytes())), v["settleTypeHash"]);
    assert_eq!(evm::hex0x(&env::keccak256_array(evm::RELEASE_TYPE.as_bytes())), v["releaseTypeHash"]);
    assert_eq!((evm::SETTLE_TYPE, evm::RELEASE_TYPE), (v["settleType"].as_str().unwrap(), v["releaseType"].as_str().unwrap()));
    let signer = v["signer"].as_str().unwrap().to_lowercase();
    let check_sig = |s: &Value, digest: &str| {
        // MPC-shaped answer (F-332) -> stored r/s/v; the vault's vectors are low-s, so no normalisation here
        let resp = json!({ "scheme": "Secp256k1",
            "big_r": { "affine_point": s["mpcAffinePoint"].as_str().unwrap().trim_start_matches("0x") },
            "s": { "scalar": s["s"].as_str().unwrap().trim_start_matches("0x") },
            "recovery_id": n(&s["mpcRecoveryId"]) as u8 });
        let sig = evm::parse_ecdsa_response(resp.to_string().as_bytes()).unwrap();
        assert!(!sig.normalised);
        assert_eq!((evm::hex0x(&sig.r), evm::hex0x(&sig.s), u128::from(sig.v)), (s["r"].as_str().unwrap().into(), s["s"].as_str().unwrap().into(), n(&s["v"])));
        assert_eq!(evm::hex0x(&sig.rsv()), s["signature65"]);
        assert_eq!(recover(digest, &evm::hex0x(&sig.r), &evm::hex0x(&sig.s), sig.v), signer);
    };
    let mut settles = 0;
    for (name, s) in v["settle"].as_object().unwrap() {
        let f = evm::SettleFields {
            position_id: n(&s["positionId"]) as u64,
            quote_id: n(&s["quoteId"]) as u64,
            repay_e6: n(&s["repayE6"]),
            seize_raw: n(&s["seizeRaw"]),
            recipient: evm::parse_address(s["recipient"].as_str().unwrap()).unwrap(),
            nonce: n(&s["nonce"]) as u64,
            expires: n(&s["expires"]) as u64,
            kind: n(&s["kind"]) as u8,
        };
        let sh = evm::settle_struct_hash(&f);
        assert_eq!(evm::hex0x(&sh), s["structHash"], "{name}");
        let d = evm::hex0x(&evm::typed_digest(&ds, &sh));
        assert_eq!(d, s["digest"].as_str().unwrap(), "{name}");
        if s.get("mpcAffinePoint").is_some() {
            check_sig(s, &d);
        }
        if name == "preliq_pos7" {
            let neg = &v["negative"]["domainChain8453"];
            let ds8453 = evm::domain_separator(n(&neg["chainId"]) as u64, &vault);
            assert_eq!(evm::hex0x(&ds8453), neg["separator"]);
            let d8453 = evm::hex0x(&evm::typed_digest(&ds8453, &sh));
            assert_eq!(d8453, v["negative"]["settlePreliqPos7DigestChain8453"].as_str().unwrap());
            assert_ne!(d8453, d, "chain id is bound into the digest");
        }
        settles += 1;
    }
    let mut releases = 0;
    for (name, s) in v["release"].as_object().unwrap() {
        let to = evm::parse_address(s["recipient"].as_str().unwrap()).unwrap();
        let sh = evm::release_struct_hash(n(&s["positionId"]) as u64, &to, n(&s["nonce"]) as u64, n(&s["expires"]) as u64);
        assert_eq!(evm::hex0x(&sh), s["structHash"], "{name}");
        let d = evm::hex0x(&evm::typed_digest(&ds, &sh));
        assert_eq!(d, s["digest"].as_str().unwrap(), "{name}");
        check_sig(s, &d);
        releases += 1;
    }
    assert_eq!((settles, releases), (2, 2));
}

// ------------------------------------------------------------------ quote recipient

#[test]
fn quote_recipient_accepts_0x_and_base58() {
    let mut c = base(true);
    fund(&mut c, "buyer1.test", 1_000_000_000, 250, false);
    set_ctx(a("buyer1.test"), 0, T0 + SEC);
    c.set_quote_remote_recipient(U64(0), Some(ERCPT.into()));
    assert_eq!(c.get_quote(U64(0)).unwrap().buyer_remote_recipient.as_deref(), Some(ERCPT));
    c.set_quote_remote_recipient(U64(0), Some(RCPT.into()));
    assert_eq!(c.get_quote(U64(0)).unwrap().buyer_remote_recipient.as_deref(), Some(RCPT));
}

#[test]
#[should_panic(expected = "bad recipient")]
fn quote_recipient_refuses_bad_0x() {
    let mut c = base(true);
    fund(&mut c, "buyer1.test", 1_000_000_000, 250, false);
    set_ctx(a("buyer1.test"), 0, T0 + SEC);
    c.set_quote_remote_recipient(U64(0), Some("0x70997970C51812dc3A010C7d01b50e0d17dc79".into()));
}
