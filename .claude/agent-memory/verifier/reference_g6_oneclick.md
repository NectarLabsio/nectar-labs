---
name: g6-oneclick-recipe
description: G6 1Click gate recipe - real commands live in services/feed, not keeper; check C-014 amountOutUsd use and whether web /feed is wired to sampler
metadata:
  type: reference
---
G6 commands (gates.md keeper line is stale): `NECTAR_IT=1 pnpm --filter feed test` (live dry quote, logs no pair/response), offline re-verify of services/feed/test/fixtures/oneclick-quote-ref.json via SDK verifyQuoteSignature, curl GET /v0/tokens for F-063, `PW_CHANNEL=chrome pnpm --filter web exec playwright test -g feed` after web build.
Traps seen 2026-11-09 (FAIL at 578b006): sampler gap_bps used amountOutUsd (C-014 says no); web "no 1Click route" badge was a hard-coded set, /feed had no depth number. Playwright screens spec writes into evidence/G3/screens in the clone (take the G6 screenshot from there).
**How to apply:** on re-run, grep oneclick.ts for amountOutUsd and apps/web for sampler consumption before declaring PASS. Related: [[g4-outlayer-recipe]]
