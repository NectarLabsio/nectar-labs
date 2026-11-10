//! WO-22 (PRD §6.11): Position Notes — NEP-171 core, NEP-177 metadata, NEP-181 enumeration, written in the
//! contract. Types and event shapes follow `near-contract-standards` 5.30.1 (F-337: `Token`, `TokenMetadata`,
//! `NFTContractMetadata`, `NFT_METADATA_SPEC = "nft-1.0.0"`, `nep171` 1.0.0 `nft_mint` / `nft_transfer`); the
//! crate is not linked because every transfer path needs Nectar hooks (PRD §19 fallback "a minimal NEP-171/177").
//!
//! - Token ids: `q-<quote_id>` (minted on `FundPappusQuote`), `p-<position_id>` (minted when a NEAR position opens
//!   and when a remote position is funded). `r-<collateral>-<n>` is reserved for Reserve Notes (WO-23b).
//! - Authority = Note owner. The owner lives in the record (`Quote.buyer`, `Position.borrower`) and a transfer
//!   rewrites it, so every authority check (top-up, withdrawal initiate/complete, `claim_fees`, `self_settle`) and
//!   every payout (residual collateral on repay, settlement and self-settlement remainder) follows the Note.
//!   Remote release still goes to the vault depositor. The original funder stays in `quote_funded` /
//!   `position_opened` events only.
//! - `nft_transfer` is refused while a pending settlement references the Note: the position is Settling, has a
//!   signed-but-unrelayed leg, or is Releasing; a quote is locked while such a position selected it (OutLayer
//!   candidates at `start_quoter`, the quote of a remote leg). Quote refs are recorded when the settlement starts
//!   and resolved lazily against the position, so no exit path needs a hook. Recipients therefore cannot change
//!   between the start of a settlement and its payouts (payout callbacks also carry the account).
//! - Transferring a Quote Note clears `buyer_remote_recipient`; the new owner sets one with
//!   `set_quote_remote_recipient`. No approvals (NEP-178): only the owner transfers.
//! - Media: `nft_token` carries `data:image/svg+xml;base64,<live SVG>`; `nft_token_svg` returns the raw SVG.
//!   Only numbers and fixed words enter it; the asset symbol and contract id are XML-escaped.

use std::collections::HashMap;

use near_sdk::json_types::{Base64VecU8, U64, U128};
use near_sdk::serde_json::{self, Value, json};
use near_sdk::store::{LookupMap, Vector};
use near_sdk::{AccountId, Gas, GasWeight, NearToken, Promise, PromiseOrValue, assert_one_yocto, env, near, require};

use crate::events::{emit, emit_standard};
use crate::types::*;
use crate::{MAX_STRING_LEN, Nectar, NectarExt, chainsig, math};

pub const NFT_METADATA_SPEC: &str = "nft-1.0.0";
pub const NEP171_STANDARD: &str = "nep171";
pub const NEP171_VERSION: &str = "1.0.0";
/// The single source of the Note artwork (addendum §10); `packages/ui` renders it through `nft_token_svg`.
pub const NOTE_SVG_TEMPLATE: &str = include_str!("../assets/position-note.svg");
pub const NOTE_DESCRIPTION: &str = "Nectar Labs Position Note (testnet, mock collateral). The owner holds the authority over the quote or loan.";
/// Pages carry a live SVG per token, so they are short.
pub const MAX_NOTE_PAGE: u64 = 20;
pub const GAS_NFT_RESOLVE: Gas = Gas::from_tgas(10);
/// `nft_transfer_call` keeps at least this for the receiver on top of the resolve gas.
pub const GAS_NFT_ON_TRANSFER_MIN: Gas = Gas::from_tgas(10);
const MAX_MSG_LEN: usize = 4_096;

pub const ERR_NO_NOTE: &str = "unknown note";
pub const ERR_NOTE_OWNER: &str = "note owner only";
pub const ERR_NOTE_LOCKED: &str = "note_locked: pending settlement";
pub const ERR_SAME_OWNER: &str = "Current and next owner must differ";

