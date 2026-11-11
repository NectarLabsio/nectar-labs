//! nectar_vault v2: Solana collateral vault for Nectar Labs remote positions (PRD §9, §9B; interface-v7 §B, §E).
//!
//! Collateral is committed out of a position only through `settle` or `release`, and only when the instruction
//! immediately before it is the native Ed25519 program verifying the position's NEAR-derived authority over the exact
//! preimage this program rebuilds from its own arguments. There is no admin key and no `cancel_position`.
//!
//! v2 (D-027, docs/work/security-review-v7.md):
//! - SR-1: the replay set is scoped to the depositor-bound slot: nonce PDA `[b"nonce", position.key(), nonce]`. A nonce
//!   burnt on one slot never blocks another, even one with the same id and authority. Records are never closed, so a
//!   slot that is withdrawn and reopened at the same address still refuses its used nonces.
//! - SR-8: a slot is bound to its depositor: position PDA `[b"pos", vault, position_id, depositor]`. Opening the same id
//!   with another depositor creates another slot and never blocks the honest one.
//! - SR-4: no payout depends on an account a third party controls. `settle` pays `seize_units` to the recipient's
//!   canonical ATA only when that account will accept the transfer (created if missing); otherwise it credits a
//!   program-owned `Claim` PDA `[b"claim", vault, recipient]` that the recipient pulls with `claim`. The remainder (and,
//!   on `release`, the whole amount) is recorded on the position as `withdrawable`; the depositor pulls it with `withdraw`
//!   to any token account of the mint, which closes the position.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Allocate, Assign, CreateAccount, Transfer};
use anchor_spl::associated_token::{self, get_associated_token_address_with_program_id, AssociatedToken};
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

pub mod ed25519;
pub mod payout;
pub mod preimage;

declare_id!("ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW");

pub const VAULT_SEED: &[u8] = b"vault";
pub const TOKENS_SEED: &[u8] = b"tokens";
pub const POS_SEED: &[u8] = b"pos";
pub const NONCE_SEED: &[u8] = b"nonce";
pub const CLAIM_SEED: &[u8] = b"claim";
pub const MAX_SYMBOL_LEN: usize = 16;

/// Layout versions (first data byte after the Anchor discriminator). The `Vault` layout is unchanged in v2.
pub const VAULT_LAYOUT: u8 = 1;
pub const POSITION_LAYOUT: u8 = 2;
pub const NONCE_LAYOUT: u8 = 2;
pub const CLAIM_LAYOUT: u8 = 1;

/// `Position.status`
pub const STATUS_OPEN: u8 = 1;
/// Settled: `seize_units` paid or credited to the recipient's claim; `withdrawable` = remainder.
pub const STATUS_SETTLED: u8 = 2;
/// Released: `withdrawable` = the whole amount.
pub const STATUS_RELEASED: u8 = 3;

/// `NonceRecord.op`
pub const OP_SETTLE: u8 = 0;
pub const OP_RELEASE: u8 = 1;

#[program]
pub mod nectar_vault {
    use super::*;

    /// Create the vault PDA `[b"vault", mint]` and its program-owned token account `[b"tokens", vault]`.
    pub fn init_vault(ctx: Context<InitVault>, symbol: String) -> Result<()> {
        require!(!symbol.is_empty() && symbol.len() <= MAX_SYMBOL_LEN, VaultError::InvalidSymbol);
        let vault = &mut ctx.accounts.vault;
        vault.version = VAULT_LAYOUT;
        vault.symbol = symbol;
        vault.mint = ctx.accounts.mint.key();
        vault.tokens = ctx.accounts.vault_tokens.key();
        vault.bump = ctx.bumps.vault;
        vault.tokens_bump = ctx.bumps.vault_tokens;
        Ok(())
    }

