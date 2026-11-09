# RUNBOOK.md — operations and incidents (testnet now, mainnet shape)

## Ids (testnet, from packages/config/config.yaml; deployed 2026-11-09, G2 PASS 2026-11-09T20:55Z, commit 5f27f44)
```bash
CORE=nectar-core.nectar.testnet
OWNER=nectar.testnet
KEEPER=keeper.nectar.testnet   # function-call key only (D-012); keeper not running continuously
```

## Standing duties (P0 testnet)
1. **Refresh the owner price at least every 24 h while the session is closed.** The oracle max age is 120 s in session and
   86,400 s closed (`max_age_s_session` / `max_age_s_closed` in config.yaml; contract `set_oracle_params`). Past it, borrows and
   `trigger_preliquidation` fail with `oracle stale` (contracts/nectar-core/src/lib.rs). Command: `update_owner_price` (below).
2. **Keeper allowance.** `keeper.nectar.testnet` has only a function-call key with a 1 NEAR allowance
   (evidence/G2/keeper-key-20261109T2050Z.log) and no full-access key, so it cannot be rotated or topped up in place. When the
   allowance runs out (`/healthz` `allowance` near 0, trigger txs rejected): create a new keeper account, add a function-call key
   for `trigger_preliquidation,relay_settlement_result` on `$CORE`, delete its full-access key, then owner `set_keeper <new>` and
   point `KEEPER_ACCOUNT_ID` / `KEEPER_KEY_PATH` at it.
3. **Owner balance.** `nectar.testnet` holds < 1 NEAR. Top up from the testnet faucet https://near-faucet.io/ (F-154) before
   owner transactions; if the faucet is rate-limited, write H-NEAR-FAUCET.

## Health checks
- Keeper: `curl -s localhost:8787/healthz` → `{ok, last_block_seen, last_tick_at, consecutive_errors, allowance, open_positions, pending_settlements, triggers_sent}`; HTTP 503 when the last tick is older than 3 poll intervals, ≥ 3 consecutive errors, or the key is full-access (services/keeper/src/server.ts).
- Contract: `near contract call-function as-read-only $CORE get_config json-args '{}' network-config testnet now` (P0 interface has no `get_status`; see docs/work/interface-p0.md) plus `get_exit_capacity '{"symbol":"NVDAx"}'` for oracle age.
- Feed API: `curl -s $FEED_URL/api/feed | jq '.assets[0]'`.

## Incidents
| Incident | First action (owner) | Then |
| --- | --- | --- |
| Oracle wrong or stale | `pause` | `propose_price` → `apply_price`, or `set_oracle_source` to fallback; `unpause`; EVIDENCE note |
| Quoter compromised / absurd output | `set_quoter_pin ""` (disables TEE pricing → static `max_discount_bps`) | fix WASM, republish, re-pin, re-record sha256 + version_key |
| Keeper key leaked or allowance spent | new keeper account with a function-call key; owner `set_keeper <new>` | point `KEEPER_KEY_PATH` at the new key; restart keeper (old account has no full-access key, so its key cannot be deleted; it is inert once `set_keeper` changes) |
| Position stuck in `Settling` | any keeper relays with `relay_settlement_result` | after `expires`, owner `cancel_settlement` → position back to `Open`; event emitted |
| Gas reserve low (< 1 NEAR) | `fund_gas_reserve` with 5 NEAR | alert threshold in keeper |
| Contract bug | `pause`; write incident note | patch; sandbox migration test; redeploy same account (hackathon) / DAO proposal (PROD) |
| Faucet / airdrop exhausted | retry with backoff ×5 | write H-NEAR-FAUCET / H-SOL-AIRDROP |

## Commands (fill ids from packages/config/config.yaml)
```
near contract call-function as-transaction $CORE pause json-args '{}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
near contract call-function as-transaction $CORE update_owner_price json-args '{"symbol":"NVDAx","price_usd_e6":"180000000"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
near contract call-function as-transaction $CORE propose_price json-args '{"symbol":"NVDAx","price_usd_e6":"150000000"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
near contract call-function as-transaction $CORE apply_price json-args '{"symbol":"NVDAx"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
# P1 only (not in P0 build):
near contract call-function as-transaction $CORE set_quoter_pin json-args '{"version_key":"","wasm_sha256":""}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
```
(Exact `call-function` grammar re-confirmed at G0 → F-018.)

## Upgrades
Hackathon: redeploy on the same account; tag commit; `contract_version()` bumped; borsh layouts versioned.
PROD: Sputnik DAO owner, 48 h timelock on `upsert_collateral` / `set_oracle_source`, instant `pause`, public changelog.

## Backups
All state on-chain; SQLite rebuilt with `pnpm --filter feed index:rebuild`. Keys: `near account export-account` once → encrypted offline file (HUMAN).
