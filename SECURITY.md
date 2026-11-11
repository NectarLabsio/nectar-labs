# Security policy

Nectar Labs is **testnet software with mock assets. It has not been audited.** Do not use it with real funds.

## Reporting a vulnerability

- **Contact:** kunal@nectarnetwork.fun, subject line `SECURITY: nectar-labs`. Please include the commit, the component and the steps to reproduce.
- **Coordinated disclosure:** please allow 90 days before public disclosure. We acknowledge reports within 5 working days.
- **Bug bounty:** none exists.
- **Scope:** the code in this repository and the testnet deployments in the README table "Live on testnet".
- **Out of scope:** third-party services (NEAR, OutLayer, the Chain Signatures MPC signer, 1Click, Pyth, NEAR AI Cloud), denial of service against public RPC endpoints, and social engineering.
- The assets are mocks, but other people use the demo. Please do not drain or grief the deployments beyond what is needed to show the issue.

Policy source: docs/PRD.md §15 ("Disclosure"). The same policy is on the docs site under Security › Bug disclosure.

## Audit status

| Component | External audit | Internal review |
| --- | --- | --- |
| `nectar-core` (NEAR, `contracts/nectar-core`) | none | pre-submission review 2026-11-11 (below) |
| `mock-ft` (testnet tokens only) | none | same review (SR-27) |
| `nectar_vault` (Solana, `solana/`) | none | same review |
| `NectarVaultBase` (EVM, `evm/`) | none | same review |
| quoter / `vault_read` (OutLayer WASM, `quoter/`) | none | spot-checked only |
| keeper, Feed, x402 (`services/`) | none | same review |
| web app and SDK (`apps/web`, `packages/`) | none | **not reviewed** (spot reads only) |

An audit is a PROD requirement before any mainnet deployment (PRD §18). The internal review is not an audit.

## Pre-submission review (2026-11-11)

Full report: [docs/work/security-review-v7.md](docs/work/security-review-v7.md). It was an automated multi-agent review: 102 agents, read-only, 60 candidate findings, 46 survived adversarial verification, 14 were rejected, and **33 remained after deduplication: 5 high, 8 medium, 20 low**. Its main theme was remote settlement: several separate defects could leave a signed remote leg stuck, with the buyer's escrow spent and the collateral locked in the vault, and nothing inside the protocol could recover it. SR-1 and SR-2 were reachable on the live Solana devnet vault.

