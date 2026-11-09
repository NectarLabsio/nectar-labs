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

/// Base58 string of 32..=44 chars (a Solana address / program id; never contains `|`, `=` or spaces).
pub fn valid_base58_address(s: &str) -> bool {
    (32..=44).contains(&s.len()) && s.bytes().all(|b| B58.contains(&b))
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
