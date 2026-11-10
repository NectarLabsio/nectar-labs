//! Canonical preimages, rebuilt on-chain byte for byte (PRD §9, interface-v7 §B).
//!
//! ASCII, pipe-separated, decimal integers, base58 keys, no spaces, signed raw (no pre-hash).
//! Kind 0 is the v1 preimage exactly (no `|kind=` suffix), pinned by
//! `contracts/nectar-core/tests/preimage_vectors.json`.

use core::fmt::Display;

pub const CHAIN: &str = "solana-devnet";

pub const KIND_LEGACY: u8 = 0;
pub const KIND_PRELIQ: u8 = 1;
pub const KIND_SELF: u8 = 2;

fn kind_suffix(kind: u8) -> Option<&'static str> {
    match kind {
        KIND_LEGACY => Some(""),
        KIND_PRELIQ => Some("|kind=PRELIQ"),
        KIND_SELF => Some("|kind=SELF"),
        _ => None,
    }
}

/// `NECTAR_SETTLE_V1|chain=solana-devnet|program=<vault program id>|pos=..|quote=..|repay_e6=..|seize_units=..|recipient=<b58>|nonce=..|expires=..[|kind=PRELIQ|SELF]`
/// Returns `None` for an unknown kind.
#[allow(clippy::too_many_arguments)]
pub fn settle_preimage(
    program: &impl Display,
    position_id: u64,
    quote_id: u64,
    repay_e6: u64,
    seize_units: u64,
    recipient: &impl Display,
    nonce: u64,
    expires: i64,
    kind: u8,
) -> Option<Vec<u8>> {
    let suffix = kind_suffix(kind)?;
    Some(
        format!(
            "NECTAR_SETTLE_V1|chain={CHAIN}|program={program}|pos={position_id}|quote={quote_id}|repay_e6={repay_e6}|seize_units={seize_units}|recipient={recipient}|nonce={nonce}|expires={expires}{suffix}"
        )
        .into_bytes(),
    )
}

/// `NECTAR_RELEASE_V1|chain=solana-devnet|vault=<vault program id>|pos=..|recipient=<depositor b58>|nonce=..|expires=..`
pub fn release_preimage(program: &impl Display, position_id: u64, recipient: &impl Display, nonce: u64, expires: i64) -> Vec<u8> {
    format!(
        "NECTAR_RELEASE_V1|chain={CHAIN}|vault={program}|pos={position_id}|recipient={recipient}|nonce={nonce}|expires={expires}"
    )
    .into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::Pubkey;
    use std::str::FromStr;

    // Vectors copied from contracts/nectar-core/tests/preimage_vectors.json (the `max_values` vector uses u128
    // repay/seize, which this program takes as u64, so it cannot be represented here). The vectors' vault_program
    // string is a placeholder that does not decode to 32 bytes, hence the generic `Display` builder.
    const VAULT: &str = "Nectar1Vau1t11111111111111111111111111111111";

    fn pk(s: &str) -> Pubkey {
        Pubkey::from_str(s).unwrap()
    }

    #[test]
    fn kind0_matches_v1_vector_demo_leg() {
        let got = settle_preimage(
            &VAULT,
            0,
            0,
            10_000_000_000,
            57_544_379,
            &pk("3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV"),
            0,
            1_700_003_600,
            KIND_LEGACY,
        )
        .unwrap();
        let want = "NECTAR_SETTLE_V1|chain=solana-devnet|program=Nectar1Vau1t11111111111111111111111111111111|pos=0|quote=0|repay_e6=10000000000|seize_units=57544379|recipient=3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV|nonce=0|expires=1700003600";
        assert_eq!(got, want.as_bytes());
        assert_eq!(got.len(), 227);
    }

    #[test]
    fn kind0_matches_v1_vector_second_nonce() {
        let got = settle_preimage(
            &VAULT,
            7,
            12,
            1_250_000_000,
            9058,
            &pk("11111111111111111111111111111111"),
            1,
            1_762_819_200,
            KIND_LEGACY,
        )
        .unwrap();
        let want = "NECTAR_SETTLE_V1|chain=solana-devnet|program=Nectar1Vau1t11111111111111111111111111111111|pos=7|quote=12|repay_e6=1250000000|seize_units=9058|recipient=11111111111111111111111111111111|nonce=1|expires=1762819200";
        assert_eq!(got, want.as_bytes());
        assert_eq!(got.len(), 211);
    }

    #[test]
    fn kind_suffixes_and_unknown_kind() {
        let r = pk("11111111111111111111111111111111");
        let base = settle_preimage(&VAULT, 1, 2, 3, 4, &r, 5, 6, KIND_LEGACY).unwrap();
        let pre = settle_preimage(&VAULT, 1, 2, 3, 4, &r, 5, 6, KIND_PRELIQ).unwrap();
        let slf = settle_preimage(&VAULT, 1, 2, 3, 4, &r, 5, 6, KIND_SELF).unwrap();
        assert_eq!(pre, [base.as_slice(), b"|kind=PRELIQ"].concat());
        assert_eq!(slf, [base.as_slice(), b"|kind=SELF"].concat());
        assert!(settle_preimage(&VAULT, 1, 2, 3, 4, &r, 5, 6, 3).is_none());
    }

    #[test]
    fn release_format() {
        let got = release_preimage(&VAULT, 7, &pk("3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV"), 9, 1_762_819_200);
        let want = "NECTAR_RELEASE_V1|chain=solana-devnet|vault=Nectar1Vau1t11111111111111111111111111111111|pos=7|recipient=3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV|nonce=9|expires=1762819200";
        assert_eq!(got, want.as_bytes());
    }
}
