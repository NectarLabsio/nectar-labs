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

/// SR-7/SR-8 (WO-34a): a Solana wallet key the vault can pay or be signed by: base58 that decodes to exactly 32 bytes
/// (`b58_decode` is the standard bijective codec, so the string is canonical) and is a point of the Ed25519 curve
/// (off-curve addresses such as PDAs are refused, interface-v7 §E).
pub fn valid_solana_pubkey(s: &str) -> bool {
    if !valid_base58_address(s) {
        return false;
    }
    let Some(bytes) = b58_decode(s) else { return false };
    let Ok(key) = <[u8; 32]>::try_from(bytes.as_slice()) else { return false };
    on_curve(&key)
}

/// GF(2^255-19) as 5 x 51-bit limbs. Only for the public `on_curve` predicate: no secrets, so not constant time.
/// Bounds: inputs < 2^54 per limb keep every u128 column < 2^115; `fe_mul` returns limbs < 2^52.
type Fe = [u64; 5];
const FE_MASK: u64 = (1 << 51) - 1;
const FE_ONE: Fe = [1, 0, 0, 0, 0];
/// p - 1, so `a + FE_MINUS_ONE` = a - 1 (mod p).
const FE_MINUS_ONE: Fe = [FE_MASK - 19, FE_MASK, FE_MASK, FE_MASK, FE_MASK];
/// Edwards d = -121665/121666.
const FE_D: Fe = [929955233495203, 466365720129213, 1662059464998953, 2033849074728123, 1442794654840575];

fn fe_from_bytes(b: &[u8; 32]) -> Fe {
    let w = |i: usize| {
        let mut x = [0u8; 8];
        x.copy_from_slice(&b[i..i + 8]);
        u64::from_le_bytes(x)
    };
    // bit offsets 0, 51, 102, 153, 204; the sign bit (255) is masked off
    [w(0) & FE_MASK, (w(6) >> 3) & FE_MASK, (w(12) >> 6) & FE_MASK, (w(19) >> 1) & FE_MASK, (w(24) >> 12) & FE_MASK]
}

fn fe_add(a: &Fe, b: &Fe) -> Fe {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3], a[4] + b[4]]
}

fn fe_mul(a: &Fe, b: &Fe) -> Fe {
    let m = |x: u64, y: u64| u128::from(x) * u128::from(y);
    let (b1, b2, b3, b4) = (b[1] * 19, b[2] * 19, b[3] * 19, b[4] * 19);
    let c = [
        m(a[0], b[0]) + m(a[1], b4) + m(a[2], b3) + m(a[3], b2) + m(a[4], b1),
        m(a[0], b[1]) + m(a[1], b[0]) + m(a[2], b4) + m(a[3], b3) + m(a[4], b2),
        m(a[0], b[2]) + m(a[1], b[1]) + m(a[2], b[0]) + m(a[3], b4) + m(a[4], b3),
        m(a[0], b[3]) + m(a[1], b[2]) + m(a[2], b[1]) + m(a[3], b[0]) + m(a[4], b4),
        m(a[0], b[4]) + m(a[1], b[3]) + m(a[2], b[2]) + m(a[3], b[1]) + m(a[4], b[0]),
    ];
    let mut r = [0u64; 5];
    let mut carry: u128 = 0;
    for i in 0..5 {
        let t = c[i] + carry;
        r[i] = (t as u64) & FE_MASK;
        carry = t >> 51;
    }
    let t = u128::from(r[0]) + carry * 19;
    r[0] = (t as u64) & FE_MASK;
    r[1] += (t >> 51) as u64;
    r
}

fn fe_sq_n(a: &Fe, n: u32) -> Fe {
    let mut r = *a;
    for _ in 0..n {
        r = fe_mul(&r, &r);
    }
    r
}

/// z^((p-1)/2) = z^(2^254 - 10) = (z^(2^250 - 1))^16 * z^6: the Legendre symbol of z.
fn fe_legendre(z: &Fe) -> Fe {
    let z2 = fe_sq_n(z, 1);
    let z9 = fe_mul(z, &fe_sq_n(&z2, 2));
    let z11 = fe_mul(&z2, &z9);
    let z_5 = fe_mul(&z9, &fe_sq_n(&z11, 1)); // 2^5 - 1
    let z_10 = fe_mul(&fe_sq_n(&z_5, 5), &z_5);
    let z_20 = fe_mul(&fe_sq_n(&z_10, 10), &z_10);
    let z_40 = fe_mul(&fe_sq_n(&z_20, 20), &z_20);
    let z_50 = fe_mul(&fe_sq_n(&z_40, 10), &z_10);
    let z_100 = fe_mul(&fe_sq_n(&z_50, 50), &z_50);
    let z_200 = fe_mul(&fe_sq_n(&z_100, 100), &z_100);
    let z_250 = fe_mul(&fe_sq_n(&z_200, 50), &z_50);
    let z6 = fe_mul(&z2, &fe_sq_n(&z2, 1));
    fe_mul(&fe_sq_n(&z_250, 4), &z6)
}

/// Unique representative in [0, p).
fn fe_canonical(a: &Fe) -> Fe {
    let mut l = *a;
    for _ in 0..2 {
        for i in 0..4 {
            l[i + 1] += l[i] >> 51;
            l[i] &= FE_MASK;
        }
        let top = l[4] >> 51;
        l[4] &= FE_MASK;
        l[0] += top * 19;
    }
    let mut q = (l[0] + 19) >> 51;
    for limb in l.iter().skip(1) {
        q = (limb + q) >> 51;
    }
    l[0] += 19 * q;
    for i in 0..4 {
        l[i + 1] += l[i] >> 51;
        l[i] &= FE_MASK;
    }
    l[4] &= FE_MASK;
    l
}

/// True when the 32 bytes decompress to an Ed25519 point: x^2 = (y^2 - 1)/(d y^2 + 1) has a root. u/v is a square
/// exactly when u*v is (v is never 0, because -1/d is a non-residue). Like `CompressedEdwardsY::decompress`, the sign
/// bit is ignored and a non-canonical y is reduced; `tests_v7c` cross-checks this against ed25519-dalek.
pub fn on_curve(key: &[u8; 32]) -> bool {
    let y = fe_from_bytes(key);
    let y2 = fe_mul(&y, &y);
    let u = fe_add(&y2, &FE_MINUS_ONE);
    let v = fe_add(&fe_mul(&FE_D, &y2), &FE_ONE);
    let s = fe_canonical(&fe_legendre(&fe_mul(&u, &v)));
    s == [0, 0, 0, 0, 0] || s == FE_ONE
}

/// SR-7: an EVM recipient or depositor: a `0x` address other than the zero address.
pub fn valid_evm_recipient(s: &str) -> bool {
    valid_evm_address(s) && s.bytes().skip(2).any(|b| b != b'0')
}

/// SR-7: a quote's `buyer_remote_recipient` (funding, `set_quote_remote_recipient`): Solana key or EVM address.
pub fn valid_remote_recipient(s: &str) -> bool {
    valid_solana_pubkey(s) || valid_evm_recipient(s)
}

/// A quote's `buyer_remote_recipient` fills positions of this domain only: base58 -> Solana (1), `0x` -> EVM (0).
/// SR-7: strict (32-byte on-curve Solana key; non-zero EVM address), so a leg no vault can pay is never signed.
pub fn recipient_fits(domain_id: u32, recipient: &str) -> bool {
    match domain_id {
        ED25519_DOMAIN_ID => valid_solana_pubkey(recipient),
        SECP256K1_DOMAIN_ID => valid_evm_recipient(recipient),
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
