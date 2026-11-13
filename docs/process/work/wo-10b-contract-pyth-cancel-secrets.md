# WO-10b — contract — Pyth source + cancel_settlement + secrets_ref (P1; ≤ 45 tool calls)
Live contract is V1 (state_version 1, upgraded 2026-11-09 via scripts/25). **No state-layout change to the V1 root struct**: put new
persistent data under new storage keys (e.g. `LazyOption`/`LookupMap` with fresh prefixes) so the next upgrade needs no migrate. If a root
change is unavoidable, add V1→V2 migrate + sandbox proof (deploy current V1 wasm from tests/fixtures, upgrade, migrate) and say why.
1. Pyth oracle source per interface-p1 + D-013 + FACTS F-054, F-163..F-165: `set_oracle_source(symbol, {"Pyth":{account, price_identifier}})`
   now allowed; `trigger_preliquidation` reads `get_price(price_identifier)` (exact return shape from F-054/F-163 or the Pyth NEAR source
   at /tmp/research), checks age ≤ max age (session-aware), `conf ≤ price·max_conf_bps/1e4`, band; else `oracle_rejected` and abort to
   Open. Pyth price `expo` handling → USD e6 exactly (integer, round against the borrower). Unit + sandbox tests with a stub Pyth contract
   in contracts/test-stubs (stale, wide-conf, out-of-band, negative expo cases) — these back G5's "staleness + conf rejection tested".
2. Owner escape: `cancel_settlement(position_id)` for a position stuck in `Settling` (e.g. a lost callback): back to Open, event
   `settlement_cancelled`. Sandbox test.
3. Quoter secrets: optional `secrets_ref: {profile, account_id}` in quoter config (owner setter `set_quoter_secrets_ref`, null clears),
   passed to `request_execution` when set (F-047). Unit test that request args include it.
4. Gas reserve accounting: OutLayer refunds unused deposit to the contract balance (WO-10a note) — add a view `get_gas_reserve()` and
   document; do not try to re-credit automatically.
Report wasm size (live upgrade budget: owner ~0.28 NEAR, H-NEAR-FAUCET), tests, gas. Commit `feat(contract):`.