    /// The depositor transfers `amount` collateral units into the vault and records the authority (the NEAR
    /// `derived_public_key` for this position, or the v1 single-path key). The slot is keyed by (id, depositor).
    pub fn open_position(ctx: Context<OpenPosition>, position_id: u64, authority: [u8; 32], amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);
        require!(authority != [0u8; 32], VaultError::ZeroAuthority);
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.depositor_tokens.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault_tokens.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;
        let p = &mut ctx.accounts.position;
        p.version = POSITION_LAYOUT;
        p.authority = authority;
        p.depositor = ctx.accounts.depositor.key();
        p.amount = amount;
        p.status = STATUS_OPEN;
        p.vault = ctx.accounts.vault.key();
        p.position_id = position_id;
        p.bump = ctx.bumps.position;
        p.withdrawable = 0;
        emit!(PositionOpened { vault: p.vault, position_id, authority, depositor: p.depositor, amount });
        Ok(())
    }

    /// Pay `seize_units` to the recipient (ATA when it accepts the transfer, else the recipient's `Claim`), record the
    /// remainder as `withdrawable`. kind 0 = v1 legacy preimage (no suffix), 1 = `|kind=PRELIQ`, 2 = `|kind=SELF`.
    #[allow(clippy::too_many_arguments)]
    pub fn settle(
        ctx: Context<Settle>,
        position_id: u64,
        quote_id: u64,
        repay_e6: u64,
        seize_units: u64,
        recipient: Pubkey,
        nonce: u64,
        expires: i64,
        kind: u8,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(expires > now, VaultError::Expired);
        let p = &ctx.accounts.position;
        require!(p.status == STATUS_OPEN, VaultError::PositionNotOpen);
        require!(seize_units <= p.amount, VaultError::SeizeExceedsAmount);
        let msg = preimage::settle_preimage(
            &crate::ID,
            position_id,
            quote_id,
            repay_e6,
            seize_units,
            &recipient,
            nonce,
            expires,
            kind,
        )
        .ok_or(VaultError::InvalidKind)?;
        ed25519::verify_preceding_ed25519(&ctx.accounts.instructions.to_account_info(), &p.authority, &msg)?;

        let authority = p.authority;
        let depositor = p.depositor;
        let remainder = p.amount - seize_units;
        let vault_key = ctx.accounts.vault.key();
        record_nonce(&mut ctx.accounts.nonce_record, vault_key, authority, nonce, position_id, OP_SETTLE, kind);
        let p = &mut ctx.accounts.position;
        p.status = STATUS_SETTLED;
        p.withdrawable = remainder;

        let mut claimed = false;
        if seize_units > 0 {
            let a = &ctx.accounts;
            let token_program_key = a.token_program.key();
            if payout::is_absent(&a.recipient_tokens) {
                associated_token::create_idempotent(CpiContext::new(
                    a.associated_token_program.to_account_info(),
                    associated_token::Create {
                        payer: a.payer.to_account_info(),
                        associated_token: a.recipient_tokens.to_account_info(),
                        authority: a.recipient_account.to_account_info(),
                        mint: a.mint.to_account_info(),
                        system_program: a.system_program.to_account_info(),
                        token_program: a.token_program.to_account_info(),
                    },
                ))?;
            }
            let accepts = {
                let info = a.recipient_tokens.to_account_info();
                let data = info.try_borrow_data()?;
                payout::accepts(info.owner, &token_program_key, &data, &a.vault.mint, &recipient, seize_units)
            };
            if accepts {
                let mint_key = a.vault.mint;
                let seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), &[a.vault.bump]];
                pay(
                    &a.token_program,
                    &a.vault_tokens,
                    &a.mint,
                    &a.recipient_tokens.to_account_info(),
                    &a.vault,
                    seeds,
                    seize_units,
                    a.mint.decimals,
                )?;
            } else {
                let total = credit_claim(
                    &a.payer.to_account_info(),
                    &a.claim.to_account_info(),
                    &a.system_program.to_account_info(),
                    vault_key,
                    recipient,
                    ctx.bumps.claim,
                    seize_units,
                )?;
                claimed = true;
                emit!(ClaimCredited { vault: vault_key, recipient, position_id, amount: seize_units, total });
            }
        }
        emit!(PositionSettled {
            vault: vault_key,
            position: ctx.accounts.position.key(),
            position_id,
            depositor,
            quote_id,
            recipient,
            seize_units,
            remainder,
            nonce,
            kind,
            claimed,
        });
        Ok(())
    }

    /// After a full repay on NEAR: record the whole amount as `withdrawable` for the depositor.
    pub fn release(ctx: Context<Release>, position_id: u64, nonce: u64, expires: i64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(expires > now, VaultError::Expired);
        let p = &ctx.accounts.position;
        require!(p.status == STATUS_OPEN, VaultError::PositionNotOpen);
        let msg = preimage::release_preimage(&crate::ID, position_id, &p.depositor, nonce, expires);
        ed25519::verify_preceding_ed25519(&ctx.accounts.instructions.to_account_info(), &p.authority, &msg)?;

        let authority = p.authority;
        let vault_key = ctx.accounts.vault.key();
        record_nonce(&mut ctx.accounts.nonce_record, vault_key, authority, nonce, position_id, OP_RELEASE, 0);
        let p = &mut ctx.accounts.position;
        p.status = STATUS_RELEASED;
        p.withdrawable = p.amount;
        emit!(PositionReleased {
            vault: vault_key,
            position: p.key(),
            position_id,
            depositor: p.depositor,
            amount: p.amount,
            nonce,
        });
        Ok(())
    }

    /// Depositor-signed: pay `withdrawable` to any token account of the mint and close the position (rent to the
    /// depositor). Only after `settle` or `release`.
    pub fn withdraw(ctx: Context<Withdraw>, position_id: u64) -> Result<()> {
        let p = &ctx.accounts.position;
        require!(p.status == STATUS_SETTLED || p.status == STATUS_RELEASED, VaultError::PositionStillOpen);
        let amount = p.withdrawable;
        if amount > 0 {
            let a = &ctx.accounts;
            let mint_key = a.vault.mint;
            let seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), &[a.vault.bump]];
            pay(
                &a.token_program,
                &a.vault_tokens,
                &a.mint,
                &a.destination.to_account_info(),
                &a.vault,
                seeds,
                amount,
                a.mint.decimals,
            )?;
        }
        emit!(PositionWithdrawn {
            vault: ctx.accounts.vault.key(),
            position_id,
            depositor: ctx.accounts.depositor.key(),
            destination: ctx.accounts.destination.key(),
            amount,
        });
        Ok(())
    }

    /// Recipient-signed: pay the whole claim to any token account of the mint and close the claim (rent to the recipient).
    pub fn claim(ctx: Context<ClaimPayout>) -> Result<()> {
        let a = &ctx.accounts;
        let amount = a.claim.amount;
        let mint_key = a.vault.mint;
        let seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), &[a.vault.bump]];
        pay(
            &a.token_program,
            &a.vault_tokens,
            &a.mint,
            &a.destination.to_account_info(),
            &a.vault,
            seeds,
            amount,
            a.mint.decimals,
        )?;
        emit!(ClaimPaid { vault: a.vault.key(), recipient: a.recipient.key(), destination: a.destination.key(), amount });
        Ok(())
    }
}

