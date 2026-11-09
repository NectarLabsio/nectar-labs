# WO-5 — keeper — bot + indexer (P0)
Goal: services/keeper (poll list_positions, get_health view, trigger_preliquidation with function-call key, backoff, /healthz, JSON logs); services/feed (NEP-297 indexer → SQLite; REST /api/feed, /api/asset/:id, /api/settlements; openapi.yaml; MCP server stub).
Acceptance: unit tests for health math match contracts/tests/model.csv; integration against testnet behind env flag; report ≤ 20 lines.
FACTS: F-012, F-015, F-021.
