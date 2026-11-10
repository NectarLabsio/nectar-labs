# WO-16c — keeper — default NEAR RPC → https://rpc.testnet.fastnear.com (≤ 15 tool calls; commit `fix(services): default RPC fastnear (D-025)`)
rpc.testnet.near.org is deprecated (answers "THIS ENDPOINT IS DEPRECATED", D-025). Replace the default in services/keeper/src/config.ts,
services/keeper/src/oracle-updater.ts, services/feed/src/main.ts, services/feed/src/mcp-stdio.ts, services/feed/scripts/record-skill-fixture.ts and
any other services/ default; keep `NEAR_RPC_URL` overriding. Leave recorded fixtures' content alone (they are recorded data); fix test expectations
that assert the old default. `pnpm verify:quick` + `pnpm verify` green. Write only services/. Report ≤ 6 lines.