fn record_nonce(r: &mut NonceRecord, vault: Pubkey, authority: [u8; 32], nonce: u64, position_id: u64, op: u8, kind: u8) {
    r.version = NONCE_LAYOUT;
    r.vault = vault;
    r.authority = authority;
    r.nonce = nonce;
    r.position_id = position_id;
    r.op = op;
    r.kind = kind;
}

#[allow(clippy::too_many_arguments)]
fn pay<'info>(
    token_program: &Interface<'info, TokenInterface>,
    from: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &AccountInfo<'info>,
    vault: &Account<'info, Vault>,
    seeds: &[&[u8]],
    amount: u64,
    decimals: u8,
) -> Result<()> {
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: from.to_account_info(),
                mint: mint.to_account_info(),
                to: to.clone(),
                authority: vault.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        decimals,
    )
}

/// Add `amount` to the recipient's `Claim` PDA, creating it on first use. Returns the new total.
fn credit_claim<'info>(
    payer: &AccountInfo<'info>,
    claim: &AccountInfo<'info>,
    system: &AccountInfo<'info>,
    vault: Pubkey,
    recipient: Pubkey,
    bump: u8,
    amount: u64,
) -> Result<u64> {
    let mut c = if claim.owner == &crate::ID {
        let c = {
            let data = claim.try_borrow_data()?;
            Claim::try_deserialize(&mut &data[..])?
        };
        require!(c.vault == vault && c.recipient == recipient, VaultError::InvalidClaimAccount);
        c
    } else {
        require!(claim.owner == &system_program::ID && claim.data_is_empty(), VaultError::InvalidClaimAccount);
        let seeds: &[&[u8]] = &[CLAIM_SEED, vault.as_ref(), recipient.as_ref(), &[bump]];
        create_pda_account(payer, claim, system, 8 + Claim::INIT_SPACE, seeds)?;
        Claim { version: CLAIM_LAYOUT, vault, recipient, amount: 0, bump }
    };
    c.amount = c.amount.checked_add(amount).ok_or(VaultError::Overflow)?;
    let mut data = claim.try_borrow_mut_data()?;
    c.try_serialize(&mut &mut data[..])?;
    Ok(c.amount)
}

