---
title: Remote collateral on Solana
slug: /integrate/remote-collateral-solana
description: Reserve, deposit, attested confirm, then settle or release, with one NEAR-derived key per position.
---
# Remote collateral on Solana

<p className="verified">Verified against: F-031 (2026-11-09), F-036 (2026-11-09), F-080 (2026-11-09), F-082 (2026-11-09), F-338 (2026-11-10), F-341 (2026-11-10) · spec docs/PRD.md §9, §9B · docs/work/interface-v7.md §B · D-016, D-018, D-020 (2026-11-10) · tests listed below (evidence/wo-21/, 2026-11-10) · devnet deploy log evidence/solana/deploy-20261110T124326Z.log</p>
<p className="status">Status: built and tested in the sandbox; testnet deployment pending. The NEAR side ships in `nectar-core-v2.nectar.testnet`, which has not been created yet (D-018, handoff H-NEAR-FAUCET). The Solana program <code>nectar_vault</code> is deployed on devnet as <a href="https://explorer.solana.com/address/ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW?cluster=devnet"><code>ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW</code></a> (deploy log above; not yet recorded in docs/EVIDENCE.md). The full round trip NEAR → Solana is pending gate G7. The OutLayer vault-read job is not built: the sandbox uses a stub in its place.</p>

## The idea

A remote loan pays out only after an attested read proves that the collateral sits in the Solana vault under a key that NEAR derives for **that one position**. It ends in one of two ways: a signed settlement to a buyer, or a signed release back to the borrower. nectar-core never holds a Solana private key. It asks the Chain Signatures MPC signer to sign messages it builds from its own state (F-031).

## Per-position derived key

Each remote position gets its own derivation path, `solana-devnet/pos/<id>`, on domain 1 (Ed25519). nectar-core calls the signer's `derived_public_key({path, predecessor: <nectar-core>, domain_id: 1})` as a cross-contract call (F-338) and stores the result as the position's `authority` (`"ed25519:<base58>"`). Derivation follows F-036. A signature for position 7 cannot move position 8's collateral, because the vault checks each position against its own authority. This replaces the single v1 path `solana-devnet-v1` (D-016) for v2 positions.

## Lifecycle

| # | Step | Who | Where | What happens |
| --- | --- | --- | --- | --- |
| 1 | `reserve_remote_position(collateral, units, borrow_usd_e6, pre_liq_ltv_bps, pay_to?, referrer?)` | borrower | NEAR | Creates the position as `AwaitingDeposit`, derives and stores the authority. No pool funds are locked. The reservation expires after 30 minutes without a deposit (`expire_remote_reservation`, anyone). |
| 2 | `open_position(position_id, authority, amount)` | borrower | Solana | Deposits mock NVDAx into the vault under that authority. The web app builds this with `@solana/kit` and signs through a Wallet Standard wallet (D-020). |
| 3 | `confirm_remote_deposit(position_id)` | anyone | NEAR | Asks an OutLayer job to read the vault account. `on_deposit_verified` requires the stored authority and at least the reserved units, records the depositor, re-checks [both limits](../concepts/aggregate-limit.md) against a fresh price, and only then pays the loan (or `pay_to`). If OutLayer fails, the position stays `AwaitingDeposit` and nothing is paid. |
| 3′ | `keeper_attest_deposit(position_id, tx_ref, depositor)` | keeper | NEAR | **Testnet fallback**, off unless the owner sets `allow_keeper_deposit_attestation`. Events carry `source: "keeper"` instead of `"outlayer"`, so the Feed can label it. |
| 4a | settle | keeper relays | NEAR → Solana | An unhealthy loan settles as in [Settlement flow](../protocol/settlement-flow.md). nectar-core signs a `PRELIQ` preimage with the position's own path. The vault's `settle` requires the Ed25519 program instruction immediately before it (F-080, F-082), the position authority, an unused nonce and an unexpired message. |
| 4b | `request_remote_release(position_id)` | anyone, after debt = 0 | NEAR → Solana | nectar-core signs the release message below with the position's path. The keeper relays it to the vault's `release`, which returns every unit to the depositor. `relay_release_result` records the Solana signature. |

Release message (raw bytes, Ed25519, the position's path):

```text
NECTAR_RELEASE_V1|chain=<chain id>|vault=<vault program id>|pos=<id>|recipient=<depositor>|nonce=<n>|expires=<unix s>
```

Edge cases the contract handles:

- A deposit that is proven but whose loan is refused (limits, expiry) records the depositor, so the collateral can still be released.
- A late deposit on an expired reservation is releasable without a loan.
- Release is refused while a signed settlement has not been relayed, before full repay, and while a confirm is in flight.

## Solana side

`nectar_vault` (Anchor 0.32.1, Solana CLI 2.3.0 per F-341) has four instructions: `init_vault`, `open_position`, `settle`, `release`. The keeper transcribes every `settle` and `release` argument from the message NEAR signed and checks the round trip before it sends (services/keeper/src/solana.ts). See [Solana vault](../protocol/solana-vault.md) and [Preimage format](../protocol/preimage-format.md).

Devnet (from evidence/solana/deploy-20261110T124326Z.log, 2026-11-10): program [`ENZaNFHo…pubW`](https://explorer.solana.com/address/ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW?cluster=devnet), vault PDA `HGSFKMWWnXeHJtPyaCEysWb5vHvQZJLvTkeB6YntEbeX`, mock NVDAx mint `3Ve8GiDBtD7crfwUcKukpMigKQaU2aXtSCNgu661E8hT`. No settle or release transaction exists yet.

## Tests

NEAR (contracts/nectar-core; the sandbox uses one stub contract as both MPC signer and OutLayer):

- sandbox `remote_reserve_confirm_borrow_settle_signed_with_position_path`, `remote_repay_then_release_signed_and_replay_refused`, `remote_refusals_attestation_and_expiry` (tests/sandbox_p2.rs; 3/0 in evidence/wo-21/sandbox_p2.log)
- `tests_p2::reserve_creates_awaiting_position_without_locking_funds`, `tests_p2::expire_reservation_after_30_min`
- `tests_p2::deposit_verified_pays_loan_and_opens`, `tests_p2::deposit_verified_with_pay_to_and_referrer`, `tests_p2::deposit_proven_but_limits_fail_records_depositor`
- `tests_p2::late_deposit_on_expired_reservation_is_releasable_without_loan`
- `tests_p2::release_signs_exact_message_with_position_path`, `tests_p2::release_refused_while_signed_settlement_unrelayed`, `tests_p2::release_nonce_follows_settle_nonces`
- `tests_p2::keeper_attestation_when_enabled`, `tests_p2::keeper_attestation_refused_while_flag_off`

Solana (solana/tests/nectar_vault.test.ts): "settle kind 1 (PRELIQ)", "release after open pays all units to the depositor and closes the position", "missing verify instruction", "wrong authority: valid signature by another key", "replayed nonce…", "release presented with a settlement signature", "victim position is untouched after every rejected attempt".
