---
title: Quoter (TEE) and fallback
slug: /protocol/quoter-tee
description: Hash-pinned OutLayer program computing the clearing discount.
---
# Quoter (TEE) and fallback

<p className="verified">Verified against: F-040 (2026-11-09), F-041 (2026-11-09), F-042 (2026-11-09), F-043 (2026-11-09), F-044 (2026-11-09), F-045 (VERIFY G4), F-046 (VERIFY G4) · spec docs/PRD.md §4.5, §7 · D-004 (2026-11-09)</p>
<p className="status">Status: P1, not built. Until G4 passes, settlement uses the fallback: each quote fills at its max_discount_bps. The fallback stays as a permanent code path.</p>

## Platform facts

| Fact | Value | Id |
| --- | --- | --- |
| Entry | `outlayer.testnet` `request_execution` with `source: {Project: {project_id, version_key}}`, `resource_limits`, `input_data`, `secrets_ref`, `response_format`, `payer_account_id` | F-040 |
| Limits | `max_instructions` default 1e9 / max 5e11; `max_memory_mb` 128 / 4096; `max_execution_seconds` 60 / 180 | F-041 |
| Cost | `estimate_execution_cost(resource_limits, input_len)` view | F-042 |
| Output | stdout ≤ 900 bytes; HTTP only on `wasm32-wasip2`; secrets as env vars | F-043 |
| Attestation | per execution, viewable at app.outlayer.ai/executions | F-044 |
| Publish flow, `version_key` format | **unverified** | F-045 (G4) |

## Clearing discount (PRD §4.5)

```text
disc_bps = min( max_discount_bps ,  regime_vol_bps + q_i · gamma_i · sigma_bps / 10^6 )
```

`q_i` (inventory utilisation, bps) and `gamma_i` (risk aversion, bps) are the buyer's secrets inside OutLayer. `sigma_bps` and `regime_vol_bps` come from price history. A light inventory clears cheaper than the public ceiling, and the buyer's curve never leaves the enclave.

## Output (≤ 900 bytes)

```json
{"v":1,"symbol":"NVDAx","price_e6":"182340000","src":"hermes","depth_e6":"0","depth_src":"none","session_open":false,"vol_bps":420,"fills":[{"id":7,"disc_bps":65}],"ts":1762700000}
```

At most 8 fills, ids as integers, amounts as strings.

## What the contract does with it

- Clamps every `disc_bps` to `[0, max_discount_bps]`. A faulty quoter can only make the **buyer** pay more, never the borrower.
- Applies the oracle band to `price_e6`.
- On failure or timeout, falls back to P0 pricing and emits `quoter_fallback`.

## Honest limits

The contract cannot verify the TDX quote on-chain. It trusts `outlayer.testnet` to run the pinned hash, and the attestation can be checked off-chain (F-044). Pinning is by `version_key` stored in contract state (`TODO-G4`). The owner can disable TEE pricing with `set_quoter_pin("")`, which reverts settlement to the fallback.
