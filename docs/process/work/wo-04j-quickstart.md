# WO-4j — docs — README quick start completeness (G9 pre-check; ≤ 10 tool calls)
Quick start lists, in order: clone (URL TODO-H2 until the repo is public), `pnpm i`, `pnpm demo:testnet`, `pnpm verify`,
`pnpm --filter web dev` (port 3100), `pnpm --filter docs-site build` / `start` (port 3000), and the Feed + MCP one-liners
(`pnpm --filter feed start` works with no env after WO-11d; MCP via stdio per services/feed/README). Note that a cold machine's `pnpm i`
takes longer than the rehearsal's warm 9 s. Keep the 5-command shape if possible (group extras under "Optional"). docs-site build green. Commit `docs:`.
