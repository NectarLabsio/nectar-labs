---
name: stub-secp-gas
description: test-stubs k256 (no precomputed tables) secp256k1 signing burns ~10 Tgas in wasm; sandbox Base tests need signer gas_tgas 50, not 15
metadata:
  type: project
---

WO-29a (2026-11-10): the MPC signer stub signs domain 0 with k256 (`default-features = false, features = ["ecdsa"]`).
`derived_public_key` (one scalar mult + b58) fits the contract's 10 Tgas `GAS_DERIVE_KEY`, but `respond` (RFC6979 sign)
exceeded the 15 Tgas sign budget ("Exceeded the prepaid gas" → "Signature request has timed out").

**Why:** k256 `precomputed-tables` are built lazily per call in wasm, so they are off; plain scalar mult is slow.
**How to apply:** sandbox tests that sign Ecdsa via the stub set `set_signer_config(.., gas_tgas: 50, ..)`
(tests/sandbox_evm.rs `SIGN_TGAS`). The live MPC still needs only 15 Tgas (F-034); do not change contract constants for
the stub. Related: [[near-gas-budgeting]].
