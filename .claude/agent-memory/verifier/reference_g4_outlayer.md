---
name: g4-outlayer
description: How to verify G4 (OutLayer) read-only: attestation API route, mainnet-host trap, missing get_settlement view, hash checks
metadata:
  type: reference
---
G4 PASSED 2026-11-09T22:10Z (d87eef6), read-only, about 25 tool calls.
- Attestation: `GET https://testnet-api.outlayer.ai/attestations/by-request/<request_id>` returns JSON (caller_account_id, transaction_hash, wasm_hash, executed_wasm_sha256, input_hash, tdx_quote, worker_measurement). The app.outlayer.ai/executions dashboard renders no rows for WebFetch.
- Trap: `https://api.outlayer.ai/attestations/<n>` (mainnet host, lookup by id) returns 200 for an UNRELATED mainnet task. Never cite it.
- The gates.md G4 line uses `get_settlement`, which nectar-core does not have (MethodNotFound). Check disc_bps from EXPERIMENTAL_tx_status events plus get_quote max_discount_bps. On reruns, check whether gates.md was fixed.
- Hashes: quoter/build.sh → sha256 = config version_key = bytes at fastfs wasm_url. Core: target/near/nectar_core/nectar_core.wasm, base58(sha256) via a node one-liner = view_account code_hash.
- Run A fallback is forced by pinning version_key 0…0 (OutLayer panics "Version not found"). Fills = max until secrets_ref is set (WO-10b).
**How to apply:** for G4 reruns, and for G5–G7 attestation or tx checks.
- Addendum (secrets pricing) PASSED 2026-11-09T22:51Z (fea52b7), 13 tool calls: execution_completed JSON has `success`/`error_message`; parse request_data (nested JSON) for request_id/input. Confirm store_secrets access via EXPERIMENTAL_tx_status sender nectar.testnet (args base64; drop encrypted blob). Views: get_vol_bps {"symbol":"NVDAx"}, get_quoter_config.secrets_ref. Run cargo near build in background while doing RPC.
