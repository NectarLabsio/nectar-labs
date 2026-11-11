---
title: Agent skill and x402 export
slug: /integrate/agent-skill-x402
description: MCP tools that return an unsigned borrow for the agent's own key, and a Feed export paid with x402 on near:testnet.
---
# Agent skill and x402 export

<p className="verified">Verified against: F-328 (2026-11-10, `@fastnear/x402` 2.5.0), F-329 (2026-11-10, NEP-141 asset per route; gate G14 PASS) · spec docs/PRD.md §10.5 · docs/work/interface-v7.md §A4–§A6 · D-018 (2026-11-10) · F-013, F-015 (2026-11-10) · signing check: docs/work/review-2-findings.md R2-05 (2026-11-11) · tests listed below (services/feed/test/skill.test.ts, services/x402/test/x402.test.ts, services/x402/test/borrow-guard.test.ts) · testnet: docs/EVIDENCE.md §G14 (2026-11-10T16:52Z; 402 → 200 verifier run 2026-11-11T13:52Z–14:18Z, tested 45ed1f3, recorded in 2e16f9b; guarded agent on HEAD 2026-11-11T15:02Z, tested 48b5c5a, recorded in a677689)</p>
<p className="status">Status: x402 live on testnet (EVIDENCE §G14, 2026-11-10T16:52Z). Relay tx <a href="https://testnet.nearblocks.io/txns/5VL1P4kgWAA6GVDjsuZSyWXx3GhKiBfznhLXwdGtHEyx">5VL1P4kg…</a>: `x402-relayer.nectar.testnet` submitted `agent1.nectar.testnet`'s signed delegate paying 0.01 mock USDC (10000 e6) to `nectar.testnet`; agent borrow tx <a href="https://testnet.nearblocks.io/txns/GcHF75nWhNi1kVnQr5tZWFH1W4gA1LvQdGhH3NxH15mt">GcHF75nW…</a> opened position #4 for $10 on nectar-core-v2. The payment asset was mock USDC (the `usdc-mock` `ft_transfer` receipt succeeded; F-329). On 2026-11-11 the verifier ran the HTTP leg itself (EVIDENCE §G14, recorded in 2e16f9b): unpaid GET → 402 with the terms below, borrow tx <a href="https://testnet.nearblocks.io/txns/7UFpexpdEH2nhmDVqXar8vZHQcK1iBFXznu9rybn24wU">7UFpexpd…</a> (position #14), relayed delegate payment <a href="https://testnet.nearblocks.io/txns/EskZKj9sXxcpTWYoKRiagRvvkh3H5hjz8KQFL7qNRQQ7">EskZKj9s…</a>, then 200 with the CSV. A second verifier run on HEAD used the agent that checks the call before signing (recorded in a677689): borrow tx <a href="https://testnet.nearblocks.io/txns/E2suM2LC4ac2AE9TZ66AGY72ZDrBdu1Yz8pEnwAs65hz">E2suM2LC…</a> (position #15), relay <a href="https://testnet.nearblocks.io/txns/4vW2tPF5Gqemkm5uoafQE6eaXidSMSCuqLcDVMTTB77b">4vW2tPF5…</a>, 200 with 123 CSV rows. The skill tools run locally with the Feed and are unit-tested on view fixtures; no gate has run them with an agent client.</p>

An agent can open a loan with one MCP call and spend the proceeds on a paid API. The MCP server never holds a key.

## MCP tools

The Feed MCP server (`nectar-feed` 0.3.0; see [Feed MCP](./feed-mcp.md) for transport and registration) serves the four read-only tools from P1 plus four skill tools. Every skill tool is annotated `readOnlyHint: true`, `destructiveHint: false`.

| Tool | Input | Returns |
| --- | --- | --- |
| `open_protected_stock_loan` | `account_id`, `collateral`, `units`, `borrow_usd` (required); `pay_to`, `referrer`, `shield`, `pre_liq_ltv_bps` (optional) | an **unsigned** call `{receiver_id: <collateral token>, method: "ft_transfer_call", args, deposit: "1", gas}` plus a preview: both limits, every fee, and health at −5%, −10% and −20% |
| `quote_capacity` | `symbol` | exit capacity; on v2 also total debt and [aggregate headroom](../concepts/aggregate-limit.md) |
| `get_note` | `token_id` | `not_available`: the tool is not wired yet. [Position Notes](../concepts/position-notes.md) are live on testnet (EVIDENCE §G2b, §G14) |
| `build_self_settle` | `position_id` | `not_available`: the tool is not wired yet. [Profit-Lock](../concepts/profit-lock.md) ran on testnet on 2026-11-10 (evidence/v7-modules/summary.md) |