/// Notes state (root field `notes`). Owners are not duplicated here: see the module doc.
#[near(serializers = [borsh])]
pub struct Notes {
    /// Every token id in mint order (NEP-181 `nft_tokens`).
    pub(crate) ids: Vector<String>,
    /// token id -> index in its owner's list.
    pub(crate) index: LookupMap<String, u32>,
    /// (owner, index) -> token id; swap-remove on transfer, O(1).
    pub(crate) by_owner: LookupMap<(AccountId, u32), String>,
    pub(crate) count: LookupMap<AccountId, u32>,
    /// quote id -> positions whose settlement selected it (pruned of finished settlements on every add).
    pub(crate) quote_refs: LookupMap<u64, Vec<u64>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NoteRef {
    Quote(u64),
    Position(u64),
}

/// `q-<n>` / `p-<n>`, canonical decimal only (no sign, no leading zero).
pub fn parse_note_id(id: &str) -> Option<NoteRef> {
    let (kind, n) = id.split_once('-')?;
    if n.is_empty() || n.len() > 20 || !n.bytes().all(|b| b.is_ascii_digit()) || (n.len() > 1 && n.starts_with('0')) {
        return None;
    }
    let v: u64 = n.parse().ok()?;
    match kind {
        "q" => Some(NoteRef::Quote(v)),
        "p" => Some(NoteRef::Position(v)),
        _ => None,
    }
}
pub fn quote_note_id(id: u64) -> String {
    format!("q-{id}")
}
pub fn position_note_id(id: u64) -> String {
    format!("p-{id}")
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NFTContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<Base64VecU8>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<Base64VecU8>,
    pub copies: Option<u64>,
    pub issued_at: Option<String>,
    pub expires_at: Option<String>,
    pub starts_at: Option<String>,
    pub updated_at: Option<String>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<Base64VecU8>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Token {
    pub token_id: String,
    pub owner_id: AccountId,
    pub metadata: Option<TokenMetadata>,
    pub approved_account_ids: Option<HashMap<AccountId, u64>>,
}

// ---------------------------------------------------------------- rendering helpers (no floats)

/// RFC 4648 base64 with padding.
pub fn base64(input: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b1 = chunk.get(1).copied().unwrap_or(0);
        let b2 = chunk.get(2).copied().unwrap_or(0);
        let n = (u32::from(chunk[0]) << 16) | (u32::from(b1) << 8) | u32::from(b2);
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { T[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[(n & 63) as usize] as char } else { '=' });
    }
    out
}

pub fn xml_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            c => out.push(c),
        }
    }
    out
}

fn group3(mut v: u128) -> String {
    let mut parts: Vec<String> = Vec::new();
    loop {
        if v < 1_000 {
            parts.push(v.to_string());
            break;
        }
        parts.push(format!("{:03}", v % 1_000));
        v /= 1_000;
    }
    parts.reverse();
    parts.join(",")
}
/// `$12,345.67` from e6 (truncated to cents).
pub fn fmt_usd(e6: u128) -> String {
    format!("${}.{:02}", group3(e6 / 1_000_000), (e6 % 1_000_000) / 10_000)
}
/// `62.50%` from bps.
pub fn fmt_bps(bps: u128) -> String {
    format!("{}.{:02}%", bps / 100, bps % 100)
}

