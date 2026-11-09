---
title: Storage and gas
slug: /protocol/storage-and-gas
description: Storage staking, bounded iteration and gas budgets.
---
# Storage and gas

<p className="verified">Verified against: F-014 (2026-11-09), F-015 (2026-11-09), F-034 (2026-11-09), F-041 (2026-11-09), F-042 (2026-11-09) · spec docs/PRD.md §6.6, §6.9 · config.yaml limits</p>
<p className="status">Status: specification. Measured gas per method is recorded at G1/G2. Values marked TODO-G2 are not measured yet.</p>

## Storage

NEAR charges storage staking at 10^19 yoctoNEAR per byte (F-014), which is 0.00001 NEAR per byte. A quote or position record is about 300 bytes (PRD §6.9). That is about 0.003 NEAR locked per record, paid by the contract account in this build. PROD adds a per-account storage deposit (NEP-145 style).

## Bounded iteration

| Bound | Value | Why |
| --- | --- | --- |
| Live quotes per asset | 64 (`max_quotes_per_asset`) | funding beyond this is refunded |
| Quotes touched per settlement | 8 (`max_quotes_per_settlement`) | settlement gas stays bounded |
| Minimum quote | $100 (`min_quote_usd_e6`) | storage griefing |
| Fee accrual | O(1) accumulator | no loop over quotes |
| List views | `from_index`, `limit` | pagination only |

## Gas

| Call | Budget | Status |
| --- | --- | --- |
| `ft_transfer_call` into core | TODO-G2 (measured in sandbox) | pending G1 |
| `trigger_preliquidation` (P0, ≤ 8 quotes) | TODO-G2 | pending G1 |
| OutLayer `request_execution` (P1) | `gas_tgas: 150` planned; cost from `estimate_execution_cost` (F-042) | pending G4 |
| `v1.signer-prod.testnet.sign` (P2) | from `sign_call_gas_attachment_requirement_tera_gas` (F-034), not a constant | pending G7 |

OutLayer resource limits planned in config.yaml are `max_instructions` 1e8, `max_memory_mb` 128 and `max_execution_seconds` 30, all within the platform maxima in F-041.

## Keeper gas

The keeper signs with a function-call access key. Such keys cannot attach deposits, and exhausting the allowance makes the key unusable (F-015). The keeper account holds a small NEAR balance, so a leaked key can burn at most that balance.
