# WO-18 — researcher — G10 v7 facts + toolchain (one pass, ≤ 40-line report). Includes WO-28 (multiplier sources).
Ids: the addendum's F-1xx = repo **F-3xx** (D-017). Write the facts under a new `## v7 (read 2026-11-10)` section in docs/FACTS.md. Each fact
needs a date, a primary URL or source path:line, and V/V(source)/GATE status. Conflicts go to CONFLICTS as C-104…C-108 (addendum C-004…C-008) and C-2xx.
Never overwrite a verified entry; supersede it with a new id.
Clone repos to /tmp/research/ and grep; do not hold whole pages. You may write `packages/config/nyse-calendar.json` (orchestrator delegates it).

1. **Toolchain installed today:** `solana --version` (4.3.2 expected, PATH `~/.local/share/solana/install/active_release/bin`), `anchor --version`,
   `avm --version` (PATH `~/.avm/bin`; skip if absent). Resolve C-017: does Anchor 0.32.1 build and test with Solana CLI 4.3.2 (platform-tools,
   `cargo build-sbf` flags), or must Anchor.toml pin `[toolchain] solana_version = "2.3.0"`? Give the source (anchor CHANGELOG/CI, agave release notes).
2. **F-338 `derived_public_key`** on `v1.signer-prod.testnet`: the exact arg names from near/mpc `contract/src/api/keys.rs` (or current path). Is it a plain
   view that a contract can call cross-contract? Then live: `near contract call-function as-read-only v1.signer-prod.testnet derived_public_key json-args
   '{"path":"solana-devnet/pos/0","predecessor":"nectar-core.nectar.testnet","domain_id":1}' network-config testnet now`, the same with `domain_id: 0`,
   and with predecessor `nectar-core-v2.nectar.testnet` (the account does not exist yet; does derivation still answer?). Record the response encodings.
3. **F-339:** near-sdk 5.30.1 `env::keccak256_array` (docs.rs) and the secp256k1 key encoding returned in step 2. Record how to get the EVM address
   (last 20 bytes of keccak256(x‖y) of the uncompressed key, without the 0x04 prefix), plus one worked example from the live key.
4. **F-330/F-331/F-332:** MPC `sign` with `payload_v2: {Ecdsa: <64 hex>}` domain 0 — the payload rule (32 bytes) and the response JSON for secp256k1
   (`big_r`, `s`, `recovery_id` field names and encodings) from near/mpc source at its current commit (diff against b5bafa3 = F-031).
5. **F-337:** `cargo search near-contract-standards` / crates.io. Which version pairs with near-sdk 5.30.1? Do the NEP-171/177/181 modules exist
   (`non_fungible_token::{core, metadata, enumeration}`)? Give the file paths.
6. **F-328/F-329 x402:** `npm view @fastnear/x402 version` + README / source. What does `createNearFacilitator` take? Can the facilitator accept an
   arbitrary NEP-141 (our `usdc-mock.nectar.testnet`) as the asset, and how is the asset configured? Does a NEP-366 SignedDelegate need a full-access key?
   What does the `near:testnet` network id look like? (docs.x402.org network list.)
7. **NYSE calendar 2026–2027** from nyse.com (holidays + early closes, with the page URL and retrieval time). Write `packages/config/nyse-calendar.json`
   as `{"source":url,"retrieved":iso,"timezone":"America/New_York","regular":{"open":"09:30","close":"16:00"},"holidays":["YYYY-MM-DD",…],
   "early_closes":[{"date":"YYYY-MM-DD","close":"13:00"}]}`. No date typed from memory: every date must be on the page you read.
8. **F-336** Rhea Finance on NEAR testnet (nearblocks / Rhea docs): contract ids, if any.
9. **WO-28 / F-320–F-327:** B20 spec (docs.base.org …/beryl/b20). Cover `multiplier()`, `PolicyRegistry.isAuthorized(policyId, account)`, B20Factory
   `0xB20f…` and whether `createB20` is open to any account on Base Sepolia (F-323; do a read-only `cast call` only if Foundry exists, else the source).
   Cover the Chainlink tokenized-equity feed including M (F-325), ERC-8021 builder-code suffix format (F-326), and the xStocks on-chain multiplier
   mechanism (Token-2022 Scaled UI Amount or not, F-327; solana.com docs + Kraken support).
10. **Versions only (npm view / --version):** viem, wagmi, @solana/wallet-adapter-react, @solana/wallet-adapter-phantom (or wallet-standard); `forge
   --version` / `cast --version` (probably not installed: record the official install method; do NOT install).
11. A public Base Sepolia RPC endpoint and a faucet list (for H15), from docs.base.org.
Report: ≤ 40 lines, one line per item with F-ids, and every conflict with the PRD v7 text flagged.
