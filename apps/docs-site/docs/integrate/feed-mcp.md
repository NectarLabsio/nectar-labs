---
title: Feed MCP
slug: /integrate/feed-mcp
description: Read-only MCP tools for agents sizing loans against committed capacity.
---
# Feed MCP

<p className="verified">Verified against: F-160 (2026-11-09), F-161 (2026-11-09), F-162 (2026-11-09) · spec docs/PRD.md §10.3, §10.4 · D-009 (2026-11-10) · source services/feed/src/mcp.ts · tests `pnpm --filter feed test` (in-memory MCP transport)</p>
<p className="status">Status on 2026-11-10: built, runs locally, no public host. The `agents` track counts it only if it passes G9.</p>

A read-only MCP server over stdio and Streamable HTTP, built on `@modelcontextprotocol/sdk` 1.32.2 (F-160). It holds no keys. With `CORE_ACCOUNT_ID` set, the tools read nectar-core views over public RPC. Without it they read the local Feed store, and `preview_borrow` returns an error.

| Tool | Input | Output |
| --- | --- | --- |
| `get_exit_capacity` | `symbol` | the view result with USD formatting and `as_of` |
| `preview_borrow` | `symbol`, `units`, `borrow_usd` | `limit_usd`, `premium_usd`, `ok`, `reason` |
| `list_quotes` | `symbol`, optional `limit` | live quotes without buyer identity (ids and sizes only) |
| `explain_limit` | `symbol` | the [Cramér formula](/concepts/cramer-limits) (PRD §4.2, D-009) with live numbers substituted |

## What agents do with it

- A lending agent calls `preview_borrow` before sizing a loan.
- A risk agent polls `get_exit_capacity` and alerts when the exit gap widens.
- A buyer's agent reads `list_quotes` to price its own commitment.

## Run it

```bash
pnpm --filter feed mcp      # stdio
pnpm --filter feed start    # REST on :8788 and MCP over HTTP at http://127.0.0.1:8789/mcp
```

## Register in Claude Code (F-161)

Run from the repo root after `pnpm i`. `--env` is greedy, so another option (`--transport`) goes between it and the name.

```bash
claude mcp add --env CORE_ACCOUNT_ID=nectar-core.nectar.testnet --transport stdio nectar-feed \
  -- node --disable-warning=ExperimentalWarning "$PWD/services/feed/src/mcp-stdio.ts"
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
      "args": ["--disable-warning=ExperimentalWarning", "/ABSOLUTE/PATH/TO/nectar-labs/services/feed/src/mcp-stdio.ts"],
      "env": { "CORE_ACCOUNT_ID": "nectar-core.nectar.testnet" }
    }
  }
}
```

The `env` key is not part of the F-162 example shape. If your Claude Desktop ignores it, set `CORE_ACCOUNT_ID` in the environment instead.
