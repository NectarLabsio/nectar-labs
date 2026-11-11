# WO-47 — verifier — G1 2.2.1 gas-row re-check + G14 re-run on the new demo agent (< 60 min)
Write only `docs/EVIDENCE.md`, `evidence/`. Commit before you report (≤ 12 lines). NO Co-Authored-By. Never --no-verify. Read docs/GATE_FAIL_G1_221.md.
1. Fresh clone of HEAD into /tmp/verify-g1g14-<ts>; `pnpm i --frozen-lockfile`. Do NOT stop/restart host services (keeper :8790, x402 :8791, Feed :8788/:8789, anvil).
2. **G1 gas rows (re-check after WO-45):** `cargo test -p nectar-core --no-fail-fast -- --nocapture` (SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
   on this Mac). Same enumeration as your 2e16f9b run: every non-private change method has a GAS row < 100 Tgas, now incl. remove_extra_remote_chain and the
   update_owner_price reject branch. Confirm no file under contracts/*/src changed since 2.2.1 and the built wasm still equals the deployed hash (3mv4LRm6…).
3. **G14 re-run on HEAD** (demo agent now verifies the MCP call before signing, services/x402/src/borrow-guard.ts): own x402 server from the clone on :8891
   (relayer key by path ~/.nectar/keys/x402-relayer.json), then `AGENT1_KEY_PATH=~/.nectar/keys/agent1.json X402_URL=http://127.0.0.1:8891/api/feed/export.csv
   FEED_MCP_URL=http://127.0.0.1:8789/mcp X402_RPC_URL=https://test.rpc.fastnear.com pnpm --filter x402 demo:testnet` (agent1 has ~1 mock NVDAx left = one run).
   Record 402 terms, borrow tx, relay tx, 200 + rows; verify on chain as before. Keys by path only; never print/copy/commit key material. Stop your server.
4. EVIDENCE: G1 (2.2.1 gas rows) row → PASS/FAIL; G14 row → add the HEAD re-run; sections + logs under evidence/G1/verifier-221b-<ts>/, evidence/G14/verifier-<ts>/.
   (The orchestrator updates docs/GATE_FAIL_G1_221.md; don't edit it.) Commit `test: evidence — G1 2.2.1 gas rows re-check; G14 on HEAD`.
