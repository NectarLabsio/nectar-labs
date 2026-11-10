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
  live numbers, cross-checked against the contract's `preview_borrow`). The nectar-core id comes from
  `CORE_ACCOUNT_ID`, else `accounts.core` in `packages/config/config.yaml`, so a fresh clone needs no env: the
  tools read contract views over public RPC (DB-only fallback when no id is known; `preview_borrow` then errors).
- **Agent skill** (`src/skill.ts`, PRD v7 §10.5), same server, keyless: `open_protected_stock_loan` returns the
  **unsigned** `ft_transfer_call` (collateral token → core, 1 yocto) plus a preview (static + Cramér limits,
  every fee, health at −5/−10/−20%); the agent signs it with its own key. v1 vs v2 is read from
  `contract_version()`: on v1 the origination/referrer/headroom fields are `null` and listed in `absent_fields`,
  and `pay_to`/`referrer` are refused (`unsupported_on_v1`). `shield` returns `unsupported_until_v2_shields`.
  `quote_capacity` (Q_c, R_c, D_c, h_c, total debt, headroom); `get_note` / `build_self_settle` return
  `not_available` until WO-22 / WO-23a. Fixtures: `scripts/record-skill-fixture.ts [core] [out.json]`.

```bash
# env (all optional; ids default to packages/config/config.yaml): CORE_ACCOUNT_ID, NECTAR_CONFIG_PATH, NEAR_RPC_URL, FEED_DB_PATH (~/.nectar/feed.sqlite),
#      FEED_PORT (8788), FEED_HOST (127.0.0.1), FEED_POLL_MS (10000), FEED_MCP_PORT (8789 | off),
#      ONECLICK_ENABLED (1 | 0), ONECLICK_INTERVAL_MS (300000), ONECLICK_REF_PAIR (near:wNEAR->near:USDC | none),
#      comma-separated list allowed; ONECLICK_ASSETS (NVDAx), ONECLICK_NOTIONAL_USD (1000; quotes at 0.5x/1x/2x),
#      ONECLICK_JWT_PATH (optional 0600 file with a 1Click JWT), FEED_FIXTURES=1 (replay recorded dry quotes, no network)
#      GET /api/oneclick: impact_bps from base units (amountOut/amountIn, token decimals), never amountOutUsd (C-014)
pnpm --filter feed start            # REST :8788, MCP over HTTP at http://127.0.0.1:8789/mcp, sampler
pnpm -s --filter feed mcp           # MCP over stdio (-s: no pnpm banner on stdout)
pnpm --filter feed test             # unit tests (recorded fixtures, in-memory MCP transport)
NECTAR_IT=1 pnpm --filter feed test # + live 1Click dry quote (read-only HTTP)
pnpm --filter feed record:oneclick  # re-record test/fixtures from one live dry quote
```

## Register the MCP server

Run the commands from the repo root after `pnpm install`. Every tool is read-only and the server holds no keys.

No env is needed for read-only use: ids default to `packages/config/config.yaml`. Syntax per FACTS F-161
(Claude Code) and F-162 (Claude Desktop). stdout carries only JSON-RPC; if you launch through pnpm, use `pnpm -s`.

**Claude Code** (stdio; `--` separates Claude options from the server command):

```bash
claude mcp add --transport stdio nectar-feed -- node --disable-warning=ExperimentalWarning "$PWD/services/feed/src/mcp-stdio.ts"
```

**Claude Code** (Streamable HTTP, while `pnpm --filter feed start` is running):

```bash
claude mcp add --transport http nectar-feed http://127.0.0.1:8789/mcp
```

Add `--scope project` to write `.mcp.json` instead of `~/.claude.json`.

**Claude Desktop** (stdio, absolute paths): add this to `claude_desktop_config.json`
(macOS `~/Library/Application Support/Claude/`, Windows `$env:AppData\Claude\`, Linux `~/.config/Claude/`) and restart:

```json
{
  "mcpServers": {
    "nectar-feed": {
      "command": "node",
      "args": ["--disable-warning=ExperimentalWarning", "/ABSOLUTE/PATH/nectar-labs/services/feed/src/mcp-stdio.ts"]
    }
  }
}
```

`nectar-core.nectar.testnet` is the nectar-core id in `packages/config/config.yaml` (`accounts.core`).
You need Node ≥ 22.22.2, because the entry is TypeScript run by Node's type stripping.

Example prompts: "explain the NVDAx limit for 100 units", "list NVDAx quotes", "preview borrowing $10,000
against 100 NVDAx".

## Event source: Neardata (P1, default) with view-polling fallback

With a nectar-core id (env or config.yaml), the feed always polls views for snapshots, and takes NEP-297 events from
Neardata (F-122): `GET /v0/last_block/final` (302 → height) then `GET /v0/block/<h>` for each new final block,
keeping receipts executed by nectar-core (failed receipts skipped). The cursor `neardata_height` is stored in
SQLite meta, so restarts resume; event inserts are idempotent. Env: `FEED_INDEXER=neardata|views` (default
`neardata`; `views` = fallback, view polling + keeper tx-status logs), `FEED_NEARDATA_URL` (default
`https://testnet.neardata.xyz`), `FEED_NEARDATA_START_HEIGHT` (first run only; default = current final block;
`276971305` holds the G2 seed `liquidity_supplied`), `FEED_NEARDATA_MAX_BLOCKS` (per poll, default 100),
`FEED_NEARDATA_API_KEY_PATH` (optional FastNear key, sent as Bearer). Tests use a captured block,
`test/fixtures/neardata-block-276971305.json`.
