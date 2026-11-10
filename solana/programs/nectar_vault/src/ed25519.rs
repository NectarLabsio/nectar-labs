//! Check the Ed25519 verify instruction that must immediately precede settle/release (F-080, F-082).
//!
//! The native Ed25519 program has already verified the signature when this program runs, but it verifies
//! whatever its offsets point at, possibly in other instructions. So we accept exactly the layout of
//! `new_ed25519_instruction_with_signature`: one signature, every `*_instruction_index = u16::MAX` (this
//! instruction), pubkey @16, signature @48, message @112 running to the end of the data, no accounts.
//! Then pubkey and message are compared byte for byte with the position authority and the rebuilt preimage.

use anchor_lang::prelude::*;
use solana_instructions_sysvar::{load_current_index_checked, load_instruction_at_checked};

use crate::VaultError;

pub const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");

pub const PUBKEY_OFFSET: usize = 16;
pub const SIGNATURE_OFFSET: usize = 48;
pub const MESSAGE_OFFSET: usize = 112;
const THIS_IX: u16 = u16::MAX;

fn u16_at(data: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([data[at], data[at + 1]])
}

/// Pure layout + content check of Ed25519 program instruction data.
pub fn check_ed25519_data(data: &[u8], pubkey: &[u8; 32], message: &[u8]) -> Result<()> {
    require!(data.len() >= MESSAGE_OFFSET, VaultError::BadEd25519Layout);
    require!(data[0] == 1, VaultError::BadEd25519Layout);
    // Ed25519SignatureOffsets at 2..16 (7 x u16 LE).
    let sig_off = u16_at(data, 2) as usize;
    let sig_ix = u16_at(data, 4);
    let pk_off = u16_at(data, 6) as usize;
    let pk_ix = u16_at(data, 8);
    let msg_off = u16_at(data, 10) as usize;
    let msg_len = u16_at(data, 12) as usize;
    let msg_ix = u16_at(data, 14);
    require!(sig_ix == THIS_IX && pk_ix == THIS_IX && msg_ix == THIS_IX, VaultError::BadEd25519Layout);
    require!(
        sig_off == SIGNATURE_OFFSET && pk_off == PUBKEY_OFFSET && msg_off == MESSAGE_OFFSET,
        VaultError::BadEd25519Layout
    );
    require!(data.len() == MESSAGE_OFFSET + msg_len, VaultError::BadEd25519Layout);
    require!(&data[PUBKEY_OFFSET..SIGNATURE_OFFSET] == pubkey.as_slice(), VaultError::PubkeyMismatch);
    require!(&data[MESSAGE_OFFSET..] == message, VaultError::MessageMismatch);
    Ok(())
}

/// Load the instruction immediately before the current one from the Instructions sysvar and check it.
pub fn verify_preceding_ed25519(ix_sysvar: &AccountInfo, pubkey: &[u8; 32], message: &[u8]) -> Result<()> {
    let current = load_current_index_checked(ix_sysvar)?;
    require!(current > 0, VaultError::MissingEd25519Verify);
    let prev = load_instruction_at_checked(usize::from(current - 1), ix_sysvar)?;
    require_keys_eq!(prev.program_id, ED25519_PROGRAM_ID, VaultError::MissingEd25519Verify);
    require!(prev.accounts.is_empty(), VaultError::BadEd25519Layout);
    check_ed25519_data(&prev.data, pubkey, message)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build(pk: &[u8; 32], sig: &[u8; 64], msg: &[u8]) -> Vec<u8> {
        let mut d = vec![1u8, 0];
        for v in [48u16, u16::MAX, 16, u16::MAX, 112, msg.len() as u16, u16::MAX] {
            d.extend_from_slice(&v.to_le_bytes());
        }
        d.extend_from_slice(pk);
        d.extend_from_slice(sig);
        d.extend_from_slice(msg);
        d
    }

    #[test]
    fn accepts_canonical_layout() {
        let d = build(&[7; 32], &[9; 64], b"hello");
        assert!(check_ed25519_data(&d, &[7; 32], b"hello").is_ok());
    }

    #[test]
    fn rejects_wrong_pubkey_message_and_layout() {
        let d = build(&[7; 32], &[9; 64], b"hello");
        assert!(check_ed25519_data(&d, &[8; 32], b"hello").is_err());
        assert!(check_ed25519_data(&d, &[7; 32], b"hellO").is_err());
        assert!(check_ed25519_data(&d, &[7; 32], b"hell").is_err());
        let mut two = d.clone();
        two[0] = 2;
        assert!(check_ed25519_data(&two, &[7; 32], b"hello").is_err());
        let mut other_ix = d.clone();
        other_ix[14..16].copy_from_slice(&0u16.to_le_bytes()); // message from instruction 0
        assert!(check_ed25519_data(&other_ix, &[7; 32], b"hello").is_err());
        let mut trailing = d.clone();
        trailing.push(0);
        assert!(check_ed25519_data(&trailing, &[7; 32], b"hello").is_err());
        assert!(check_ed25519_data(&d[..50], &[7; 32], b"hello").is_err());
    }
}
