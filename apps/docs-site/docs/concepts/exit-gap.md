---
title: Exit gap
slug: /concepts/exit-gap
description: Collateral at stake minus what can actually absorb it.
---
# Exit gap

<p className="verified">Verified against: F-063 (2026-11-09) · spec docs/process/prd.md §1, §17 · D-009 (2026-11-10)</p>
<p className="status">Status: definition. The Feed displays it; it is built and runs locally (`pnpm --filter feed start`), with no public host.</p>

```text
exit gap_c = collateral value at stake_c − (Q_c + R_c + D_c)
```

The exit gap is how much collateral a lender holds that nothing committed or verified could absorb in a forced sale. A positive gap means the lender is relying on liquidity that may not be there when it is needed.

## Why it exists

- **Depth is revocable.** DEX and prop-AMM depth for tokenized stocks thins on weekends and in crashes. That is why `D_c` is forced to 0 when `market_session_open` is false.
- **No public route.** 1Click listed no tokenized equity on 2026-11-09 (F-063).

## How Nectar closes it

Committed quotes add `Q_c`, which does not disappear on a Friday evening because it is escrowed with a notice period of at least 7 days. The [Cramér limit](/concepts/cramer-limits) never exceeds `(1 − h_c)` times recoverable value, so the limit tracks the gap instead of ignoring it.

The Feed will show per asset: collateral at stake, `Q_c`, `R_c`, `D_c`, haircut, session state, exit gap and effective limit (PRD §10.2).
