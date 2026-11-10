# keeper

Daemon holding one NEAR **function-call key** scoped to `trigger_preliquidation, relay_settlement_result`
on nectar-core (D-010). It never holds owner keys, never prices anything, and sends only a `position_id`
with 0 deposit. At startup it reads the key's on-chain permission and exits 2 (`startup_refused`) if it
is a FullAccess key; deleting full-access keys on the keeper account (D-012) stays the primary control.

Loop (every `KEEPER_POLL_MS`, default 10 s): `list_positions` (paged) → keep `status == "Open"` →
`get_health` → if `triggerable && oracle_fresh` → `trigger_preliquidation(position_id)`.
Local health maths (`src/health.ts`) is a logged cross-check only, pinned to `contracts/nectar-core/tests/model.csv`
(fallback `test/model.fixture.csv` until WO-2 lands it).

```bash
# required: KEEPER_KEY_PATH (0600 JSON: account_id, public_key, private_key; no default key)
# ids: CORE_ACCOUNT_ID, KEEPER_ACCOUNT_ID default to accounts.core / accounts.keeper in packages/config/config.yaml
# optional: NEAR_RPC_URL, KEEPER_POLL_MS, KEEPER_PAGE_SIZE, KEEPER_GAS_TGAS (≤300), KEEPER_HEALTH_PORT (8787),
#           KEEPER_HEALTH_HOST (127.0.0.1), KEEPER_DB_PATH (~/.nectar/keeper.sqlite)
pnpm --filter keeper start
curl -s localhost:8787/healthz   # last_block_seen, allowance, pending_settlements, ...
curl -s localhost:8787/runs      # keeper_runs (last 50)
pnpm --filter keeper test        # unit; testnet read-only suite runs with NECTAR_IT=1
```

Idempotent on restart (on-chain `Settling` is skipped; interrupted runs are marked failed), exponential
backoff per position and per tick, JSON logs to stdout with no IP/address fields.

## Solana relay (P2, `src/solana.ts`)

Enabled only when `KEEPER_SOLANA_KEYPAIR` (0600 solana-keygen JSON, path only; never logged) is set; `SOLANA_RPC_URL`
defaults to devnet and a mainnet URL is refused. Each tick: `Settling` positions whose collateral has `remote_chain` →
`get_pending_settlement` (`Signed`) → `[Ed25519 verify ix, settle ix]` (solana/client; kind from the preimage suffix) → confirm →
`relay_settlement_result(position_id, solana_tx_sig)`. v2 only (`contract_version` 2.x): `remote.status == "Releasing"` →
`get_pending_release` → `[Ed25519, release]` → `relay_release_result` (falls back to `relay_settlement_result` if absent);
`remote.status == "AwaitingDeposit"` + position PDA amount ≥ reserved units and authority match → `confirm_remote_deposit`.
Every argument is transcribed from the signed message and checked by rebuilding it byte for byte. Idempotent: a used nonce PDA
means the leg landed (the tx that created it is relayed); a closed position PDA is skipped. Optional: `NECTAR_VAULT_PROGRAM_ID`
(cross-check), `NECTAR_VAULT_MINT` (else the Vault account is found by symbol). `/healthz` gains a `solana` block.

## Oracle updater (P1, D-013 — disabled until H13)

`pnpm --filter keeper oracle-updater` runs a separate process that pushes Hermes update data into
`pyth-oracle.testnet.update_price_feeds` with the fee (from the `get_update_fee_estimate` view) as deposit.
It uses its **own** small-balance account, never the keeper account. It stays disabled and logs
`oracle_updater_disabled{reason}` unless all of these are set: `PYTH_API_KEY_PATH` (0600 file, TODO-H13),
`ORACLE_UPDATER_ACCOUNT_ID`, `ORACLE_UPDATER_KEY_PATH` (0600), `ORACLE_UPDATER_FEED_IDS` (comma-separated 32-byte hex).
Unverified shapes are configurable: `PYTH_AUTH_HEADER` (default `Authorization`), `PYTH_AUTH_SCHEME` (default `Bearer`,
empty = raw key), `ORACLE_UPDATER_FEE_VIEW`, `ORACLE_UPDATER_DATA_ARG` (default `data`). Fee cap: `ORACLE_UPDATER_MAX_FEE_YOCTO`
(default 0.1 NEAR). The API key is never logged. Tests use a synthetic Hermes fixture (no key exists yet).