/// Create a program-owned PDA. Like Anchor's `init`, it also works when someone pre-funded the address with lamports
/// (a bare `create_account` would fail with "already in use", which would let anyone block the claim fallback).
fn create_pda_account<'info>(
    payer: &AccountInfo<'info>,
    target: &AccountInfo<'info>,
    system: &AccountInfo<'info>,
    space: usize,
    seeds: &[&[u8]],
) -> Result<()> {
    let required = Rent::get()?.minimum_balance(space);
    let current = target.lamports();
    if current == 0 {
        system_program::create_account(
            CpiContext::new_with_signer(
                system.clone(),
                CreateAccount { from: payer.clone(), to: target.clone() },
                &[seeds],
            ),
            required,
            space as u64,
            &crate::ID,
        )
    } else {
        let top_up = required.saturating_sub(current);
        if top_up > 0 {
            system_program::transfer(
                CpiContext::new(system.clone(), Transfer { from: payer.clone(), to: target.clone() }),
                top_up,
            )?;
        }
        system_program::allocate(
            CpiContext::new_with_signer(system.clone(), Allocate { account_to_allocate: target.clone() }, &[seeds]),
            space as u64,
        )?;
        system_program::assign(
            CpiContext::new_with_signer(system.clone(), Assign { account_to_assign: target.clone() }, &[seeds]),
            &crate::ID,
        )
    }
}

// ---------------------------------------------------------------- accounts

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub version: u8,
    #[max_len(16)]
    pub symbol: String,
    pub mint: Pubkey,
    pub tokens: Pubkey,
    pub bump: u8,
    pub tokens_bump: u8,
}

/// Position v2 (131 bytes), PDA `[b"pos", vault, position_id.to_le_bytes(), depositor]`. Fields @8..123 keep the v1
/// offsets; `withdrawable` is appended @123. Read by the OutLayer `vault_read` job (WO-24).
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub version: u8,
    pub authority: [u8; 32],
    pub depositor: Pubkey,
    pub amount: u64,
    pub status: u8,
    pub vault: Pubkey,
    pub position_id: u64,
    pub bump: u8,
    pub withdrawable: u64,
}

/// NonceRecord v2 (91 bytes), PDA `[b"nonce", position.key(), nonce.to_le_bytes()]`; its existence marks the nonce used
/// on that slot (init fails on reuse).
#[account]
#[derive(InitSpace)]
pub struct NonceRecord {
    pub version: u8,
    pub vault: Pubkey,
    pub authority: [u8; 32],
    pub nonce: u64,
    pub position_id: u64,
    pub op: u8,
    pub kind: u8,
}

