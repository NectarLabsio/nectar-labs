# RUNBOOK.md — operations and incidents (testnet now, mainnet shape)

## Health checks
- Keeper: `curl -s $KEEPER_URL/healthz` → `{lastBlock, allowanceYocto, pendingSettlements, oracleAgeS}`; stale if lastBlock older than 3 min.
- Contract: `near contract call-function as-read-only $CORE get_status json-args '{}' network-config testnet now` → paused?, oracle age, gas reserve, quoter pin.
- Feed API: `curl -s $FEED_URL/api/feed | jq '.assets[0]'`.

## Incidents
| Incident | First action (owner) | Then |
| --- | --- | --- |
| Oracle wrong or stale | `pause` | `propose_price` → `apply_price`, or `set_oracle_source` to fallback; `unpause`; EVIDENCE note |
| Quoter compromised / absurd output | `set_quoter_pin ""` (disables TEE pricing → static `max_discount_bps`) | fix WASM, republish, re-pin, re-record sha256 + version_key |
| Keeper key leaked | `set_keeper <new>`; `near account delete-keys keeper… <old pk>` | rotate `KEEPER_KEY_PATH`; redeploy keeper |
| Position stuck in `Settling` | any keeper relays with `relay_settlement_result` | after `expires`, owner `cancel_settlement` → position back to `Open`; event emitted |
| Gas reserve low (< 1 NEAR) | `fund_gas_reserve` with 5 NEAR | alert threshold in keeper |
| Contract bug | `pause`; write incident note | patch; sandbox migration test; redeploy same account (hackathon) / DAO proposal (PROD) |
| Faucet / airdrop exhausted | retry with backoff ×5 | write H-NEAR-FAUCET / H-SOL-AIRDROP |

## Commands (fill ids from packages/config/config.yaml)
```
near contract call-function as-transaction $CORE pause json-args '{}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
near contract call-function as-transaction $CORE propose_price json-args '{"token":"'$NVDAX'","price_e6":"185000000","conf_e6":"50000"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
near contract call-function as-transaction $CORE apply_price json-args '{"token":"'$NVDAX'"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
near contract call-function as-transaction $CORE set_quoter_pin json-args '{"version_key":"","wasm_sha256":""}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
```
(Exact `call-function` grammar re-confirmed at G0 → F-018.)

## Upgrades
Hackathon: redeploy on the same account; tag commit; `contract_version()` bumped; borsh layouts versioned.
PROD: Sputnik DAO owner, 48 h timelock on `upsert_collateral` / `set_oracle_source`, instant `pause`, public changelog.

## Backups
All state on-chain; SQLite rebuilt with `pnpm --filter feed index:rebuild`. Keys: `near account export-account` once → encrypted offline file (HUMAN).
