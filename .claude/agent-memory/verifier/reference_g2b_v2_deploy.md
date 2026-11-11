---
name: g2b-v2-deploy-recipe
description: How to run G2b (v2 core re-run) fast; view arg traps, calendar paging, live-state drift, stale v1 ids in unit tests
metadata:
  type: reference
---
First run 2026-11-10 (1c4cdb3) FAILED only on `pnpm verify`: services/feed/test/defaults.test.ts and services/keeper/test/keyfile.test.ts assert the v1 core id while config.yaml points at v2.
- Code proof: `view_code` → base64 -d → sha256 → base58 == code_hash; rebuild (`cargo near build non-reproducible-wasm`, ~40 s warm) was byte-identical (sha256 252a6abe…).
- Views needing args: list_collaterals `{}`, get_fee_stack `{"symbol":"NVDAx"}`, get_reserve `{"symbol":"NVDAx"}`; no-arg calls must still send `{}`. get_session_calendar caps pages at 100 → page to count (287).
- Live state drifts: concurrent G7 v2 runs add quotes/positions mid-gate. Record next_quote_id/next_position_id at first read and note drift. See [[explorer-webfetch-403]] for nearblocks.
- ~20 tool calls total.