struct NoteFace {
    kind: &'static str,
    asset: String,
    metrics: [(&'static str, String); 4],
    bar_pct: u128,
    status: &'static str,
}

// ---------------------------------------------------------------- internal
impl Nectar {
    pub(crate) fn note_exists(&self, token_id: &str) -> bool {
        self.notes.index.contains_key(token_id)
    }

    /// `(ref, owner)` of a minted Note.
    pub(crate) fn note_owner(&self, token_id: &str) -> Option<(NoteRef, AccountId)> {
        let r = parse_note_id(token_id)?;
        if !self.note_exists(token_id) {
            return None;
        }
        let owner = match r {
            NoteRef::Quote(id) => self.quote(id)?.buyer,
            NoteRef::Position(id) => self.position(id)?.borrower,
        };
        Some((r, owner))
    }

    /// A settlement of this position is in flight (Settling, signed-but-unrelayed leg, Releasing).
    pub(crate) fn settlement_pending(&self, p: &Position) -> bool {
        if p.status == PositionStatus::Settling {
            return true;
        }
        if p.remote.as_ref().is_some_and(|r| matches!(r.status, RemoteStatus::Settling | RemoteStatus::Releasing)) {
            return true;
        }
        #[cfg(feature = "p2")]
        if self.settle_in_flight(p.position_id.0) {
            return true;
        }
        false
    }
    fn position_pending(&self, id: u64) -> bool {
        self.position(id).is_some_and(|p| self.settlement_pending(&p))
    }

    pub(crate) fn note_locked(&self, r: NoteRef) -> bool {
        match r {
            NoteRef::Position(id) => self.position_pending(id),
            NoteRef::Quote(id) => {
                self.notes.quote_refs.get(&id).is_some_and(|ps| ps.iter().any(|pid| self.position_pending(*pid)))
            }
        }
    }

    /// Records that `position_id`'s settlement references `quote_ids` (called when the settlement starts).
    pub(crate) fn note_refs_add(&mut self, position_id: u64, quote_ids: &[u64]) {
        for qid in quote_ids {
            let mut refs = self.notes.quote_refs.get(qid).cloned().unwrap_or_default();
            refs.retain(|pid| *pid != position_id && self.position_pending(*pid));
            refs.push(position_id);
            self.notes.quote_refs.insert(*qid, refs);
        }
    }

    fn note_add_to_owner(&mut self, token_id: &str, owner: &AccountId) {
        let n = self.notes.count.get(owner).copied().unwrap_or(0);
        let next = n.checked_add(1).unwrap_or_else(|| env::panic_str(math::ERR_OVERFLOW));
        self.notes.by_owner.insert((owner.clone(), n), token_id.to_string());
        self.notes.index.insert(token_id.to_string(), n);
        self.notes.count.insert(owner.clone(), next);
    }

    fn note_remove_from_owner(&mut self, token_id: &str, owner: &AccountId) {
        let idx = self.notes.index.get(token_id).copied().unwrap_or_else(|| env::panic_str(ERR_NO_NOTE));
        let n = self.notes.count.get(owner).copied().unwrap_or(0);
        let last = n.checked_sub(1).unwrap_or_else(|| env::panic_str("note index"));
        if idx != last {
            let moved = self
                .notes
                .by_owner
                .get(&(owner.clone(), last))
                .cloned()
                .unwrap_or_else(|| env::panic_str("note index"));
            self.notes.by_owner.insert((owner.clone(), idx), moved.clone());
            self.notes.index.insert(moved, idx);
        }
        self.notes.by_owner.remove(&(owner.clone(), last));
        if last == 0 {
            self.notes.count.remove(owner);
        } else {
            self.notes.count.insert(owner.clone(), last);
        }
    }

    /// Mints `token_id` to `owner` (idempotent). Effect only; emits NEP-171 `nft_mint`.
    pub(crate) fn mint_note(&mut self, token_id: String, owner: &AccountId) {
        if self.note_exists(&token_id) {
            return;
        }
        self.notes.ids.push(token_id.clone());
        self.note_add_to_owner(&token_id, owner);
        emit_standard(NEP171_STANDARD, NEP171_VERSION, "nft_mint", json!({ "owner_id": owner, "token_ids": [token_id] }));
    }

    /// Moves the Note and its authority: the owner lists, `buyer`/`borrower`, and clears a quote's remote recipient.
    fn move_note(&mut self, token_id: &str, r: NoteRef, from: &AccountId, to: &AccountId) {
        self.note_remove_from_owner(token_id, from);
        self.note_add_to_owner(token_id, to);
        match r {
            NoteRef::Quote(id) => {
                let mut q = self.quote_or_panic(id);
                let cleared = q.buyer_remote_recipient.take().is_some();
                q.buyer = to.clone();
                self.put_quote(q);
                if cleared {
                    emit("quote_remote_recipient_cleared", json!({ "quote_id": U64(id) }));
                }
            }
            NoteRef::Position(id) => {
                let mut p = self.position_or_panic(id);
                p.borrower = to.clone();
                self.put_position(p);
            }
        }
    }

    fn emit_nft_transfer(from: &AccountId, to: &AccountId, token_id: &str, memo: Option<&str>) {
        let mut d = json!({ "old_owner_id": from, "new_owner_id": to, "token_ids": [token_id] });
        if let (Some(m), Some(o)) = (memo, d.as_object_mut()) {
            o.insert("memo".into(), Value::String(m.to_string()));
        }
        emit_standard(NEP171_STANDARD, NEP171_VERSION, "nft_transfer", d);
    }

    /// Checks, then effects. Returns the previous owner.
    pub(crate) fn note_transfer_internal(
        &mut self,
        sender: &AccountId,
        receiver: &AccountId,
        token_id: &str,
        memo: Option<&str>,
    ) -> AccountId {
        let (r, owner) = self.note_owner(token_id).unwrap_or_else(|| env::panic_str(ERR_NO_NOTE));
        require!(sender == &owner, ERR_NOTE_OWNER);
        require!(receiver != &owner, ERR_SAME_OWNER);
        require!(memo.is_none_or(|m| m.len() <= MAX_STRING_LEN), "string too long");
        require!(!self.note_locked(r), ERR_NOTE_LOCKED);
        self.move_note(token_id, r, &owner, receiver);
        Self::emit_nft_transfer(&owner, receiver, token_id, memo);
        owner
    }

    fn loan_face(&self, id: u64, locked: bool) -> Option<NoteFace> {
        let p = self.position(id)?;
        let c = self.coll(&p.collateral)?;
        let value = Self::value_of(p.units.0, &c).unwrap_or(0);
        let debt = p.debt_usd_e6.0;
        let ltv = u128::from(math::ltv_bps(debt, value));
        let health = if debt == 0 || ltv == 0 {
            "MAX".to_string()
        } else {
            let x100 = u128::from(p.pre_liq_ltv_bps).saturating_mul(100) / ltv;
            format!("{}.{:02}", x100 / 100, x100 % 100)
        };
        let backing = c.active_committed_q_usd_e6.0.saturating_add(c.nectar_reserve_usd_e6.0);
        let releasing = p.remote.as_ref().is_some_and(|r| r.status == RemoteStatus::Releasing);
        let status = match p.status {
            PositionStatus::Closed => "CLOSED",
            _ if releasing => "RELEASING",
            _ if locked => "SETTLING",
            _ => "OPEN",
        };
        Some(NoteFace {
            kind: "LOAN",
            asset: p.collateral,
            metrics: [
                ("LTV", if ltv > 1_000_000 { "MAX".into() } else { fmt_bps(ltv) }),
                ("HEALTH", health),
                ("DEBT", fmt_usd(debt)),
                ("BACKING Q+R", fmt_usd(backing)),
            ],
            bar_pct: (ltv / 100).min(100),
            status,
        })
    }

    fn quote_face(&self, id: u64, locked: bool) -> Option<NoteFace> {
        let q = self.quote(id)?;
        let c = self.coll(&q.collateral)?;
        let pending = math::pending_fees(q.weight(), c.acc_fee_per_dollar_e18.0, q.fee_debt_e18.0).unwrap_or(0);
        let fees = q.claimable_fees_usd_e6.0.saturating_add(pending);
        let now = env::block_timestamp();
        let unlock = match q.unlock_ns {
            None => format!("NOTICE {}H", q.notice_period_ns.0 / 3_600_000_000_000),
            Some(u) if now >= u.0 => "NOW".to_string(),
            Some(u) => format!("IN {}H", (u.0 - now).div_ceil(3_600_000_000_000)),
        };
        let committed = q.committed_usd_e6.0;
        let used = committed.saturating_sub(q.remaining_usd_e6.0);
        let bar = if committed == 0 { 0 } else { (used.saturating_mul(100) / committed).min(100) };
        let status = if locked {
            "SETTLING"
        } else if q.remaining_usd_e6.0 == 0 {
            "EMPTY"
        } else if q.exiting() {
            "EXITING"
        } else {
            "ACTIVE"
        };
        Some(NoteFace {
            kind: "QUOTE",
            asset: q.collateral,
            metrics: [
                ("REMAINING", fmt_usd(q.remaining_usd_e6.0)),
                ("MAX DISCOUNT", fmt_bps(u128::from(q.max_discount_bps))),
                ("UNLOCK", unlock),
                ("CLAIMABLE FEES", fmt_usd(fees)),
            ],
            bar_pct: bar,
            status,
        })
    }

    pub(crate) fn render_note(&self, token_id: &str) -> Option<String> {
        let (r, _) = self.note_owner(token_id)?;
        let locked = self.note_locked(r);
        let f = match r {
            NoteRef::Quote(id) => self.quote_face(id, locked)?,
            NoteRef::Position(id) => self.loan_face(id, locked)?,
        };
        let [(l1, v1), (l2, v2), (l3, v3), (l4, v4)] = f.metrics;
        Some(
            NOTE_SVG_TEMPLATE
                .replace("{{TYPE}}", f.kind)
                .replace("{{ID}}", token_id)
                .replace("{{ASSET}}", &xml_escape(&f.asset))
                .replace("{{M1_LABEL}}", l1)
                .replace("{{M1_VALUE}}", &v1)
                .replace("{{M2_LABEL}}", l2)
                .replace("{{M2_VALUE}}", &v2)
                .replace("{{M3_LABEL}}", l3)
                .replace("{{M3_VALUE}}", &v3)
                .replace("{{M4_LABEL}}", l4)
                .replace("{{M4_VALUE}}", &v4)
                .replace("{{BAR_PCT}}", &f.bar_pct.to_string())
                .replace("{{STATUS}}", f.status)
                .replace("{{CONTRACT}}", &xml_escape(env::current_account_id().as_str())),
        )
    }

    pub(crate) fn note_token(&self, token_id: &str) -> Option<Token> {
        let (r, owner) = self.note_owner(token_id)?;
        let svg = self.render_note(token_id)?;
        let title = match r {
            NoteRef::Quote(_) => format!("Quote Note {token_id}"),
            NoteRef::Position(_) => format!("Loan Note {token_id}"),
        };
        Some(Token {
            token_id: token_id.to_string(),
            owner_id: owner,
            metadata: Some(TokenMetadata {
                title: Some(title),
                description: Some(NOTE_DESCRIPTION.to_string()),
                media_hash: Some(Base64VecU8(env::sha256(svg.as_bytes()))),
                media: Some(format!("data:image/svg+xml;base64,{}", base64(svg.as_bytes()))),
                copies: Some(1),
                ..Default::default()
            }),
            approved_account_ids: None,
        })
    }

    fn page(from_index: Option<U128>, limit: Option<u64>) -> (u32, u32) {
        let from = u32::try_from(from_index.map_or(0, |v| v.0)).unwrap_or(u32::MAX);
        let lim = limit.unwrap_or(MAX_NOTE_PAGE).min(MAX_NOTE_PAGE) as u32;
        (from, lim)
    }
}

// ---------------------------------------------------------------- public (NEP-171 / 177 / 181)
#[near]
impl Nectar {
    /// NEP-171. Note owner only, 1 yocto; refused while a pending settlement references the Note.
    #[payable]
    pub fn nft_transfer(&mut self, receiver_id: AccountId, token_id: String, approval_id: Option<u64>, memo: Option<String>) {
        assert_one_yocto();
        let _ = approval_id; // no approvals: only the owner transfers
        self.note_transfer_internal(&env::predecessor_account_id(), &receiver_id, &token_id, memo.as_deref());
    }

    /// NEP-171. Transfers, then `receiver.nft_on_transfer`; `nft_resolve_transfer` returns the Note if asked to.
    #[payable]
    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        assert_one_yocto();
        let _ = approval_id;
        require!(msg.len() <= MAX_MSG_LEN, "msg too long");
        let left = env::prepaid_gas().as_gas().saturating_sub(env::used_gas().as_gas());
        require!(left >= GAS_NFT_RESOLVE.as_gas() + GAS_NFT_ON_TRANSFER_MIN.as_gas() + Gas::from_tgas(10).as_gas(), "attach more gas");
        let sender = env::predecessor_account_id();
        let old_owner = self.note_transfer_internal(&sender, &receiver_id, &token_id, memo.as_deref());
        let args = json!({ "sender_id": sender, "previous_owner_id": old_owner, "token_id": token_id, "msg": msg });
        let cb = json!({ "previous_owner_id": old_owner, "receiver_id": receiver_id, "token_id": token_id,
                         "approved_account_ids": Value::Null });
        Promise::new(receiver_id.clone())
            .function_call_weight(
                "nft_on_transfer",
                args.to_string().into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_NFT_ON_TRANSFER_MIN,
                GasWeight(1),
            )
            .then(Promise::new(env::current_account_id()).function_call_weight(
                "nft_resolve_transfer",
                cb.to_string().into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_NFT_RESOLVE,
                GasWeight(0),
            ))
            .into()
    }

    /// NEP-171 resolver. True = the receiver keeps the Note. A Note locked by a settlement started meanwhile stays.
    #[private]
    pub fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: String,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        let _ = approved_account_ids;
        let must_revert = env::promise_result_checked(0, "false".len())
            .ok()
            .and_then(|v| serde_json::from_slice::<bool>(&v).ok())
            .unwrap_or(true);
        if !must_revert {
            return true;
        }
        let Some((r, owner)) = self.note_owner(&token_id) else { return true };
        if owner != receiver_id || owner == previous_owner_id {
            return true;
        }
        if self.note_locked(r) {
            env::log_str("note kept by receiver: pending settlement");
            return true;
        }
        self.move_note(&token_id, r, &receiver_id, &previous_owner_id);
        Self::emit_nft_transfer(&receiver_id, &previous_owner_id, &token_id, None);
        false
    }

