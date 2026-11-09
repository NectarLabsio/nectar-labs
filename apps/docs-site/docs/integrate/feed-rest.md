---
title: Feed REST
slug: /integrate/feed-rest
description: Public read API over committed exit capacity.
---
# Feed REST

<p className="verified">Verified against: F-018 (2026-11-10), F-021 (2026-11-09) · spec docs/PRD.md §10.2</p>
<p className="status">Status: not built (WO-5 indexer; REST in P1). Until it ships, read the contract views directly. They are public and need no key.</p>

## Planned endpoints (PRD §10.2)

| Route | Returns |
| --- | --- |
| `GET /api/feed` | every collateral: `Q_c`, `R_c`, `D_c`, haircut, session, exit gap, effective limit, oracle age |
| `GET /api/feed/:symbol` | one collateral, same fields |
| `GET /api/feed/:symbol/history?from=&to=` | time series from indexed NEP-297 events |
| `GET /api/export.csv` | the same, as CSV |

The data comes from the indexer, which tails `nectar-core` NEP-297 events (F-021) into SQLite. Responses are cached for 10 s. The OpenAPI document (`services/feed/openapi.yaml`) will be rendered on this page when the service exists.

## Today: read the chain directly

```bash
near contract call-function as-read-only TODO-G2 get_exit_capacity json-args '{"symbol":"NVDAx"}' network-config testnet now
near contract call-function as-read-only TODO-G2 list_quotes json-args '{"symbol":"NVDAx","from_index":0,"limit":16}' network-config testnet now
```

Command grammar: near-cli-rs v0.31.1 (F-018). The account id is `TODO-G2` until deploy.
