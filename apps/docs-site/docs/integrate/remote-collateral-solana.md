---
title: Remote collateral on Solana
slug: /integrate/remote-collateral-solana
description: Reserve, deposit, attested confirm, then settle or release, with one NEAR-derived key per position.
---
# Remote collateral on Solana

<p className="verified">Verified against: F-031 (2026-11-09), F-036 (2026-11-09), F-080 (2026-11-09), F-082 (2026-11-09), F-338 (2026-11-10), F-341 (2026-11-10) · spec docs/process/prd.md §9, §9B · docs/process/work/interface-v7.md §B · D-016, D-018, D-020 (2026-11-10) · tests listed below (evidence/wo-21/, 2026-11-10) · devnet deploy log evidence/solana/deploy-20261110T124326Z.log · testnet + devnet: docs/EVIDENCE.md §G7 v7 (2026-11-10T16:52Z, 91db9ea) · docs/process/work/interface-v7.md §E, D-027 (2026-11-11) · re-run on 2.2.1-v7 + vault v2: docs/EVIDENCE.md §G7 re-run after D-027 (2026-11-11T08:25Z, recorded in b8784c1)</p>
<p className="status">Status: live on testnet and devnet (EVIDENCE §G7 v7, 2026-11-10T16:52Z). On `nectar-core-v2.nectar.testnet` positions #2 and #3 went through the whole lifecycle: their stored authorities equal the signer's live `derived_public_key` for `solana-devnet/pos/2` and `pos/3`; deposits were confirmed by the OutLayer vault-read job (`source: outlayer`, requests 16443 and 16449); #2 was repaid and released (devnet tx <a href="https://explorer.solana.com/tx/5fTihnbJz5dPndVbHnwk54WoLxKCtz96HfYaPAveDSJ9jw51BNBJQ9mAbxAjWRWJB8EfsP4wrvhrJcmiFwaULLGv?cluster=devnet">5fTihnbJ…</a>) and #3 was pre-liquidated and settled to the buyer (devnet tx <a href="https://explorer.solana.com/tx/3cdcQru2WH6dbN9qvqLsKVz5CppVikHSYEgbJF8WLS6DRwzECncHSM3f5ABSJXZ4EWSZoKSfhFFRwePgihL7pWJ6?cluster=devnet">3cdcQru2…</a>). Program <a href="https://explorer.solana.com/address/ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW?cluster=devnet"><code>ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW</code></a>. The keeper attestation path is the labelled testnet fallback; neither position used it. The price drop that triggered #3 is an owner-oracle demo control. Those runs used contract 2.0.0-v7 and the v1 vault layout. Since 2026-11-11 the stack is contract <code>2.2.1-v7</code> and vault v2 (D-027). The verifier re-ran G7 on it (EVIDENCE §G7, recorded in b8784c1): PASS. Position 8 had its loan refused (aggregate limit) and its collateral released, position 9 was repaid and released, and position 10 was settled to the buyer (+2.386856 NVDAx). In each case the depositor then signed <code>withdraw</code>. The stored authorities equal the signer's live <code>derived_public_key</code>, the deposits were confirmed with <code>source: outlayer</code>, and each Solana tx has the Ed25519 verify at ix0.</p>

## The idea

A remote loan pays out only after an attested read proves that the collateral sits in the Solana vault under a key that NEAR derives for **that one position**. It ends in one of two ways: a signed settlement to a buyer, or a signed release back to the borrower. nectar-core never holds a Solana private key. It asks the Chain Signatures MPC signer to sign messages it builds from its own state (F-031).

## Per-position derived key

Each remote position gets its own derivation path, `solana-devnet/pos/<id>`, on domain 1 (Ed25519). nectar-core calls the signer's `derived_public_key({path, predecessor: <nectar-core>, domain_id: 1})` as a cross-contract call (F-338) and stores the result as the position's `authority` (`"ed25519:<base58>"`). Derivation follows F-036. A signature for position 7 cannot move position 8's collateral, because the vault checks each position against its own authority. This replaces the single v1 path `solana-devnet-v1` (D-016) for v2 positions.

