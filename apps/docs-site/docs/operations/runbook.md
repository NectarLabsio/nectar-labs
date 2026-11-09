---
title: Runbook
slug: /operations/runbook
description: Owner commands for pause, price override and keeper rotation.
---
# Runbook

<p className="verified">Verified against: F-018 (2026-11-10), F-019 (2026-11-10) · F-154 (2026-11-09) · docs/work/interface-p0.md (2026-11-10) · config.yaml oracle max ages · evidence/G2/keeper-key-20261109T2050Z.log · mirrors docs/RUNBOOK.md</p>
<p className="status">Status: commands target the P0 interface deployed on testnet on 2026-11-09 (G2 PASS 2026-11-09T20:55Z, commit 5f27f44). P1 and P2 commands are marked as such and do not exist in the P0 build.</p>

Ids from `packages/config/config.yaml`:

```bash
CORE=nectar-core.nectar.testnet      # nectar-core account
OWNER=nectar.testnet                 # owner account (keychain)
```

## Standing duties

- **Owner price every 24 h while the session is closed.** The oracle max age is 120 s in session and 86,400 s closed (`max_age_s_session`, `max_age_s_closed` in config.yaml; `set_oracle_params` on chain). An older price makes borrows and `trigger_preliquidation` fail with `oracle stale`. Refresh with `update_owner_price` (below).
- **Keeper allowance.** `keeper.nectar.testnet` has only a function-call key with a 1 NEAR allowance and no full-access key, so the key cannot be rotated or topped up in place. When the allowance runs out, follow [Rotate the keeper](#rotate-the-keeper).
- **Owner balance.** `nectar.testnet` holds less than 1 NEAR. Top it up from the testnet faucet https://near-faucet.io/ (F-154) before owner transactions.

## Health

```bash
near contract call-function as-read-only "$CORE" get_config json-args '{}' network-config testnet now
near contract call-function as-read-only "$CORE" get_exit_capacity json-args '{"symbol":"NVDAx"}' network-config testnet now
near contract call-function as-read-only "$CORE" get_pool json-args '{}' network-config testnet now
```

## Pause and unpause

```bash
near contract call-function as-transaction "$CORE" pause json-args '{}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-keychain send
near contract call-function as-transaction "$CORE" unpause json-args '{}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-keychain send
```

## Owner price (P0 oracle)

Within the band:

```bash
near contract call-function as-transaction "$CORE" update_owner_price json-args '{"symbol":"NVDAx","price_usd_e6":"185000000"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-keychain send
```

Outside the band (two-step override):

```bash
near contract call-function as-transaction "$CORE" propose_price json-args '{"symbol":"NVDAx","price_usd_e6":"150000000"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-keychain send
near contract call-function as-transaction "$CORE" apply_price json-args '{"symbol":"NVDAx"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-keychain send
```

## Rotate the keeper

The keeper account has no full-access key, so rotation means a new keeper account. Create the account (it has a full-access key at first), add the scoped key as on [Run a keeper](/integrate/run-a-keeper), delete the new account's full-access key, then switch the contract:

```bash
near contract call-function as-transaction "$CORE" set_keeper json-args '{"keeper":"<new_keeper>"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-keychain send
near account delete-keys <new_keeper> public-keys <full_access_public_key> network-config testnet sign-with-keychain send
```

Point `KEEPER_ACCOUNT_ID` and `KEEPER_KEY_PATH` at the new account and restart. The old account's key cannot be deleted (no full-access key) and is inert after `set_keeper`.

## Gas reserve

`fund_gas_reserve` is payable and owner-only. Keep it at the 5 NEAR target (`gas_reserve_target_near`). P0 does not spend it. P1 and P2 cross-contract calls do.

## P1 only

`set_quoter_pin` with an empty pin disables TEE pricing, and settlement then uses `max_discount_bps`. The method does not exist in the P0 build.

Command grammar: F-018 (call-function), F-019 (delete-keys). Incident playbooks: [Incident response](/operations/incidents).
