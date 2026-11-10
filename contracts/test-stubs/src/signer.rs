//! WO-15: sandbox stand-in for `v1.signer-prod.testnet` `sign` (F-031, F-033, F-035). Never deployed to testnet.
//!
//! `sign({request:{path, payload_v2:{Eddsa:<hex>}, domain_id}})` (1 yocto) yields like the MPC contract and
//! schedules `respond` (playing the MPC nodes), which signs the raw payload bytes with a fixed local Ed25519
//! test key and resumes the yield. The yield callback returns `{"scheme":"Ed25519","signature":[64 u8]}`, so
//! the caller's `.then` sees exactly the F-035 shape. `set_signer_mode("fail")` resumes with a marker that
//! makes the callback panic: the caller sees a failed promise, as on MPC `fail_on_timeout`.
//! State lives under raw keys so the OutLayer/Pyth stub layout is untouched.

use ed25519_dalek::{Signer, SigningKey};
use near_sdk::serde_json::{Value, json};
use near_sdk::{Gas, GasWeight, NearToken, Promise, env, near, require};

use crate::{OutlayerStub, OutlayerStubExt, hex};

/// Test-only key seed (also `tests/preimage_vectors.json` `test_key_seed_hex`). Public on purpose.
pub const TEST_SEED: [u8; 32] = [7u8; 32];
const MODE_KEY: &[u8] = b"signer_mode";
const LAST_KEY: &[u8] = b"signer_last_request";
const FAIL: &[u8] = b"fail";

fn unhex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok()).collect()
}

/// v2 secp256k1 key the live signer answered for (`base-sepolia/pos/0`, pred `nectar-core-v2.nectar.testnet`, F-338),
/// returned for every domain-0 query: enough to exercise the EVM-address path (F-339).
pub const SECP_KEY_F338: &str =
    "secp256k1:64HT9SZmkJET5rHBHBR1pymtPgT6J74C8EoeRSmuTaE2Sgh1QHUGh3Aw76PCQuVtUpfrfwunKPL3aM5aCNBGBKJM";
const B58: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

pub fn sign_payload(payload: &[u8]) -> [u8; 64] {
    sign_with(&TEST_SEED, payload)
}

pub fn sign_with(seed: &[u8; 32], payload: &[u8]) -> [u8; 64] {
    SigningKey::from_bytes(seed).sign(payload).to_bytes()
}

/// Stub derivation (WO-21): a per-position path `<chain>/pos/<id>` gets its own key,
/// `seed = sha256("nectar-stub-derive:" + predecessor + "," + path)`; any other path keeps the fixed TEST_SEED
/// (WO-15 vectors). Not the MPC's math (F-036); it only makes "signed with the position's path" observable.
pub fn seed_for(predecessor: &str, path: &str) -> [u8; 32] {
    if !path.contains("/pos/") {
        return TEST_SEED;
    }
    env::sha256_array(format!("nectar-stub-derive:{predecessor},{path}").as_bytes())
}

