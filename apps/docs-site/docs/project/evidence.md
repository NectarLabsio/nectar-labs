---
title: Evidence
slug: /project/evidence
description: Gate log with commands, outputs and explorer links.
---
# Evidence

<p className="verified">Verified against: docs/EVIDENCE.md as of 2026-11-11 (summary table, incl. the re-runs after D-027 recorded in commits b8784c1 and 5083d30) · F-001, F-004 (2026-11-09) · D-026 (2026-11-10), D-027 (2026-11-11)</p>
<p className="status">Status on 2026-11-11: G0–G4, G6 PASS; G8 PASS (fixture); G5 FALLBACK (disclosed); v7: G1 (v7) PASS, G10 PASS with open items, G12 PASS on a local fork of Base Sepolia (D-026). After the security fix wave (D-027) the verifier re-ran G11, G2b, G7, G14 (chain claims) and G3b on contract 2.2.1-v7, and G13 on the local fork: all PASS. G9 pending. This page mirrors docs/EVIDENCE.md, which only the verifier writes. If the two ever differ, docs/EVIDENCE.md wins.</p>

Nectar Labs is being built for the NEAR Hackathon (development closes 2026-11-14 23:59 UTC, F-001). Reviewers and their agents check that the repository runs and does what the README says (F-004). This page is where that claim is backed. Each gate is run by a separate verifier from a fresh clone with no secrets.

