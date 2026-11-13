# WO-11a — keeper — 1Click depth sampler + Feed MCP (P1; ≤ 45 tool calls)
Spec: docs/process/work/interface-p1.md §Keeper/Feed, FACTS F-060..F-064, F-160.
1. services/feed: 1Click `dry:true` sampler every 5 min (configurable), `verifyQuoteSignature` (@defuse-protocol/one-click-sdk-typescript 0.1.26)
   must be true or the sample is dropped; store samples in SQLite; NVDAx = "no 1Click route" (no request sent when the token list has no route);
   one routable reference pair (configurable) so G6 can show a verified signed quote. Unit tests with recorded fixtures; a live test behind
   `NECTAR_IT=1` (read-only HTTP, no deposits ever — Q-007).
2. Feed MCP server with @modelcontextprotocol/sdk 1.32.2: tools get_exit_capacity, preview_borrow, list_quotes (no buyer ids), explain_limit
   (D-009 formula with live numbers); stdio + Streamable HTTP; read-only, no keys; tests with the SDK's in-memory transport if available.
3. services/feed/README: registration for Claude Code / Claude Desktop. Commit `feat(feed):`.
