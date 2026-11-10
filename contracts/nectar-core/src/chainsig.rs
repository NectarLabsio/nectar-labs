//! Chain Signatures settlement leg: pure helpers (interface-p2.md, D-016). No state, no env calls, so
//! the golden vectors in tests/preimage_vectors.json pin them byte-for-byte in every build.
//!
//! Preimage (ASCII, pipe-separated, decimal integers, no spaces), signed raw by the MPC (D-016, F-031):
//! `NECTAR_SETTLE_V1|chain=<id>|program=<vault>|pos=<n>|quote=<n>|repay_e6=<n>|seize_units=<n>|recipient=<b58>|nonce=<n>|expires=<unix_s>`

use near_sdk::serde::Deserialize;

/// `Eddsa` payload upper bound of the MPC signer (F-031).
pub const MAX_EDDSA_PAYLOAD: usize = 1232;
/// The MPC `sign` gas requirement on testnet (F-034 live).
pub const MIN_SIGN_TGAS: u64 = 15;
/// Ed25519 domain of the MPC signer (F-032).
pub const ED25519_DOMAIN_ID: u32 = 1;

const B58: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/// Inputs of one remote leg. Field order = preimage order.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreimageInput<'a> {
    pub chain_id: &'a str,
    pub vault_program: &'a str,
    pub position_id: u64,
    pub quote_id: u64,
    pub repay_e6: u128,
    pub seize_units: u128,
    pub recipient: &'a str,
    pub nonce: u64,
    pub expires: u64,
}

pub fn build_preimage(i: &PreimageInput) -> String {
    format!(
        "NECTAR_SETTLE_V1|chain={}|program={}|pos={}|quote={}|repay_e6={}|seize_units={}|recipient={}|nonce={}|expires={}",
        i.chain_id, i.vault_program, i.position_id, i.quote_id, i.repay_e6, i.seize_units, i.recipient, i.nonce, i.expires
    )
}

/// Settle kinds rebuilt by `nectar_vault` (solana/programs/nectar_vault/src/preimage.rs). v2 never produces kind 0.
pub const KIND_PRELIQ: u8 = 1;
pub const KIND_SELF: u8 = 2;

/// v2 settle preimage = v1 preimage + `|kind=PRELIQ` (1) or `|kind=SELF` (2). `None` for any other kind.
pub fn build_preimage_v2(i: &PreimageInput, kind: u8) -> Option<String> {
    let suffix = match kind {
        KIND_PRELIQ => "|kind=PRELIQ",
        KIND_SELF => "|kind=SELF",
        _ => return None,
    };
    Some(format!("{}{suffix}", build_preimage(i)))
}

/// `NECTAR_RELEASE_V1|chain=<id>|vault=<vault program id>|pos=<n>|recipient=<depositor b58>|nonce=<n>|expires=<unix_s>`
pub fn build_release_preimage(chain_id: &str, vault_program: &str, position_id: u64, recipient: &str, nonce: u64, expires: u64) -> String {
    format!("NECTAR_RELEASE_V1|chain={chain_id}|vault={vault_program}|pos={position_id}|recipient={recipient}|nonce={nonce}|expires={expires}")
}

/// MPC derivation path of one remote position: `<chain_id>/pos/<id>` (interface-v7 §B).
pub fn position_path(chain_id: &str, position_id: u64) -> String {
    format!("{chain_id}/pos/{position_id}")
}

/// Base58 (Bitcoin alphabet) decode; `None` on a foreign character or an empty string.
pub fn b58_decode(s: &str) -> Option<Vec<u8>> {
    if s.is_empty() {
        return None;
    }
    let mut out: Vec<u8> = Vec::with_capacity(s.len());
    for ch in s.bytes() {
        let mut carry = B58.iter().position(|b| *b == ch)? as u32;
        for byte in out.iter_mut() {
            carry += u32::from(*byte) * 58;
            *byte = (carry & 0xff) as u8;
            carry >>= 8;
        }
        while carry > 0 {
            out.push((carry & 0xff) as u8);
            carry >>= 8;
        }
    }
    let zeros = s.bytes().take_while(|b| *b == b'1').count();
    out.extend(std::iter::repeat_n(0u8, zeros));
    out.reverse();
    Some(out)
}

