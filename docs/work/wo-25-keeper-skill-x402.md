# WO-25 — keeper — agent skill (MCP tools) + x402 paid route (< 2 h; two commits)
Read first: PRD v7 §10.5 only, `docs/work/interface-v7.md` §A (msg fields, preview_borrow fee stack), FACTS F-328/F-329 (repo ids:
`@fastnear/x402` 2.5.0 pins `@x402/near` ~2.18.0; network id `near:testnet`; payer and relayer need full-access keys; asset set per route as
`price: {amount, asset}`; `payTo` must be storage-registered on the token), existing `services/feed/src/mcp.ts`.
The v2 contract is not deployed and the relayer/agent accounts do not exist yet (H-NEAR-FAUCET). Build and test against mocks; G14 runs live later.

**Part 1 — skill tools (commit `feat(feed): agent skill MCP tools`).** Add to the existing Feed MCP server (stdio + HTTP :8789/mcp), read-only and keyless:
- `open_protected_stock_loan {account_id, collateral, units, borrow_usd, shield?, pay_to?, referrer?}` returns the **unsigned** call
  `{receiver_id: <collateral token>, method: "ft_transfer_call", args: {receiver_id: <core>, amount, msg}, deposit: "1", gas}` plus a preview:
  both limits, every fee (`preview_borrow` on v2; on v1 compute from v1 views, with fields absent marked), and health at −5/−10/−20%. It never signs.
  `shield` is accepted but returns `unsupported_until_v2_shields` until WO-23a exists.
- `quote_capacity {symbol}` (Q_c, R_c, D_c, h_c, total debt, headroom), `get_note {token_id}` (returns `not_available` until WO-22),
  `build_self_settle {position_id}` (returns `not_available` until WO-23a).
- Tests: tool schemas, an unsigned-call shape snapshot, the v1/v2 branches with recorded view fixtures, and a guarantee that no tool reads a key or env secret.

**Part 2 — x402 (commit `feat(x402): paid feed export on near:testnet`).** New package `services/x402/` (pnpm workspace member):
- A resource server wrapping the Feed's `/api/feed/export.csv` as an x402 route priced at **0.01 mock USDC** (`amount: "10000"`, asset
  `usdc-mock.nectar.testnet`, network `near:testnet`), with `payTo` = treasury account from config.
- Our own facilitator (`createNearFacilitator`, relayer = `x402-relayer.nectar.testnet`), keys loaded from a path in env
  (`X402_RELAYER_KEY_PATH`), never logged.
- `demo-agent.ts`: borrows against mock NVDAx (builds the call via the Part 1 tool and signs with `AGENT1_KEY_PATH`), then GETs the CSV, gets the
  402, pays with a NEP-366 SignedDelegate, and gets the 200. `pnpm --filter x402 demo:testnet` runs it; it refuses mainnet.
- Tests: unit tests with a mocked facilitator and mocked NEAR RPC (402 → pay → 200 path; wrong network refused; missing key path ⇒ clear error).
- `.env.example`: `X402_FACILITATOR_URL=`, `X402_RELAYER_ACCOUNT_ID=`, `X402_RELAYER_KEY_PATH=`, `AGENT1_ACCOUNT_ID=`, `AGENT1_KEY_PATH=` (paths/ids only).
If the x402 library turns out not to accept an arbitrary NEP-141 asset, stop Part 2, report it (F-329 conflict), and leave Part 1 merged.
Write only under services/ and .env.example. `pnpm verify:quick` must stay green. Report ≤ 20 lines.
