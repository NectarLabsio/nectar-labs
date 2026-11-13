# WO-68 — docs — README + handoffs truthful for release 4 (c95cd0c) (< 45 min; commit `docs: README hosted demo = release 4; handoffs (WO-68)`)
Write only README.md, docs/DEMO_SCRIPT.md, docs/process/human-handoff.md. Source: docs/process/gate-fail-wo67.md and docs/EVIDENCE.md §"WO-34 production (custom hosts)" +
§"G9 run 6" (WO-67). No product change. Copy rules: never "insurance", never "without liquidations", "live" only where EVIDENCE shows it.
1. README hosted-demo section (README:14–35 per GATE_FAIL_WO67): release 4 = c95cd0c is in production (2026-11-13 ~02:00Z, Kunal approved). State as fact,
   citing EVIDENCE §WO-34 production (custom hosts) PASS: status page at https://status.nectarlabs.io (SITE /status 308s there); docs at the root of
   https://docs.nectarlabs.io (old /docs/<path> 308s); "Get test assets" deployed on https://testnet.nectarlabs.io (mock assets, no value); the 5 old
   vercel.app hosts 308 to the custom hosts; Feed CORS allows SITE, APP and STATUS. Drop "next release"/"not deployed"/"no verifier run recorded" lines.
2. Feed: since 2026-11-13 02:22Z the hosted Feed indexes events again (FEED_INDEXER=neardata with a FastNear key, start block 277398512 ≈ 8.5 h back;
   history "indexed"). Replace any README/DEMO_SCRIPT line saying the hosted Feed records no events / views mode. Say events before block 277398512
   are not in the hosted Feed.
3. docs/DEMO_SCRIPT.md:18 (pre-release text) → current. Leave the shot list to WO-35 (orchestrator); only fix stale facts.
4. HUMAN_HANDOFF: H-DEPLOY → DONE (Kunal typed approval 2026-11-13; web dpl_Bm1uwQcX…, docs dpl_DpqAmb6…). H-NEARDATA → DONE (Kunal supplied the key
   2026-11-13; it sits on Railway feed as FEED_NEARDATA_API_KEY; recommend sealing it in the dashboard and rotating it after judging — it was pasted in a
   chat session). H-DNS stays CLOSED. H-ORACLE stays WAITING; add: "Before applying, Kunal picks the refresher cadence (A ~60 s in NYSE hours / B 10 min /
   C 12 h): a borrow in an open session needs the price < 120 s (max_age_ns_session, get_config), docs/process/work/wo-35-demo-video.md C6."
5. `pnpm verify:quick` 0; `node scripts/check-no-branding-all.mjs` 0. DISK RULE: no pnpm install in the worktree (symlink node_modules). NO Co-Authored-By.
Report ≤ 10 lines: README lines changed, handoff statuses.