/// `derived_public_key` answer (F-338) -> stored authority. Domain 1: `"ed25519:<b58 of 32 B>"` kept as is.
/// Domain 0: `"secp256k1:<b58 of 64 B x‖y>"` -> EVM address `0x` + hex(last 20 bytes of keccak256(x‖y)) (F-339).
pub fn authority_from_derived_key(key: &str, domain_id: u32) -> Result<String, &'static str> {
    match domain_id {
        ED25519_DOMAIN_ID => {
            let b58 = key.strip_prefix("ed25519:").ok_or("bad_curve")?;
            let bytes = b58_decode(b58).ok_or("bad_base58")?;
            if bytes.len() != 32 {
                return Err("bad_key_length");
            }
            Ok(key.to_string())
        }
        SECP256K1_DOMAIN_ID => {
            let b58 = key.strip_prefix("secp256k1:").ok_or("bad_curve")?;
            let xy = b58_decode(b58).ok_or("bad_base58")?;
            if xy.len() != 64 {
                return Err("bad_key_length");
            }
            let h = near_sdk::env::keccak256_array(&xy);
            Ok(format!("0x{}", hex(&h[12..])))
        }
        _ => Err("bad_domain"),
    }
}

/// Compare a vault-reported authority with the stored one. Ed25519: the base58 part, with or without the
/// `ed25519:` prefix. EVM: case-insensitive `0x` address.
pub fn authority_matches(stored: &str, reported: &str) -> bool {
    if let Some(s) = stored.strip_prefix("ed25519:") {
        let r = reported.strip_prefix("ed25519:").unwrap_or(reported);
        return !s.is_empty() && s == r;
    }
    stored.starts_with("0x") && stored.len() == 42 && stored.eq_ignore_ascii_case(reported)
}

/// Secp256k1 domain of the MPC signer (F-032).
pub const SECP256K1_DOMAIN_ID: u32 = 0;

/// Base58 string of 32..=44 chars (a Solana address / program id; never contains `|`, `=` or spaces).
pub fn valid_base58_address(s: &str) -> bool {
    (32..=44).contains(&s.len()) && s.bytes().all(|b| B58.contains(&b))
}

/// EVM address: `0x` + 40 hex, any case (WO-29a).
pub fn valid_evm_address(s: &str) -> bool {
    s.len() == 42 && s.starts_with("0x") && s.bytes().skip(2).all(|b| b.is_ascii_hexdigit())
}

/// A quote's `buyer_remote_recipient` fills positions of this domain only: base58 -> Solana (1), `0x` -> EVM (0).
pub fn recipient_fits(domain_id: u32, recipient: &str) -> bool {
    match domain_id {
        ED25519_DOMAIN_ID => valid_base58_address(recipient),
        SECP256K1_DOMAIN_ID => valid_evm_address(recipient),
        _ => false,
    }
}

/// Solana transaction signature: base58, 64..=90 chars.
pub fn valid_tx_signature(s: &str) -> bool {
    (64..=90).contains(&s.len()) && s.bytes().all(|b| B58.contains(&b))
}

/// `[a-z0-9-]{1,32}` (e.g. `solana-devnet`).
pub fn valid_chain_id(s: &str) -> bool {
    (1..=32).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// MPC derivation path: printable ASCII without spaces, 1..=64 bytes.
pub fn valid_path(s: &str) -> bool {
    (1..=64).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_graphic())
}

pub fn hex(bytes: &[u8]) -> String {
    const H: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(H[(b >> 4) as usize] as char);
        s.push(H[(b & 15) as usize] as char);
    }
    s
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct SignatureResponse {
    scheme: String,
    signature: Vec<u8>,
}

/// MPC `sign` result (F-035): `{"scheme":"Ed25519","signature":[64 u8]}` -> the 64 bytes.
pub fn parse_signature_response(raw: &[u8]) -> Result<[u8; 64], &'static str> {
    let r: SignatureResponse = near_sdk::serde_json::from_slice(raw).map_err(|_| "bad_response")?;
    if r.scheme != "Ed25519" {
        return Err("bad_scheme");
    }
    r.signature.try_into().map_err(|_| "bad_length")
}
