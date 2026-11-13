# SUBMISSION.md — payload draft, never sent by an agent

Status: **DRAFT until Kunal sends, 2026-11-13** (`idea` re-checked for WO-92 against the final README; every claim backed by docs/EVIDENCE.md or a tx checked on testnet RPC, last on 2026-11-13T20:12Z, see the table under the idea). Fields follow "Submission API" in docs/process/hackathon.md (verified 2026-11-09; re-read the published
https://nearhackathon.com/HACKATHON.md on Nov 14 before sending, F-001). Only Kunal sends it (H1). Agents run the submit
script with `--dry-run` only. The JSON payload holds personal data (name, email, payout account), so it is printed, never committed.

## Payload fields (exactly these 11; the builder reads this table)
Format the builder relies on: one row per API field, column 1 = API field name in backticks, column 2 = value in backticks
(or `TODO-H<n>`), column 3 = source. Values in column 2 are sent verbatim. `idea` is read from the fenced block below.

| API field | Value | Source / rule (HACKATHON.md "Submission API") |
| --- | --- | --- |
| `requestId` | `GENERATE-ONCE` | UUID made once by the builder at the first `--send` (`node -e 'console.log(crypto.randomUUID())'`), stored in `~/.nectar/submission-request-id` (0600, outside the repo), reused on every retry |
| `projectName` | `Nectar Labs` | README title; 2-80 chars |
| `leadName` | `Kunal` | Kunal's H10 reply, 2026-11-13: `lead: Kunal`, and "Use "Kunal" with no surname everywhere"; 2-80 chars |
| `email` | `kunal@nectarnetwork.fun` | Kunal's H10 reply, 2026-11-13: `email: kunal@nectarnetwork.fun` (≤ 160 chars, ≤ 2 submissions per email, Q-015; used once: Nectar Labs is the only project) |
| `size` | `1` | Kunal's H10 reply, 2026-11-13: `size: 1`; one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+`, exactly as written |
| `tracks` | `["defi","security","agents"]` | Kunal's H16 reply in session, 2026-11-11: "H16 defi security agents" (D-028). `privacy` dropped by Kunal; `nfts` not entered (H16 closed 2026-11-12, see "Tracks" below) |
| `nearAddress` | `kunal-drall.near` | Kunal's H14 reply, 2026-11-13: account `kunal-drall.near`, consent yes. **Mainnet** payout account in Kunal's own wallet, not created by an agent; matches the regex in HACKATHON.md (line 155) |
| `projectUrl` | `https://github.com/NectarLabsio/nectar-labs` | public repo; Kunal pushed main 2026-11-13 (H2); ≤ 300 chars; each repo is submitted once |
| `demoUrl` | `TODO-H3` | URL of the **public X demo post** (H3) carrying the video (H11). HACKATHON.md: send only once the repo is public and the post is up |
| `idea` | (block below) | 20-2000 chars |
| `consent` | `true` | Kunal's H14 reply, 2026-11-13: `consent yes`, his agreement to: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." |

Never sent: `website`. It is a spam trap: any non-empty value rejects the submission (F-007). The builder must not emit that key,
and must not add any key outside the 11 above. Demo video `TODO-H11` is not an API field: it is attached to the X post (H3).

### idea
```text
Problem: lenders cap loans against tokenized stocks because the DEX liquidity they would sell into can disappear, most of all when the stock market is closed. Without a buyer they can count on, they set a low limit or sell early.

What Nectar Labs does: market makers escrow time-locked USDC buy quotes in a NEAR contract. A borrower's limit rests on those quotes, B_c = min(LTV_c·V_c, (1−h_c)(Q_c+R_c+D_c)), and the borrower pays a limit premium on the capacity above the static limit; 70% of it goes to the committed buyers, shared with the Reserve pro rata. If a loan turns unhealthy, its collateral goes to the committed buyer at a capped discount instead of a DEX.

NEAR's role: (1) nectar-core-v2 (Rust, near-sdk 5.30.1) escrows the quotes, takes deposits through NEP-141 ft_transfer_call and enforces each loan's limit and a shared capacity per asset. (2) Every quote and loan is an NEP-171 Note; transferring it moves the loan's rights. (3) Agents pay for data over x402 with NEP-366 signed delegate actions, and our price bot's key can call only update_owner_price. (4) A keeper with a function-call key triggers pre-liquidation; a hash-pinned OutLayer TEE program prices the discount under the quote's cap, and Chain Signatures signs each release or settlement for collateral in a Solana devnet vault, which checks the Ed25519 signature before it pays.

Real vs mock: NEAR testnet and Solana devnet only. The collateral (NVDAx) and USDC are mock tokens, the market makers are our demo accounts, the price is an owner oracle, the Base leg ran on a local fork of Base Sepolia, and 1Click quotes are read-only. No token, no mainnet, not audited (SECURITY.md lists what is open).

Try it: https://testnet.nectarlabs.io ("Get test assets" on /borrow). From a clone, pnpm i && pnpm demo:testnet reads the testnet contract over public RPC. Every claim links a testnet tx or a test in the README; gate logs are in docs/EVIDENCE.md.
```

Claim → evidence (docs/EVIDENCE.md gate table as of a677689, quoted exactly; "re-run after D-027" rows are 2026-11-11T08:02Z–08:25Z, clone 3ab3026; the G14 402 → 200 and first G1 2.2.1 gas-row rows are 2026-11-11T13:52Z–14:18Z, clone 45ed1f3; the G14-on-HEAD and G1 re-check rows are 15:01Z–15:25Z, clone 48b5c5a):
| Claim in `idea` | Gate / test |
| --- | --- |
| escrowed quotes back the limit; shared capacity per asset | view `get_exit_capacity {"symbol":"NVDAx"}` at block 277557669 (2026-11-13T20:13:44Z): q $16,119.22, r $10, d 0, haircut 1000 bps, capacity $14,516.298, total debt $9,559.00, headroom $4,957.298; refusal tx 9ykovXkm… (`remote_loan_refused {reason: aggregate_limit}`, G7 re-run chain.log; RPC SuccessValue 2026-11-13) |
| limit premium; 70% to the committed buyers, shared with the Reserve pro rata | contracts/nectar-core/src/lib.rs:803-817 (premium on the borrow above the static limit at `limit_premium_bps`, or the Shield fee; `split_premium_qr` splits the buyers' share Q_c : R_c between the quotes' and the Reserve's fee indices); `get_config` fee_split buyers_bps 7000, lenders_bps 2000, treasury_bps 1000 at block 277558471 (2026-11-13T20:21Z) |
| NEP-141 deposits | E2suM2LC… agent1 → nvdax-mock `ft_transfer_call` → position #15 (G14 re-run on HEAD; RPC SuccessValue 2026-11-13; `get_position 15` Open, 1 NVDAx, $10) |
| NEP-171 Note; transfer moves the loan's rights | GcHF75nW… emits `nep171 nft_mint p-4` (RPC 2026-11-13); tests `v7_notes_self_settle_by_new_loan_owner`, `v7_notes_self_settle_old_owner_refused`, `v7_notes_residual_collateral_goes_to_loan_note_owner` (contracts/nectar-core/src/tests_notes.rs); remote release goes to the depositor (SECURITY.md "What remains" item 12) |
| x402 with NEP-366 signed delegate actions | 6karZo8L… (2026-11-13T19:41:06Z, action `Delegate` agent1 → usdc-mock `ft_transfer`, signer x402-relayer; RPC SuccessValue 2026-11-13T20:12Z; 402 → 200 with 168 CSV rows in docs/media/screens/06-agent-402-200.png; borrow DTtVhTnS… opened position #20) · 8bXCY34S… (2026-11-13T12:28Z, action `Delegate`, signer x402-relayer, receiver agent1; RPC SuccessValue; orchestrator run, RPC-checked in G9 run 9) · verifier-run 4vW2tPF5… (G14) |
| price bot's key can call only update_owner_price | AddKey tx BHopF1cu… (RPC SuccessValue 2026-11-13); `view_access_key_list nectar.testnet` 2026-11-13: FunctionCall, method_names [update_owner_price], receiver nectar-core-v2; first refresh De6aVqqN… (G9 run 9) |
| market makers are our demo accounts | README "What is real, what is mock"; quoter inputs operator-set (G4, G7; docs-site Quoter (TEE), Honest limits) |
| how to try | https://testnet.nectarlabs.io answered 200 on 2026-11-13 ~18:31Z; production acceptance PASS 5/5 on c9fd56b (EVIDENCE §"WO-34 production (web + docs c9fd56b, WO-85/86 brand)"); `pnpm demo:testnet` 4 s in G9 run 8 (public URL) |
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
| pre-submission review, SECURITY.md | not a gate: D-027, SECURITY.md, docs/process/work/security-review-v7.md. Fix tests recorded in 5083d30 (G11 re-run after D-027): every SR-1…SR-33 has a named test, 124 contract sr* tests, Solana 10 cargo + 55 TS, forge 105 pass / 3 skip |
| runs repeated on the fixed contract | G7, G13 (local fork) and G14 re-run after D-027 rows above |
| web | G3b web E2E (re-run after D-027 + design port) PASS (2026-11-11T08:24Z, recorded in 5083d30; mocked remote and Notes E2E passed, screenshot capture not run). G3b re-run 2 after the review 2 web fixes and WO-49 (clone fd6592d, recorded in 5770fa7) PASS: e2e 404 / 0 / 88 skipped, screens.spec 76/76, LH 28/28 = 100, headers present, `pnpm verify` green; re-run 1 (3107a1a) had failed on screenshot tests only, fixed in WO-49; not claimed in `idea` |

## Tracks — H16 (Kunal decided 2026-11-11, D-028)
Entered: `defi`, `security`, `agents` (Kunal, in session: "H16 defi security agents (I'll decide nfts after item 3)"). `nfts`: not entered (H16 closed 2026-11-12, reason below). Not entered: `privacy` (dropped by Kunal, 2026-11-11) and `realworld`. Each entered track is backed by a gate.
- `defi` (lending): committed exit liquidity as a limit input; G1, G2, G2b (re-run after D-027, 2.2.1-v7), G4, G6, G7 (re-run after D-027).
- `security`: function-call keeper key (D-010/D-012/D-019; G2b re-run: 5 methods), pinned TEE program, contract-built signing preimage with a per-position derived key (D-003, D-016, F-338), oracle staleness/confidence/band checks (G5 sandbox tests), weekend guard that can only close. Pre-submission review (33 findings: 5 high, 8 medium, 20 low; D-027): highs and mediums fixed or disclosed as partial or open in SECURITY.md, not an audit. Slot-scoped nonces shown on chain: replay → `NonceUsed(14)` on the local fork (G13 re-run); fix tests recorded in 5083d30 (G11 re-run after D-027: every SR-1…SR-33 has a named test). Review 2 (2026-11-11; web app, SDK, copilot, reference agent, privacy claims): 12 findings, each fixed with a named test or disclosed in SECURITY.md "Review 2". Known limitations kept by decision or design are listed in SECURITY.md "What remains": FACTS C-020 (item 11, D-029) and the remote Loan Note release (item 12).
- `agents`: an agent account opened a loan and paid 0.01 mock USDC for a Feed export through x402 on testnet (G14 PASS; re-run after D-027 PASS for the chain claims; the HTTP 402 → 200 leg verifier-run 2026-11-11T13:54Z, recorded in 2e16f9b). The reference agent now rebuilds and checks the MCP call before signing (R2-05; G14 re-run on HEAD with that agent PASS, recorded in a677689). The Feed MCP server is built and read-only, but no gate has run it with an agent client; say so if asked.
- `nfts`: **not entered** (H16 closed 2026-11-12). Kunal's condition for `nfts` (a `move_note` test asserting the new owner can repay and close and the old owner cannot) does not hold by design: repay is permissionless (contracts/nectar-core/src/tests_notes.rs `v7_notes_residual_collateral_goes_to_loan_note_owner`: a stranger repays, the residual collateral goes to the new owner); self-settle follows the Note (`v7_notes_self_settle_by_new_loan_owner`) and the old owner is refused (`v7_notes_self_settle_old_owner_refused`). Position Notes (NEP-171) stay a product feature (EVIDENCE §G2b `nft_tokens`, §G14 `nft_mint p-4`).
- `privacy`: **not entered** (Kunal, 2026-11-11). The privacy-relevant facts and their limits (quoter inputs, RPC providers, analytics) stay as disclosures in README "Security" and SECURITY.md R2-02, not as a pitch.
- `realworld`: **not entered.** The real-world payout path (`pay_to`) is built and sandbox-tested but has no testnet run, and the collateral is a mock.

## Baseline disclosure (Q-002 / Q-005): not an API field; lives in README. Approved by Kunal (H12, 2026-11-13)
README "Prior work" text, Kunal's edited wording, verbatim: "Before the hackathon, Kunal researched exit-liquidity gaps for tokenized stocks under Nectar Network (an October 2026 product brief and
Stellar Community Fund #42 material). That research and the Nectar brand assets (logo, colour tokens) are the baseline. Nectar Network's separate Stellar testnet
product shares no code with this repository. All code, contracts, programs, services and sites here were written during the hackathon window, starting 2026-11-09."
Q-015: Nectar Labs is Kunal's only project in this hackathon (Kunal, 2026-11-13: "this is the only project, no other project"; his H10
`projects: 1` meant one project in total). Q-015 satisfied: 1 project per person (limit 2); email used once. README names no other project.

## What the submit script must read (orchestrator wires it; agents: `--dry-run` only)
1. This file only, table "Payload fields": column 1 (API field) → column 2 (value). Ignore every other table.
2. `idea`: the text inside the ```text block under "### idea"; refuse if outside 20-2000 chars.
3. `tracks`: parse column 2 as a JSON array; refuse unknown ids or duplicates.
4. `requestId`: generate once, store in `~/.nectar/submission-request-id` (0600), reuse on retry; never write it into the repo.
5. `consent`: send boolean `true` only when column 2 is literally `true`; `size`: exact string from the allowed set.
6. Refuse (exit 2) if any value still contains `TODO-H`, if a `website` key appears, or if the body exceeds 12000 bytes.
7. Endpoint from docs/process/hackathon.md (`POST https://nearhackathon.com/api/applications`), as now.
Wired: `scripts/submit.sh` (dry run by default) calls `scripts/build-submission.mjs`, which reads this file's "Payload fields" table and the
`### idea` block. It exits 2 on a missing field, a `website` key, a body over 12,000 B, an `idea` outside 20–2000 characters or, in send
mode only, any `TODO-H`; it does not yet check track ids or duplicates (rule 3). The send flag is `--send` (H1 in docs/process/human-handoff.md).

## Order of human steps (HACKATHON.md: send only once the repo is public and the post is up)
H10 + H14 (identity, payout account, consent; done 2026-11-13) → H12 (prior work; approved 2026-11-13) → H2 (repo public) → H11 (video) → H3 (X post; its URL = `demoUrl`) →
G9 PASS from the public URL → H1 (Kunal sends).
G9 today: run 9b PASS (2026-11-13T14:27Z–14:33Z, 0904aec; step-4 re-check that resolves run 9) and run 8 PASS from the public GitHub URL (2026-11-13T13:44Z–13:52Z, b6d6f41); docs/EVIDENCE.md §G9. The README was restructured after those runs (WO-89, then WO-92), so the next G9 run re-checks its claims.
Pre-send checklist: G9 PASS on the current README (runs 8 + 9b passed on the earlier text; re-run after WO-92) · no `TODO-H` in the dry run · `gitleaks detect --log-opts=--all` clean · README "What we set out to prove" table matches EVIDENCE and RPC · tracks re-checked against the G9 MCP result.
