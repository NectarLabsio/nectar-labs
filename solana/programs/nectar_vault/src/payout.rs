//! Will this token account accept a payout? (SR-4)
//!
//! `settle` must never revert because of an account the recipient controls, so every destination-side failure of
//! `transfer_checked` is predicted here and turned into the claim fallback: wrong owner (classic SPL accounts can be
//! reassigned), wrong mint, frozen, balance overflow, and on Token-2022 the two account extensions that refuse plain
//! incoming transfers (spl-token-2022 8.0.1 processor.rs `process_transfer`: `memo_required`,
//! `non_confidential_transfer_allowed`). Mint-level state (paused, transfer hook) is the mint's, not the recipient's.

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_2022::spl_token_2022::{
    self,
    extension::{
        confidential_transfer::ConfidentialTransferAccount, memo_transfer::MemoTransfer, BaseStateWithExtensions,
        StateWithExtensions,
    },
    state::{Account as SplAccount, AccountState},
};

/// True when the address holds no account yet (a system-owned, empty address, possibly pre-funded with lamports).
pub fn is_absent(info: &AccountInfo) -> bool {
    info.owner == &system_program::ID && info.data_is_empty()
}

/// True when `data`, owned by `account_owner`, is a token account of `mint` held by `owner` that will accept `amount`.
pub fn accepts(account_owner: &Pubkey, token_program: &Pubkey, data: &[u8], mint: &Pubkey, owner: &Pubkey, amount: u64) -> bool {
    if account_owner != token_program {
        return false;
    }
    let Ok(state) = StateWithExtensions::<SplAccount>::unpack(data) else {
        return false;
    };
    if state.base.mint != *mint || state.base.owner != *owner || state.base.state != AccountState::Initialized {
        return false;
    }
    if state.base.amount.checked_add(amount).is_none() {
        return false;
    }
    if *token_program == spl_token_2022::ID {
        if let Ok(memo) = state.get_extension::<MemoTransfer>() {
            if bool::from(memo.require_incoming_transfer_memos) {
                return false;
            }
        }
        if let Ok(ct) = state.get_extension::<ConfidentialTransferAccount>() {
            if !bool::from(ct.allow_non_confidential_credits) {
                return false;
            }
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::solana_program::program_option::COption;
    use anchor_lang::solana_program::program_pack::Pack;
    use anchor_spl::token::ID as TOKEN_ID;
    use spl_token_2022::extension::{BaseStateWithExtensionsMut, ExtensionType, StateWithExtensionsMut};

    const MINT: Pubkey = Pubkey::new_from_array([1; 32]);
    const OWNER: Pubkey = Pubkey::new_from_array([2; 32]);

    fn base(state: AccountState, amount: u64) -> SplAccount {
        SplAccount {
            mint: MINT,
            owner: OWNER,
            amount,
            delegate: COption::None,
            state,
            is_native: COption::None,
            delegated_amount: 0,
            close_authority: COption::None,
        }
    }

    fn classic(a: SplAccount) -> Vec<u8> {
        let mut d = vec![0u8; SplAccount::LEN];
        SplAccount::pack(a, &mut d).unwrap();
        d
    }

    fn with_memo(required: bool) -> Vec<u8> {
        let len = ExtensionType::try_calculate_account_len::<SplAccount>(&[ExtensionType::MemoTransfer]).unwrap();
        let mut d = vec![0u8; len];
        let mut s = StateWithExtensionsMut::<SplAccount>::unpack_uninitialized(&mut d).unwrap();
        s.init_extension::<MemoTransfer>(true).unwrap().require_incoming_transfer_memos = required.into();
        s.base = base(AccountState::Initialized, 0);
        s.pack_base();
        s.init_account_type().unwrap();
        d
    }

    #[test]
    fn accepts_a_valid_classic_account() {
        assert!(accepts(&TOKEN_ID, &TOKEN_ID, &classic(base(AccountState::Initialized, 5)), &MINT, &OWNER, 1));
    }

    #[test]
    fn refuses_wrong_program_owner_mint_frozen_overflow_and_garbage() {
        let ok = classic(base(AccountState::Initialized, 5));
        assert!(!accepts(&OWNER, &TOKEN_ID, &ok, &MINT, &OWNER, 1));
        assert!(!accepts(&TOKEN_ID, &TOKEN_ID, &ok, &OWNER, &OWNER, 1));
        assert!(!accepts(&TOKEN_ID, &TOKEN_ID, &ok, &MINT, &MINT, 1));
        assert!(!accepts(&TOKEN_ID, &TOKEN_ID, &classic(base(AccountState::Frozen, 5)), &MINT, &OWNER, 1));
        assert!(!accepts(&TOKEN_ID, &TOKEN_ID, &classic(base(AccountState::Initialized, u64::MAX)), &MINT, &OWNER, 1));
        assert!(!accepts(&TOKEN_ID, &TOKEN_ID, &[0u8; 10], &MINT, &OWNER, 1));
        assert!(!accepts(&TOKEN_ID, &TOKEN_ID, &[0u8; SplAccount::LEN], &MINT, &OWNER, 1));
    }

    #[test]
    fn token_2022_memo_transfer_flag_decides() {
        assert!(accepts(&spl_token_2022::ID, &spl_token_2022::ID, &with_memo(false), &MINT, &OWNER, 1));
        assert!(!accepts(&spl_token_2022::ID, &spl_token_2022::ID, &with_memo(true), &MINT, &OWNER, 1));
    }
}
