---
title: Feed MCP
slug: /integrate/feed-mcp
description: Read-only MCP tools for agents sizing loans against committed capacity.
---
# Feed MCP

<p className="verified">Verified against: F-021 (2026-11-09) · spec docs/PRD.md §10.3, §10.4 · D-009 (2026-11-10)</p>
<p className="status">Status: P1, not built. It is listed as live only if it ships and passes G9. The SDK version and registration commands are pinned and verified when it ships.</p>

A stdio and HTTP MCP server, read-only, with no keys and per-IP rate limits.

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

## Registering in Claude Code or Claude Desktop

The exact registration commands are added when the server ships. They are checked against the current Claude Code documentation at that time rather than guessed now.