/// Claim (82 bytes), PDA `[b"claim", vault, recipient]`: seized units held for a recipient whose ATA refused them.
#[account]
#[derive(InitSpace)]
pub struct Claim {
    pub version: u8,
    pub vault: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = payer,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, mint.key().as_ref()],
        bump
    )]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        init,
        payer = payer,
        seeds = [TOKENS_SEED, vault.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = vault,
        token::token_program = token_program
    )]
    pub vault_tokens: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(position_id: u64)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(seeds = [VAULT_SEED, mint.key().as_ref()], bump = vault.bump, has_one = mint)]
    pub vault: Box<Account<'info, Vault>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, seeds = [TOKENS_SEED, vault.key().as_ref()], bump = vault.tokens_bump)]
    pub vault_tokens: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = depositor, token::token_program = token_program)]
    pub depositor_tokens: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = depositor,
        space = 8 + Position::INIT_SPACE,
        seeds = [POS_SEED, vault.key().as_ref(), &position_id.to_le_bytes(), depositor.key().as_ref()],
        bump
    )]
    pub position: Box<Account<'info, Position>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(position_id: u64, quote_id: u64, repay_e6: u64, seize_units: u64, recipient: Pubkey, nonce: u64)]
pub struct Settle<'info> {
    /// Fee payer / relayer (any keeper). Pays the nonce record, a missing recipient ATA and a new claim.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [VAULT_SEED, mint.key().as_ref()], bump = vault.bump, has_one = mint)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, seeds = [TOKENS_SEED, vault.key().as_ref()], bump = vault.tokens_bump)]
    pub vault_tokens: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [POS_SEED, vault.key().as_ref(), &position_id.to_le_bytes(), position.depositor.as_ref()],
        bump = position.bump
    )]
    pub position: Box<Account<'info, Position>>,
    /// CHECK: must equal the signed `recipient` argument; only used as the ATA owner.
    #[account(address = recipient @ VaultError::RecipientMismatch)]
    pub recipient_account: UncheckedAccount<'info>,
    /// CHECK: the recipient's canonical ATA (address-checked). Deliberately not deserialized by Anchor: its owner,
    /// state and extensions are under the recipient's control (SR-4), so the handler checks them and falls back to
    /// the claim instead of reverting.
    #[account(
        mut,
        address = get_associated_token_address_with_program_id(&recipient, &mint.key(), &token_program.key())
            @ VaultError::RecipientTokensMismatch
    )]
    pub recipient_tokens: UncheckedAccount<'info>,
    /// CHECK: the recipient's claim PDA (seeds-checked); created and credited only when the ATA refuses the transfer.
    #[account(mut, seeds = [CLAIM_SEED, vault.key().as_ref(), recipient.as_ref()], bump)]
    pub claim: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + NonceRecord::INIT_SPACE,
        seeds = [NONCE_SEED, position.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub nonce_record: Box<Account<'info, NonceRecord>>,
    /// CHECK: the Instructions sysvar (address-checked here and again by the load_* helpers).
    #[account(address = solana_instructions_sysvar::ID)]
    pub instructions: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(position_id: u64, nonce: u64)]
