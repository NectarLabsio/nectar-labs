---
title: Audits
slug: /security/audits
description: Audit status, stated plainly.
---
# Audits

<p className="verified">Verified against: spec docs/PRD.md §15, §18 · docs/work/security-review-v7.md (2026-11-11) · D-026 (2026-11-10), D-027 (2026-11-11) · F-346 (2026-11-10) · tests named below · rollout logs evidence/rollout/ (2026-11-11) · docs/EVIDENCE.md re-runs after D-027: §G2b, §G7, §G13, §G14 (recorded in b8784c1), §G11, §G3b (recorded in 5083d30), §G14 402 → 200 and §G1 2.2.1 gas rows (recorded in 2e16f9b; re-runs recorded in a677689) · docs/work/review-2-findings.md (2026-11-11)</p>

**No audit has been performed.** The contracts, the Solana program and the quoter are unaudited testnet code. Do not use them with real assets.

| Component | Audit | Planned |
| --- | --- | --- |
| `nectar-core` (NEAR) | none | before any mainnet deployment (PROD) |
| `mock-ft` | none | testnet only, never on mainnet |
| `nectar_vault` (Solana) | none | before mainnet (PROD) |
| quoter (OutLayer WASM) | none | before mainnet (PROD) |

Mainnet also requires a 30-day testnet soak and a legal review of the disclaimers (PRD §18). Until then the internal controls are the tests named on the [Threat table](/security/threats) and below.

## Pre-release review (2026-11-11, not an audit)

An automated, read-only multi-agent review (report: `docs/work/security-review-v7.md`) kept **33 findings: 5 high, 8 medium, 20 low**. Most concerned remote settlement: a signed remote leg could get stuck with the buyer's escrow spent and the collateral locked. Decision D-027 fixed every high and medium finding plus the cheap lows. It was deployed on 2026-11-11 as nectar-core-v2 `2.2.1-v7` (code-only upgrades), Solana vault v2 (in-place upgrade) and a redeployed EVM vault on the local fork. The full per-finding table is in `SECURITY.md` at the repository root. The verifier re-ran the gates on the upgraded stack on 2026-11-11 and recorded PASS for G11, G2b, G7, G13 (local fork), G14 (chain claims, then the HTTP 402 → 200 step, then on HEAD with the guarded demo agent) and G3b ([Evidence](/project/evidence)). The per-method gas-row check on 2.2.1 first failed on one owner setter without a row; after a test was added it passed (67 of 67 change methods, recorded in a677689). Every finding SR-1…SR-33 has at least one test named after it, and 124 `sr*` contract tests pass (EVIDENCE §G11, recorded in 5083d30). The tests ran on the fixed code only.

Examples of reproducing tests: `sr3_expired_signed_leg_resigns_identically_with_a_fresh_nonce`, `sr5_two_remote_loans_cannot_exceed_remote_capacity`, `sr7_funding_refuses_a_recipient_no_vault_can_pay`, `sr8_squatted_slot_never_confirms_the_reservation`, `sr17_owed_collateral_claim_round_trip` (contracts/nectar-core); "nonces burnt on the attacker's own slots, same ids, do not block an honest settle or release" and "recipient ATA reassigned: settle credits a claim, recipient and depositor both pull" (solana/tests/nectar_vault.test.ts); `test_SR1_v2_nonceBurnedElsewhereDoesNotBlockSlot`, `test_SR30_v2_settleAtExactExpiry_reverts` (evm/test/SecurityV7.t.sol).

## What remains

| Item | State |
| --- | --- |
| SR-5 remote capacity | **partial.** Checked only when a loan is originated: remote debt + borrow ≤ (1 − h) × fitting quotes, and borrow ≤ the largest fitting quote. Remote settlement is single-leg, and bin-packing is not re-checked later. Buyers can clear their remote recipient or exit after origination |
| SR-6 gas reserve | **partial.** Callers are restricted, keeper reads are capped at 4 per position, a floor is kept for pre-liquidation, and a short reserve falls back to static pricing. Keeper reads on anyone's reservations still spend the reserve above the floor, and OutLayer refunds are not re-credited |
| SR-7 recipients | **partial.** Strict format at funding, at a recipient change and at signing. There is no B20 `isAuthorized` check (F-346), so a 0x recipient that is not on the allowlist can strand a Base leg |
| SR-4 on the EVM vault | **open.** Solana pays by pull (`withdraw`, `claim`). The EVM `settle` still pushes the remainder to the depositor in the same transaction |
| SR-15 mint binding | **partial.** `vault_read` reports no mint, so one vault may serve only one collateral |
| keeper relays | **advisory.** nectar-core records the keeper's tx reference without verifying the remote transaction ([Trust model](/security/trust-model)) |
| keeper residuals | Base events do not name the slot (heuristic match). Short Base deposits on expired reservations are not attested. The Solana landed-tx search is bounded per tick. The daemon runs locally, not continuously |
| Base spoke | runs on a local fork of Base Sepolia, not Base Sepolia (D-026) |
| lows | 18 of 20 fixed, SR-15 partial, SR-28 mitigated (the keeper reports `unsupported` instead of looping) |
| not reviewed | callback gas on failure branches, upgrade safety (no `migrate`). The web app, SDK, copilot, reference agent and privacy claims were covered by review 2 (below) |

## Review 2 (2026-11-11, not an audit)

An independent, read-only review of the web app, the SDK, the copilot, the reference x402 agent and every privacy claim (report: `docs/work/review-2-findings.md`) kept **12 findings: 5 medium, 7 low**. The per-finding table is in `SECURITY.md`, section "Review 2". No contract code changed. Fixed, each with a named test: the copilot answer is bound to the question typed and the announced model (R2-03), `/api/copilot` is same-origin, size-capped and rate-limited (R2-04), the reference agent signs only its own rebuild of the MCP call (R2-05), amount parsing and the borrow review (R2-06, R2-07), Note transfers to missing accounts (R2-09), testnet-only signers and RPC URLs (R2-10), API route hygiene (R2-11). Privacy and quoter copy was corrected (R2-01, R2-02, R2-12).

| Residual | State |
| --- | --- |
| fee bound in `LockCollateralAndBorrow` (R2-07) | **open** (contract, PROD). A price or fee-parameter change between preview and inclusion changes the fee with no bound the user signed |
| browser security headers (R2-08) | **partial.** `frame-ancestors 'none'`, `object-src 'none'`, X-Frame-Options and HSTS are set. No full `script-src` / `connect-src` policy, the wallet-list manifest is not pinned, and the real-wallet flow under the new headers is checked by hand (E2E uses mock wallets) |
| Solana cluster check (R2-10) | URL only; no genesis-hash check (the devnet genesis hash is not in FACTS) |
| market-maker secrets (R2-02) | operator-set demo parameters, published; each fill reveals their product. MM-owned secrets are PROD |
| dependencies | the zod advisory still reaches `services/x402` through `@x402/core` (needs zod 3; no patched 3.x); docs-site build-time advisories (`tinypool`, `serialize-javascript`) are build-only; `elliptic` (low) on the web server |
| implicit-account definitions (FACTS C-020) | sources differ; the SDK accepts only 64-hex and `0x` as implicit, so other forms fail closed |
