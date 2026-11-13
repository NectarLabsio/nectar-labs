# WO-11d — keeper/feed — zero-config defaults for a fresh clone (G9 pre-check; ≤ 15 tool calls)
1. services/feed and services/keeper: when CORE_ACCOUNT_ID (and the token/feed ids) are unset, read them from packages/config/config.yaml
   (accounts.core, usdc_mock, nvdax_mock, collateral.nvdax) — env still overrides. Remove the stale "(TODO-G2)" wording. Keeper still
   REQUIRES its key path (no default key). Test: feed starts with no env and /api/feed + MCP get_exit_capacity return live NVDAx data.
2. MCP stdio: the `mcp` entry must write nothing but JSON-RPC to stdout — run node directly (e.g. `"mcp": "node src/mcp-stdio.ts"` and
   document `pnpm -s --filter feed mcp` or the direct node command); assert in a test that the first stdout byte is `{`.
3. services/feed/README: replace the TODO-FACTS note with the registration commands from FACTS F-161 (claude mcp add, stdio and
   --transport http) and F-162 (Claude Desktop mcpServers JSON); no env needed for read-only use.
`pnpm verify:quick` green. Commit `fix(feed):`.
