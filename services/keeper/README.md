# keeper (P0)

Daemon holding one NEAR **function-call key** scoped to `trigger_preliquidation, relay_settlement_result`
on nectar-core (D-010). It never holds owner keys, never prices anything, and sends only a `position_id`
with 0 deposit. At startup it reads the key's on-chain permission and exits 2 (`startup_refused`) if it
is a FullAccess key; deleting full-access keys on the keeper account (D-012) stays the primary control.

Loop (every `KEEPER_POLL_MS`, default 10 s): `list_positions` (paged) → keep `status == "Open"` →
`get_health` → if `triggerable && oracle_fresh` → `trigger_preliquidation(position_id)`.
Local health maths (`src/health.ts`) is a logged cross-check only, pinned to `contracts/nectar-core/tests/model.csv`
(fallback `test/model.fixture.csv` until WO-2 lands it).

```bash
# env: CORE_ACCOUNT_ID, KEEPER_ACCOUNT_ID, KEEPER_KEY_PATH (0600 JSON: account_id, public_key, private_key)
# optional: NEAR_RPC_URL, KEEPER_POLL_MS, KEEPER_PAGE_SIZE, KEEPER_GAS_TGAS (≤300), KEEPER_HEALTH_PORT (8787),
#           KEEPER_HEALTH_HOST (127.0.0.1), KEEPER_DB_PATH (~/.nectar/keeper.sqlite)
pnpm --filter keeper start
curl -s localhost:8787/healthz   # last_block_seen, allowance, pending_settlements, ...
curl -s localhost:8787/runs      # keeper_runs (last 50)
pnpm --filter keeper test        # unit; testnet read-only suite runs with NECTAR_IT=1 CORE_ACCOUNT_ID=<core>
```

Idempotent on restart (on-chain `Settling` is skipped; interrupted runs are marked failed), exponential
backoff per position and per tick, JSON logs to stdout with no IP/address fields.
P2 relay (`relay_settlement_result`, Solana fee payer `KEEPER_SOLANA_KEYPAIR`) is not built yet.
