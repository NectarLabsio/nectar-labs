---
title: Run a keeper
slug: /integrate/run-a-keeper
description: One function-call key, two methods, no deposits.
---
# Run a keeper

<p className="verified">Verified against: F-015 (2026-11-09), F-018 (2026-11-10), F-019 (2026-11-10), F-020 (2026-11-10, --help confirmation pending), C-004 (open) · spec docs/PRD.md §10.1 · D-010 (2026-11-10)</p>
<p className="status">Status: keeper service not built (WO-5). Account TODO-G2. P0 has one keeper account. Registry, bonds and races are PROD-only.</p>

## The key

The keeper signs with a **function-call access key** on its own account, restricted to `nectar-core` and to two methods (D-010). Such a key cannot attach deposits (F-015).

```bash
near account add-key <keeper_account> \
  grant-function-call-access --allowance 'unlimited' \
  --contract-account-id <nectar_core> \
  --function-names 'trigger_preliquidation,relay_settlement_result' \
  autogenerate-new-keypair --signature-scheme ed25519 save-to-keychain \
  network-config testnet sign-with-keychain send
```

Grammar from near-cli-rs v0.31.1 source (F-020). Older docs spell the flags `--receiver-account-id` / `--method-names`, which v0.31.1 does not accept (C-004). `--signature-scheme ed25519` avoids an interactive prompt. Full-access keys on the keeper account are then removed with `near account delete-keys` (F-019), and the access-key list goes to the Evidence page.

## The loop (PRD §10.1)

1. Every 10 s, read `list_positions`, the oracle state and `get_exit_capacity`.
2. If `debt · 10_000 > V · pre_liq_ltv_bps`, call `trigger_preliquidation(position_id)` with 0 deposit (F-018 call grammar).
3. Skip positions in `Settling`, which makes the loop idempotent.
4. P2: watch `settlement_signed`, submit the Solana transaction, call `relay_settlement_result`.

The keeper exposes `/healthz`, writes JSON logs and records runs in SQLite for the Keepers page.

## Limits on a keeper

A leaked keeper key can burn at most the keeper account's NEAR balance. It cannot move tokens, choose prices, or make the contract sign a payload. Rotation: owner `set_keeper(new)`, then delete the old key. See [Runbook](/operations/runbook).
