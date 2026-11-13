# WO-34k — keeper — Feed + x402 Railway-ready (< 2 h; commit `feat(services): Railway-ready Feed and x402 (single port, volume, CORS, health)`)
Write only `services/`. Context: docs/process/work/wo-34-deploy.md. Railway facts (PORT injection, Dockerfile path, one public port, volumes) come from FACTS (WO-34r
in parallel). If missing, keep the design generic (Dockerfile + env) and note it. **Local defaults unchanged** (Feed :8788/:8789, x402 :8791, keeper as
today). Never stop the running host services (keeper :8790, x402 :8791, Feed :8788/:8789, anvil :8545). Use your own ports for tests.
1. Feed hosted mode:
   - Single public port from `PORT`, serving the REST API + `POST /mcp` (Streamable HTTP) on one server when `FEED_SINGLE_PORT=1`.
   - `/health` (keep `/healthz`) reporting lag, last indexed block, chain head, contract ids, version.
   - DB path from env on a volume (`FEED_DB_PATH=/data/...`).
   - On an empty DB, start indexing near the chain head (`FEED_START_BLOCK=head` or `head-N`). Document what that means for history.
   - RPC fallback list from FACTS / config (D-025 primary first).
   - CORS: when `FEED_CORS_ORIGINS` is set, allow exactly those origins (SITE_URL, APP_URL), otherwise today's behaviour.
   - No request logging of IPs (keep "No request logging").
2. x402 hosted mode: `PORT`, CORS as above, FEED_URL for the upstream.
   - Relayer key from `X402_RELAYER_KEY_PATH` (today) or `X402_RELAYER_KEY_JSON` (env-held, for Railway secrets). Never logged, never echoed in
     /health or errors. Refuse a full-access key: check the key's permission via view_access_key and exit if it is FullAccess.
   - `/health`.
3. Keeper (only report, do not host): does it support per-chain enable flags (e.g. `KEEPER_CHAINS=near,solana`)? Base runs on a local anvil fork (D-026),
   so a hosted keeper cannot reach it. If adding flags plus `KEEPER_KEY_JSON` (same full-access refusal) is < 30 min, do it. Otherwise report the gap.
4. Build: `services/feed/Dockerfile` and `services/x402/Dockerfile` (build context = repo root, pnpm workspace, Node ≥ 22.22.2, non-root user, no secrets
   in layers, .dockerignore excluding `.env*`, `evidence/`, `~/.nectar`, keys).
   - If docker is available locally, build both images and run them on your own ports: /health 200, an MCP `tools/list` 200, and the CORS preflight for an
     allowed and a refused origin. Otherwise run the same checks with `node` and the same env.
5. Tests for single-port routing, CORS allowlist and the full-access-key refusal. `pnpm verify:quick`.
No Railway CLI, no deploy, no key material in the repo or logs. NO Co-Authored-By. Never --no-verify. Report ≤ 10 lines (env var table included).