pub fn b58_encode(bytes: &[u8]) -> String {
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

#[near]
impl OutlayerStub {
    /// F-338 shape: `derived_public_key(path, predecessor?, domain_id?)` -> `"ed25519:<b58>"` / `"secp256k1:<b58>"`.
    /// Signer modes: `derive_fail` panics, `derive_bad` answers a malformed key.
    pub fn derived_public_key(&self, path: String, predecessor: Option<near_sdk::AccountId>, domain_id: Option<u32>) -> String {
        match env::storage_read(MODE_KEY).as_deref() {
            Some(b"derive_fail") => env::panic_str("stub: derived_public_key failed"),
            Some(b"derive_bad") => return "ed25519:0OIl".into(),
            _ => {}
        }
        let pred = predecessor.unwrap_or_else(env::predecessor_account_id);
        match domain_id.unwrap_or(0) {
            1 => {
                let vk = SigningKey::from_bytes(&seed_for(pred.as_str(), &path)).verifying_key();
                format!("ed25519:{}", b58_encode(&vk.to_bytes()))
            }
            _ => SECP_KEY_F338.into(),
        }
    }

    #[payable]
    pub fn sign(&mut self, request: Value) {
        require!(env::attached_deposit() >= NearToken::from_yoctonear(1), "deposit 1 yocto");
        require!(request["domain_id"] == json!(1), "domain_id must be 1 (Ed25519)");
        let payload_hex = request["payload_v2"]["Eddsa"].as_str().unwrap_or_else(|| env::panic_str("Eddsa payload"));
        let payload = unhex(payload_hex).unwrap_or_else(|| env::panic_str("payload hex"));
        require!(!payload.is_empty() && payload.len() <= 1232, "payload size");
        let path = request["path"].as_str().unwrap_or_default().to_string();
        let seed = seed_for(env::predecessor_account_id().as_str(), &path);
        env::storage_write(LAST_KEY, request.to_string().as_bytes());
        let idx = env::promise_yield_create("on_sign_resume", b"{}", Gas::from_tgas(5), GasWeight(0), 0);
        let data_id = env::read_register(0).unwrap_or_else(|| env::panic_str("yield id"));
        Promise::new(env::current_account_id())
            // all gas left after the 5 Tgas yield callback (weight 1, F-171): the stub fits the live 15 Tgas
            .function_call_weight(
                "respond",
                json!({ "data_id_hex": hex(&data_id), "payload_hex": payload_hex, "seed_hex": hex(&seed) })
                    .to_string()
                    .into_bytes(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(1),
                GasWeight(1),
            )
            .detach();
        env::promise_return(idx);
    }

    /// Plays the MPC nodes: sign the raw payload (no pre-hash, D-016) and resume the yield.
    #[private]
    pub fn respond(&mut self, data_id_hex: String, payload_hex: String, seed_hex: Option<String>) {
        let id: [u8; 32] = unhex(&data_id_hex).and_then(|v| v.try_into().ok()).unwrap_or_else(|| env::panic_str("data id"));
        let seed: [u8; 32] = seed_hex.and_then(|s| unhex(&s)).and_then(|v| v.try_into().ok()).unwrap_or(TEST_SEED);
        let data = if env::storage_read(MODE_KEY).as_deref() == Some(FAIL) {
            FAIL.to_vec()
        } else {
            let sig = sign_with(&seed, &unhex(&payload_hex).unwrap_or_default());
            json!({ "scheme": "Ed25519", "signature": sig.to_vec() }).to_string().into_bytes()
        };
        require!(env::promise_yield_resume(&id, data), "no such yield");
    }

    /// Yield callback: its return value is the result of the caller's `sign` promise.
    #[private]
    pub fn on_sign_resume(&self) -> Value {
        let raw = env::promise_result_checked(0, 1024).unwrap_or_else(|_| env::panic_str("Signature request has timed out."));
        if raw == FAIL {
            env::panic_str("Signature request has timed out.");
        }
        near_sdk::serde_json::from_slice(&raw).unwrap_or_else(|_| env::panic_str("resume data"))
    }

    pub fn set_signer_mode(&mut self, mode: String) {
        env::storage_write(MODE_KEY, mode.as_bytes());
    }

    pub fn signer_public_key_hex(&self) -> String {
        hex(&SigningKey::from_bytes(&TEST_SEED).verifying_key().to_bytes())
    }

    pub fn get_last_sign_request(&self) -> String {
        env::storage_read(LAST_KEY).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signature, Verifier};
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    #[test]
    fn key_matches_vectors_and_signs_raw_bytes() {
        testing_env!(VMContextBuilder::new().build());
        let s = OutlayerStub::new();
        let v: Value = near_sdk::serde_json::from_str(include_str!("../../nectar-core/tests/preimage_vectors.json")).unwrap();
        assert_eq!(s.signer_public_key_hex(), v["test_public_key_hex"].as_str().unwrap());
        let pre = v["vectors"][0]["preimage"].as_str().unwrap().as_bytes();
        let sig = sign_payload(pre);
        assert_eq!(hex(&sig), v["vectors"][0]["signature_hex"].as_str().unwrap(), "Ed25519 is deterministic");
        SigningKey::from_bytes(&TEST_SEED).verifying_key().verify(pre, &Signature::from_bytes(&sig)).unwrap();
    }

    #[test]
    fn mode_and_last_request() {
        testing_env!(VMContextBuilder::new().build());
        let mut s = OutlayerStub::new();
        assert_eq!(s.get_last_sign_request(), "");
        s.set_signer_mode("fail".into());
        assert_eq!(env::storage_read(MODE_KEY).as_deref(), Some(FAIL));
        assert_eq!(unhex("0aff"), Some(vec![10, 255]));
        assert_eq!(unhex("0"), None);
    }

    #[test]
    fn derived_key_per_position_path_and_b58() {
        testing_env!(VMContextBuilder::new().build());
        let mut s = OutlayerStub::new();
        let core: near_sdk::AccountId = "core.test".parse().unwrap();
        let k0 = s.derived_public_key("solana-devnet/pos/0".into(), Some(core.clone()), Some(1));
        let k1 = s.derived_public_key("solana-devnet/pos/1".into(), Some(core.clone()), Some(1));
        assert!(k0.starts_with("ed25519:") && k0 != k1);
        let legacy = s.derived_public_key("solana-devnet-v1".into(), Some(core.clone()), Some(1));
        assert_eq!(legacy, format!("ed25519:{}", b58_encode(&unhex(&s.signer_public_key_hex()).unwrap())));
        assert_eq!(s.derived_public_key("base-sepolia/pos/0".into(), Some(core), Some(0)), SECP_KEY_F338);
        assert_eq!(b58_encode(&[0, 0, 1]), "112");
        assert_eq!(b58_encode(&[0u8; 32]), "11111111111111111111111111111111");
        s.set_signer_mode("derive_bad".into());
        assert_eq!(s.derived_public_key("x/pos/0".into(), None, Some(1)), "ed25519:0OIl");
        // per-path signatures verify against the derived key
        let seed = seed_for("core.test", "solana-devnet/pos/0");
        let sig = Signature::from_bytes(&sign_with(&seed, b"msg"));
        SigningKey::from_bytes(&seed).verifying_key().verify(b"msg", &sig).unwrap();
    }

    #[test]
    #[should_panic(expected = "stub: derived_public_key failed")]
    fn derived_key_fail_mode() {
        testing_env!(VMContextBuilder::new().build());
        let mut s = OutlayerStub::new();
        s.set_signer_mode("derive_fail".into());
        s.derived_public_key("x/pos/0".into(), None, Some(1));
    }

    #[test]
    #[should_panic(expected = "domain_id must be 1")]
    fn sign_rejects_secp_domain() {
        testing_env!(VMContextBuilder::new().attached_deposit(NearToken::from_yoctonear(1)).build());
        let mut s = OutlayerStub::new();
        s.sign(json!({ "path": "p", "payload_v2": { "Eddsa": "00" }, "domain_id": 0 }));
    }
}
