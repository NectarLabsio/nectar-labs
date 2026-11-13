# WO-15 — contract — Chain Signatures settlement leg (P2; ≤ 50 tool calls). Spec: docs/process/work/interface-p2.md, D-016, FACTS F-031..F-036, F-082, F-175.
Implement the contract section exactly; V1 root struct unchanged (new storage keys; V1/V1.x fixture upgrade test stays green — copy the
live wasm sha fa2bb4f1… as a new fixture). Preimage builder is pure and unit-tested byte-for-byte (golden vectors in tests/preimage_vectors.json,
also consumable by the Solana program tests and the keeper later). Off-chain authority derivation (F-036) as a small Rust test util or a
tools/derive-authority.mjs using @noble/curves 2.4.0 + @noble/hashes (add to contracts/tools/package.json only; report the deps) that
reproduces `ed25519:3DTxgHcU…` for path "solana-1" (F-036 live check) and prints the key for "solana-devnet-v1".
Report: tests, gas table incl. sign leg, wasm size, derived authority for solana-devnet-v1. Commit `feat(contract):`.