Rules the tool enforces:

- Numbers come from contract views (`preview_borrow`, `get_exit_capacity`, `get_collateral`). The only local arithmetic is the display-only health table, which uses the keeper's health maths pinned to `contracts/nectar-core/tests/model.csv`.
- It detects v1 or v2 with `contract_version()`. On v1, `pay_to` and `referrer` are refused, because v1 would silently ignore them, and the v2-only fee fields are listed as absent.
- A borrow the contract would refuse returns the preview and **no** call. `referrer == account_id` is refused before any view is read ([Fee stack and referrals](../concepts/fee-stack.md)).
- `borrow_usd` is a decimal string with at most 6 decimals; exponent forms such as `1e3` are rejected.
- `shield` returns `unsupported_until_v2_shields`.

The agent signs the returned call with its own key (for example with `near-api-js`). The server cannot sign: `skill.ts` and `mcp.ts` import no file-system or key APIs, and every tool runs with `process.env` locked in the tests.

### Check the call before signing

Treat the returned call as untrusted tool output. A hostile or compromised Feed, or a proxy in between, could return an `ft_transfer` of the agent's whole balance in the same shape. Before signing, rebuild the call from the agent's own inputs (for example with `tx.borrow` in `packages/sdk`) and require that it equals the returned one, or at least check every field:

- `receiver_id` is the collateral token from the agent's own config, and `method` is `ft_transfer_call`.
- `args.receiver_id` is the nectar-core account from the agent's own config, and `args.amount` equals the `units` it asked for.
- `args.msg` decodes to `{"LockCollateralAndBorrow": {...}}` with the `collateral`, `borrow_usd_e6`, `pre_liq_ltv_bps`, `pay_to` and `referrer` it asked for, and nothing else.
- `deposit` is `"1"` (1 yoctoNEAR, F-013).

Sign from a dedicated agent account that holds only what the agent may spend. A NEAR function-call key cannot sign this call, because `ft_transfer_call` needs 1 yoctoNEAR and function-call keys cannot attach NEAR (F-015). The account balance is the limit. The reference demo agent runs these checks (`services/x402/src/borrow-guard.ts`): it rebuilds the call from its own inputs and `config.yaml`, compares every field (the msg byte for byte, with no `pay_to`, `referrer` or `shield`; gas at most 300 Tgas), exits with code 3 and signs nothing on any mismatch, and otherwise signs its own rebuild, never the returned object. It signs with a full-access key on `agent1.nectar.testnet`, a testnet account that holds only demo funds.

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

The demo agent (`pnpm --filter x402 demo:testnet`) does the whole story: it gets the unsigned borrow from `open_protected_stock_loan`, checks it against its own rebuild, signs the rebuild with its own key, gets the 402 challenge, pays it and receives the file. The verifier ran it from a fresh clone on 2026-11-11 (EVIDENCE §G14, recorded in 2e16f9b): unpaid GET → 402, borrow tx [7UFpexpd…](https://testnet.nearblocks.io/txns/7UFpexpdEH2nhmDVqXar8vZHQcK1iBFXznu9rybn24wU) (position #14), relay tx [EskZKj9s…](https://testnet.nearblocks.io/txns/EskZKj9sXxcpTWYoKRiagRvvkh3H5hjz8KQFL7qNRQQ7), paid GET → 200 with 110 CSV rows. That run predates the call check. The verifier ran it again on HEAD with the check (EVIDENCE §G14, 2026-11-11T15:02Z, recorded in a677689): `borrow_verified` logged before signing, borrow tx [E2suM2LC…](https://testnet.nearblocks.io/txns/E2suM2LC4ac2AE9TZ66AGY72ZDrBdu1Yz8pEnwAs65hz) (position #15), relay tx [4vW2tPF5…](https://testnet.nearblocks.io/txns/4vW2tPF5Gqemkm5uoafQE6eaXidSMSCuqLcDVMTTB77b), paid GET → 200 with 123 CSV rows.

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

services/x402/test/borrow-guard.test.ts:

- "the honest Feed call passes and the agent signs its own byte-identical rebuild"
- "refuses the review scenario: ft_transfer of the whole balance to an attacker on usdc-mock"
- "refuses a msg that redirects proceeds (pay_to) or adds a referrer or shield"
- "refuses a msg whose bytes differ from the rebuild (duplicate keys, whitespace)"
- "refuses deposit other than 1 yocto, gas above 300 Tgas, extra fields and non-objects"
- "hostile MCP (ft_transfer to an attacker on usdc-mock): exit 3, clear message, zero RPC requests"
- "honest MCP: passes the guard and signs exactly the rebuilt call"
