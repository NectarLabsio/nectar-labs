//! nectar_vault: Solana collateral vault for Nectar Labs remote positions (PRD §9, §9B; interface-v7 §B).
//!
//! Collateral leaves the vault only through `settle` or `release`, and only when the instruction immediately
//! before it is the native Ed25519 program verifying the position's NEAR-derived authority over the exact
//! preimage this program rebuilds from its own arguments. There is no admin key and no `cancel_position`.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

pub mod ed25519;
pub mod preimage;

declare_id!("ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW");

pub const VAULT_SEED: &[u8] = b"vault";
pub const TOKENS_SEED: &[u8] = b"tokens";
pub const POS_SEED: &[u8] = b"pos";
pub const NONCE_SEED: &[u8] = b"nonce";
pub const MAX_SYMBOL_LEN: usize = 16;

/// Account layout version (first data byte after the Anchor discriminator).
pub const LAYOUT_V1: u8 = 1;
pub const STATUS_OPEN: u8 = 1;

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
        vault.version = LAYOUT_V1;
        vault.symbol = symbol;
        vault.mint = ctx.accounts.mint.key();
        vault.tokens = ctx.accounts.vault_tokens.key();
        vault.bump = ctx.bumps.vault;
        vault.tokens_bump = ctx.bumps.vault_tokens;
        Ok(())
    }

    /// The depositor transfers `amount` collateral units into the vault and records the authority
    /// (the NEAR `derived_public_key` for this position, or the v1 single-path key).
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
        p.version = LAYOUT_V1;
        p.authority = authority;
        p.depositor = ctx.accounts.depositor.key();
        p.amount = amount;
        p.status = STATUS_OPEN;
        p.vault = ctx.accounts.vault.key();
        p.position_id = position_id;
        p.bump = ctx.bumps.position;
        emit!(PositionOpened { vault: p.vault, position_id, authority, depositor: p.depositor, amount });
        Ok(())
    }

    /// Pay `seize_units` to the recipient's ATA and the remainder to the depositor's ATA, then close the position.
    /// kind 0 = v1 legacy preimage (no suffix), 1 = `|kind=PRELIQ`, 2 = `|kind=SELF`.
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

        let remainder = p.amount - seize_units;
        let vault_key = ctx.accounts.vault.key();
        record_nonce(&mut ctx.accounts.nonce_record, vault_key, nonce, position_id, OP_SETTLE, kind);

        let mint_key = ctx.accounts.vault.mint;
        let seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), &[ctx.accounts.vault.bump]];
        let decimals = ctx.accounts.mint.decimals;
        if seize_units > 0 {
            pay(
                &ctx.accounts.token_program,
                &ctx.accounts.vault_tokens,
                &ctx.accounts.mint,
                &ctx.accounts.recipient_tokens,
                &ctx.accounts.vault,
                seeds,
                seize_units,
                decimals,
            )?;
        }
        if remainder > 0 {
            pay(
                &ctx.accounts.token_program,
                &ctx.accounts.vault_tokens,
                &ctx.accounts.mint,
                &ctx.accounts.depositor_tokens,
                &ctx.accounts.vault,
                seeds,
                remainder,
                decimals,
            )?;
        }
        emit!(PositionSettled { vault: vault_key, position_id, quote_id, recipient, seize_units, remainder, nonce, kind });
        Ok(())
    }

    /// After a full repay on NEAR: pay all units to the depositor and close the position.
    pub fn release(ctx: Context<Release>, position_id: u64, nonce: u64, expires: i64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(expires > now, VaultError::Expired);
        let p = &ctx.accounts.position;
        require!(p.status == STATUS_OPEN, VaultError::PositionNotOpen);
        let msg = preimage::release_preimage(&crate::ID, position_id, &p.depositor, nonce, expires);
        ed25519::verify_preceding_ed25519(&ctx.accounts.instructions.to_account_info(), &p.authority, &msg)?;

        let amount = p.amount;
        let vault_key = ctx.accounts.vault.key();
        record_nonce(&mut ctx.accounts.nonce_record, vault_key, nonce, position_id, OP_RELEASE, 0);

        let mint_key = ctx.accounts.vault.mint;
        let seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), &[ctx.accounts.vault.bump]];
        pay(
            &ctx.accounts.token_program,
            &ctx.accounts.vault_tokens,
            &ctx.accounts.mint,
            &ctx.accounts.depositor_tokens,
            &ctx.accounts.vault,
            seeds,
            amount,
            ctx.accounts.mint.decimals,
        )?;
        emit!(PositionReleased { vault: vault_key, position_id, depositor: ctx.accounts.depositor.key(), amount, nonce });
        Ok(())
    }
}

