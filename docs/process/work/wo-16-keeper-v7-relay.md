# WO-16 — keeper — v7 maths fix (main is red) + Solana relay (< 2 h; two commits)
Read first: `docs/process/work/interface-v7.md` §A1/A3 and §B, `solana/deploy.md` (discriminators, account order, Position byte offsets),
`solana/client/ed25519.ts` + `solana/client/preimage.ts` (reuse them; do not copy them), FACTS F-082, F-186.

**Part 1 — restore green (commit `fix(keeper): v7 limit and health maths`).** `pnpm verify:quick` fails on main: 32 keeper tests
compare the keeper's limit and health maths with `contracts/nectar-core/tests/model.csv`, which WO-19 extended with `agg_*` and `mult_*` rows and new
columns (multiplier, total debt, origination). Update the keeper maths to the v2 rules:
- aggregate headroom `(1e4−h)(Q+R+D)/1e4 − total_debt`, with `b_c = min(LTV cap, headroom)`;
- valuation `units·M/1e18·price/10^d` (Underlying);
- D_c = 0 and the weekend haircut when the session is closed.
The keeper must still read v1 views (fields absent ⇒ M = 1e18, total_debt = 0, session from `market_session_open`). Every model row must be checked
(the "every limit row was checked" test). Also rename the `services/feed/src/db.ts` comment "1Click R_c series" → "1Click D_c (verified DEX depth)
series" (C-107/C-108) and anything else in services/ that calls 1Click depth R_c. `pnpm verify:quick` must be green before Part 2.

**Part 2 — relay (commit `feat(keeper): Solana settle/release relay`).** `services/keeper/src/solana.ts` with `@solana/kit` 8.6.0 (F-081/F-186):
1. Poll `get_pending_settlement` for Settling positions whose collateral has `remote_chain`. Build `[ed25519 verify ix (solana/client/ed25519.ts),
   settle ix]` (kind from the preimage suffix: none = 0, `|kind=PRELIQ` = 1, `|kind=SELF` = 2), send it with the fee-payer keypair at
   `KEEPER_SOLANA_KEYPAIR` (path from env; never log the key), confirm, then call `relay_settlement_result(position_id, solana_tx_sig)` with the
   NEAR function-call key. Idempotent: skip if the position PDA is already closed or the nonce PDA exists.
2. The same for `get_pending_release` (v2 only; absent on v1 ⇒ skip) → `[ed25519 verify ix, release ix]`.
3. Deposit watcher (v2 only): for positions with `remote.status == "AwaitingDeposit"`, read the position PDA (`getAccountInfo`, offsets from
   deploy.md); when it exists with amount ≥ reserved units, call `confirm_remote_deposit(position_id)`.
4. Tests: unit tests with a recorded preimage + signature (use `solana/client` test vectors) that check byte-exact ix data and account order;
   a mocked RPC for idempotency. No devnet sends in tests. `.env.example` gains `KEEPER_SOLANA_KEYPAIR=` (path only) and `SOLANA_RPC_URL=` (default devnet).
Write only under services/ (+ `.env.example` lines named above). Report ≤ 20 lines: test counts, verify:quick status, anything contradicting deploy.md.
