# WO-72 — docs — README/handoffs after the Feed v2 fix (< 20 min; commit `docs: hosted Feed indexes v2 events (WO-72)`)
Write only README.md, docs/DEMO_SCRIPT.md, docs/HUMAN_HANDOFF.md. Facts (orchestrator, evidence/ops/feed-v2-reindex-*.log, x402-paid-download-20261113T122853Z.log):
- WO-71 (merge 37dfec9): the Feed accepts nectar event versions 1.0.0 and 2.0.0 (v2 adds only fields the Feed does not read; evidence/WO-71/fields.md),
  indexes settled_reserve, and /health adds indexer_cursor + indexer_lag_blocks. Hosted Feed redeployed 12:10Z from 37dfec9 (Railway deploy d2861e5f),
  fresh DB, FEED_START_BLOCK 277503800; at 12:11:32Z it logged neardata_events 277503800–277503899 = 1 event (the 11:28Z oracle_updated, block 277503817);
  indexer lag 4151 → 0 blocks by 12:27Z. Events before block 277503800 are not in the hosted Feed.
- x402 paid CSV 12:28Z: 402 → 200, 112 rows, tx 8bXCY34SVYv5b7vJ4GLfWkbJtQdqbSSBJsrzPCE75XRk.
1. README Feed rows (:26, :61 and anything WO-70 changed): replace "Snapshots only: no contract event history" with the facts above (no "live" unless EVIDENCE).
2. HUMAN_HANDOFF H-FEED-EVENTS → DONE ("fix", Kunal 2026-11-13). Parallel block fetch: after judging unless the Feed falls behind (Kunal).
3. DEMO_SCRIPT step 3: the hosted Feed records events again (from block 277503800).
4. `pnpm verify:quick` 0; branding check 0. Symlink node_modules (no install). NO Co-Authored-By. Report ≤ 6 lines.
