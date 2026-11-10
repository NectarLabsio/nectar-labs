---
title: Aggregate borrowing limit
slug: /concepts/aggregate-limit
description: The v7 two-sided check. A loan must fit its own LTV ceiling and the capacity the whole asset shares.
---
# Aggregate borrowing limit

<p className="verified">Verified against: spec docs/PRD.md §4.2 (aggregate rule, v7) · docs/work/interface-v7.md §A1, §A6 · D-018 (2026-11-10) · tests listed below (evidence/wo-21/cargo-test.log, 2026-11-10)</p>
<p className="status">Status: built and tested in the sandbox; testnet deployment pending. It ships in `nectar-core-v2.nectar.testnet`, which has not been created yet (D-018; it needs testnet NEAR, handoff H-NEAR-FAUCET). The live v1 contract does not have this check.</p>

## Why it changed

`Q_c + R_c + D_c` is one pool of exit capacity per asset, and every position in that asset shares it. v6 compared each new loan with the whole pool and ignored the loans already drawn against it, so two borrowers could each draw the full capacity (PRD §4.2). v7 adds a second check that covers the whole asset.

## The two checks

A borrow passes only if **both** hold (interface-v7 §A1):

```text
position:  position_debt               ≤ max_nectar_ltv_bps · V_position / 10_000
asset:     total_debt_usd_e6 + borrow  ≤ (10_000 − h_c) · (Q_c + R_c + D_c) / 10_000
```

| Term | Field | Notes |
| --- | --- | --- |
| `V_position` | units × M × price (see [Corporate-action multiplier](./corporate-actions.md)) | the position's own collateral |
| `total_debt_usd_e6` | `CollateralConfig.total_debt_usd_e6` | goes up on borrow, down on repay, and down by the debt repaid at settlement |
| `Q_c` | `active_committed_q_usd_e6` | committed quotes ([Pappus quotes](./pappus-quotes.md)) |
| `R_c` | `nectar_reserve_usd_e6` | Nectar Reserve; 0 until the Reserve work order ships |
| `D_c` | `verified_dex_depth_usd_e6` | verified DEX depth; forced to 0 when the session is closed ([Weekend Oracle Guard](./weekend-oracle-guard.md)) |
| `h_c` | `base_haircut_bps` in session, `weekend_haircut_bps` otherwise | owner-set |

Integer maths, rounded against the borrower. A refusal comes back from `preview_borrow` with `reason: "aggregate_limit"`.

## Worked example (illustrative numbers, not chain state)

Session closed, so `D_c` = 0 and `h_c` = 2,500 bps. `Q_c` = $10,000 and `R_c` = 0. The asset can carry (1 − 0.25) × $10,000 = **$7,500** of total debt.

| Step | total debt | Headroom | Result |
| --- | --- | --- | --- |
| Borrower A draws $6,000 (own LTV ceiling $7,000) | $6,000 | $1,500 | passes both checks |
| Borrower B asks for $3,000 (own LTV ceiling $9,000) | — | $1,500 | refused, `aggregate_limit` |
| Borrower B asks for $1,500 | $7,500 | $0 | passes |
| A repays $2,000 | $5,500 | $2,000 | headroom is freed for anyone |

## Where you can read it

`get_exit_capacity(symbol)` on v2 adds `total_debt_usd_e6`, `aggregate_capacity_usd_e6` (= (1 − h)(Q + R + D)) and `aggregate_headroom_usd_e6`. `preview_borrow` adds `aggregate_headroom_usd_e6` (interface-v7 §A6). The Feed MCP tool `quote_capacity` returns total debt and headroom when it runs against v2 (see [Agent skill and x402](../integrate/agent-skill-x402.md)).

## Tests

- `math::tests::aggregate_headroom_limits_b_c`
- `tests_v7::two_borrowers_cannot_both_draw_full_capacity`
- `tests_v7::split_capacity_between_two_borrowers_then_repay_frees_headroom`
- `tests_v7::settlement_reduces_total_debt`
- `tests_v7::failed_borrow_proceeds_leave_the_aggregate` (a failed payout does not leave phantom debt)
- sandbox `aggregate_debt_two_borrowers_repay_settle` (contracts/nectar-core/tests/sandbox_v7.rs)
- Feed: `agent skill: open_protected_stock_loan` › "v2: aggregate_limit refusal" (services/feed/test/skill.test.ts)

Run them with `cargo test --workspace` in `contracts/` and `pnpm --filter feed test`.
