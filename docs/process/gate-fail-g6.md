# GATE_FAIL_G6 — 2026-11-09T22:14Z UTC — commit 578b006
**What failed:** (1) depth metric uses `amountInUsd − amountOutUsd` (services/feed/src/oneclick.ts:179-181), the field pair C-014 says
is meaningless (amountOutUsd mirrors the input USD value) → always 0 bps. (2) /feed shows no sampler data: the NVDAx "no 1Click route"
badge is hard-coded (apps/web/components/OracleBadge.tsx:6) and no depth is rendered; gap_bps reaches only MCP.
**Passed:** live dry quote (wNEAR→USDC, $1k) verifies with verifyQuoteSignature = true; recorded fixture re-verifies offline; dry-only
enforced in code; /v0/tokens 216 tokens, no tokenized equity (F-063); Feed specs 12/12, badge renders.
**Fix (in scope):** PRD §8 method without an external price: three dry quotes at 0.5×/1×/2× notional, rate from base units
(amountOut/amountIn with token decimals), `impact_bps = 1 − rate(n)/rate(0.5×)` (also from minAmountOut as worst case); Feed API
`GET /api/oneclick` (shape in docs/process/work/wo-11c-oneclick-impact.md) drives the web panel and the NVDAx route status. WO-11c (feed) ∥ WO-12b (web).
