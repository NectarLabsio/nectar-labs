# WO-34x — keeper (services) — SR-32 x402, SR-33 feed skill (< 1 h; commit `fix(services): SR-32 facilitator auth, SR-33 preview pre_liq`)
Read docs/work/security-review-v7.md SR-32 and SR-33. SR-32: the facilitator HTTP endpoint must not settle caller-chosen requirements for strangers — bind to
the server's own route requirements (asset, amount, payTo, network) and/or require a shared secret from env (path only, never logged); in-process mode stays
default. SR-33: open_protected_stock_loan's preview must apply the same pre_liq_ltv_bps rule as the contract (ok=false with the contract's reason). Tests for
both. Write only services/. NO Co-Authored-By line. Report ≤ 8 lines.
