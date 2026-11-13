# WO-39 — verifier — G14 402 → 200 re-run + G1 gas rows on 2.2.1 (< 90 min)
Write only `docs/EVIDENCE.md`, `evidence/`. Commit FIRST, report second (≤ 15 lines). NO Co-Authored-By line. Never --no-verify.

0. **Before anything else**, edit EVIDENCE.md G14 re-run row (line ~32): status → "PASS (chain claims) · HTTP 402 → 200 leg SELF-ATTESTED (orchestrator log
   evidence/G14/rerun/demo-20261111T080042Z.log; not verifier-run)". Same wording in the line ~602 "Pending" sentence. Commit `test: evidence — G14 402→200 leg self-attested`.
1. Fresh clone of HEAD into /tmp/verify-g14-<ts>; `pnpm i --frozen-lockfile`. Do NOT stop or restart host services (keeper :8790, x402 :8791, Feed :8788/:8789,
   anvil :8545). Start YOUR OWN x402 server from the clone on port 8891 (`X402_PORT=8891`, relayer key by path `~/.nectar/keys/x402-relayer.json`; read
   services/x402/README.md for the env names). Host Feed is reachable at :8788 (REST) / :8789 (MCP); its /healthz may say ok:false (neardata 429 catch-up) —
   the views path still answers; record it, it is not the claim under test.
2. Run, from the clone: `AGENT1_KEY_PATH=~/.nectar/keys/agent1.json X402_URL=http://127.0.0.1:8891/api/feed/export.csv FEED_MCP_URL=http://127.0.0.1:8789/mcp
   X402_RPC_URL=https://test.rpc.fastnear.com pnpm --filter x402 demo:testnet` (agent1 was topped up with 2 mock NVDAx at ~09:50Z; it holds 19.92 mock USDC).
   Record: unpaid GET → 402 body (network, asset, amount, payTo); borrow tx; relayed delegate tx; final 200 + CSV row count. Verify both txs on chain
   (fastnear, D-025): all receipts success, relay signer x402-relayer, Delegate by agent1, usdc-mock ft_transfer 10000 → nectar.testnet.
   Keys are read by path only: never print, copy or commit key material; never write .env. Testnet only. Stop your server after.
3. Gas rows on 2.2.1: in the clone, run the contract sandbox targets with `--nocapture` exactly as EVIDENCE §G1 (v7) / §G11 did (on this Mac a plain
   `cargo near build` needs `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk`). Enumerate every public change method of contracts/nectar-core
   at HEAD (incl. owner setters and the 2.2.x additions, e.g. resign_remote_settlement, claim_owed_collateral, update_owner_price band path). PASS = each has
   a GAS row < 100 Tgas. List any missing; do not fix code.
4. EVIDENCE: replace the step-0 status with the result (G14 row: PASS/FAIL, "402 → 200 verifier-run <ts>"); add a row "G1 (2.2.1 gas rows)"; sections with
   commands, hashes, counts; update the line ~602 sentence. Logs: evidence/G14/verifier-<ts>/, evidence/G1/verifier-221-<ts>/.
   Commit `test: evidence — G14 402→200 verifier re-run; G1 gas rows on 2.2.1`.
