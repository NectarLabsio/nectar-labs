---
title: Runbook
slug: /operations/runbook
description: Owner commands for pause, price override and keeper rotation.
---
# Runbook

<p className="verified">Verified against: F-018 (2026-11-10), F-019 (2026-11-10) · docs/work/interface-p0.md (2026-11-10) · mirrors docs/RUNBOOK.md</p>
<p className="status">Status: commands target the P0 interface deployed on testnet on 2026-11-09 (G2 verification pending). P1 and P2 commands are marked as such and do not exist in the P0 build.</p>

Ids from `packages/config/config.yaml`:

```bash
CORE=nectar-core.nectar.testnet      # nectar-core account
OWNER=nectar.testnet                 # owner account (keychain)
```

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

```bash
near contract call-function as-transaction "$CORE" set_keeper json-args '{"keeper":"<new_keeper>"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-keychain send
near account delete-keys <old_keeper> public-keys <old_public_key> network-config testnet sign-with-keychain send
```

## Gas reserve

`fund_gas_reserve` is payable and owner-only. Keep it at the 5 NEAR target (`gas_reserve_target_near`). P0 does not spend it. P1 and P2 cross-contract calls do.

## P1 only

`set_quoter_pin` with an empty pin disables TEE pricing, and settlement then uses `max_discount_bps`. The method does not exist in the P0 build.

Command grammar: F-018 (call-function), F-019 (delete-keys). Incident playbooks: [Incident response](/operations/incidents).
