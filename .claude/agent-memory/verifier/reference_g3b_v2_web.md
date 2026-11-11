---
name: g3b-v2-web
description: G3b (web E2E vs nectar-core-v2) run notes — flags-off specs fail once config enables v7 flags, LH script misses v7 routes, live-data checks, module-run chain checks
metadata:
  type: reference
---
G3b 2026-11-10 (2bf99e1) FAILED: e2e 214/14/18. 7 specs × 2 projects assert flags-off / v1 behaviour (agents-console:48, notes:147, shields:175/242, v7:33/64/78), and the config now enables the flags. LH 20/20 ≥ 90.
- apps/web/scripts/lighthouse.mjs ROUTES leave out /shield /reserve /notes. Copy it (sed ROUTES + outDir) inside the clone. Don't edit the original.
- Live checks: /api/health shows version 2.0.0-v7 (pages only say "v2"); Q_c on /feed is an aggregate (cross-check with list_quotes {"symbol":"NVDAx"}, which needs the symbol arg); /notes needs a wallet, so probe /note/<id> instead.
- /api/feed is prerendered (revalidate 10s), so the first hit gives a build-time snapshot. Use RPC get_exit_capacity as truth.
- v7-modules logs have no tx hashes (only key + signature), so prove module runs from state views (get_position, get_reserve, nft_token, get_shield).
- Don't print nft_tokens without a jq/slice: the base64 SVG media floods the output.
- e2e takes ~10 min. Whole run ≈ 30 tool calls.
G3b re-run 2026-11-10T17:40Z (0ed567f) PASSED after WO-26f: e2e 244/0/18 in 3.7 min. Specs now pin flags through __NECTAR_E2E_MOCK__. /api/feed is force-dynamic and returns as_of/age_s, so compare it with RPC get_exit_capacity (q_usd_e6, r_usd_e6, total_debt_usd_e6). With no Feed URL, /api/indexer/* answers 200 configured:false. LH 20/20 = 100. Took about 20 tool calls. Probe script: evidence/G3b/verifier-rerun-20261110T1740Z/g3b-rerun-probe.mjs (run it from apps/web so @playwright/test resolves). Delete the ._* AppleDouble files before git add.
**How to apply:** on G3b reruns, first check whether the flags-off specs were updated. Keep the extra-routes LH copy.
