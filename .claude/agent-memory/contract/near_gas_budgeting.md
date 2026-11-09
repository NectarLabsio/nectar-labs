---
name: near-gas-budgeting
description: Creating N cross-contract receipts costs the creator ~5 Tgas/pair beyond attached gas; static callback gas undercounts — measured in nectar-core sandbox 2026-11-10
metadata:
  type: project
---

In the WO-10a sandbox, `on_quoter_result` with 10 `ft_transfer`+`on_payout` pairs failed "Exceeded the prepaid gas"
while reporting only ~13 Tgas burnt: the exec fees of each receipt it creates are charged to the creator on top of the
gas attached to them. Budget ~5 Tgas per transfer pair extra (constant `GAS_RECEIPTS_PER_TRANSFER`) and give the last
callback `function_call_weight(.., GasWeight(1))` so unused trigger gas flows to it.

**Why:** the keeper attaches 300 Tgas max; trigger -> OutLayer -> callback -> 10 transfers is near that cap, and
`gas_tgas` for `request_execution` above ~120 starves the 8-distinct-buyer case.
**How to apply:** when adding promises to settlement paths, re-run `gas_trigger_quoter_eight_legs` in
tests/sandbox_p1.rs and read the per-receipt `GAS,` lines before changing gas constants.