fn record_nonce(r: &mut NonceRecord, vault: Pubkey, nonce: u64, position_id: u64, op: u8, kind: u8) {
    r.version = LAYOUT_V1;
    r.vault = vault;
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
    to: &InterfaceAccount<'info, TokenAccount>,
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
                to: to.to_account_info(),
                authority: vault.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        decimals,
    )
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

/// PDA `[b"pos", vault, position_id.to_le_bytes()]`. Read by the OutLayer `vault_read` job (WO-24).
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
}

/// PDA `[b"nonce", vault, nonce.to_le_bytes()]`; its existence marks the nonce used (init fails on reuse).
#[account]
#[derive(InitSpace)]
pub struct NonceRecord {
    pub version: u8,
    pub vault: Pubkey,
    pub nonce: u64,
    pub position_id: u64,
    pub op: u8,
    pub kind: u8,
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
        seeds = [POS_SEED, vault.key().as_ref(), &position_id.to_le_bytes()],
        bump
    )]
    pub position: Box<Account<'info, Position>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(position_id: u64, quote_id: u64, repay_e6: u64, seize_units: u64, recipient: Pubkey, nonce: u64)]
pub struct Settle<'info> {
    /// Fee payer / relayer (any keeper). Pays the nonce record and any missing ATA.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [VAULT_SEED, mint.key().as_ref()], bump = vault.bump, has_one = mint)]
    pub vault: Box<Account<'info, Vault>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, seeds = [TOKENS_SEED, vault.key().as_ref()], bump = vault.tokens_bump)]
    pub vault_tokens: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [POS_SEED, vault.key().as_ref(), &position_id.to_le_bytes()],
        bump = position.bump,
        has_one = depositor,
        close = depositor
    )]
    pub position: Box<Account<'info, Position>>,
    /// CHECK: equals `position.depositor` (has_one); receives the position rent and the remainder.
    #[account(mut)]
    pub depositor: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = depositor,
        associated_token::token_program = token_program
    )]
    pub depositor_tokens: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: must equal the signed `recipient` argument; only used as the ATA owner.
    #[account(address = recipient @ VaultError::RecipientMismatch)]
    pub recipient_account: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = recipient_account,
        associated_token::token_program = token_program
    )]
    pub recipient_tokens: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        space = 8 + NonceRecord::INIT_SPACE,
        seeds = [NONCE_SEED, vault.key().as_ref(), &nonce.to_le_bytes()],
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
    #[account(seeds = [VAULT_SEED, mint.key().as_ref()], bump = vault.bump, has_one = mint)]
    pub vault: Box<Account<'info, Vault>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, seeds = [TOKENS_SEED, vault.key().as_ref()], bump = vault.tokens_bump)]
    pub vault_tokens: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [POS_SEED, vault.key().as_ref(), &position_id.to_le_bytes()],
        bump = position.bump,
        has_one = depositor,
        close = depositor
    )]
    pub position: Box<Account<'info, Position>>,
    /// CHECK: equals `position.depositor` (has_one).
    #[account(mut)]
    pub depositor: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = depositor,
        associated_token::token_program = token_program
    )]
    pub depositor_tokens: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        space = 8 + NonceRecord::INIT_SPACE,
        seeds = [NONCE_SEED, vault.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub nonce_record: Box<Account<'info, NonceRecord>>,
    /// CHECK: the Instructions sysvar.
    #[account(address = solana_instructions_sysvar::ID)]
    pub instructions: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
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
    pub position_id: u64,
    pub quote_id: u64,
    pub recipient: Pubkey,
    pub seize_units: u64,
    pub remainder: u64,
    pub nonce: u64,
    pub kind: u8,
}

#[event]
pub struct PositionReleased {
    pub vault: Pubkey,
    pub position_id: u64,
    pub depositor: Pubkey,
    pub amount: u64,
    pub nonce: u64,
}

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
}
