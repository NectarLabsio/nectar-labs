# WO-24 — quoter — OutLayer jobs: vault_read, calendar, multiplier (< 2 h; commit `feat(quoter): v7 OutLayer jobs`)
Read first: PRD v7 §4.6, §4.7, §9B step 3 (only), `contracts/nectar-core/src/remote.rs` (the exact `vault_read` request/response the contract
parses; match it byte for byte: authority prefix, number encodings), `solana/deploy.md` (Position PDA seeds and byte offsets), FACTS F-040–F-046
(OutLayer limits: stdout ≤ 900 B, wasip2 HTTP), F-345/F-350 (B20 multiplier, D-021), F-342 (calendar). Write only quoter/.
The existing quoter wasm dispatches on stdin `job` (absent ⇒ the current quote job, unchanged and byte-compatible):
1. `vault_read {chain:"solana-devnet", program, position_id}`: derive the position PDA (seeds per deploy.md; implement find_program_address with
   sha256 in Rust, no Solana SDK if it bloats wasip2), call `getAccountInfo` (base64) on the RPC from input (default `https://api.devnet.solana.com`),
   decode the 123-byte Position, and print `{position_id, units, authority, depositor, slot_or_block}` exactly as remote.rs expects. A missing account
   prints `{"position_id":…,"found":false}` (or whatever remote.rs treats as "not deposited").
2. `calendar {symbol, now_s}`: from an embedded copy of `packages/config/nyse-calendar.json` (build-time include), print `{"force_closed":true|false,
   "reason":"holiday|early_close|weekend|open"}`. It can only ever ask to close.
3. `multiplier {rpc_url, token, decimals}`: `eth_call` to `multiplier()` (selector from F-345) and print `{"multiplier_e18":"…"}`. D-021: never applied to a
   TokenIncludesMultiplier feed (the contract enforces that; just return the value).
Tests: vectors for each job (a recorded getAccountInfo response built from deploy.md offsets, calendar dates incl. DST boundary and early close, a
recorded eth_call response). Output ≤ 900 B is asserted. Build with the existing `quoter/build.sh`; report wasm size and the new sha256.
Do not publish (the orchestrator re-pins with scripts/30-quoter-publish.sh after merge). Report ≤ 20 lines.
