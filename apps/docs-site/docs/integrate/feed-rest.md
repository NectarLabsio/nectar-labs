---
title: Feed REST
slug: /integrate/feed-rest
description: Public read API over committed exit capacity.
---
# Feed REST

<p className="verified">Verified against: F-018 (2026-11-10), F-021 (2026-11-10) · source services/feed/openapi.yaml (OpenAPI 3.1.0, v0.1.0) · test services/feed/test/feed.test.ts "openapi.yaml documents exactly the served routes"</p>
<p className="status">Status: built in P0, runs locally (`pnpm --filter feed start`, default <code>http://127.0.0.1:8788</code>). No public host yet. It polls views of <code>nectar-core.nectar.testnet</code> (id from config.yaml).</p>

The Feed is a read-only view of committed exit capacity on `nectar-core` (NEAR testnet, mock collateral). An indexer polls the contract views (`list_collaterals`, `get_exit_capacity`, `list_quotes`, `list_positions`) and can also read NEP-297 logs (F-021) from the keeper's own transactions. Both write to SQLite. Responses are cached for 10 s and contain no account ids or buyer identities (test "serves feed, asset, settlements, healthz over HTTP with 10 s cache and no account ids").

Number formats: u128 amounts are decimal strings with suffix `_usd_e6` (USDC, 6 decimals). Basis points are integers. Timestamps are ISO 8601 date-time strings.

## Endpoints

| Route | Returns | Errors |
| --- | --- | --- |
| `GET /api/feed` | `{as_of_block, as_of, assets: Asset[]}`, the latest capacity for every asset | none |
| `GET /api/asset/{id}?limit=` | `{as_of_block, as_of, symbol, latest: Asset, history[], quotes: Quote[]}` for one asset | 400, 404 |
| `GET /api/settlements?limit=&position_id=` | `{as_of_block, as_of, items: Settlement[]}`, recent pre-liquidation settlements | 400 |
| `GET /healthz` | indexer health | 503 when the indexer has not polled recently |

Parameters:

- `id` (path): collateral symbol, for example `NVDAx`, pattern `^[A-Za-z0-9._-]{1,32}$`.
- `limit` on `/api/asset/{id}`: history points, newest first, default 168, maximum 2000.
- `limit` on `/api/settlements`: 1 to 500.
- `position_id` on `/api/settlements`: decimal string of up to 20 digits.

Errors return `{"error": "<message>"}`.

## Schemas

**Asset** is `get_exit_capacity(symbol)` as last indexed.

| Field | Type | Meaning |
| --- | --- | --- |
| `symbol` | string | collateral symbol |
| `q_usd_e6` | string | committed quotes `Q_c` |
| `r_usd_e6` | string | Nectar Reserve `R_c` (0 on testnet; Reserve is PROD-only) |
| `d_usd_e6` | string | verified DEX depth `D_c` (0 when the session is closed) |
| `haircut_bps` | integer | haircut `h_c` |
| `session_open` | boolean | market session state |
| `oracle_price_usd_e6` | string | oracle price |
| `oracle_age_s` | integer | seconds since the oracle update |
| `oracle_fresh` | boolean | whether the price passes the staleness check |
| `b_c_usd_per_unit_e6` | string or null | Cramér limit per collateral unit |
| `limit_bps_effective` | integer | effective limit in bps |
| `block_height` | integer | block of the observation |
| `observed_at` | date-time | time of the observation |

**History point** (in `/api/asset/{id}`): `block_height`, `observed_at`, `q_usd_e6`, `limit_bps_effective`, `haircut_bps`, `session_open`.

**Quote** carries no buyer identity: `quote_id`, `collateral`, `amount_usd_e6`, `max_discount_bps`, `status` (`Live`, `Exiting` or `Withdrawn`).

**Settlement**: `position_id`, `quote_id`, `disc_bps`, `repay_usd_e6`, `seize_units`, `status` (view rows: `Settling` or `Closed`), `block_height`, `tx_hash`, `source` (`event` or `view`), `observed_at`.

**Health**: `ok`, `last_block_seen`, `last_poll_at`, `last_error`, `source` (`views`, `views+tx_status` or `none`), `events_indexed`.

## Example

```bash
pnpm --filter feed start            # env: CORE_ACCOUNT_ID, NEAR_RPC_URL, FEED_DB_PATH, FEED_PORT (8788)
curl -s http://127.0.0.1:8788/healthz
curl -s http://127.0.0.1:8788/api/feed
curl -s 'http://127.0.0.1:8788/api/asset/NVDAx?limit=24'
```

## Without the Feed: read the chain directly

The contract views are public and need no key.

```bash
near contract call-function as-read-only nectar-core.nectar.testnet get_exit_capacity json-args '{"symbol":"NVDAx"}' network-config testnet now
near contract call-function as-read-only nectar-core.nectar.testnet list_quotes json-args '{"symbol":"NVDAx","from_index":0,"limit":16}' network-config testnet now
```

Command grammar: near-cli-rs v0.31.1 (F-018). The account id comes from `packages/config/config.yaml`.

The MCP server that exposes the same data to agents is a P1 item. See [Feed MCP](/integrate/feed-mcp).
