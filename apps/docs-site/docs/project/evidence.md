---
title: Evidence
slug: /project/evidence
description: Gate log with commands, outputs and explorer links.
---
# Evidence

<p className="verified">Verified against: docs/EVIDENCE.md as of 2026-11-10 (all gates pending) · F-001, F-004 (2026-11-09)</p>
<p className="status">Status on 2026-11-10: no gate has passed. This page mirrors docs/EVIDENCE.md, which only the verifier writes. If the two ever differ, docs/EVIDENCE.md wins.</p>

Nectar Labs is being built for the NEAR Hackathon (development closes 2026-11-14 23:59 UTC, F-001). Reviewers and their agents check that the repository runs and does what the README says (F-004). This page is where that claim is backed. Each gate is run by a separate verifier from a fresh clone with no secrets.

| Gate | What it proves | Status | Evidence |
| --- | --- | --- | --- |
| G0 | toolchain installed; exact CLI grammar in FACTS | pending | — |
| G1 | contract unit and sandbox tests; `model.csv` match | pending | — |
| G2 | testnet deploy; views answer; explorer links | pending | — |
| G3 | web E2E; accessibility ≥ 90; both themes; phone | pending | — |
| G4 | OutLayer execution attested; cost recorded; fallback tested | pending | — |
| G5 | oracle live price; staleness and confidence rejection tested | FALLBACK (disclosed): owner oracle; live Pyth waits on H13 | docs/EVIDENCE.md §G5 |
| G6 | 1Click dry quote verified | PASS 2026-11-09T22:58Z (fea52b7) | docs/EVIDENCE.md §G6 |
| G7 | Solana devnet tx with Ed25519 verify and settle; signer response on NEAR | pending | — |
| G8 | copilot verifier green (fixture at minimum) | pending | — |
| G9 | fresh-clone README rehearsal under 15 min; no secrets in history | pending | — |

## Block format

Each run adds one block to `docs/EVIDENCE.md`, newest first within a gate. A block holds the command, at most 40 lines of trimmed output, the explorer links (each opened once by the verifier), the views read, and notes such as a faucet retry.

Rows change from "pending" to PASS or FAIL only when the verifier writes them. This page is regenerated from that file at each gate.
