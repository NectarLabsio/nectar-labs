# WO-34g — web — RPC fallback across providers; health under rate limits (< 90 min; commit `fix(web): cross-provider RPC fallback; health under rate limits`)
Write only `apps/web/`, `packages/sdk/`. Fixes docs/GATE_FAIL_G3B_R3.md (read it). Both of the app's RPC endpoints are FastNEAR, so a -429 takes out both.
1. Live-probe the non-FastNEAR testnet hosts from F-369 with JSON-RPC `status` and one `query` call_function view on nectar-core-v2:
   `https://near-testnet.drpc.org` and `https://testnet-rpc.intea.rs`.
   - Keep only hosts that answer with chain_id testnet and a head within ~10 blocks of FastNEAR. Probe output goes to evidence/G3/rpc-probe-<ts>.log.
   - If a host fails or contradicts F-369, say so in the report (the researcher records it).
2. SDK fallback order: test.rpc.fastnear.com (D-025), rpc.testnet.fastnear.com, then the probed hosts.
   - Fail over on 429, 5xx, timeout or a network error.
   - Keep the WO-34f per-endpoint backoff, in-flight de-dupe and 8 s cache.
   - The same list serves the server routes (/api/health, /api/indexer, status) and the browser.
   - config.yaml stays orchestrator-owned: if a list belongs there, say so and I add it. Otherwise keep it in the SDK, with the FACTS ids in a comment.
3. `/api/health`: when every RPC fails, answer with the last good snapshot if it is ≤ 60 s old (`stale_s` field, still ok). Otherwise ok:false with
   the reason. Never invent a value.
4. Live e2e specs (testnet.spec, live-views and any spec that reads the chain): retry with backoff (Playwright `retries: 2` for those projects, or a
   per-test poll). They still fail on a real product error.
5. CSP connect-src gets the kept hosts. Add them to apps/web/content/data-inventory.{json,md} as "RPC fallback (contacted only when FastNEAR refuses)".
   Tell me the list; docs updates the privacy page.
6. Tests:
   - SDK unit tests for the failover order and for 429 → next provider.
   - The full e2e (desktop + phone) twice on your own port, with the host services running as they are (do not stop them). Target 0 failed.
   - `pnpm verify:quick`.
Own ports (not 3000/3100/3217/3291/3297/3471/3613/3741/3742/3761/3762/3771/3857/3961–3963/8788–8791/8891). Stop your servers. `git merge main` before the
final runs. NO Co-Authored-By. Never --no-verify. Report ≤ 8 lines.
