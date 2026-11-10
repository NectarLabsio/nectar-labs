# SUBMISSION.md — payload draft, never sent by an agent

Status: **DRAFT, 2026-11-10.** Fields follow "Submission API" in docs/HACKATHON.md (verified 2026-11-09; re-read the live
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
| `tracks` | `["defi","security","privacy"]` | see "Tracks" below; `agents` is added only per the rule there |
| `nearAddress` | `TODO-H14` | **mainnet** payout account, made by Kunal in his own wallet; never created or invented by an agent; must match the regex in HACKATHON.md |
| `projectUrl` | `TODO-H2` | public repo URL after H2; ≤ 300 chars; each repo is submitted once |
| `demoUrl` | `TODO-H3` | URL of the **public X demo post** (H3) carrying the video (H11). HACKATHON.md: send only once the repo is public and the post is up |
| `idea` | (block below) | 20-2000 chars |
| `consent` | `TODO-H14` | becomes `true` only after Kunal reads and agrees to: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." |

Never sent: `website`. It is a spam trap: any non-empty value rejects the submission (F-007). The builder must not emit that key,
and must not add any key outside the 11 above. Demo video `TODO-H11` is not an API field: it is attached to the X post (H3).

### idea
```text
Problem: lenders cap the LTV of tokenized stocks because DEX exit liquidity is revocable. Nectar Labs makes exit liquidity committed. Market makers escrow time-locked USDC quotes (Pappus) in a NEAR contract with a 7-day notice period. Borrowers get a higher limit (Cramér), B_c = min(LTV_c·V_c, (1−h_c)(Q_c+R_c+D_c)), and pay a limit premium that funds the buyers' commitment fees. Pre-liquidation sells collateral to the committed buyer at a bounded discount instead of on a DEX.

How NEAR fits: nectar-core (Rust, near-sdk 5.30.1) on NEAR testnet holds quotes, positions, the pool and an O(1) fee index (G1, G2 PASS). A hash-pinned OutLayer TEE program computes the settlement discount from encrypted market-maker inputs; the contract clamps it to the quote's cap and settles at the cap if the call fails (G4 PASS: request 15148 returned 159 bps against a 400 bps cap, demo inputs). The keeper holds a function-call key for two methods only. 1Click dry quotes give signed reference depth and are never deposited (G6 PASS). Chain Signatures: the contract builds the settlement message itself and v1.signer-prod.testnet signs the raw bytes with Ed25519; the signature verifies against the derived vault key (G7 PARTIAL: NEAR side verified, Solana devnet program not built). The NEAR AI copilot shows an answer only after TDX quote and signature checks (G8 PASS on a fixture; no live answer verified).

Disclosed: collateral and USDC are mock tokens; the price comes from an owner oracle (G5 FALLBACK; the Pyth path is built and tested, no live NVDA price); testnet only, no token, no mainnet. Evidence: docs/EVIDENCE.md.
```

Claim → evidence (docs/EVIDENCE.md gate table, quoted exactly):
| Claim in `idea` | Gate / test |
| --- | --- |
| contract, pool, quotes, fee index | G1 PASS (2026-11-09T20:43Z) · G2 PASS (20:55Z) |
| TEE discount 159 bps vs 400 cap, cap fallback | G4 PASS (22:10Z) + G4 addendum PASS (22:51Z): runs A/C fallback, run D request 15148 |
| two-method keeper key | D-010, D-012; G2 `view_access_key_list` |
| 1Click dry, never deposited | G6 PASS (22:58Z), Q-007 |
| oracle | G5 FALLBACK (disclosed) (22:55Z) |
| Chain Signatures NEAR side | G7 PARTIAL: NEAR side verified; Solana leg not built (23:57Z), position #6 |
| copilot | G8 PASS (fixture) (23:56Z) |
| web | G3 PASS (21:15Z), not claimed in `idea` |

## Tracks
`defi`, `security`, `privacy`: each backed by a gate.
- `defi` (lending): committed exit liquidity as a limit input; G1, G2, G4, G6.
- `security`: function-call keeper key (D-010/D-012), pinned TEE program, contract-built signing preimage (D-003, D-016), oracle staleness/confidence/band checks (G5 sandbox tests).
- `privacy`: market-maker inputs encrypted for the TEE (G4 addendum; disclosed: demo values, plaintext seen by OutLayer's `/secrets/pubkey`, F-167); copilot verification gate (G8 PASS fixture).
- `agents`: **not included today.** The Feed MCP server is built and runs locally, but no gate in EVIDENCE verifies it as working with an agent client (G6 only saw `get_exit_capacity` output; the `claude mcp add` syntax is still TODO-FACTS). Add `agents` only if the G9 record lists the MCP check as PASS (CLAUDE.md §1).

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
Gaps for the orchestrator: `scripts/build-submission.mjs`, called by the script, does not exist yet. The script reads README
sections (comment, line 6); it must not: `idea` comes from this file. The send flag is `--send`; docs/HUMAN_HANDOFF.md H1 is updated to match.

## Order of human steps (HACKATHON.md: send only once the repo is public and the post is up)
H10 + H14 (identity, payout account, consent) → H12 (prior work) → H2 (repo public) → H11 (video) → H3 (X post; its URL = `demoUrl`) →
G9 PASS from the public URL → H1 (Kunal sends).
Pre-send checklist: G9 PASS · no `TODO-H` in the dry run · `gitleaks detect --log-opts=--all` clean · README "Live on testnet" table
matches EVIDENCE · tracks re-checked against the G9 MCP result.
