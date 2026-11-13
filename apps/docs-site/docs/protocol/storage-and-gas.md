---
title: Storage and gas
slug: /protocol/storage-and-gas
description: Storage staking, bounded iteration and gas budgets.
---
# Storage and gas

<p className="verified">Verified against: F-014 (2026-11-09), F-015 (2026-11-09), F-034 (2026-11-09), F-041 (2026-11-09), F-042 (2026-11-09) · spec docs/process/prd.md §6.6, §6.9 · config.yaml limits · evidence/G1/gas-sandbox.csv (G1 PASS 2026-11-09T20:43Z, commit b721641) · `set_session` removed in commit c7fa925 (exports re-read 2026-11-13)</p>
<p className="status">Status: P0 gas measured in the near-workspaces sandbox at G1 (evidence/G1/gas-sandbox.csv, G1 PASS commit b721641). Testnet gas may differ slightly; P1/P2 budgets are not measured yet.</p>

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

Measured P0 values, copied from evidence/G1/gas-sandbox.csv (total gas burnt per call, 1 Tgas = 10^12 gas). `ft_transfer_call:*` rows include the token transfer and the `ft_on_transfer` branch named after the colon.

| Call (sandbox) | Gas burnt | Tgas |
| --- | ---: | ---: |
| `apply_price` | 2,271,054,866,034 | 2.27 |
| `claim_fees` | 6,623,355,577,701 | 6.62 |
| `complete_quote_withdrawal` | 6,733,776,178,760 | 6.73 |
| `ft_transfer_call:FundPappusQuote` | 6,757,563,058,562 | 6.76 |
| `ft_transfer_call:LockCollateralAndBorrow` | 11,087,671,216,717 | 11.09 |
| `ft_transfer_call:Repay(partial)` | 6,445,177,830,363 | 6.45 |
| `ft_transfer_call:Repay(refund)` | 6,507,390,100,626 | 6.51 |
| `ft_transfer_call:SupplyLendingLiquidity` | 6,270,630,565,433 | 6.27 |
| `ft_transfer_call:TopUpQuote` | 6,628,524,629,556 | 6.63 |
| `ft_transfer_call:invalid` | 6,370,933,934,517 | 6.37 |
| `fund_gas_reserve` | 1,796,782,826,135 | 1.80 |
| `initiate_quote_withdrawal` | 2,315,007,889,416 | 2.32 |
| `new` | 1,751,354,662,595 | 1.75 |
| `pause` | 1,840,940,796,311 | 1.84 |
| `propose_price` | 2,080,696,706,142 | 2.08 |
| `set_dex_depth` | 2,041,277,668,171 | 2.04 |
| `set_fee_split` | 1,814,690,526,452 | 1.81 |
| `set_keeper` | 1,814,311,870,139 | 1.81 |
| `set_oracle_params` | 1,817,307,324,212 | 1.82 |
| `set_quote_params` | 1,817,303,650,097 | 1.82 |
| `set_reserve` (v1 only; removed in v2, D-024) | 2,041,323,627,883 | 2.04 |
| `set_session` (v1 only; v2 uses `set_session_calendar` and `force_session_closed`) | 2,037,962,774,353 | 2.04 |
| `trigger_preliquidation(2 legs)` | 19,979,096,630,723 | 19.98 |
| `trigger_preliquidation(8 legs)` | 46,970,045,935,847 | 46.97 |
| `unpause` | 1,841,759,818,559 | 1.84 |
| `update_owner_price` | 2,118,858,280,279 | 2.12 |
| `upsert_collateral` | 2,360,519,213,673 | 2.36 |

Mock token (mock-ft) calls, for reference:

| Call (sandbox) | Gas burnt | Tgas |
| --- | ---: | ---: |
| `mock-ft:ft_transfer` | 1,937,331,976,856 | 1.94 |
| `mock-ft:mint` | 1,728,122,260,829 | 1.73 |
| `mock-ft:new` | 1,525,112,786,760 | 1.53 |
| `mock-ft:storage_deposit` | 1,727,810,328,399 | 1.73 |

The worst P0 case is `trigger_preliquidation` touching 8 quotes (`max_quotes_per_settlement`) at about 47 Tgas, well under the 300 Tgas per-transaction limit the keeper attaches (`KEEPER_GAS_TGAS`, default 300).

| Call (later phases) | Budget | Status |
| --- | --- | --- |
| OutLayer `request_execution` (P1) | `gas_tgas: 150` planned; cost from `estimate_execution_cost` (F-042) | pending G4 |
| `v1.signer-prod.testnet.sign` (P2) | from `sign_call_gas_attachment_requirement_tera_gas` (F-034), not a constant | 30 Tgas attached in the G7 run (docs/EVIDENCE.md §G7) |

OutLayer resource limits planned in config.yaml are `max_instructions` 1e8, `max_memory_mb` 128 and `max_execution_seconds` 30, all within the platform maxima in F-041.

## Keeper gas

The keeper signs with a function-call access key. Such keys cannot attach deposits, and exhausting the allowance makes the key unusable (F-015). The testnet keeper key has a 1 NEAR allowance (evidence/G2/keeper-key-20261109T2050Z.log); a leaked key can burn at most that. When the allowance runs out the key stops working; see [Runbook](/operations/runbook) for the replacement procedure.