Decision D-027 (docs/DECISIONS.md) fixed every high and medium finding plus the cheap lows before submission. Interface: docs/work/interface-v7.md §E. Two independent reviewers then re-traced every finding at commit `6e51276`. Contract: 19 fixed, 3 partial, no theft or double execution found. Vaults and keeper: mostly fixed, plus new items. The follow-up work orders (docs/work/wo-35-final-security-followups.md) fixed them: Solana nonce seeds include the authority (N1), the keeper accepts a nonce record as proof of a landed leg (N2–N4), remote triggers get a gas budget (a contract reviewer's item), and an EVM release must name the depositor as recipient (`test_release_recipientNotDepositor_reverts`). A live re-run then found an SR-5 regression: every remote loan was refused on 2.2.0-v7. It was fixed in 2.2.1-v7 (WO-36c).

### What is deployed after the fix wave

| Component | State on 2026-11-11 | Source |
| --- | --- | --- |
| `nectar-core-v2.nectar.testnet` | `2.2.1-v7`. Two code-only upgrades: 2.1.0 → 2.2.0 (tx `7J1DsrKP19HTd1c2AWuoRbW2AyCUR75nd8hLGwNuKPAr`) and 2.2.0 → 2.2.1 (tx `EfTCTQbX4Vq2YbQdPPKWik1s56CEkK6e4EW54Q3hw5ay`), deployed code hash `3mv4LRm6mNtyDLkR8fmaiTQmpHc12KGdfd2BLsjovFvk`. Built with `cargo near build non-reproducible-wasm`, so no byte-for-byte rebuild is claimed | evidence/rollout/security-upgrade-20261111T070338Z.log, evidence/rollout/upgrade-221-20261111T075031Z.log |
| `usdc-mock`, `nvdax-mock` | `mock-ft` code-only upgrade (SR-27) | same rollout log, step 3 |
| Solana `nectar_vault` `ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW` (devnet) | in-place upgrade to the v2 account layout. No v1 positions were open. Last deployed in slot 521021977 | same rollout log, step 4; solana/deploy.md |
| OutLayer quoter | version `5f9bb28796c6c355522444252be380f09e0a1067a453a6d48e06724f581bc062` pinned (`vault_read` reads the v2 layout) | same rollout log, step 5 |
| EVM vault | redeployed **on a local fork of Base Sepolia (anvil, chain id 84532), not on Base Sepolia** (D-026): vault `0xC64b733424C8d25fB574F275007ED8756e261226`, MockB20 `0x634F88DAEf0a1f77645c523C3FA351Fe37aaf81d` | same rollout log, step 6 |

Re-runs on this stack (agent runs, **verifier record pending**; docs/EVIDENCE.md still records the earlier runs on 2.0.0/2.1.0-v7):
- G7 on Solana devnet, evidence/G7/rerun/summary.md. Position 8: refused loan, then release and withdraw. Position 9: funded loan, repay, release, withdraw. Position 10: settle to the buyer, then the depositor withdraws the remainder.
- G13 on the local fork, evidence/G13/rerun/summary.md. Position 11 released, position 12 settled, and a replayed settle reverts with `NonceUsed(14)`.
- G14 on testnet, evidence/G14/rerun/summary.md: borrow, then 402, then a paid call, then 200.
- G11 and G2b (contract tests and testnet views) have not been re-run by the verifier on 2.2.1-v7.

### Status per finding

"Fixed" means the code change is merged and a reproducing test is in the repository. The test names below come from `contracts/nectar-core/src/tests_v7c.rs` / `tests_v7d.rs` (`srN_*`), `solana/tests/nectar_vault.test.ts`, `evm/test/SecurityV7.t.sol` and `services/*/test`. A verifier run of those suites on the deployed versions is pending.

| Id | Sev | Finding (short) | Status | Evidence |
| --- | --- | --- | --- | --- |
| SR-1 | high | Anyone could burn the vault-wide nonces (Solana, EVM) | fixed. Solana nonce PDA `["nonce", position, authority, nonce]` (incl. N1); EVM `nonceUsed[slotKey][nonce]` | "nonces burnt on the attacker's own slots…", "pre-burning nonces by … under the depositor's own key…"; `test_SR1_v2_*` |
| SR-2 | high | Keeper took any account at the nonce PDA as proof a leg landed | fixed. Only a program-owned `NonceRecord` with every field matching counts (incl. N2–N4) | keeper tests "N2a…", "N2b…", "N3…", "SR-1: a nonce burned on another slot does not count as landed" |
| SR-3 | high | An expired, unrelayed signed remote leg had no recovery | fixed. `resign_remote_settlement(position_id)`: anyone, after expiry, re-signs the identical leg with a fresh nonce; no rollback | `sr3_expired_signed_leg_resigns_identically_with_a_fresh_nonce`, `sr3_resign_refused_after_relay`, `sr3_base_resign_signs_a_fresh_digest_of_the_same_leg` |
| SR-4 | high | Depositor or recipient could make every settle revert via its token account | **Solana: fixed** (pull payouts: the recipient `claim`s when its ATA is unusable, the depositor `withdraw`s). **EVM: open**, see "What remains" | "depositor reassigns its ATA owner…", "recipient ATA reassigned: settle credits a claim…" |
| SR-5 | high | Remote loans sized against capacity that cannot settle them; truncate-before-filter | **partial**, see "What remains" | `sr5_remote_limit_boundary`, `sr5_two_remote_loans_cannot_exceed_remote_capacity`, `sr5_unfit_quotes_cannot_crowd_out_a_fitting_one`, `sr5_borrow_capped_at_the_largest_fitting_quote` |
| SR-6 | medium | Anyone could drain `gas_reserve_yocto` | **partial**, see "What remains" | `sr6_stranger_cannot_confirm`, `sr6_job_requests_are_keeper_or_owner_only`, `sr6_short_reserve_falls_back_to_p0_instead_of_blocking_the_rescue` |
| SR-7 | medium | Remote recipients only format-checked | **partial**, see "What remains" | `sr7_recipient_validity`, `sr7_funding_refuses_a_recipient_no_vault_can_pay`, `sr7_legacy_quote_with_a_bad_recipient_is_never_signed` |
| SR-8 | medium | Vault position ids could be squatted | fixed. Depositor committed at reservation (`remote.committed_depositor`); Solana slots `["pos", vault, id, depositor]`; EVM slots keyed by (id, depositor) | `sr8_squatted_slot_never_confirms_the_reservation`, "an attacker opening the same id with another depositor…", `test_SR8_v2_*` |
| SR-9 | medium | Quoter deposit spent before checking that a settle can succeed | fixed. Pre-check, abort cooldown, owner `write_off_bad_debt` | `sr9_a_settle_that_cannot_succeed_never_spends_the_deposit`, `sr9_write_off_is_the_terminal_state` |
| SR-10 | medium | Rounding dead end in underwater remote legs | fixed | `sr10_underwater_rounding_seizes_every_unit` |
| SR-11 | medium | Keeper looped on underfunded deposits | fixed. Compares against `remote.reserved_units`; doubling, capped cooldown | keeper tests "top-level units are 0, the reserved amount binds…", "N4: an unchanged deposit is retried on a doubling, capped cooldown…" |
| SR-12 | medium | Keeper vault discovery could be blocked | fixed. Vault program and mint pinned from config | keeper test "SR-12: a look-alike vault under another mint changes nothing" |
| SR-13 | medium | One OutLayer calendar answer latched `forced_closed` | fixed. An OutLayer close now expires | `sr13_an_outlayer_answer_closes_for_a_bounded_time` |
| SR-14 | low | Untrusted callers grow contract-paid storage | fixed. Minimum borrow, 8 open reservations per account | `sr14_open_reservations_are_capped_per_account`, `sr14_remote_borrow_below_the_minimum_is_refused` |
| SR-15 | low | Remote deposits not bound to a mint | **partial**, see "What remains" | `sr15_a_vault_serves_one_collateral` |
| SR-16 | low | Relisting a quote skipped the Reserve-discount check | fixed | `sr16_top_up_cannot_relist_above_the_reserve_discount` |
| SR-17 | low | `owed_collateral` had no claim path | fixed. `claim_owed_collateral(symbol)` (1 yoctoNEAR) | `sr17_owed_collateral_claim_round_trip`, `sr17_claim_refused_while_paused` |
| SR-18 | low | A short deposit was never recorded | fixed. Recorded, loan refused, releasable | `sr18_short_deposit_is_recorded_refused_and_releasable` |
| SR-19 | low | `upsert_collateral` could change a live asset's token or decimals | fixed | `sr19_token_change_refused_with_open_debt` |
| SR-20 | low | Dust `Q_c` captured the buyers' share; fee index overflow risk | fixed | `sr20_dust_q_collects_no_premium_and_never_moves_the_index` |
| SR-21 | low | Recipient change without 1 yoctoNEAR | fixed | `sr21_recipient_change_needs_one_yocto` |
| SR-22 | low | A depleted Reserve refused new deposits | fixed. Reserve epochs | `sr22_join_on_a_depleted_reserve_mints_one_to_one` |
| SR-23 | low | Refused Note transfer not returned if a settlement started meanwhile | fixed | `sr23_a_refused_note_goes_back_even_if_a_settlement_started_meanwhile` |
| SR-24 | low | Stale `quote_refs` locked Quote Notes | fixed | `sr24_an_aborted_run_leaves_no_lock_on_its_quotes` |
| SR-25 | low | `withdraw_claimable` ignored pause | fixed | `sr25_withdraw_claimable_refused_while_paused` |
| SR-26 | low | Anyone could force a release during the borrower's retry window | fixed | `sr26_stranger_cannot_kill_the_retry` |
| SR-27 | low | `mock-ft` free registration drained storage stake | fixed and deployed (mock tokens upgraded) | `sr27_free_registration_refused` |
| SR-28 | low | Base keeper's non-attest mode looped forever | mitigated. Without attestation the keeper reports `unsupported` and sends nothing; the local fork uses the labelled keeper attestation | keeper test "SR-28: without attestation or an OutLayer read…" |
| SR-29 | low | Base "nonce used" recovery scanned only 10,000 blocks | fixed. Scans from the reservation block | keeper tests "SR-29: …" |
| SR-30 | low | EVM expiry off by one second | fixed. Valid while `block.timestamp < expires` | `test_SR30_v2_settleAtExactExpiry_reverts` |
| SR-31 | low | Keeper's vault program not pinned | fixed | keeper tests "SR-31: …" |
| SR-32 | low | x402 facilitator settled caller-chosen terms without auth | fixed. Bearer secret from a 0600 file, route terms pinned, binds 127.0.0.1; in-process is the default | x402 tests "every endpoint answers 401 without the shared secret…", "pins each route term…" |
| SR-33 | low | Feed preview said ok for borrows the contract refuses | fixed | services/feed/test/skill.test.ts "v2: above pre_liq but under the LTV cap fails with the contract reason and no call" |

Also fixed after the review: the "no-code phantom deposit" from the review's coverage gaps. The EVM constructor refuses a token with no code outside the B20 precompile prefix, and every transfer must return exactly one word of `true` (`test_phantom_v2_*`).

## What remains (known, not fixed)

1. **SR-5, partial: remote capacity is checked only when a loan is originated.** A remote loan must pass two checks. The first is the aggregate check. The second compares remote debt plus the new borrow with (1 − h) × the fitting, non-exiting quotes, and caps the borrow at the largest single fitting quote. Settlement now filters by recipient before it cuts the list to 8 candidates. Remote settlement is still **single-leg**: one quote must clear a position's debt (or take every unit). Nothing re-checks the bin-packing after origination. Two loans that each fit the largest quote can depend on the same quote, and **buyers can clear their remote recipient (`set_quote_remote_recipient(None)`) or exit after origination**. Either way a position can become impossible to pre-liquidate until its value falls below what some fitting quote can cover. There is no Reserve stage and no multi-leg remote settlement.
2. **SR-6, partial: the gas reserve can still be spent by keeper reads on anyone's reservations.** Confirms are limited to the borrower, the keeper or the owner. The keeper gets at most 4 reserve-paid reads per position, and the borrower's read comes out of its held reservation deposit. Job requests are keeper or owner only. Non-liquidation spends leave a floor of 4 quoter runs, and a short reserve falls back to static (P0) pricing instead of blocking the rescue. But any account can open reservations (8 at a time per account, deposit refunded), and the keeper spends reserve on them. OutLayer refunds are not credited back to `gas_reserve_yocto` (see contracts/nectar-core/src/p1.rs). So the reserve above the floor can be worn down, after which quoter-priced settlement degrades to static pricing until the owner tops up the reserve.
3. **SR-7, partial: there is no B20 `isAuthorized` check at funding.** Recipients must now be a 32-byte on-curve Solana key or a non-zero 0x address, at funding, at `set_quote_remote_recipient` and before signing. The contract does not call the B20 policy registry (`isAuthorized(policyId, account)`, F-346). With an allowlist policy, a 0x recipient that is not on the allowlist (or is removed later) makes the EVM `settle` revert with `NotAuthorized`. `resign_remote_settlement` re-signs the same recipient, so that **Base leg stays stranded** until a contract upgrade.
4. **SR-4, EVM remainder still pushed.** On Solana, payouts are pulled. On the EVM vault, `settle` still transfers the seized units to the recipient and the remainder to the depositor in the same transaction, and checks both against the B20 policy (evm/src/NectarVaultBase.sol `_executeSettle`). If either party is not authorized, for example the depositor's policy is revoked after it deposited, the whole settle reverts and the leg is stuck as in item 3.
5. **SR-15, partial: there is no mint binding in `vault_read`.** The OutLayer read reports no mint. The contract instead refuses to let one (chain, vault) serve a second collateral (`assert_vault_unbound`). Correctness therefore depends on each vault holding one mint: the Solana vault PDA is derived from its mint, and the EVM vault has one token.
6. **Keeper relays are advisory.** `relay_settlement_result` and `relay_release_result` are keeper-only and check the format of the tx reference. nectar-core does **not** verify that the Solana or Base transaction happened. A keeper that lies, or a leaked keeper key, can close a remote position on NEAR without the leg landing, and a relayed leg can no longer be re-signed. PROD needs a light-client or attested proof (PRD §9 trust note). The keeper-v2 key is a function-call key with no deposits (D-019).
7. **Keeper residuals after WO-35k** (services/keeper/README.md):
   - Base vault events do not name the slot. A leg that landed through another contract is used only when no direct call on the slot emitted the event, which is a heuristic.
   - Base has no OutLayer `vault_read` (SR-28). A short deposit on an expired Base reservation is not attested, because attestation books the full reserved units, so no automated path proves it for release.
   - The landed-tx search on Solana is bounded per tick. Anyone can pad an address's history, which delays (but does not block) that leg's relay.
   - The keeper's reserve-paid reads stop at 4 per position. After that a deposit must be confirmed by the borrower or the owner.
   - The daemon runs locally, not continuously. A keeper outage longer than a signed leg's expiry leaves it unrelayed. Anyone can then recover it with `resign_remote_settlement`, and the web app shows a "Re-sign settlement" button.
8. **The Base spoke runs on a local fork of Base Sepolia, not on Base Sepolia** (D-026; no usable faucet without a login, F-368). The NEAR side, which derives the key, builds the EIP-712 digest and gets the MPC signature, is real on testnet. The vault transactions exist only on a local anvil chain and have no public explorer.
9. **Not reviewed** (coverage gaps in the report): the web app and SDK (XSS from on-chain strings, wallet transaction building, API routes, CSP); the copilot and agents (prompt injection from on-chain data); privacy claims; callback gas on failure branches; upgrade safety (there is no `migrate`; layouts change only through new raw keys); 18–24-decimal collateral; MEV and economic attacks; git-history secret scan (G9 runs gitleaks).
10. **Trust in the owner.** A single deployer key on testnet sets parameters, pauses, and moves the mock price (a disclosed demo control). PROD needs a DAO owner with a timelock.

## Rejected by the review's verifiers (not fixed by design)

The report lists 14 candidates that verifiers rejected, each with the reason, in docs/work/security-review-v7.md "Rejected by verifiers". One of them is the transferable remote Loan Note: it carries no collateral claim, and release always goes to the vault depositor. That is documented behaviour.
