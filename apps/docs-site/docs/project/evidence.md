---
title: Evidence
slug: /project/evidence
description: Gate log with commands, outputs and explorer links.
---
# Evidence

<p className="verified">Verified against: docs/EVIDENCE.md as of 2026-11-10 (summary table) · F-001, F-004 (2026-11-09)</p>
<p className="status">Status on 2026-11-10: G0–G4, G6 PASS; G8 PASS (fixture); G5 FALLBACK (disclosed); G7 PARTIAL; G9 pending. This page mirrors docs/EVIDENCE.md, which only the verifier writes. If the two ever differ, docs/EVIDENCE.md wins.</p>

Nectar Labs is being built for the NEAR Hackathon (development closes 2026-11-14 23:59 UTC, F-001). Reviewers and their agents check that the repository runs and does what the README says (F-004). This page is where that claim is backed. Each gate is run by a separate verifier from a fresh clone with no secrets.

| Gate | What it proves | Status | Evidence |
| --- | --- | --- | --- |
| G0 | toolchain installed; exact CLI grammar in FACTS | PASS 2026-11-09T23:09Z (b3a9090) | docs/EVIDENCE.md §G0 |
| G1 | contract unit and sandbox tests; `model.csv` match | PASS 2026-11-09T20:43Z (b721641) | docs/EVIDENCE.md §G1 |
| G2 | testnet deploy; views answer; explorer links | PASS 2026-11-09T20:55Z (5f27f44) | docs/EVIDENCE.md §G2 |
| G3 | web E2E; accessibility ≥ 90; both themes; phone | PASS 2026-11-09T21:15Z (176914f) | docs/EVIDENCE.md §G3 |
| G4 | OutLayer execution attested; cost recorded; fallback tested | PASS 2026-11-09T22:10Z (d87eef6) | docs/EVIDENCE.md §G4 |
| G5 | oracle live price; staleness and confidence rejection tested | FALLBACK (disclosed): owner oracle; live Pyth waits on H13 | docs/EVIDENCE.md §G5 |
| G6 | 1Click dry quote verified | PASS 2026-11-09T22:58Z (fea52b7) | docs/EVIDENCE.md §G6 |
| G7 | Solana devnet tx with Ed25519 verify and settle; signer response on NEAR | PARTIAL 2026-11-09T23:57Z (97382fd): signer response on NEAR verified ([tx FCtApD2L…MHhe](https://testnet.nearblocks.io/txns/FCtApD2LMyPh9hEznyMuCrccvTHWqAhNH2eJ17agMHhe)); Solana leg not built (H-TOOLCHAIN-SOLANA) | docs/EVIDENCE.md §G7 |
| G8 | copilot verifier green (fixture at minimum) | PASS (fixture) 2026-11-09T23:56Z (df4706f); no live NEAR AI answer (key H7) | docs/EVIDENCE.md §G8 |
| G9 | fresh-clone README rehearsal under 15 min; no secrets in history | pending | — |

## Block format

Each run adds one block to `docs/EVIDENCE.md`, newest first within a gate. A block holds the command, at most 40 lines of trimmed output, the explorer links (each opened once by the verifier), the views read, and notes such as a faucet retry.

Rows change from "pending" to PASS or FAIL only when the verifier writes them. This page is regenerated from that file at each gate.
