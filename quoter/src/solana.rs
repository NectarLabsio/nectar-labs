//! Minimal Solana primitives for the `vault_read` job (WO-24), without the Solana SDK (wasm size):
//! base58 / base64, the Ed25519 "is on curve" test, `find_program_address`, and the 123-byte `Position` layout
//! from solana/deploy.md. Integer-only, no allocation beyond small vectors.

use sha2::{Digest, Sha256};

const B58: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const PDA_MARKER: &[u8] = b"ProgramDerivedAddress";

// ------------------------------------------------------------------ base58 / base64

pub fn b58_encode(bytes: &[u8]) -> String {
    let mut digits: Vec<u8> = Vec::with_capacity(bytes.len() * 2);
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
    let mut s = String::with_capacity(zeros + digits.len());
    s.extend(std::iter::repeat_n('1', zeros));
    s.extend(digits.iter().rev().map(|d| B58[*d as usize] as char));
    s
}

/// Base58 → exactly 32 bytes (a Solana address). `None` on a foreign character or another length.
pub fn b58_decode32(s: &str) -> Option<[u8; 32]> {
    if s.is_empty() || s.len() > 44 {
        return None;
    }
    let mut out: Vec<u8> = Vec::with_capacity(32);
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
    out.try_into().ok()
}

/// Standard base64 (RFC 4648 alphabet, `=` padding required to a multiple of 4).
pub fn b64_decode(s: &str) -> Option<Vec<u8>> {
    fn val(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some(u32::from(c - b'A')),
            b'a'..=b'z' => Some(u32::from(c - b'a') + 26),
            b'0'..=b'9' => Some(u32::from(c - b'0') + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let b = s.as_bytes();
    if !b.len().is_multiple_of(4) {
        return None;
    }
    let mut out = Vec::with_capacity(b.len() / 4 * 3);
    for (i, chunk) in b.chunks(4).enumerate() {
        let last = i + 1 == b.len() / 4;
        let pad = chunk.iter().rev().take_while(|c| **c == b'=').count();
        if pad > 2 || (pad > 0 && !last) {
            return None;
        }
        let mut n: u32 = 0;
        for &c in &chunk[..4 - pad] {
            n = (n << 6) | val(c)?;
        }
        n <<= 6 * pad as u32;
        let bytes = [(n >> 16) as u8, (n >> 8) as u8, n as u8];
        out.extend_from_slice(&bytes[..3 - pad]);
    }
    Some(out)
}

// ------------------------------------------------------------------ GF(2^255 - 19), 4 × u64 little-endian limbs

type Fe = [u64; 4];
const P: Fe = [0xFFFF_FFFF_FFFF_FFED, u64::MAX, u64::MAX, 0x7FFF_FFFF_FFFF_FFFF];
const ZERO: Fe = [0; 4];
const ONE: Fe = [1, 0, 0, 0];
/// Edwards d = −121665/121666 mod p (checked in tests).
const D: Fe = [0x75EB_4DCA_1359_78A3, 0x0070_0A4D_4141_D8AB, 0x8CC7_4079_7779_E898, 0x5203_6CEE_2B6F_FE73];
/// (p − 1) / 2 = 2^254 − 10 (Euler's criterion).
const HALF_P_MINUS_1: Fe = [0xFFFF_FFFF_FFFF_FFF6, u64::MAX, u64::MAX, 0x3FFF_FFFF_FFFF_FFFF];

fn geq_p(a: &Fe) -> bool {
    for i in (0..4).rev() {
        if a[i] != P[i] {
            return a[i] > P[i];
        }
    }
    true
}

/// a − b mod 2^256 with the final borrow.
fn sub_raw(a: &Fe, b: &Fe) -> (Fe, bool) {
    let mut r = [0u64; 4];
    let mut borrow = false;
    for i in 0..4 {
        let (d1, o1) = a[i].overflowing_sub(b[i]);
        let (d2, o2) = d1.overflowing_sub(u64::from(borrow));
        r[i] = d2;
        borrow = o1 || o2;
    }
    (r, borrow)
}

fn add_raw(a: &Fe, b: &Fe) -> (Fe, bool) {
    let mut r = [0u64; 4];
    let mut carry = false;
    for i in 0..4 {
        let (s1, o1) = a[i].overflowing_add(b[i]);
        let (s2, o2) = s1.overflowing_add(u64::from(carry));
        r[i] = s2;
        carry = o1 || o2;
    }
    (r, carry)
}

/// Input < 2p → canonical (< p).
fn reduce_once(a: Fe) -> Fe {
    if geq_p(&a) { sub_raw(&a, &P).0 } else { a }
}

/// Any 256-bit value → canonical: fold bit 255 (2^255 ≡ 19), then one conditional subtraction.
fn reduce256(mut a: Fe) -> Fe {
    let top = a[3] >> 63;
    a[3] &= 0x7FFF_FFFF_FFFF_FFFF;
    let (r, _) = add_raw(&a, &[19 * top, 0, 0, 0]); // a < 2^255 → no carry out
    reduce_once(r)
}

fn fe_add(a: &Fe, b: &Fe) -> Fe {
    // a, b < p < 2^255 → sum < 2^256
    reduce_once(add_raw(a, b).0)
}

fn fe_sub(a: &Fe, b: &Fe) -> Fe {
    let (d, borrow) = sub_raw(a, b);
    if borrow { add_raw(&d, &P).0 } else { d }
}

fn fe_mul(a: &Fe, b: &Fe) -> Fe {
    let mut t = [0u64; 8];
    for i in 0..4 {
        let mut carry: u128 = 0;
        for j in 0..4 {
            let v = u128::from(t[i + j]) + u128::from(a[i]) * u128::from(b[j]) + carry;
            t[i + j] = v as u64;
            carry = v >> 64;
        }
        t[i + 4] = carry as u64;
    }
    // 2^256 ≡ 38 (mod p): r = lo + 38·hi
    let mut r = [0u64; 4];
    let mut carry: u128 = 0;
    for i in 0..4 {
        let v = u128::from(t[i]) + 38 * u128::from(t[i + 4]) + carry;
        r[i] = v as u64;
        carry = v >> 64;
    }
    // carry ≤ 38: fold once more; a second overflow leaves r tiny, so adding 38 cannot overflow again.
    let (r2, over) = add_raw(&r, &[(carry * 38) as u64, 0, 0, 0]);
    let r3 = if over { add_raw(&r2, &[38, 0, 0, 0]).0 } else { r2 };
    reduce256(r3)
}

fn fe_pow(a: &Fe, e: &Fe) -> Fe {
    let mut r = ONE;
    for i in (0..4).rev() {
        for bit in (0..64).rev() {
            r = fe_mul(&r, &r);
            if (e[i] >> bit) & 1 == 1 {
                r = fe_mul(&r, a);
            }
        }
    }
    r
}

/// Same predicate as `curve25519-dalek` `CompressedEdwardsY::decompress().is_some()` (what Solana uses for
/// PDAs): y = the 255 low bits mod p; on the curve iff u/v = (y² − 1)/(d·y² + 1) is a square (or u = 0).
/// v ≠ 0 always (−1/d is not a square), so this is Euler's criterion on u·v.
pub fn is_on_curve(bytes: &[u8; 32]) -> bool {
    let mut y = [0u64; 4];
    for (i, limb) in y.iter_mut().enumerate() {
        let mut w = [0u8; 8];
        w.copy_from_slice(&bytes[i * 8..i * 8 + 8]);
        *limb = u64::from_le_bytes(w);
    }
    y[3] &= 0x7FFF_FFFF_FFFF_FFFF;
    let y = reduce_once(y);
    let yy = fe_mul(&y, &y);
    let u = fe_sub(&yy, &ONE);
    let v = fe_add(&fe_mul(&yy, &D), &ONE);
    let chi = fe_pow(&fe_mul(&u, &v), &HALF_P_MINUS_1);
    chi == ZERO || chi == ONE
}

// ------------------------------------------------------------------ PDAs

/// `create_program_address`: sha256(seeds ‖ program_id ‖ "ProgramDerivedAddress"), rejected if on the curve.
pub fn create_program_address(seeds: &[&[u8]], program: &[u8; 32]) -> Option<[u8; 32]> {
    let mut h = Sha256::new();
    for s in seeds {
        h.update(s);
    }
    h.update(program);
    h.update(PDA_MARKER);
    let out: [u8; 32] = h.finalize().into();
    (!is_on_curve(&out)).then_some(out)
}

/// `find_program_address`: highest bump in 255..=0 whose address is off the curve.
pub fn find_program_address(seeds: &[&[u8]], program: &[u8; 32]) -> Option<([u8; 32], u8)> {
    let mut b = [0u8; 1];
    for bump in (0..=255u8).rev() {
        b[0] = bump;
        let mut with_bump: Vec<&[u8]> = seeds.to_vec();
        with_bump.push(&b);
        if let Some(a) = create_program_address(&with_bump, program) {
            return Some((a, bump));
        }
    }
    None
}

/// nectar_vault PDAs (solana/deploy.md): vault `["vault", mint]`, position `["pos", vault, u64le(id)]`.
pub fn vault_pda(mint: &[u8; 32], program: &[u8; 32]) -> Option<[u8; 32]> {
    find_program_address(&[b"vault", mint], program).map(|(a, _)| a)
}

pub fn position_pda(vault: &[u8; 32], position_id: u64, program: &[u8; 32]) -> Option<[u8; 32]> {
    find_program_address(&[b"pos", vault, &position_id.to_le_bytes()], program).map(|(a, _)| a)
}

// ------------------------------------------------------------------ Position account (123 bytes)

pub const POSITION_LEN: usize = 123;
pub const POSITION_DISCRIMINATOR: [u8; 8] = [170, 188, 143, 228, 122, 64, 247, 208];
pub const STATUS_OPEN: u8 = 1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Position {
    pub version: u8,
    pub authority: [u8; 32],
    pub depositor: [u8; 32],
    pub amount: u64,
    pub status: u8,
    pub vault: [u8; 32],
    pub position_id: u64,
    pub bump: u8,
}

fn arr32(d: &[u8], at: usize) -> [u8; 32] {
    let mut a = [0u8; 32];
    a.copy_from_slice(&d[at..at + 32]);
    a
}

fn u64le(d: &[u8], at: usize) -> u64 {
    let mut a = [0u8; 8];
    a.copy_from_slice(&d[at..at + 8]);
    u64::from_le_bytes(a)
}

/// Offsets per solana/deploy.md: discriminator @0, version @8, authority @9, depositor @41, amount @73,
/// status @81, vault @82, position_id @114, bump @122.
pub fn decode_position(d: &[u8]) -> Result<Position, &'static str> {
    if d.len() != POSITION_LEN {
        return Err("bad_account_len");
    }
    if d[..8] != POSITION_DISCRIMINATOR {
        return Err("bad_discriminator");
    }
    Ok(Position {
        version: d[8],
        authority: arr32(d, 9),
        depositor: arr32(d, 41),
        amount: u64le(d, 73),
        status: d[81],
        vault: arr32(d, 82),
        position_id: u64le(d, 114),
        bump: d[122],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fe_small(x: u64) -> Fe {
        [x, 0, 0, 0]
    }

    #[test]
    fn d_constant() {
        // d·121666 + 121665 ≡ 0
        assert_eq!(fe_add(&fe_mul(&D, &fe_small(121_666)), &fe_small(121_665)), ZERO);
    }

    #[test]
    fn field_basics() {
        let pm1 = sub_raw(&P, &ONE).0;
        assert_eq!(fe_mul(&pm1, &pm1), ONE); // (−1)² = 1
        assert_eq!(fe_add(&pm1, &ONE), ZERO);
        assert_eq!(fe_sub(&ZERO, &ONE), pm1);
        // Fermat: a^(p−1) = 1
        let pm1_e = sub_raw(&P, &ONE).0;
        assert_eq!(fe_pow(&fe_small(7), &pm1_e), ONE);
        // −1 is a square (p ≡ 1 mod 4), 2 is not (p ≡ 5 mod 8)
        assert_eq!(fe_pow(&pm1, &HALF_P_MINUS_1), ONE);
        assert_eq!(fe_pow(&fe_small(2), &HALF_P_MINUS_1), pm1);
    }

    #[test]
    fn curve_points() {
        // Ed25519 base point (compressed) and the identity (y = 1) are on the curve.
        let mut base = [0x66u8; 32];
        base[0] = 0x58;
        assert!(is_on_curve(&base));
        let mut id = [0u8; 32];
        id[0] = 1;
        assert!(is_on_curve(&id));
    }

    #[test]
    fn base58_round_trip() {
        let a = b58_decode32("ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW").unwrap();
        assert_eq!(b58_encode(&a), "ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW");
        assert_eq!(b58_encode(&[0u8; 32]), "11111111111111111111111111111111");
        assert_eq!(b58_decode32("11111111111111111111111111111111"), Some([0u8; 32]));
        assert_eq!(b58_decode32("0OIl"), None);
        assert_eq!(b58_decode32("abc"), None); // too short
    }

    #[test]
    fn base64() {
        assert_eq!(b64_decode("").unwrap(), b"");
        assert_eq!(b64_decode("Zg==").unwrap(), b"f");
        assert_eq!(b64_decode("Zm8=").unwrap(), b"fo");
        assert_eq!(b64_decode("Zm9vYmFy").unwrap(), b"foobar");
        assert_eq!(b64_decode("Zm9vYg=="), Some(b"foob".to_vec()));
        assert_eq!(b64_decode("Zg=a"), None);
        assert_eq!(b64_decode("Zg="), None);
        assert_eq!(b64_decode("Z===",), None);
    }
}