    /// Quote Note owner sets (or clears) the Solana recipient of remote fills. Refused while the Note is locked.
    pub fn set_quote_remote_recipient(&mut self, quote_id: U64, recipient: Option<String>) {
        let mut q = self.quote_or_panic(quote_id.0);
        require!(env::predecessor_account_id() == q.buyer, ERR_NOTE_OWNER);
        if let Some(r) = &recipient {
            require!(chainsig::valid_base58_address(r), "bad recipient");
        }
        require!(!self.note_locked(NoteRef::Quote(quote_id.0)), ERR_NOTE_LOCKED);
        q.buyer_remote_recipient = recipient.clone();
        self.put_quote(q);
        emit("quote_remote_recipient_set", json!({ "quote_id": quote_id, "recipient": recipient }));
    }

    pub fn nft_token(&self, token_id: String) -> Option<Token> {
        self.note_token(&token_id)
    }

    /// Raw live SVG of a Note (the web app renders this; wallets get the data URI in `nft_token`).
    pub fn nft_token_svg(&self, token_id: String) -> String {
        self.render_note(&token_id).unwrap_or_else(|| env::panic_str(ERR_NO_NOTE))
    }

    /// True while a pending settlement references the Note (transfer disabled; UI shows the reason).
    pub fn nft_transfer_locked(&self, token_id: String) -> bool {
        let (r, _) = self.note_owner(&token_id).unwrap_or_else(|| env::panic_str(ERR_NO_NOTE));
        self.note_locked(r)
    }

    pub fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Nectar Position Notes".to_string(),
            symbol: "NOTE".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }

    pub fn nft_total_supply(&self) -> U128 {
        U128(u128::from(self.notes.ids.len()))
    }

    /// NEP-181, mint order; at most `MAX_NOTE_PAGE` per call.
    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        let (from, lim) = Self::page(from_index, limit);
        let end = from.saturating_add(lim).min(self.notes.ids.len());
        (from..end).filter_map(|i| self.notes.ids.get(i).and_then(|t| self.note_token(t))).collect()
    }

    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        U128(u128::from(self.notes.count.get(&account_id).copied().unwrap_or(0)))
    }

    /// NEP-181; at most `MAX_NOTE_PAGE` per call.
    pub fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        let (from, lim) = Self::page(from_index, limit);
        let n = self.notes.count.get(&account_id).copied().unwrap_or(0);
        let end = from.saturating_add(lim).min(n);
        (from..end)
            .filter_map(|i| self.notes.by_owner.get(&(account_id.clone(), i)).and_then(|t| self.note_token(t)))
            .collect()
    }
}
