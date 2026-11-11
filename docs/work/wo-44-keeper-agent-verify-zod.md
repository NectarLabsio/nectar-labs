# WO-44 — keeper — reference agent verifies the MCP call; zod bump (< 45 min; commit `fix(x402): demo agent verifies the MCP call before signing; feed zod bump`)
Write only `services/x402/`, `services/feed/` (+ `pnpm-lock.yaml` for the bump). Source: docs/work/review-2-findings.md R2-05 + "Dependencies".
1. **R2-05** `services/x402/src/demo-agent.ts`: before signing, rebuild the expected call from the agent's own inputs (SDK `tx.borrow` / msg builder if
   importable, else explicit) and refuse unless: receiver_id = collateral token from config, method = `ft_transfer_call`, args.receiver_id = core contract from
   config, args.amount = DEMO_UNITS, decoded msg = LockCollateralAndBorrow with the requested borrow_usd, deposit = "1" (yocto), gas ≤ 300 Tgas. Exit non-zero
   with a clear message on mismatch. Unit test: a hostile MCP response (`ft_transfer` to attacker / other receiver / bigger amount) is refused; the honest one passes.
   Do NOT run demo:testnet (a verifier re-runs G14 separately).
2. `services/feed`: bump zod to ≥ 4.6.6 (review: high advisory < 4.6.6); feed tests + typecheck green.
`pnpm verify:quick` green. NO Co-Authored-By. Never --no-verify. Report ≤ 6 lines.
