---
title: Run a keeper
slug: /integrate/run-a-keeper
description: One function-call key, two methods, no deposits.
---
# Run a keeper

<p className="verified">Verified against: F-015 (2026-11-09), F-018 (2026-11-10), F-019 (2026-11-10), F-020 (2026-11-10), C-004 (open) · D-010, D-012 (2026-11-10) · services/keeper/src/config.ts, keyfile.ts, server.ts, package.json · evidence/G2/keeper-key-20261109T2050Z.log, evidence/G2/verifier-20261109T2055Z.log (G2 PASS 2026-11-09T20:55Z, commit 5f27f44)</p>
<p className="status">Status: keeper service built (services/keeper, WO-5) and run locally; not running continuously. Account `keeper.nectar.testnet` holds one function-call key (1 NEAR allowance, 2 methods) and no full-access key (D-012, checked at G2). P0 has one keeper account. Registry, bonds and races are PROD-only. The P2 relay (`relay_settlement_result`) is not built.</p>

## The key

The keeper signs with a **function-call access key** on its own account, restricted to `nectar-core` and to two methods (D-010). Such a key cannot attach deposits, and once its allowance is spent the key stops working (F-015). The testnet key was created with:

```bash
near account add-key keeper.nectar.testnet \
  grant-function-call-access --allowance '1 NEAR' \
  --contract-account-id nectar-core.nectar.testnet \
  --function-names trigger_preliquidation,relay_settlement_result \
  autogenerate-new-keypair --signature-scheme ed25519 save-to-keychain \
  network-config testnet sign-with-keychain send
```

Grammar from near-cli-rs v0.31.1 source (F-020); the exact command is in evidence/G2/keeper-key-20261109T2050Z.log. Older docs spell the flags `--receiver-account-id` / `--method-names`, which v0.31.1 does not accept (C-004). Full-access keys on the keeper account are then removed with `near account delete-keys` (F-019); the G2 verifier recorded the access-key list (one `FunctionCall` key, allowance `1000000000000000000000000` yocto).

## Configure and start

The keeper reads ids and a key **path** from the environment. Key material never sits in `.env`.

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `CORE_ACCOUNT_ID` | yes | — | `nectar-core.nectar.testnet` |
| `KEEPER_ACCOUNT_ID` | yes | — | `keeper.nectar.testnet` |
| `KEEPER_KEY_PATH` | yes | — | JSON file `{account_id, public_key, private_key}` holding the function-call key; must be mode `0600` (the keeper refuses group/other bits) |
| `NEAR_RPC_URL` | no | `https://rpc.testnet.near.org` | RPC endpoint |
| `KEEPER_POLL_MS` | no | `10000` | loop interval |
| `KEEPER_PAGE_SIZE` | no | `50` | `list_positions` page size |
| `KEEPER_GAS_TGAS` | no | `300` | gas per trigger (max 300) |
| `KEEPER_HEALTH_PORT` / `KEEPER_HEALTH_HOST` | no | `8787` / `127.0.0.1` | health server |
| `KEEPER_DB_PATH` | no | `~/.nectar/keeper.sqlite` | run history |

```bash
export CORE_ACCOUNT_ID=nectar-core.nectar.testnet KEEPER_ACCOUNT_ID=keeper.nectar.testnet
export KEEPER_KEY_PATH=~/.nectar/keeper.json      # chmod 600
pnpm --filter keeper start
curl -s localhost:8787/healthz                    # 200 when healthy, 503 otherwise
curl -s localhost:8787/runs                       # last 50 runs
```

The keeper refuses to start (exit code 2, `startup_refused` log) while a required id is unset or still `TODO-G2`, or while the key file is missing or readable by group/other.

## Full-access keys are refused

The refusal is layered. Operationally, `keeper.nectar.testnet` has no full-access key (D-012, verified at G2). In the service, the keeper reads the permission of its own key each tick: if it is `FullAccess`, `/healthz` reports `"allowance": "FULL_ACCESS (expected a function-call key)"` and `"ok": false` (HTTP 503) (services/keeper/src/server.ts). It does not exit on its own, so monitoring must treat a 503 as a stop signal. A contract-level check of the signer key is deferred to PROD (D-012).

`/healthz` also returns `last_block_seen`, `last_tick_at`, `consecutive_errors`, `open_positions`, `pending_settlements` and `triggers_sent`. It is `ok` only when the last tick is newer than 3 poll intervals and fewer than 3 consecutive errors occurred.

## The loop (PRD §10.1)

1. Every `KEEPER_POLL_MS`, page through `list_positions` and keep positions with status `Open`.
2. Call `get_health`; if `triggerable && oracle_fresh`, call `trigger_preliquidation(position_id)` with 0 deposit (F-018 call grammar).
3. Positions in `Settling` are skipped, which makes the loop idempotent across restarts; interrupted runs are marked failed in SQLite.
4. P2 (not built): watch `settlement_signed`, submit the Solana transaction, call `relay_settlement_result`.

Logs are JSON on stdout with no IP or address fields. Backoff is exponential per position and per tick.

## Limits on a keeper

A leaked keeper key can burn at most its 1 NEAR allowance. It cannot move tokens, choose prices, or make the contract sign a payload. The keeper account has no full-access key, so the key cannot be rotated in place: create a new keeper account, then owner `set_keeper(new)`. See [Runbook](/operations/runbook).
