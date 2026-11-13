---
title: Position Notes
slug: /concepts/position-notes
description: Every quote, loan and Reserve deposit is an NEP-171 Note. Authority follows the Note, and transfers lock while a settlement is pending.
---
# Position Notes

<p className="verified">Verified against: spec docs/process/prd.md §6.11, §19.4 · docs/process/work/interface-v7.md §C · contracts/nectar-core/src/notes.rs (WO-22, merged 2026-11-10) · F-337 (near-contract-standards 5.30.1, 2026-11-10) · D-023 (2026-11-10) · tests listed below · testnet: docs/EVIDENCE.md §G2b (2026-11-10T16:34Z first run, views), §G14 (2026-11-10T16:52Z) · transfer and release paths read 2026-11-11: contracts/nectar-core/src/notes.rs:332-349 (the transfer path behind `nft_transfer` and `nft_transfer_call`), lib.rs:824-858 (the `Repay` path behind `ft_transfer_call`), remote.rs:957 (`request_remote_release`) · previous-holder limits re-read 2026-11-13: tests_notes.rs `v7_notes_self_settle_old_owner_refused`, `v7_notes_old_quote_owner_refused`, `v7_notes_transfer_owner_only` · web app receiver check: F-380, F-381, F-382 (2026-11-11), FACTS C-020, D-029 (2026-11-11)</p>
<p className="status">Status: live on testnet (EVIDENCE §G2b: `nft_tokens` lists `q-0`, `p-0`, `q-1`, `p-1` and `nft_token_svg p-1` renders; EVIDENCE §G14: `nft_mint p-4`). Reserve Note `r-NVDAx-0` was minted in the 2026-11-10 module run (evidence/v7-modules/summary.md). Transfer locks are tested in the sandbox only. The earlier v1 contract mints no Notes.</p>

## Three kinds of Note

nectar-core implements NEP-171 (core), NEP-177 (metadata) and NEP-181 (enumeration) itself. Collection name "Nectar Position Notes", symbol `NOTE`. The types and event shapes are copied from near-contract-standards 5.30.1 (F-337). The crate is not linked because every transfer path needs Nectar's own locks (D-023).

| Token id | Minted when | Represents |
| --- | --- | --- |
| `q-<quote_id>` | a quote is funded (`FundPappusQuote`) | a buyer's escrowed quote and its fees |
| `p-<position_id>` | a NEAR position opens, or a remote position is funded | a loan and its collateral |
| `r-<collateral>-<n>` | a deposit into the [Nectar Reserve](/concepts/nectar-reserve) | Reserve shares, units and fees |

The contract pays mint storage (NEP-145 storage deposits are PROD-only). There are no approvals (NEP-178): only the owner transfers.

## Authority follows the Note

The Note owner *is* the record's owner (`Quote.buyer`, `Position.borrower`, Reserve Note `owner`), and a transfer rewrites it. Every authority check therefore moves with the Note: top-up, withdrawal initiate and complete, `claim_fees`, `self_settle`, Reserve exit. For collateral held on NEAR, every payout goes to the current owner as well: residual collateral on full repay (lib.rs:852-858), the settlement remainder and the self-settlement remainder. After a transfer the previous holder can no longer self-settle the loan (`v7_notes_self_settle_old_owner_refused`), start the quote's withdrawal (`v7_notes_old_quote_owner_refused`) or transfer the Note again (`v7_notes_transfer_owner_only`). It can still repay the loan, as any account can (`Repay` through `ft_transfer_call`), and the collateral a full repay releases then goes to the Note's holder.

Two exceptions:
- **Remote Loan Notes (Solana devnet, Base local fork) do not carry the collateral.** A transfer (`nft_transfer` or `nft_transfer_call`) moves the borrower's authority by rewriting `position.borrower`, and anyone may repay (`Repay` through `ft_transfer_call`), but `request_remote_release` signs the release to the depositor recorded at deposit, and the vault pays only that depositor (`withdraw`). The remote settlement remainder also goes to the depositor. A new owner who repays a remote loan does not receive the collateral. This is a known limitation (SECURITY.md "What remains" item 12).
- The original funder stays in the `quote_funded` and `position_opened` events. History is not rewritten.

Transferring a Quote Note clears its Solana recipient (`buyer_remote_recipient`). The new owner sets one with `set_quote_remote_recipient(quote_id, recipient?)`.

