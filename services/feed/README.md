# feed (P0)

Nectar Feed indexer + read-only REST. SQLite via `node:sqlite` (no native addon).

- Sources: **view polling** (default: `list_collaterals`, `get_exit_capacity`, `list_quotes`, `list_positions`)
  and optional **tx-status** indexing of NEP-297 logs from the keeper's own transactions
  (`KEEPER_DB_PATH` + `KEEPER_ACCOUNT_ID`). A general receipt-tailing source waits on a verified RPC
  approach in docs/FACTS.md.
- REST per [`openapi.yaml`](openapi.yaml): `GET /api/feed`, `GET /api/asset/{id}`, `GET /api/settlements`,
  `GET /healthz`. Cached 10 s. No account ids in responses.
- MCP: `src/mcp.ts` is a stub registration of the six read-only tools (`get_feed`, `get_asset`,
  `get_quotes`, `get_positions`, `get_settlements`, `explain_limit`); handlers and transports land in P1.

```bash
# env: CORE_ACCOUNT_ID (polling off while TODO-G2), NEAR_RPC_URL, FEED_DB_PATH (~/.nectar/feed.sqlite),
#      FEED_PORT (8788), FEED_HOST (127.0.0.1), FEED_POLL_MS (10000)
pnpm --filter feed start
pnpm --filter feed test
```
