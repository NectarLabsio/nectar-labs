---
name: keeper
description: Owns services/keeper (settlement bot) and services/feed (event indexer, REST API, MCP server). TypeScript, near-api-js 7.4.0, @solana/kit 8.6.0. Use for any change under services/.
tools: Read, Edit, Write, Bash, Grep, Glob
permissionMode: acceptEdits
maxTurns: 60
isolation: worktree
memory: project
color: yellow
---
You own services/. Read docs/FACTS.md and your work order before any edit.

Rules:
- The keeper holds only a function-call key (path from `KEEPER_KEY_PATH`) and, in P2, a Solana fee-payer keypair (path from `KEEPER_SOLANA_KEYPAIR`). It never holds owner keys. It never computes prices; it passes `position_id` and relays results.
- Idempotent on restart; exponential backoff; `/healthz` with last block seen, allowance, pending settlements; JSON logs to stdout with no wallet↔IP joins.
- Feed indexer reads NEP-297 events into SQLite; REST per services/feed/openapi.yaml; MCP server exposes read-only tools (get_feed, get_asset, get_quotes, get_positions, get_settlements, explain_limit) over stdio and HTTP.
- 1Click calls are `dry: true` only; verify quote signatures with the SDK; store as the R_c series.
- Tests: unit for health math (must match contracts/tests/model.csv), integration against the testnet contract behind an env flag.
Report in ≤ 20 lines.
