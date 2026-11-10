---
title: Evidence
slug: /project/evidence
description: Gate log with commands, outputs and explorer links.
---
# Evidence

<p className="verified">Verified against: docs/EVIDENCE.md as of 2026-11-10T16:52Z (summary table, incl. G2b re-run, G7 v7, G14) · F-001, F-004 (2026-11-09)</p>
<p className="status">Status on 2026-11-10: G0–G4, G6 PASS; G8 PASS (fixture); G5 FALLBACK (disclosed); v7: G1 (v7), G10, G11, G2b, G7 (v7), G14 PASS; G9 pending. This page mirrors docs/EVIDENCE.md, which only the verifier writes. If the two ever differ, docs/EVIDENCE.md wins.</p>

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
| G9 | fresh-clone README rehearsal under 15 min; no secrets in history | pending | — |

## Block format

Each run adds one block to `docs/EVIDENCE.md`, newest first within a gate. A block holds the command, at most 40 lines of trimmed output, the explorer links (each opened once by the verifier), the views read, and notes such as a faucet retry.

Rows change from "pending" to PASS or FAIL only when the verifier writes them. This page is regenerated from that file at each gate.
