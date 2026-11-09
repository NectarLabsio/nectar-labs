---
name: reference-outlayer-oracles
description: Where OutLayer CLI/contract source lives, docs domain change, and how to list a NEAR contract's methods when no source exists
metadata:
  type: reference
---
- OutLayer CLI: github.com/out-layer/outlayer-cli (crate `outlayer-cli`, binary `outlayer`); contract + workers: github.com/out-layer/outlayer (contract/src/{execution,projects,views,lib}.rs).
- docs.outlayer.ai was NXDOMAIN on 2026-11-09; docs moved to outlayer.fastnear.com/docs.
- For contracts with no public source (e.g. price-oracle.testnet), list wasm exports via RPC `view_code` + parsing the export section (section id 7). That is how C-012 was found.
- 1Click SDK / MCP SDK: read npm tarballs under /tmp/research/<name>/package.
- Hermes `/v2/updates/price/latest` returned 401 without a key (2026-11-09); Pyth keys come from app.pyth.com.