## Locks

`nft_transfer` is refused with `note_locked: pending settlement` while a settlement references the Note:

- **Loan Note:** the position is `Settling`, has a signed but unrelayed Solana leg, or is `Releasing`.
- **Quote Note:** a pending settlement selected the quote (a candidate that `trigger_preliquidation` sent to the OutLayer quoter, or the quote of a remote leg).
- **Reserve Note:** a settlement that reached, or may reach, the Reserve of that asset is pending.

A recipient therefore cannot change between the start of a settlement and its payouts. `set_quote_remote_recipient` is refused while the Quote Note is locked. `nft_transfer_locked(token_id)` lets a client grey out the button before a wallet opens.

## Calls, views and events

- Calls (1 yoctoNEAR): `nft_transfer(receiver_id, token_id, approval_id?, memo?)`, `nft_transfer_call(.., msg)`. `approval_id` is ignored; transfer to self is refused; memo and msg lengths are bounded. The contract does not check whether the receiver exists.
- Web app Transfer (R2-09): a named receiver must answer `view_account`; an `UNKNOWN_ACCOUNT` answer (F-380) or an RPC failure keeps Transfer off. Only 64-hex and `0x` + 40-hex ids count as implicit and skip the lookup (F-381). `0s` and `0u` ids are looked up too (F-382), so the web app cannot send a Note to such an account before it exists. That is the safe side of FACTS C-020, kept by decision (D-029).
- Views: `nft_token`, `nft_tokens`, `nft_tokens_for_owner`, `nft_supply_for_owner`, `nft_total_supply`, `nft_metadata`, `nft_transfer_locked`. Pages are capped at 20.
- `nft_token` carries a live SVG card as `data:image/svg+xml;base64,…`; `nft_token_svg(token_id)` returns the raw SVG. Only numbers and fixed words enter it, and the asset symbol and contract id are XML-escaped.
- Events: NEP-297 standard `nep171` `nft_mint` / `nft_transfer`; nectar `quote_remote_recipient_set` / `quote_remote_recipient_cleared`.

The Feed MCP tool `get_note` still returns `not_available`; it is wired once the v2 contract is deployed ([Agent skill and x402](/integrate/agent-skill-x402)).

## Tests

- ids, encoding and media: `tests_notes::v7_notes_ids_parse_canonical_only`, `v7_notes_base64_rfc4648_vectors`, `v7_notes_xml_escape_and_number_formats`, `v7_notes_template_is_small_and_has_every_placeholder`, `v7_notes_metadata_and_token_media`
- minting and enumeration: `v7_notes_minted_on_funding_and_open_with_nep171_events`, `v7_notes_enumeration_pages_and_owner_lists_after_transfers`, `v7_notes_page_cap`
- authority: `v7_notes_quote_authority_moves_with_transfer`, `v7_notes_old_quote_owner_refused`, `v7_notes_claim_fees_follows_note`, `v7_notes_residual_collateral_goes_to_loan_note_owner`, `v7_notes_self_settle_by_new_loan_owner`, `v7_notes_self_settle_old_owner_refused`
- remote recipient: `v7_notes_transfer_clears_remote_recipient_and_new_owner_sets_one`, `v7_notes_set_recipient_owner_only`, `v7_notes_set_recipient_refused_while_locked`
- locks: `v7_notes_locked_while_quoter_settling_then_free_after_cancel`, `v7_notes_loan_transfer_refused_while_settling`, `v7_notes_candidate_quote_transfer_refused_while_settling`, `v7_notes_remote_leg_locks_quote_and_loan_until_relayed`, `v7_notes_remote_sign_failure_unlocks`, `v7_notes_releasing_locks_loan`
- transfer rules: `v7_notes_transfer_needs_one_yocto`, `v7_notes_transfer_owner_only`, `v7_notes_transfer_to_self_refused`, `v7_notes_transfer_memo_bounded`, `v7_notes_transfer_call_schedules_receiver_and_resolve`, `v7_notes_transfer_call_gas_floor`
- Reserve Notes: `tests_reserve::v7_reserve_note_transfer_moves_the_claim`, `v7_reserve_note_transfer_refused_while_reserve_settlement_pending`; sandbox `reserve_shortfall_stays_settling_and_locks_transfers` (contracts/nectar-core/tests/sandbox_reserve.rs)
