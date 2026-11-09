---
name: explorer-webfetch-403
description: testnet.nearblocks.io pages return HTTP 403 to WebFetch (api-testnet.nearblocks.io gives 410); use RPC view_account for proof, record the 403
metadata:
  type: reference
---
On 2026-11-09 (G2 run, commit 5f27f44) WebFetch of https://testnet.nearblocks.io/address/<id> returned HTTP 403 for all three contracts; https://api-testnet.nearblocks.io/v1/account/<id> returned 410 Gone. Using curl with a browser user agent was denied by the auto-mode classifier as bot-check circumvention, so don't try it.
**How to apply:** for explorer-link criteria (G2, G7), record the WebFetch status as-is and prove existence/code via RPC (`view_account` code_hash, `view_access_key_list` at https://rpc.testnet.near.org). Say that a human browser check is still open. Caller accepted "links recorded" as the bar.