## Lifecycle

| # | Step | Who | Where | What happens |
| --- | --- | --- | --- | --- |
| 1 | `reserve_remote_position(collateral, units, borrow_usd_e6, pre_liq_ltv_bps, pay_to?, referrer?, shield?, chain?, depositor)` | borrower | NEAR | Creates the position as `AwaitingDeposit`, derives and stores the authority, and commits `depositor` (the borrower's Solana wallet; `remote.committed_depositor`, SR-8). Only a deposit from that wallet can confirm it. No pool funds are locked; at most 8 open reservations per account. The reservation expires after 30 minutes without a deposit (`expire_remote_reservation`). |
| 2 | `open_position(position_id, authority, amount)` | borrower | Solana | Deposits mock NVDAx into the vault under that authority. The web app builds this with `@solana/kit` and signs through a Wallet Standard wallet (D-020). |
| 3 | `confirm_remote_deposit(position_id)` | borrower, keeper or owner (SR-6) | NEAR | Asks an OutLayer job to read the vault account (the `vault_read` job in quoter/src/solana.rs, pinned version `5f9bb287…` since 2026-11-11, which reads the v2 layout; the earlier pin `5d90edb8…` confirmed positions #2 and #3 on testnet, OutLayer requests 16443 and 16449, EVIDENCE §G7 v7). `on_deposit_verified` requires the stored authority and at least the reserved units, records the depositor, re-checks [both limits](../concepts/aggregate-limit.md) against a fresh price, and only then pays the loan (or `pay_to`). A remote loan must also fit remote capacity: remote debt + borrow ≤ (1 − h) × the fitting, non-exiting quotes, and borrow ≤ the largest single fitting quote, because remote settlement is single-leg (SR-5; tests `sr5_remote_limit_boundary`, `sr5_two_remote_loans_cannot_exceed_remote_capacity`). If OutLayer fails, the position stays `AwaitingDeposit` and nothing is paid. |
| 3′ | `keeper_attest_deposit(position_id, tx_ref, depositor)` | keeper | NEAR | **Testnet fallback**, off unless the owner sets `allow_keeper_deposit_attestation`. Events carry `source: "keeper"` instead of `"outlayer"`, so the Feed can label it. |
| 4a | settle | keeper relays | NEAR → Solana | An unhealthy loan settles as in [Settlement flow](../protocol/settlement-flow.md). nectar-core signs a `PRELIQ` preimage with the position's own path. The vault's `settle` requires the Ed25519 program instruction immediately before it (F-080, F-082), the position authority, an unused nonce and an unexpired message. |
| 4b | `request_remote_release(position_id)` | anyone, after debt = 0 | NEAR → Solana | nectar-core signs the release message below with the position's path. The keeper relays it to the vault's `release`, which records every unit as withdrawable for the depositor. `relay_release_result` records the Solana signature. |
| 5 | `withdraw(position_id)` / `claim()` | depositor / buyer | Solana | Pull payouts (vault v2): after settle or release the depositor withdraws the remainder (or everything) to any token account of the mint; a buyer whose ATA could not receive claims its credited units. |

Release message (raw bytes, Ed25519, the position's path):

```text
NECTAR_RELEASE_V1|chain=<chain id>|vault=<vault program id>|pos=<id>|recipient=<depositor>|nonce=<n>|expires=<unix s>
```

Edge cases the contract handles:

- A deposit that is proven but whose loan is refused (limits, expiry) records the depositor, so the collateral can still be released.
- A late deposit on an expired reservation is releasable without a loan.
- Release is refused while a signed settlement has not been relayed, before full repay, and while a confirm is in flight.
- A short deposit is recorded, the loan is refused, and the collateral is releasable (`sr18_short_deposit_is_recorded_refused_and_releasable`).
- A quote recipient must be a 32-byte on-curve Solana key or a non-zero 0x address, at funding, at `set_quote_remote_recipient` and before signing (`sr7_recipient_validity`). There is no B20 `isAuthorized` check (F-346; see [Audits](../security/audits.md)).

## Recovery actions (2.2.x)

| Method | Who | When |
| --- | --- | --- |
| `resign_remote_settlement(position_id)` | anyone (not payable) | a signed settle leg expired without being relayed. nectar-core signs the **identical** leg (repay, seize, recipient, kind) with a fresh nonce and expiry; nothing is rolled back. If the old message did land, the vault slot is no longer open and the new one fails. Refused after a relay. Tests `sr3_expired_signed_leg_resigns_identically_with_a_fresh_nonce`, `sr3_resign_refused_after_relay`. The web app shows "Re-sign settlement" |
| `request_remote_release(position_id)` | anyone, after debt = 0 | also re-requestable once a signed release expired unrelayed (fresh nonce) |
| `claim_owed_collateral(symbol)` | the account owed (1 yoctoNEAR) | a settlement, release or proceeds-rollback transfer of NEAR-held collateral failed; the units wait in `owed_collateral` (view `get_owed_collateral`). Test `sr17_owed_collateral_claim_round_trip` |
| `write_off_bad_debt(position_id)` | owner | a position with debt and no collateral left; for remote positions only once its leg was relayed. Test `sr9_write_off_is_the_terminal_state` |

The keeper's relay report is advisory: nectar-core does not verify the Solana transaction ([Trust model](../security/trust-model.md)).

## Solana side

`nectar_vault` (Anchor 0.32.1, Solana CLI 2.3.0 per F-341) has six instructions since the v2 upgrade: `init_vault`, `open_position`, `settle`, `release`, `withdraw`, `claim`. The keeper transcribes every `settle` and `release` argument from the message NEAR signed and checks the round trip before it sends (services/keeper/src/solana.ts). See [Solana vault](../protocol/solana-vault.md) and [Preimage format](../protocol/preimage-format.md).

Devnet (from evidence/solana/deploy-20261110T124326Z.log, 2026-11-10): program [`ENZaNFHo…pubW`](https://explorer.solana.com/address/ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW?cluster=devnet), vault PDA `HGSFKMWWnXeHJtPyaCEysWb5vHvQZJLvTkeB6YntEbeX`, mock NVDAx mint `3Ve8GiDBtD7crfwUcKukpMigKQaU2aXtSCNgu661E8hT`. Settle and release transactions: see the status line above.

## Tests

NEAR (contracts/nectar-core; the sandbox uses one stub contract as both MPC signer and OutLayer):

- sandbox `remote_reserve_confirm_borrow_settle_signed_with_position_path`, `remote_repay_then_release_signed_and_replay_refused`, `remote_refusals_attestation_and_expiry` (tests/sandbox_p2.rs; 3/0 in evidence/wo-21/sandbox_p2.log)
- `tests_p2::reserve_creates_awaiting_position_without_locking_funds`, `tests_p2::expire_reservation_after_30_min`
- `tests_p2::deposit_verified_pays_loan_and_opens`, `tests_p2::deposit_verified_with_pay_to_and_referrer`, `tests_p2::deposit_proven_but_limits_fail_records_depositor`
- `tests_p2::late_deposit_on_expired_reservation_is_releasable_without_loan`
- `tests_p2::release_signs_exact_message_with_position_path`, `tests_p2::release_refused_while_signed_settlement_unrelayed`, `tests_p2::release_nonce_follows_settle_nonces`
- `tests_p2::keeper_attestation_when_enabled`, `tests_p2::keeper_attestation_refused_while_flag_off`

Solana (solana/tests/nectar_vault.test.ts): "settle kind 1 (PRELIQ)", "release after open pays all units to the depositor and closes the position", "missing verify instruction", "wrong authority: valid signature by another key", "replayed nonce…", "release presented with a settlement signature", "victim position is untouched after every rejected attempt".
