---
name: mock-ft-test-tricks
description: Sandbox/unit-test facts learned on WO-61 (mock-ft faucet) - preserve_order JSON, hand-built receiver wasm, storage_byte_cost const, token-account storage headroom
metadata:
  type: project
---

Learned 2026-11-12 (WO-61):
- near-sdk 5.30.1 `serde_json::json!` keeps insertion order (preserve_order on), so `EVENT_JSON:` strings compare exactly
  in the order written, not alphabetically.
- No `wat` crate is in the offline cargo registry. A 102-byte hand-assembled wasm whose `ft_on_transfer` returns `"0"`
  deploys and runs in near-workspaces 0.24 sandbox: `RECEIVER_WASM` in contracts/mock-ft/tests/sandbox_faucet.rs. Copy it
  when a test needs a positive ft_transfer_call receiver without a new crate.
- `env::storage_byte_cost()` is a constant 1e19 in near-sdk 5.30.1 (env.rs:2980), not a host fn, so views may use it.
  Record overhead = 40 bytes (near-parameters 0.38.0 parameters.yaml:37); unit mock and sandbox both match it.
- usdc-mock / nvdax-mock had ~0.10 NEAR (~10.2 KB) free on 2026-11-12 with 158,465-byte code; WO-61 wasm is 171,771 bytes,
  so a code-only upgrade needs a top-up first (else LackBalanceForState).

**Why:** each of these cost a test iteration or a research detour.
**How to apply:** reuse for any mock-ft/nectar-core upgrade or event test; re-check headroom with view_account before
promising an upgrade fits. Related: [[near-sdk-store-cache]], [[g1-gas-row-labels]].