| Gate | What it proves | Status | Evidence |
| --- | --- | --- | --- |
| G0 | toolchain installed; exact CLI grammar in FACTS | PASS 2026-11-09T23:09Z (b3a9090) | docs/EVIDENCE.md §G0 |
| G1 | contract unit and sandbox tests; `model.csv` match | PASS 2026-11-09T20:43Z (b721641) | docs/EVIDENCE.md §G1 |
| G1 (v7) | v7 contract additions: unit, sandbox, `model.csv` | PASS 2026-11-10T14:05Z (09c4316) | docs/EVIDENCE.md §G1 |
| G2 | testnet deploy; views answer; explorer links | PASS 2026-11-09T20:55Z (5f27f44) | docs/EVIDENCE.md §G2 |
| G3 | web E2E; accessibility ≥ 90; both themes; phone | PASS 2026-11-09T21:15Z (176914f) | docs/EVIDENCE.md §G3 |
| G4 | OutLayer execution attested; cost recorded; fallback tested | PASS 2026-11-09T22:10Z (d87eef6) | docs/EVIDENCE.md §G4 |
| G5 | oracle live price; staleness and confidence rejection tested | FALLBACK (disclosed): owner oracle; live Pyth waits on H13 | docs/EVIDENCE.md §G5 |
| G6 | 1Click dry quote verified | PASS 2026-11-09T22:58Z (fea52b7) | docs/EVIDENCE.md §G6 |
| G7 | Solana devnet tx with Ed25519 verify and settle; signer response on NEAR | PASS (re-run after D-027) 2026-11-11T08:25Z (tested 3ab3026, recorded in b8784c1): positions 8–10 on 2.2.1-v7 + vault v2, three finalized devnet txs with the Ed25519 verify at ix0, the depositor's `withdraw` after each. Earlier PASS (v7) 2026-11-10T16:52Z (91db9ea) on the v1 layout: release [5fTihnbJ…](https://explorer.solana.com/tx/5fTihnbJz5dPndVbHnwk54WoLxKCtz96HfYaPAveDSJ9jw51BNBJQ9mAbxAjWRWJB8EfsP4wrvhrJcmiFwaULLGv?cluster=devnet) and settle [3cdcQru2…](https://explorer.solana.com/tx/3cdcQru2WH6dbN9qvqLsKVz5CppVikHSYEgbJF8WLS6DRwzECncHSM3f5ABSJXZ4EWSZoKSfhFFRwePgihL7pWJ6?cluster=devnet); supersedes PARTIAL 2026-11-09T23:57Z (97382fd, NEAR side only) | docs/EVIDENCE.md §G7 |
| G8 | copilot verifier green (fixture at minimum) | PASS (fixture) 2026-11-09T23:56Z (df4706f); no live NEAR AI answer (key H7) | docs/EVIDENCE.md §G8 |
| G10 | v7 facts and toolchain | PASS with open items (F-351, F-352, F-353) 2026-11-10T13:44Z (09c4316) | docs/EVIDENCE.md §G10 |
| G11 | v7 contract tests, gas rows, `model.csv --v7` | PASS (re-run after D-027) 2026-11-11T08:20Z (tested 3ab3026, recorded in 5083d30): 608 unit + 50 sandbox, mock-ft 23, `model.csv` 132 rows, max receipt 67.69 Tgas. The check that every method has a gas row was not run on 2.2.1 (verifier record pending). Earlier PASS with open item F-352 2026-11-10T16:12Z (53f1e63) | docs/EVIDENCE.md §G11 |
| G2b | `nectar-core-v2` testnet deploy; views answer; `pnpm verify` green | PASS (re-run after D-027) 2026-11-11T08:25Z (tested 3ab3026, recorded in b8784c1): `contract_version` 2.2.1-v7; the 2.2.1-v7 wasm rebuilt from a fresh clone with `cargo near build non-reproducible-wasm` matched the deployed code hash (3mv4LRm6…) on the verifier's machine; it is not the Docker reproducible build. `pnpm verify` was not part of this re-run. Earlier PASS 2026-11-10T16:52Z (91db9ea) on 2.0.0-v7 | docs/EVIDENCE.md §G2b |
| G14 | x402 paid call on testnet | PASS for the chain claims (re-run after D-027) 2026-11-11T08:25Z (tested 3ab3026, recorded in b8784c1): borrow tx [HvFX6YRa…](https://testnet.nearblocks.io/txns/HvFX6YRaY64YWss7KBQSpucM1vnVUtHFraQvqjGs6Q1V) (position #13), relay tx [BemztvL9…](https://testnet.nearblocks.io/txns/BemztvL9jzTCm5wzbA8tD7Kj3q7qKEe9fJTLA8Zsn35G). Earlier PASS 2026-11-10T16:52Z: relay tx [5VL1P4kg…](https://testnet.nearblocks.io/txns/5VL1P4kgWAA6GVDjsuZSyWXx3GhKiBfznhLXwdGtHEyx), agent borrow tx [GcHF75nW…](https://testnet.nearblocks.io/txns/GcHF75nWhNi1kVnQr5tZWFH1W4gA1LvQdGhH3NxH15mt) | docs/EVIDENCE.md §G14 |
| G3b | web E2E against `nectar-core-v2` | PASS (re-run after D-027 and the design port) 2026-11-11T08:24Z (tested 3ab3026, recorded in 5083d30): 392 passed / 0 failed / 82 skipped; accessibility ≥ 90 on all 22 route/theme pairs (home light 97); no horizontal scroll at 400 px. Earlier PASS 2026-11-10T17:48Z (0ed567f) | docs/EVIDENCE.md §G3b |
| G12 | Base toolchain and collateral | PASS 2026-11-10T18:04Z (7bface5), **local fork of Base Sepolia, not Base Sepolia** (D-026) | docs/EVIDENCE.md §G12 |
| G13 | Base round trip | PASS (re-run after D-027) 2026-11-11T08:25Z (tested 3ab3026, recorded in b8784c1), **local fork**: release and settle on the redeployed vault, replays revert `NonceUsed`. Earlier PASS 2026-11-10T18:05Z (7bface5) | docs/EVIDENCE.md §G13 |
| G9 | fresh-clone README rehearsal under 15 min; no secrets in history | pending | — |

## After the security fix wave (2026-11-11)

On 2026-11-11 a pre-submission security review led to a fix wave (D-027): nectar-core-v2 `2.2.1-v7`, Solana vault v2, mock tokens upgraded, and the EVM vault redeployed on the local fork. The verifier then re-ran the gates on that stack from fresh clones of commit 3ab3026 and recorded them in docs/EVIDENCE.md:

| Run | What the verifier checked | Recorded |
| --- | --- | --- |
| G2b re-run | `contract_version` 2.2.1-v7; rebuilt code hash equals the deployed one (3mv4LRm6…); keeper-v2 has one function-call key for 5 methods; the views answer | §G2b, commit b8784c1 |
| G7 re-run | positions 8–10: stored authorities equal the live derived key (domain 1); deposits confirmed with `source: outlayer`; 8 refused by the aggregate limit and released, 9 released, 10 settled (+2.386856 NVDAx to the buyer); Ed25519 verify at ix0 of each devnet tx; the depositor's withdrawals; PDAs closed | §G7, commit b8784c1 |
| G13 re-run | positions 11 (release) and 12 (settle) on the redeployed fork vault; on-chain digest equals the NEAR digest, `ecrecover` equals the authority; replays revert `NonceUsed(10)` / `NonceUsed(14)` | §G13, commit b8784c1 |
| G14 re-run | borrow tx [HvFX6YRa…](https://testnet.nearblocks.io/txns/HvFX6YRaY64YWss7KBQSpucM1vnVUtHFraQvqjGs6Q1V) (position #13, $10) and relay tx [BemztvL9…](https://testnet.nearblocks.io/txns/BemztvL9jzTCm5wzbA8tD7Kj3q7qKEe9fJTLA8Zsn35G) (agent1's delegate paying 0.01 mock USDC to `nectar.testnet`) | §G14, commit b8784c1 |
| G11 re-run | 608 unit + 50 sandbox, mock-ft 23, `model.csv` 132 rows, max receipt 67.69 Tgas; every SR-1…SR-33 has a named test and 124 contract `sr*` tests pass; Solana 10 cargo + 55 TS; forge 105 pass / 3 skip; keeper 293, x402 17, feed 63, sdk 178 | §G11, commit 5083d30 |
| G3b re-run | e2e 392 pass / 82 skip; accessibility ≥ 90 on 22 route/theme pairs; no horizontal scroll at 400 px. The vault v2 screens (withdraw, claim, Re-sign settlement, claim owed collateral) passed their **mocked** E2E tests in `e2e/remote.spec.ts` on desktop and phone. Only screenshot capture was not run: `remote screenshots` (`REMOTE_SCREENS` unset, 14 per project) and the notes screenshots (`NOTES_SCREENS` unset) | §G3b, commit 5083d30 |

Not re-run by the verifier (verifier record pending):

- the G14 HTTP step (unpaid call → 402, paid call → 200). It rests on the orchestrator log in evidence/G14/rerun/.
- the G1 check that every contract method has a gas row, on 2.2.1. Only the 100 Tgas ceiling was checked.

What was fixed and what remains: [Audits](/security/audits).

## Block format

Each run adds one block to `docs/EVIDENCE.md`, newest first within a gate. A block holds the command, at most 40 lines of trimmed output, the explorer links (each opened once by the verifier), the views read, and notes such as a faucet retry.

Rows change from "pending" to PASS or FAIL only when the verifier writes them. This page is regenerated from that file at each gate.