pub struct Release<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [VAULT_SEED, vault.mint.as_ref()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        mut,
        seeds = [POS_SEED, vault.key().as_ref(), &position_id.to_le_bytes(), position.depositor.as_ref()],
        bump = position.bump
    )]
    pub position: Box<Account<'info, Position>>,
    #[account(
        init,
        payer = payer,
        space = 8 + NonceRecord::INIT_SPACE,
        seeds = [NONCE_SEED, position.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub nonce_record: Box<Account<'info, NonceRecord>>,
    /// CHECK: the Instructions sysvar.
    #[account(address = solana_instructions_sysvar::ID)]
    pub instructions: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(position_id: u64)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(seeds = [VAULT_SEED, mint.key().as_ref()], bump = vault.bump, has_one = mint)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, seeds = [TOKENS_SEED, vault.key().as_ref()], bump = vault.tokens_bump)]
    pub vault_tokens: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [POS_SEED, vault.key().as_ref(), &position_id.to_le_bytes(), depositor.key().as_ref()],
        bump = position.bump,
        has_one = depositor,
        close = depositor
    )]
    pub position: Box<Account<'info, Position>>,
    /// Any token account of the mint, chosen by the depositor.
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
        constraint = destination.key() != vault_tokens.key() @ VaultError::DestinationIsVault
    )]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,
    #[account(seeds = [VAULT_SEED, mint.key().as_ref()], bump = vault.bump, has_one = mint)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, seeds = [TOKENS_SEED, vault.key().as_ref()], bump = vault.tokens_bump)]
    pub vault_tokens: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [CLAIM_SEED, vault.key().as_ref(), recipient.key().as_ref()],
        bump = claim.bump,
        has_one = recipient,
        has_one = vault,
        close = recipient
    )]
    pub claim: Box<Account<'info, Claim>>,
    /// Any token account of the mint, chosen by the recipient.
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
        constraint = destination.key() != vault_tokens.key() @ VaultError::DestinationIsVault
    )]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

// ---------------------------------------------------------------- events, errors

#[event]
pub struct PositionOpened {
    pub vault: Pubkey,
    pub position_id: u64,
    pub authority: [u8; 32],
    pub depositor: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PositionSettled {
    pub vault: Pubkey,
    /// The slot that was settled (`[b"pos", vault, position_id, depositor]`).
    pub position: Pubkey,
    pub position_id: u64,
    pub depositor: Pubkey,
    pub quote_id: u64,
    pub recipient: Pubkey,
    pub seize_units: u64,
    pub remainder: u64,
    pub nonce: u64,
    pub kind: u8,
    /// true: `seize_units` was credited to the recipient's claim instead of paid to the ATA.
    pub claimed: bool,
}

#[event]
pub struct PositionReleased {
    pub vault: Pubkey,
    pub position: Pubkey,
    pub position_id: u64,
    pub depositor: Pubkey,
    pub amount: u64,
    pub nonce: u64,
}

#[event]
pub struct PositionWithdrawn {
    pub vault: Pubkey,
    pub position_id: u64,
    pub depositor: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ClaimCredited {
    pub vault: Pubkey,
    pub recipient: Pubkey,
    pub position_id: u64,
    pub amount: u64,
    pub total: u64,
}

#[event]
pub struct ClaimPaid {
    pub vault: Pubkey,
    pub recipient: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
}

/// Error codes are 6000 + index; v1 entries keep their index, v2 entries are appended.
#[error_code]
pub enum VaultError {
    #[msg("symbol must be 1..=16 bytes")]
    InvalidSymbol,
    #[msg("amount must be > 0")]
    ZeroAmount,
    #[msg("authority must not be all zero")]
    ZeroAuthority,
    #[msg("kind must be 0 (legacy), 1 (PRELIQ) or 2 (SELF)")]
    InvalidKind,
    #[msg("expires must be in the future")]
    Expired,
    #[msg("position is not open")]
    PositionNotOpen,
    #[msg("seize_units exceeds the position amount")]
    SeizeExceedsAmount,
    #[msg("the previous instruction must be the Ed25519 verify instruction")]
    MissingEd25519Verify,
    #[msg("Ed25519 instruction layout must be num=1, offsets 16/48/112, all indexes u16::MAX")]
    BadEd25519Layout,
    #[msg("Ed25519 pubkey is not the position authority")]
    PubkeyMismatch,
    #[msg("Ed25519 message is not the rebuilt preimage")]
    MessageMismatch,
    #[msg("recipient account does not match the recipient argument")]
    RecipientMismatch,
    #[msg("position is still open: withdraw needs a settle or release first")]
    PositionStillOpen,
    #[msg("recipient_tokens is not the recipient's associated token account for this mint and token program")]
    RecipientTokensMismatch,
    #[msg("claim account is not this recipient's claim")]
    InvalidClaimAccount,
    #[msg("destination must not be the vault token account")]
    DestinationIsVault,
    #[msg("arithmetic overflow")]
    Overflow,
}
