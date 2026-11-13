# WO-70 — docs — README/DEMO_SCRIPT/HUMAN_HANDOFF truthful after the final audit (< 30 min; commit `docs: Feed v2 event gap, refresher running, demo wallet (WO-70)`)
Write only README.md, docs/DEMO_SCRIPT.md, docs/process/human-handoff.md. Source: docs/process/final-report.md (FAILED 1 + 2, stale-docs list) and docs/process/state.md top block.
1. README Feed rows (README:26, :61 and any other Feed-history line): the hosted Feed runs FEED_INDEXER=neardata (since 2026-11-13; start block 277503800
   since 11:36Z) but indexes NO contract events from nectar-core-v2: the Feed accepts only event version "1.0.0" (services/feed/src/events.ts:7, :34)
   while nectar-core-v2 emits "2.0.0" (contracts/nectar-core/src/events.rs:8); events_indexed = 0 (FINAL_REPORT FAILED 1). Snapshots from contract views
   work; the x402 paid CSV answered 200 with 168 rows at 11:44Z (tx 7dfoTwqXVav4rCT18PPb5C76Xc13E3325C6ZUvnUYsYt, evidence/ops/x402-paid-download-*.log).
   Remove "configured to index contract events from block 277398512". Say a fix needs a Feed code change + redeploy, pending Kunal.
2. HUMAN_HANDOFF: H-ORACLE → DONE (schedule A: 60 s in NYSE windows, 6 h outside, through 2026-11-18; FC key on nectar.testnet → nectar-core-v2
   update_owner_price only, allowance 5 NEAR, tx BHopF1cuKAMDFoCnKyNZPPKR3qVPgs5dYiKxx6jwWpao; first refresh De6aVqqNvfyemXtpuGP6quaUNcZgN2xP6cCXHXEwvfZG).
   H-DEMO-WALLET → DONE (orchestrator under Kunal's conditions: Intear web wallet in ~/.nectar/demo-chrome-profile, phrase never printed, connected to
   testnet.nectarlabs.io). H-NEARDATA: Kunal will add a NEW sealed key when he rotates it after judging (not sealed today).
3. DEMO_SCRIPT step 2: the refresher RUNS (schedule A) — drop "STAGED, not running" and the 10-min cadence; keep the 120 s borrow rule.
4. `pnpm verify:quick` 0; `node scripts/check-no-branding-all.mjs` 0. Symlink node_modules (no install). NO Co-Authored-By. Report ≤ 8 lines.
