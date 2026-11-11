---
title: Evidence
slug: /project/evidence
description: Gate log with commands, outputs and explorer links.
---
# Evidence

<p className="verified">Verified against: docs/EVIDENCE.md as of 2026-11-11 (summary table, incl. G2b re-run, G7 v7, G14, G3b re-run, G12, G13) · F-001, F-004 (2026-11-09) · D-026 (2026-11-10), D-027 (2026-11-11)</p>
<p className="status">Status on 2026-11-10: G0–G4, G6 PASS; G8 PASS (fixture); G5 FALLBACK (disclosed); v7: G1 (v7), G10, G11, G2b, G7 (v7), G14, G3b PASS; G12 + G13 PASS on a local fork of Base Sepolia (D-026); G9 pending. The 2026-11-11 re-runs after the security fix wave (D-027) are not yet in docs/EVIDENCE.md: verifier record pending. This page mirrors docs/EVIDENCE.md, which only the verifier writes. If the two ever differ, docs/EVIDENCE.md wins.</p>

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
| G7 | Solana devnet tx with Ed25519 verify and settle; signer response on NEAR | PASS (v7) 2026-11-10T16:52Z (91db9ea): release [5fTihnbJ…](https://explorer.solana.com/tx/5fTihnbJz5dPndVbHnwk54WoLxKCtz96HfYaPAveDSJ9jw51BNBJQ9mAbxAjWRWJB8EfsP4wrvhrJcmiFwaULLGv?cluster=devnet) and settle [3cdcQru2…](https://explorer.solana.com/tx/3cdcQru2WH6dbN9qvqLsKVz5CppVikHSYEgbJF8WLS6DRwzECncHSM3f5ABSJXZ4EWSZoKSfhFFRwePgihL7pWJ6?cluster=devnet) on devnet, each with an Ed25519 verify of the NEAR-signed message; supersedes PARTIAL 2026-11-09T23:57Z (97382fd, NEAR side only) | docs/EVIDENCE.md §G7 |
| G8 | copilot verifier green (fixture at minimum) | PASS (fixture) 2026-11-09T23:56Z (df4706f); no live NEAR AI answer (key H7) | docs/EVIDENCE.md §G8 |
| G10 | v7 facts and toolchain | PASS with open items (F-351, F-352, F-353) 2026-11-10T13:44Z (09c4316) | docs/EVIDENCE.md §G10 |
| G11 | v7 contract tests, gas rows, `model.csv --v7` | PASS with open item F-352 2026-11-10T16:12Z (53f1e63) | docs/EVIDENCE.md §G11 |
| G2b | `nectar-core-v2` testnet deploy; views answer; `pnpm verify` green | PASS 2026-11-10T16:52Z (91db9ea); code_hash `3W5bif…31ey` rebuilt byte for byte | docs/EVIDENCE.md §G2b |
| G14 | x402 paid call on testnet | PASS 2026-11-10T16:52Z: relay tx [5VL1P4kg…](https://testnet.nearblocks.io/txns/5VL1P4kgWAA6GVDjsuZSyWXx3GhKiBfznhLXwdGtHEyx), agent borrow tx [GcHF75nW…](https://testnet.nearblocks.io/txns/GcHF75nWhNi1kVnQr5tZWFH1W4gA1LvQdGhH3NxH15mt) | docs/EVIDENCE.md §G14 |
| G3b | web E2E against `nectar-core-v2` | PASS 2026-11-10T17:48Z (0ed567f): 244 passed / 0 failed; accessibility 100 on 10 routes × 2 themes | docs/EVIDENCE.md §G3b |
| G12 | Base toolchain and collateral | PASS 2026-11-10T18:04Z (7bface5), **local fork of Base Sepolia, not Base Sepolia** (D-026) | docs/EVIDENCE.md §G12 |
| G13 | Base round trip | PASS 2026-11-10T18:05Z (7bface5), **local fork**: release and settle, replay reverts `NonceUsed` | docs/EVIDENCE.md §G13 |
| G9 | fresh-clone README rehearsal under 15 min; no secrets in history | pending | — |

## After the security fix wave (2026-11-11): verifier record pending

On 2026-11-11 a pre-submission security review led to a fix wave (D-027): nectar-core-v2 `2.2.1-v7`, Solana vault v2, mock tokens upgraded, and the EVM vault redeployed on the local fork. Agent re-runs exist, but docs/EVIDENCE.md does not record them yet:

| Run | What it shows | Evidence |
| --- | --- | --- |
| G7 re-run | positions 8–10 on 2.2.1-v7 + vault v2: refused-loan release, funded release, settle, each followed by the depositor's `withdraw` | evidence/G7/rerun/summary.md |
| G13 re-run | positions 11 (release) and 12 (settle) on the redeployed fork vault; replay reverts `NonceUsed(14)` | evidence/G13/rerun/summary.md |
| G14 re-run | borrow tx [HvFX6YRa…](https://testnet.nearblocks.io/txns/HvFX6YRaY64YWss7KBQSpucM1vnVUtHFraQvqjGs6Q1V), 402, paid relay tx [BemztvL9…](https://testnet.nearblocks.io/txns/BemztvL9jzTCm5wzbA8tD7Kj3q7qKEe9fJTLA8Zsn35G), 200 | evidence/G14/rerun/summary.md |
| G11 / G2b on 2.2.1-v7 | contract tests and testnet views | not run yet |

What was fixed and what remains: [Audits](/security/audits).

## Block format

Each run adds one block to `docs/EVIDENCE.md`, newest first within a gate. A block holds the command, at most 40 lines of trimmed output, the explorer links (each opened once by the verifier), the views read, and notes such as a faucet retry.

Rows change from "pending" to PASS or FAIL only when the verifier writes them. This page is regenerated from that file at each gate.
