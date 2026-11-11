---
title: Feed MCP
slug: /integrate/feed-mcp
description: Read-only MCP tools for agents sizing loans against committed capacity.
---
# Feed MCP

<p className="verified">Verified against: F-160 (2026-11-09), F-161 (2026-11-09), F-162 (2026-11-09) · spec docs/PRD.md §10.3, §10.4 · D-009 (2026-11-10) · docs/EVIDENCE.md §G9 Feed MCP step (2026-11-11) · source services/feed/src/mcp.ts, main.ts, repo-config.ts · tests `pnpm --filter feed test` (in-memory MCP transport)</p>
<p className="status">Status on 2026-11-11: built, runs locally, no public host. In the fresh-clone run (docs/EVIDENCE.md §G9) a scripted JSON-RPC client used it over stdio and HTTP with no env: initialize answered, 8 tools listed, and `get_exit_capacity` returned the same exit capacity as `pnpm demo:testnet`. No LLM agent client has been tested.</p>

A read-only MCP server over stdio and Streamable HTTP, built on `@modelcontextprotocol/sdk` 1.32.2 (F-160). It holds no keys and needs no env: the nectar-core id defaults to `accounts.core` in `packages/config/config.yaml` (now `nectar-core-v2.nectar.testnet`), and the tools read its views over public RPC. `CORE_ACCOUNT_ID` overrides the id. Only when no id is configured at all do the tools fall back to the local Feed store, and then `preview_borrow` returns an error.

| Tool | Input | Output |
| --- | --- | --- |
| `get_exit_capacity` | `symbol` | the view result with USD formatting and `as_of` |
| `preview_borrow` | `symbol`, `units`, `borrow_usd` | `limit_usd`, `premium_usd`, `ok`, `reason` |
| `list_quotes` | `symbol`, optional `limit` | live quotes without buyer identity (ids and sizes only) |
| `explain_limit` | `symbol` | the [Cramér formula](/concepts/cramer-limits) (PRD §4.2, D-009) with live numbers substituted |

The server also lists the four agent skill tools (8 in total): `open_protected_stock_loan`, `quote_capacity`, `get_note` and `build_self_settle`. The last two still return `not_available`. See [Agent skill and x402 export](/integrate/agent-skill-x402).

## What agents do with it

- A lending agent calls `preview_borrow` before sizing a loan.
- A risk agent polls `get_exit_capacity` and alerts when the exit gap widens.
- A buyer's agent reads `list_quotes` to price its own commitment.

## Run it

```bash
pnpm -s --filter feed mcp   # stdio (-s keeps stdout pure JSON-RPC)
pnpm --filter feed start    # REST on :8788 and MCP over HTTP at http://127.0.0.1:8789/mcp
```

All variables are optional: `FEED_PORT` (REST, default 8788), `FEED_MCP_PORT` (MCP over HTTP, default 8789; `off` disables it), `FEED_HOST` (default 127.0.0.1), `FEED_DB_PATH` (default `~/.nectar/feed.sqlite`). If a port is already taken, `feed start` exits with `EADDRINUSE`. A raw HTTP client must send `accept: application/json, text/event-stream` (EVIDENCE §G9). The full list is in `services/feed/README.md`.

## Register in Claude Code (F-161)

Run from the repo root after `pnpm i`. No env is needed. `--` separates Claude options from the server command.

```bash
claude mcp add --transport stdio nectar-feed -- node --disable-warning=ExperimentalWarning "$PWD/services/feed/src/mcp-stdio.ts"
```

Over HTTP, while `pnpm --filter feed start` is running:

```bash
claude mcp add --transport http nectar-feed http://127.0.0.1:8789/mcp
```

## Register in Claude Desktop (F-162)

Add this to `claude_desktop_config.json` (macOS `~/Library/Application Support/Claude/`, Windows `%AppData%\Claude\`, Linux `~/.config/Claude/`) and restart. Paths must be absolute. Only stdio is documented for this file.

```json
{
  "mcpServers": {
    "nectar-feed": {
      "command": "node",
      "args": ["--disable-warning=ExperimentalWarning", "/ABSOLUTE/PATH/TO/nectar-labs/services/feed/src/mcp-stdio.ts"]
    }
  }
}
```

No `env` key is needed: the server reads the nectar-core id from `packages/config/config.yaml`. You need Node ≥ 22.22.2, because the entry is TypeScript run by Node's type stripping.
