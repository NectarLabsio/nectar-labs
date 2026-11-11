# SUBMISSION.md — payload draft, never sent by an agent

Status: **DRAFT, 2026-11-11** (prose refreshed to docs/EVIDENCE.md as of commit a677689, plus review 2 fixes). Fields follow "Submission API" in docs/HACKATHON.md (verified 2026-11-09; re-read the live
https://nearhackathon.com/HACKATHON.md on Nov 14 before sending, F-001). Only Kunal sends it (H1). Agents run the submit
script with `--dry-run` only. The JSON payload holds personal data (name, email, payout account), so it is printed, never committed.

## Payload fields (exactly these 11; the builder reads this table)
Format the builder relies on: one row per API field, column 1 = API field name in backticks, column 2 = value in backticks
(or `TODO-H<n>`), column 3 = source. Values in column 2 are sent verbatim. `idea` is read from the fenced block below.

| API field | Value | Source / rule (HACKATHON.md "Submission API") |
| --- | --- | --- |
| `requestId` | `GENERATE-ONCE` | UUID made once by the builder at the first `--send` (`node -e 'console.log(crypto.randomUUID())'`), stored in `~/.nectar/submission-request-id` (0600, outside the repo), reused on every retry |
| `projectName` | `Nectar Labs` | README title; 2-80 chars |
| `leadName` | `TODO-H10` | README "Team" names Kunal Drall, but HACKATHON.md says never guess this field: Kunal confirms in H10 |
| `email` | `TODO-H10` | the earlier draft had `kunal@nectarnetwork.fun`; Kunal confirms it in H10 (≤ 160 chars, ≤ 2 submissions per email, Q-015) |
| `size` | `TODO-H10` | one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+`, exactly as written; `1` if H10 says "Kunal only" |
| `tracks` | `["defi","security","privacy"]` | core three; the proposal in "Tracks" below adds `agents` and `nfts`. Kunal decides (H16); this value changes only on his reply |
| `nearAddress` | `TODO-H14` | **mainnet** payout account, made by Kunal in his own wallet; never created or invented by an agent; must match the regex in HACKATHON.md |
| `projectUrl` | `TODO-H2` | public repo URL after H2; ≤ 300 chars; each repo is submitted once |
| `demoUrl` | `TODO-H3` | URL of the **public X demo post** (H3) carrying the video (H11). HACKATHON.md: send only once the repo is public and the post is up |
| `idea` | (block below) | 20-2000 chars |
| `consent` | `TODO-H14` | becomes `true` only after Kunal reads and agrees to: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." |

Never sent: `website`. It is a spam trap: any non-empty value rejects the submission (F-007). The builder must not emit that key,
and must not add any key outside the 11 above. Demo video `TODO-H11` is not an API field: it is attached to the X post (H3).

### idea
```text
Problem: lenders cap the LTV of tokenized stocks because DEX exit liquidity is revocable. Nectar Labs makes exit liquidity committed. Market makers escrow time-locked USDC quotes (Pappus) in a NEAR contract with 7-day notice. Borrowers get a higher limit (Cramér), B_c = min(LTV_c·V_c, (1−h_c)(Q_c+R_c+D_c)), and pay a limit premium that funds the buyers' commitment fees. Pre-liquidation sells collateral to the committed buyer at a bounded discount, not on a DEX.

How NEAR fits: nectar-core-v2 (Rust, near-sdk 5.30.1, 2.2.1-v7) on NEAR testnet holds quotes, positions, the pool and an O(1) fee index. A hash-pinned OutLayer TEE program prices the settlement discount from encrypted inputs (operator-set demo values; fills reveal their product); the contract clamps it to the quote's cap and settles at the cap if the call fails. The keeper holds a function-call key only. 1Click dry quotes add signed reference depth, never deposited. Chain Signatures: the contract builds each settlement or release message, v1.signer-prod.testnet signs it with a key derived per position, and a Solana devnet vault checks the Ed25519 signature before it pays the buyer or releases to the borrower; an OutLayer read of the vault confirms each deposit. The same flow, with secp256k1 keys, signs EIP-712 messages for an EVM vault on a local fork of Base Sepolia, not Base Sepolia. Agents pay for data with x402 on NEAR, and every quote and loan is an NEP-171 Note. The copilot shows only answers an attested NEAR AI TEE signed for the question typed (provenance, not advice; fixture-tested, no live answer yet).

Disclosed: collateral and USDC are mock tokens; the price comes from an owner oracle (Pyth path built and tested, no live NVDA price); testnet only, no token, no mainnet. Not audited: a pre-submission review found 33 issues (5 high); highs and mediums are fixed or listed as partial or open in SECURITY.md; Solana, Base-fork and x402 runs were repeated after the fixes. Evidence: docs/EVIDENCE.md.
```

Claim → evidence (docs/EVIDENCE.md gate table as of a677689, quoted exactly; "re-run after D-027" rows are 2026-11-11T08:02Z–08:25Z, clone 3ab3026; the G14 402 → 200 and first G1 2.2.1 gas-row rows are 2026-11-11T13:52Z–14:18Z, clone 45ed1f3; the G14-on-HEAD and G1 re-check rows are 15:01Z–15:25Z, clone 48b5c5a):
| Claim in `idea` | Gate / test |
| --- | --- |
| nectar-core-v2 at 2.2.1-v7 on testnet | G2b testnet deploy v2 (after D-027) PASS: `contract_version` 2.2.1-v7, rebuilt wasm byte-identical to `view_code`, code_hash `3mv4LRm6…` (open item: the rebuild needed an SDKROOT override on the verifier's host) |
| quotes, positions, pool, fee index | G1 PASS (2026-11-09T20:43Z) · G2 PASS (20:55Z) · G1 (v7 additions) PASS (2026-11-10T14:05Z) · G11 v7 contract (re-run after D-027) PASS (2026-11-11T08:20Z), recorded in 5083d30: 608 unit + 50 sandbox, wasm hash = deployed 2.2.1-v7 · G1 (2.2.1 gas rows) PASS (re-check 2026-11-11T15:25Z, clone 48b5c5a, recorded in a677689): 67 of 67 change methods have a GAS row, max tx-total 78.60 Tgas, wasm = deployed 3mv4LRm6…; first run FAIL (14:16Z, 2e16f9b) on `remove_extra_remote_chain`, fixed by the WO-45 test (no contract change) |
| TEE discount, cap fallback | G4 PASS (2026-11-09T22:10Z) + G4 addendum PASS (22:51Z): runs A/C fallback, run D request 15148 = 159 bps vs 400 cap. On 2.2.1-v7: G7 re-run `quoter_result` fills quote 2 at 300 bps |
| keeper function-call key | G2b (after D-027): keeper-v2 one FunctionCall key, 5 methods, receiver nectar-core-v2 (D-019) |
| 1Click dry, never deposited | G6 PASS (2026-11-09T22:58Z), Q-007 |
| oracle | G5 FALLBACK (disclosed) (2026-11-09T22:55Z) |
| Chain Signatures + Solana vault, per-position key, OutLayer deposit read | G7 Solana + signer (re-run after D-027) PASS: positions 8/9/10, authority == live `derived_public_key` (domain 1), confirms `source "outlayer"`, three finalized Solana txs with the Ed25519 ix before the vault ix, depositor withdrawals 3 / 3 / 0.613144 (vault v2). Earlier: G7 (v7) PASS (2026-11-10T16:52Z) |
| EVM vault on a local fork of Base Sepolia | G13 Base round trip (re-run after D-027) PASS on the local fork of Base Sepolia (D-026), not Base Sepolia: positions 11 released / 12 settled, replay → `NonceUsed(14)`. G12 PASS on the fork (2026-11-10T18:04Z). ERC-8021 suffix not appended (H19); real Base Sepolia pending H15 |
| x402 | G14 x402 (re-run after D-027) PASS for the chain claims: borrow `HvFX6…` (position #13), relay `BemztvL…`. The HTTP 402 → 200 leg was then verifier-run (2026-11-11T13:54Z–13:55Z, clone 45ed1f3, recorded in 2e16f9b): unpaid GET → 402 (near:testnet, usdc-mock, 10000, payTo nectar.testnet), borrow `7UFpexpd…` (position #14), relay `EskZKj9s…`, paid → 200 CSV 110 rows. G14 re-run on HEAD with the guarded demo agent (WO-44) PASS (2026-11-11T15:02Z, clone 48b5c5a, recorded in a677689): `borrow_verified` before signing, borrow `E2suM2LC…` (position #15), relay `4vW2tPF5…`, 200 + 123 CSV rows |
| NEP-171 Notes | G2b PASS (2026-11-10T16:52Z) `nft_tokens` · G14 PASS (16:52Z) `nft_mint p-4` · G14 re-run `nft_mint` for position #13 |
| copilot | G8 PASS (fixture) (2026-11-09T23:56Z). Binding to the question typed and the announced model came after G8: test "R2-03: an exchange signed for other notes or another model is not verified, even with an accepted DCAP verdict" (apps/web/lib/copilot/verify.test.ts; `pnpm --filter web test:copilot` 12 pass, 1 skipped live, 2026-11-11) |
| pre-submission review, SECURITY.md | not a gate: D-027, SECURITY.md, docs/work/security-review-v7.md. Fix tests recorded in 5083d30 (G11 re-run after D-027): every SR-1…SR-33 has a named test, 124 contract sr* tests, Solana 10 cargo + 55 TS, forge 105 pass / 3 skip |
| runs repeated on the fixed contract | G7, G13 (local fork) and G14 re-run after D-027 rows above |
| web | G3b web E2E (re-run after D-027 + design port) PASS (2026-11-11T08:24Z, recorded in 5083d30; mocked remote and Notes E2E passed, screenshot capture not run); not claimed in `idea` |

## Tracks — proposal for H16 (Kunal decides)
Proposed: `defi`, `security`, `privacy`, `agents`, `nfts`. Not proposed: `realworld`. Each proposed track is backed by a gate.
- `defi` (lending): committed exit liquidity as a limit input; G1, G2, G2b (re-run after D-027, 2.2.1-v7), G4, G6, G7 (re-run after D-027).
- `security`: function-call keeper key (D-010/D-012/D-019; G2b re-run: 5 methods), pinned TEE program, contract-built signing preimage with a per-position derived key (D-003, D-016, F-338), oracle staleness/confidence/band checks (G5 sandbox tests), weekend guard that can only close. Pre-submission review (33 findings: 5 high, 8 medium, 20 low; D-027): highs and mediums fixed or disclosed as partial or open in SECURITY.md, not an audit. Slot-scoped nonces shown on chain: replay → `NonceUsed(14)` on the local fork (G13 re-run); fix tests recorded in 5083d30 (G11 re-run after D-027: every SR-1…SR-33 has a named test). Review 2 (2026-11-11; web app, SDK, copilot, reference agent, privacy claims): 12 findings, each fixed with a named test or disclosed in SECURITY.md "Review 2".
- `privacy`: quoter inputs encrypted for OutLayer's keystore, readable only by the pinned program (G4 addendum). Disclosed limits: operator-set demo parameters published in the docs, plaintext seen by OutLayer's `/secrets/pubkey` (F-167), and each fill's `disc_bps` with the public `vol_bps` reveals q·γ (request 15148: 159 bps at vol 150 → q·γ in [6.0e6, 6.67e6)). PROD path: MM-owned secrets, no plaintext step, coarser outputs. Copilot: answer shown only when signed by an attested NEAR AI TEE and bound to the question typed and the announced model, provenance not advice (G8 PASS fixture; binding test R2-03 in verify.test.ts); `/api/copilot` is same-origin only and rate-limited. The browser calls FastNEAR and Solana devnet RPC directly; they see IP and account.
- `agents`: an agent account opened a loan and paid 0.01 mock USDC for a Feed export through x402 on testnet (G14 PASS; re-run after D-027 PASS for the chain claims; the HTTP 402 → 200 leg verifier-run 2026-11-11T13:54Z, recorded in 2e16f9b). The reference agent now rebuilds and checks the MCP call before signing (R2-05; G14 re-run on HEAD with that agent PASS, recorded in a677689). The Feed MCP server is built and read-only, but no gate has run it with an agent client; say so if asked.
- `nfts`: Position Notes (NEP-171) are minted on testnet for every quote, position and Reserve deposit (EVIDENCE §G2b `nft_tokens`, §G14 `nft_mint p-4` and the re-run's `nft_mint` for position #13).
- `realworld`: **not proposed.** The real-world payout path (`pay_to`) is built and sandbox-tested but has no testnet run, and the collateral is a mock.

## Baseline disclosure (Q-002 / Q-005): not an API field; lives in README. DRAFT until H12
README "Prior work" text, unchanged: "Nectar Network (Kunal Drall) published research on exit-liquidity gaps for tokenized stocks
before the hackathon (Oct 2026 product brief; SCF #42 material). That research is the baseline. All code, contracts, programs,
services and sites in this repository were written during the hackathon window (from 2026-11-09)."
Q-015: if Kunal enters a second project, README must name it (H10).

## What the submit script must read (orchestrator wires it; agents: `--dry-run` only)
1. This file only, table "Payload fields": column 1 (API field) → column 2 (value). Ignore every other table.
2. `idea`: the text inside the ```text block under "### idea"; refuse if outside 20-2000 chars.
3. `tracks`: parse column 2 as a JSON array; refuse unknown ids or duplicates.
4. `requestId`: generate once, store in `~/.nectar/submission-request-id` (0600), reuse on retry; never write it into the repo.
5. `consent`: send boolean `true` only when column 2 is literally `true`; `size`: exact string from the allowed set.
6. Refuse (exit 2) if any value still contains `TODO-H`, if a `website` key appears, or if the body exceeds 12000 bytes.
7. Endpoint from docs/HACKATHON.md (`POST https://nearhackathon.com/api/applications`), as now.
Wired: `scripts/submit.sh` (dry run by default) calls `scripts/build-submission.mjs`, which reads this file's "Payload fields" table and the
`### idea` block. It exits 2 on a missing field, a `website` key, a body over 12,000 B, an `idea` outside 20–2000 characters or, in send
mode only, any `TODO-H`; it does not yet check track ids or duplicates (rule 3). The send flag is `--send` (H1 in docs/HUMAN_HANDOFF.md).

## Order of human steps (HACKATHON.md: send only once the repo is public and the post is up)
H10 + H14 (identity, payout account, consent) → H12 (prior work) → H2 (repo public) → H11 (video) → H3 (X post; its URL = `demoUrl`) →
G9 PASS from the public URL → H1 (Kunal sends).
G9 today: PASS from a local fresh clone (docs/EVIDENCE.md §G9 re-run, 2026-11-11, tested 0af5cdd, recorded in 89f83ee; the clone URL is TODO-H2,
so the verifier used the local path). The first run's FAIL (c5f6349) is superseded. A re-run from the public URL follows H2.
Pre-send checklist: G9 PASS (local clone: done, 89f83ee; public URL: after H2) · no `TODO-H` in the dry run · `gitleaks detect --log-opts=--all` clean · README "Live on testnet" table
matches EVIDENCE · tracks re-checked against the G9 MCP result.
