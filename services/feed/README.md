# feed (P1)

Nectar Feed indexer + read-only REST, a 1Click dry-quote depth sampler, and a read-only MCP server.
SQLite via `node:sqlite` (no native addon). Holds no keys.

- Sources: **view polling** (default: `list_collaterals`, `get_exit_capacity`, `list_quotes`, `list_positions`)
  and optional **tx-status** indexing of NEP-297 logs from the keeper's own transactions
  (`KEEPER_DB_PATH` + `KEEPER_ACCOUNT_ID`).
- REST per [`openapi.yaml`](openapi.yaml): `GET /api/feed`, `GET /api/asset/{id}`, `GET /api/settlements`,
  `GET /healthz`. Cached 10 s. No account ids in responses.
- **1Click sampler** (`src/oneclick.ts`): every 5 min, `POST /v0/quote` with `dry: true` only. The client
  can reach `GET /v0/tokens` and `POST /v0/quote` only and refuses any non-dry body; nothing is ever
  deposited. Each response must pass `verifyQuoteSignature` (one-click SDK 0.1.26) or the sample is
  dropped (`meta.oneclick_dropped`). Verified samples (with the full signed response, re-verifiable offline)
  go to the `oneclick_samples` table. **NVDAx: "no 1Click route"**: the token list has no NVDA asset, so
  no request is sent. A reference pair (`near:wNEAR -> near:USDC`, $1,000 notional) shows a verified signed quote.
- **Feed MCP** (`src/mcp.ts`, `@modelcontextprotocol/sdk` 1.32.2): read-only tools
  `get_exit_capacity`, `preview_borrow`, `list_quotes` (no buyer ids), `explain_limit` (D-009 formula with
  live numbers, cross-checked against the contract's `preview_borrow`). With `CORE_ACCOUNT_ID` set the
  tools read contract views over public RPC; without it they read the Feed SQLite store (`preview_borrow`
  then returns an error).

```bash
# env: CORE_ACCOUNT_ID (polling + live MCP views; off while unset), NEAR_RPC_URL, FEED_DB_PATH (~/.nectar/feed.sqlite),
#      FEED_PORT (8788), FEED_HOST (127.0.0.1), FEED_POLL_MS (10000), FEED_MCP_PORT (8789 | off),
#      ONECLICK_ENABLED (1 | 0), ONECLICK_INTERVAL_MS (300000), ONECLICK_REF_PAIR (near:wNEAR->near:USDC | none),
#      ONECLICK_NOTIONAL_USD_E6 (1000000000), ONECLICK_JWT_PATH (optional 0600 file with a 1Click JWT)
pnpm --filter feed start            # REST :8788, MCP over HTTP at http://127.0.0.1:8789/mcp, sampler
pnpm --filter feed mcp              # MCP over stdio
pnpm --filter feed test             # unit tests (recorded fixtures, in-memory MCP transport)
NECTAR_IT=1 pnpm --filter feed test # + live 1Click dry quote (read-only HTTP)
pnpm --filter feed record:oneclick  # re-record test/fixtures from one live dry quote
```

## Register the MCP server

Run the commands from the repo root after `pnpm install`. Every tool is read-only and the server holds no keys.

> TODO-FACTS: the `claude mcp add` flags and the Claude Desktop config shape below are not in docs/FACTS.md yet.
> Verify them before G9. The server itself is tested over stdio and HTTP.

**Claude Code** (stdio):

```bash
claude mcp add nectar-feed \
  -e FEED_DB_PATH=$HOME/.nectar/feed.sqlite -e CORE_ACCOUNT_ID=nectar-core.nectar.testnet \
  -- node --disable-warning=ExperimentalWarning "$PWD/services/feed/src/mcp-stdio.ts"
```

**Claude Code** (HTTP, while `pnpm --filter feed start` is running):

```bash
claude mcp add --transport http nectar-feed http://127.0.0.1:8789/mcp
```

**Claude Desktop**: add this to `claude_desktop_config.json` (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`) and restart Claude Desktop:

```json
{
  "mcpServers": {
    "nectar-feed": {
      "command": "node",
      "args": ["--disable-warning=ExperimentalWarning", "/ABSOLUTE/PATH/nectar-labs/services/feed/src/mcp-stdio.ts"],
      "env": { "FEED_DB_PATH": "/Users/YOU/.nectar/feed.sqlite", "CORE_ACCOUNT_ID": "nectar-core.nectar.testnet" }
    }
  }
}
```

`nectar-core.nectar.testnet` is the nectar-core id in `packages/config/config.yaml` (`accounts.core`).
You need Node ≥ 22.22.2, because the entry is TypeScript run by Node's type stripping.

Example prompts: "explain the NVDAx limit for 100 units", "list NVDAx quotes", "preview borrowing $10,000
against 100 NVDAx".
