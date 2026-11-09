# WO-4d — docs — follow-ups (small: ≤ 25 tool calls)
1. README + apps/docs-site start/live-on-testnet: "G2 PASS 2026-11-09T20:55Z (commit 5f27f44): views answer, on-chain code_hash = G1-verified
   wasm, keeper key scope correct; explorer pages pending a human click (H-EXPLORER)". G3: "in progress" (do not claim PASS).
2. apps/docs-site/docs/integrate/run-a-keeper.md: services/keeper exists (merged WO-5) — document env vars (KEEPER_ACCOUNT_ID,
   KEEPER_KEY_PATH 0600 function-call key, NEAR_RPC_URL), `pnpm --filter keeper start` (check services/keeper/package.json for the real
   script name), /healthz, and that the keeper refuses full-access keys.
3. storage-and-gas.md: fill gas values from evidence/G1/gas-sandbox.csv (cite the file + G1 PASS commit b721641).
4. Dev ports: web runs on 3100 (`next dev -p 3100`), docs-site on 3000 — make README/quick-start consistent.
5. docs/RUNBOOK.md + operations/runbook.md: (a) owner must refresh the price at least every 24 h while the session is closed
   (`update_owner_price`, oracle max age), else borrows/triggers refuse "stale oracle"; (b) the keeper has only a function-call key
   (no rotation on that account): if its 1 NEAR allowance runs out, create a new keeper account with a function-call key and call
   `set_keeper` as owner; (c) owner nectar.testnet has < 1 NEAR: faucet top-up via https://near-faucet.io/ (F-154).
docs-site build green, no hackathon wording outside project/evidence. Commit `docs:`. Report ≤ 10 lines.
