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
# NEAR RPC (WO-35k): every call (views, access key, tx send) walks FastNEAR ×2, dRPC, Intear (F-413, keyless); 429 / 5xx / timeout
#   rotates with backoff. NEAR_RPC_URL goes first (loopback or NEAR_RPC_FALLBACK=off = alone); NEAR_RPC_URLS = exact list.
#   /healthz `rpc`: endpoint hosts, last_served, failovers, cooling. Logs `rpc_failover` / `rpc_endpoint` carry the host only.
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
Once a reservation has expired (including `remote.status == "Expired"` with no proven deposit), a late or short deposit is
confirmed too, so it can be released; no loan follows. Every argument is transcribed from the signed message and checked by
rebuilding it byte for byte. Positions are the slot `["pos", vault, id, committed_depositor]` and nonce records
`["nonce", position, authority, nonce_le]` (interface-v7 §E). A program-owned `NonceRecord` matching every field proves the leg
landed, whatever the slot shows now (it may be withdrawn or reopened); a plain transfer to the nonce PDA proves nothing. The tx
relayed is the successful one that ran that vault instruction with this slot and record in their account positions, found by
paging the nonce's history oldest first and then the slot's; the search is bounded per tick and resumes after a rate limit.
If the slot shows the leg's end status (or is withdrawn) with no record for the current nonce, the slot's history is searched for
an older nonce of the same leg under NEAR's authority, and that tx is relayed. An unchanged deposit is retried on a doubling
cooldown capped at 6 h; the contract's per-position keeper budget is the hard limit. The vault is pinned: `NECTAR_VAULT_PROGRAM_ID` and `NECTAR_VAULT_MINT` default to `config.yaml`
`solana.vault_program` / `solana.mint`, the keeper refuses to start without them, and a position naming another program is
refused. `/healthz` gains a `solana` block.

## Oracle updater (P1, D-013 — disabled until H13)

`pnpm --filter keeper oracle-updater` runs a separate process that pushes Hermes update data into
`pyth-oracle.testnet.update_price_feeds` with the fee (from the `get_update_fee_estimate` view) as deposit.
It uses its **own** small-balance account, never the keeper account. It stays disabled and logs
`oracle_updater_disabled{reason}` unless all of these are set: `PYTH_API_KEY_PATH` (0600 file, TODO-H13),
`ORACLE_UPDATER_ACCOUNT_ID`, `ORACLE_UPDATER_KEY_PATH` (0600), `ORACLE_UPDATER_FEED_IDS` (comma-separated 32-byte hex).
Unverified shapes are configurable: `PYTH_AUTH_HEADER` (default `Authorization`), `PYTH_AUTH_SCHEME` (default `Bearer`,
empty = raw key), `ORACLE_UPDATER_FEE_VIEW`, `ORACLE_UPDATER_DATA_ARG` (default `data`). Fee cap: `ORACLE_UPDATER_MAX_FEE_YOCTO`
(default 0.1 NEAR). The API key is never logged. Tests use a synthetic Hermes fixture (no key exists yet).

## Base relay (P2b, WO-29b)

Enabled by `BASE_RPC_URL` (chain 84532 only: Base Sepolia or the disclosed local fork; 8453 and mainnet hosts are refused,
and the chain id is checked on the wire). Signer: Foundry keystore `BASE_KEYSTORE_DIR/BASE_ACCOUNT` + 0600
`BASE_PASSWORD_FILE`, decrypted in-process; startup refuses if any `*PRIVATE_KEY*` / `*SECRET_KEY*` / `MNEMONIC` env var is set.
For each signed `get_pending_settlement_evm` / `get_pending_release_evm` the keeper rebuilds the EIP-712 digest from the
view fields, checks it equals the signed digest and that the signature recovers to the vault position's authority, then
sends `settle` / `release` and relays the 0x tx hash via `relay_settlement_result` / `relay_release_result`. The tx hash is
stored before broadcast (restart-safe); a used nonce on the slot `keccak256(abi.encode(id, depositor))` relays the tx found in
`PositionSettled` / `PositionReleased` logs, scanned from the reservation block (`BASE_LOG_LOOKBACK_BLOCKS`, default 10000,
applies only without a reservation time). The events do not name the slot: a direct call on another slot is passed over, and a
tx sent through another contract is used only when no direct call on this slot emitted the event. A slot showing the leg's end
status under NEAR's authority with the current nonce unused relays the older leg's log, limited to nonces that slot consumed.
The vault is pinned: `BASE_VAULT_ADDRESS`, default `config.yaml` `base.vault`.
Deposits: `keeper_attest_deposit` with `BASE_KEEPER_ATTEST=1` (local fork; labelled); expired reservations are covered as on
Solana, except that a short deposit is not attested, because attestation books the reserved units. Without it, `confirm_remote_deposit` is
unsupported because the quoter does not answer `vault_read` for base-sepolia: the keeper logs `base_deposit_confirm_unsupported`,
reports `base.deposit_confirm: "unsupported"` on `/healthz`, and sends nothing. `BASE_OUTLAYER_VAULT_READ=1` enables it once the
quoter does.
ERC-8021 suffix: not appended while the format is unverified (F-351); `/healthz` `base.builder_suffix` says so (TODO-H19).
