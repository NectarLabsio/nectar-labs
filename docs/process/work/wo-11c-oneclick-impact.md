# WO-11c — feed — 1Click price impact from base units (G6 fix; ≤ 30 tool calls). Context: docs/process/gate-fail-g6.md, FACTS F-060..F-064, C-014
1. Sampler: per reference pair, three `dry:true` quotes at 0.5×, 1×, 2× of `ONECLICK_NOTIONAL_USD` (default $1,000; convert USD→amountIn
   with the /v0/tokens price only to size the input — never to measure output). Each must pass verifyQuoteSignature or the set is dropped.
   rate_e6 = amountOut·10^dec_in·1e6 / (amountIn·10^dec_out) (integers/BigInt, token decimals from /v0/tokens); impact_bps (vs the 0.5×
   sample, floor, may be 0) from amountOut and worst_impact_bps from minAmountOut. Remove every use of amountInUsd/amountOutUsd for depth.
2. Asset route status from the token list: NVDAx (and any configured asset) `no_route` when absent — sampled, not hard-coded.
3. `GET /api/oneclick` (add to services/feed/openapi.yaml, test "openapi documents served routes" must stay green):
   {"as_of":"<iso>","pairs":[{"id":"wnear-usdc","origin":"<assetId>","destination":"<assetId>","verified":true,"correlation_id":"…",
   "samples":[{"notional_usd":500,"amount_in":"…","amount_out":"…","min_amount_out":"…","rate_e6":"…","impact_bps":0,"worst_impact_bps":0}]}],
   "assets":[{"symbol":"NVDAx","status":"no_route"}]}
   Also a fixture mode (`FEED_FIXTURES=1`) that serves /api/oneclick from recorded fixtures (re-record 3 sizes with `record:oneclick`,
   read-only) so web e2e can run without live sampling.
4. MCP `explain_limit`/`get_exit_capacity` use the same numbers. Tests: unit (rate/impact math incl. decimals 24 vs 6), fixture-mode
   route test, live test behind NECTAR_IT=1. `pnpm verify:quick` green. Commit `fix(feed):`.
