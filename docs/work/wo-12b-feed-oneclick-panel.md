# WO-12b — web — render 1Click data from the Feed API (G6 fix; ≤ 25 tool calls). Context: docs/GATE_FAIL_G6.md
API shape: docs/work/wo-11c-oneclick-impact.md §3 (`GET /api/oneclick`, via the existing same-origin proxy).
/feed: a "1Click reference depth" panel per pair (rate, impact at 0.5×/1×/2×, worst case from minAmountOut, "signature verified",
as-of) and NVDAx route status from `assets[]` — delete the hard-coded NO_1CLICK_ROUTE set; when the API is unreachable show
"1Click data unavailable" (never a fake badge). e2e: start the feed with FEED_FIXTURES=1 (or mock the proxy route with Playwright's
route API using a fixture matching the shape) and assert the panel + NVDAx status. e2e + lighthouse green. Commit `fix(web):`.
