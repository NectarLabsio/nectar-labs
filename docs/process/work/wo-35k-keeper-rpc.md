# WO-35k — keeper — RPC fallback for keeper + Feed; honest views-mode numbers (< 75 min; commit `fix(keeper,feed): RPC fallback; honest views-mode health`)
Write only services/keeper/ and services/feed/. Kunal, 2026-11-12: "Add a second NEAR RPC endpoint from FACTS as a fallback for the keeper and the Feed".
Facts: F-413 (non-FastNEAR testnet fallbacks dRPC and Intear; check whether either needs a key), packages/sdk/src/rpc.ts TESTNET_RPC_FALLBACKS +
resilientRpcTransport (already used by the web app).
1. Keeper: the final audit saw `/healthz ok:false` after 4 consecutive FastNEAR 429s (recovered later). Use the SDK's fallback list/transport (or the same order:
   FastNEAR ×2, dRPC, Intear) for every RPC call: on 429/5xx/timeout rotate with backoff; log which endpoint served (no keys, no IPs). Env override stays
   possible. If an endpoint needs a key, do not add it: write the TODO-H marker + one line for the orchestrator (handoff).
2. Feed (views mode, `FEED_INDEXER=views`): the same fallback for its view calls.
3. Feed /health in views mode reports `chain_head` lower than `last_indexed_block` (e.g. 277297242 vs 277369501) — a wrong number. Report the head honestly
   (the view block height, or null with a field saying why) and keep `lag_blocks` consistent. Add an explicit marker for clients, e.g. `history: "unavailable"`
   (views mode) / `"indexed"`, next to `events_indexed`. Event-list endpoints in views mode return an empty list with that marker, never synthesized data.
   Keep existing fields (the web app reads `source`, `events_indexed`); document the new field in the Feed's README/API notes.
4. Do not restart or stop host services (keeper :8790, x402 :8791, Feed :8788/:8789): the orchestrator restarts the host keeper after the merge.
Tests: keeper + feed unit tests (a 429 on the first endpoint → the second serves), `pnpm verify:quick` 0. Own ports only if you start anything.
NO Co-Authored-By. Never --no-verify. Report ≤ 8 lines: endpoints used, test counts, the new /health shape.
