---
name: g6-oneclick-recipe
description: G6 1Click gate recipe - real commands live in services/feed, not keeper; check C-014 amountOutUsd use and whether web /feed is wired to sampler
metadata:
  type: reference
---
G6 commands (gates.md keeper line is stale): `NECTAR_IT=1 pnpm --filter feed test` (live dry quote, logs no pair/response), offline re-verify of services/feed/test/fixtures/oneclick-quote-ref.json via SDK verifyQuoteSignature, curl GET /v0/tokens for F-063, `PW_CHANNEL=chrome pnpm --filter web exec playwright test -g feed` after web build.
Traps seen 2026-11-09 (FAIL at 578b006): sampler gap_bps used amountOutUsd (C-014 says no); web "no 1Click route" badge was a hard-coded set, /feed had no depth number. Playwright screens spec writes into evidence/G3/screens in the clone (take the G6 screenshot from there).
Re-run PASS 2026-11-09 at fea52b7: feed now serves GET /api/oneclick (FEED_FIXTURES=1 replays, port via FEED_PORT, FEED_MCP_PORT=off); web proxies via /api/indexer/<path>, NEXT_PUBLIC_FEED_URL is build-time (rebuild, `next start -p 3100`); panel screenshot via a scratchpad Playwright script that uses createRequire on apps/web; /healthz may not return 2xx in fixture mode, so probe /api/oneclick instead. wNEAR/USDC impact_bps is 0 up to $2k; only worst_impact (~1%) is nonzero.
**How to apply:** on re-run, grep oneclick.ts for amountOutUsd and apps/web for sampler consumption before declaring PASS. Related: [[g4-outlayer-recipe]]
