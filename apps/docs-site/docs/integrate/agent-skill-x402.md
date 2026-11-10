---
title: Agent skill and x402 export
slug: /integrate/agent-skill-x402
description: MCP tools that return an unsigned borrow for the agent's own key, and a Feed export paid with x402 on near:testnet.
---
# Agent skill and x402 export

<p className="verified">Verified against: F-328 (2026-11-10, `@fastnear/x402` 2.5.0), F-329 (2026-11-10, NEP-141 asset per route; gate G14 open) · spec docs/PRD.md §10.5 · docs/work/interface-v7.md §A4–§A6 · D-018 (2026-11-10) · tests listed below (services/feed/test/skill.test.ts, services/x402/test/x402.test.ts)</p>
<p className="status">Status: built and tested in the sandbox; testnet deployment pending. The skill tools are unit-tested against JSON view fixtures for v1 and v2 (services/feed/test/fixtures/skill-views-v1.json, skill-views-v2.json); v2 is not deployed, so its fixture is not a chain recording. The x402 route is tested against a mocked facilitator chain and mocked NEAR RPC. The relayer and agent accounts (`x402-relayer.nectar.testnet`, `agent1.nectar.testnet`) do not exist yet (handoff H-NEAR-FAUCET), so no x402 payment has settled on testnet (gate G14). Whether the facilitator accepts mock USDC as the asset is also confirmed at G14 (F-329).</p>

An agent can open a loan with one MCP call and spend the proceeds on a paid API. The MCP server never holds a key.

## MCP tools

The Feed MCP server (`nectar-feed` 0.3.0; see [Feed MCP](./feed-mcp.md) for transport and registration) serves the four read-only tools from P1 plus four skill tools. Every skill tool is annotated `readOnlyHint: true`, `destructiveHint: false`.

| Tool | Input | Returns |
| --- | --- | --- |
| `open_protected_stock_loan` | `account_id`, `collateral`, `units`, `borrow_usd` (required); `pay_to`, `referrer`, `shield`, `pre_liq_ltv_bps` (optional) | an **unsigned** call `{receiver_id: <collateral token>, method: "ft_transfer_call", args, deposit: "1", gas}` plus a preview: both limits, every fee, and health at −5%, −10% and −20% |
| `quote_capacity` | `symbol` | exit capacity; on v2 also total debt and [aggregate headroom](../concepts/aggregate-limit.md) |
| `get_note` | `token_id` | `not_available` (Position Notes are not built yet) |
| `build_self_settle` | `position_id` | `not_available` (Profit-Lock is not built yet) |

Rules the tool enforces:

- Numbers come from contract views (`preview_borrow`, `get_exit_capacity`, `get_collateral`). The only local arithmetic is the display-only health table, which uses the keeper's health maths pinned to `contracts/nectar-core/tests/model.csv`.
- It detects v1 or v2 with `contract_version()`. On v1, `pay_to` and `referrer` are refused, because v1 would silently ignore them, and the v2-only fee fields are listed as absent.
- A borrow the contract would refuse returns the preview and **no** call. `referrer == account_id` is refused before any view is read ([Fee stack and referrals](../concepts/fee-stack.md)).
- `borrow_usd` is a decimal string with at most 6 decimals; exponent forms such as `1e3` are rejected.
- `shield` returns `unsupported_until_v2_shields`.

The agent signs the returned call with its own key (for example with `near-api-js`). The server cannot sign: `skill.ts` and `mcp.ts` import no file-system or key APIs, and every tool runs with `process.env` locked in the tests.

## x402 paid export

`/api/feed/export.csv` (Feed REST) is served through `services/x402` as an x402 resource:

| Item | Value |
| --- | --- |
| Network | `near:testnet` only; mainnet hints are refused by the server config and by the demo agent before signing |
| Price | 0.01 mock USDC = `{amount: "10000", asset: "usdc-mock.nectar.testnet"}` (F-329) |
| Pay to | treasury (`accounts.treasury` in config.yaml, else the owner) |
| Library | `@fastnear/x402` 2.5.0 with `@x402/core` / `@x402/near` 2.18.0 (F-328) |
| Facilitator | our own `createNearFacilitator`, relayer `x402-relayer.nectar.testnet` (key from a `0600` file, never logged) |
| Payment | NEP-366 `SignedDelegate` from the agent's full-access key |

The CSV is fetched from the Feed **before** settlement, so a Feed outage returns 502 and never charges the payer.

The demo agent (`pnpm --filter x402 demo:testnet`) does the whole story: it gets the unsigned borrow from `open_protected_stock_loan`, signs it with its own key, gets the 402 challenge, pays it and receives the file. It needs the two accounts above, so it has not been run on testnet yet.

```bash
pnpm --filter feed test     # skill tools
pnpm --filter x402 test     # x402 route, mocked facilitator and RPC
```

## Tests

services/feed/test/skill.test.ts:

- "registers the four skill tools, read-only, with the PRD §10.5 inputs"
- "schema rejects a bad account id and a float-y borrow amount"
- "v1: unsigned-call snapshot, v1 fee fields marked absent, health table"
- "v1: a borrow the contract would refuse returns the preview and no call"
- "v1: pay_to and referrer are refused (v1 would silently ignore them)"
- "v2: fee stack from preview_borrow, pay_to + referrer in msg, v2 gas"
- "v2: aggregate_limit refusal; referrer == borrower refused before any view"
- "skill.ts and mcp.ts import no fs/crypto-key APIs and never touch process.env or key paths", "every tool runs with process.env locked (any read throws)"

services/x402/test/x402.test.ts:

- "402 challenge names usdc-mock, 10000, near:testnet, treasury"
- "402 -> NEP-366 SignedDelegate payment -> 200 with the CSV"
- "insufficient balance is refused by the facilitator (no settlement)"
- "feed down -> 502 and the payment is not settled"
- "config refuses mainnet hints and non-testnet network ids", "the agent refuses a near:mainnet challenge before signing"
- "loads a 0600 near-cli file, refuses a group-readable one and a mismatched account; errors carry no key"
