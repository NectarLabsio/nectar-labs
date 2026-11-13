# WO-16b — keeper — G2b fix (≤ 15 tool calls; commit `test(services): read core id from config, not the v1 literal`)
Read docs/process/gate-fail-g2b.md. `services/feed/test/defaults.test.ts` (lines ~21, 26) and `services/keeper/test/keyfile.test.ts` (~43) assert the literal
`nectar-core.nectar.testnet`. config.yaml now has `accounts.core = nectar-core-v2.nectar.testnet` (v1 kept as `accounts.core_v1`). Make the tests read the
expected id from packages/config/config.yaml (the same loader the code uses) so they pass for either value. Search services/ for any other v1 literal
in tests or code defaults and fix the same way. `pnpm verify:quick` and `pnpm verify` green (pnpm verify runs scripts/50-verify.sh against public testnet).
Write only services/. Report ≤ 8 lines.
