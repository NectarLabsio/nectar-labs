# EVIDENCE.md — written by the verifier agent only

| Gate | Status | UTC | Commit | Evidence |
| --- | --- | --- | --- | --- |
| G0 toolchain + facts | pending | | | |
| G1 contract tests | PASS | 2026-11-09T20:43Z | b721641 | evidence/G1/verifier-20261109T2043Z.log, evidence/G1/verifier-gas-20261109T2043Z.csv (prior FAIL 20:33Z, 3bc0de8: see §G1 history) |
| G2 testnet deploy | PASS | 2026-11-09T20:55Z | 5f27f44 | evidence/G2/verifier-20261109T2055Z.log (explorer pages returned HTTP 403 to WebFetch; see §G2) |
| G3 web E2E | pending | | | |
| G4 OutLayer | pending | | | |
| G5 oracle | pending | | | |
| G6 1Click depth | pending | | | |
| G7 Solana + signer | pending | | | |
| G8 copilot | pending | | | |
| G9 fresh-clone rehearsal | pending | | | |

Block format (one per run, newest first within a gate):

```
### G2 — testnet deploy — PASS — 2026-11-10T19:42Z — commit 3f9c1a2
$ scripts/20-deploy-testnet.sh
... (≤ 40 lines)
Explorer: https://testnet.nearblocks.io/address/nectar-core.nectar.testnet  (opened: shows contract code hash …)
Views: get_collateral → {...}
Notes: faucet rate-limited once; retried after 90 s.
```

## G2

### G2 — testnet deploy — PASS — 2026-11-09T20:55Z — commit 5f27f44
Fresh clone /tmp/verify-G2-1794257515 (git clone /Volumes/T7/nectar-labs), no keys, no transactions sent. Full log: evidence/G2/verifier-20261109T2055Z.log
```
$ pnpm i --frozen-lockfile                         -> Done (pnpm 10.34.9)
$ pnpm demo:testnet                                -> EXIT=0
account nectar-core.nectar.testnet  version nectar-core 0.1.0 p0
Q_c $15,000.00  R_c $0.00  D_c $0.00  haircut 2500 bps  session closed; oracle $180.00 (age 320s, fresh); effective limit 7000 bps
pool: available $38,750.00  utilised $11,250.00  treasury $12.15
quotes: #0 remaining $10,000.00 max disc 250 bps live · #1 remaining $5,000.00 max disc 400 bps live
positions: #0 Open debt $11,250.00 ltv 6250 bps / pre-liq 7500 bps
$ near contract call-function as-read-only nectar-core.nectar.testnet get_collateral json-args '{"symbol":"NVDAx"}' network-config testnet now
  -> base_ltv 4000, max_nectar_ltv 7000, haircut 1000/2500, premium 300, session false, oracle 180000000, Q 15000000000, acc_fee_per_dollar_e18 5670000000000000
$ ... get_pool '{}'  -> available 38750000000, utilised 11250000000, treasury 12150000, lenders_fees 24300000
$ ... get_health '{"position_id":"0"}' -> value 18000000000, debt 11250000000, ltv 6250, pre_liq 7500, oracle_fresh true, triggerable false
$ ... preview_borrow '{"symbol":"NVDAx","units":"100000000","borrow_usd_e6":"11250000000"}'
  -> b_c 11250000000, static_limit 7200000000, premium 121500000, ok true, reason null
  (first attempt used arg name collateral_amount -> deserialize panic "missing field units"; verifier error, interface-p0.md says units)
$ ... get_quote 0/1 -> claimable 56700000 / 28350000 (sum 85050000) · get_position 0 -> Open, units 100000000, premium 121500000
$ (cd contracts/nectar-core && cargo near build non-reproducible-wasm)   SDKROOT=.../MacOSX26.5.sdk -> EXIT=0
$ (cd contracts/mock-ft && cargo near build non-reproducible-wasm)       -> EXIT=0
local base58(sha256) nectar_core.wasm = 8FtHHN134KPuXtA6VyyYgH57166gdixvA5tFiXXyf2gV (324833 B)
local base58(sha256) mock_ft.wasm     = 3iUhtF1eC3hiRiasN37tDb6VGzAsvEDXs7czbnYJcXsF (152268 B)
RPC view_account nectar-core.nectar.testnet code_hash 8FtHHN134KPuXtA6VyyYgH57166gdixvA5tFiXXyf2gV  (match)
RPC view_account usdc-mock.nectar.testnet   code_hash 3iUhtF1eC3hiRiasN37tDb6VGzAsvEDXs7czbnYJcXsF  (match)
RPC view_account nvdax-mock.nectar.testnet  code_hash 3iUhtF1eC3hiRiasN37tDb6VGzAsvEDXs7czbnYJcXsF  (match)
$ git diff --stat b721641..HEAD -- contracts/ Cargo.toml Cargo.lock rust-toolchain.toml   -> empty (source = G1-verified)
$ RPC view_access_key_list keeper.nectar.testnet -> 1 key
ed25519:Gx7eX95TzYQq4c4pjg2ZfsHWdtUw9csLMfETKswnyXgQ FunctionCall receiver nectar-core.nectar.testnet methods [trigger_preliquidation, relay_settlement_result] allowance 1 NEAR
```
Model check vs contracts/nectar-core/tests/model.csv row demo_borrow: B_c 11250000000 = 11250000000 · static limit 7200000000 = 7200000000 ·
premium 121500000 = 121500000 · ltv_bps 6250 = 6250 · value 18000000000 = 18000000000 · pre-liq 7500 = 7500 · buyers fee 85050000 = quote
claimables 56700000 + 28350000 · lenders 24300000 = pool.lenders_fees · treasury 12150000 = pool.treasury · acc_increment_e18 5670000000000000 =
collateral.acc_fee_per_dollar_e18. No differences.
Keeper scope (D-012): only a FunctionCall key, receiver nectar-core, the two keeper methods; no FullAccess key.
Explorer (WebFetch, opened this run): https://testnet.nearblocks.io/address/nectar-core.nectar.testnet -> HTTP 403 Forbidden ·
https://testnet.nearblocks.io/address/usdc-mock.nectar.testnet -> HTTP 403 · https://testnet.nearblocks.io/address/nvdax-mock.nectar.testnet -> HTTP 403 ·
https://api-testnet.nearblocks.io/v1/account/nectar-core.nectar.testnet -> HTTP 410 Gone. The pages did not load for an automated fetch, so this
run did not see their content; account existence and deployed code are shown by RPC view_account above. A human browser check is still open.
Verdict: PASS. Accounts exist, views answer, two quotes and one Open position, demo state matches model.csv demo_borrow, code hashes match the
wasm built from G1-verified source, keeper key scope correct, links recorded (load status: 403 to WebFetch).
Observations (not gate criteria): get_quote field `fee_debt_e18` returns 56700000 / 28350000, the same USD-e6 values as `claimable_fees_usd_e6`,
so the name suggests an e18 scale that the value does not have. relay_settlement_result is on the keeper key but is a P1 feature-gated method
that does not exist in the deployed default build.

## G1

### G1 — contract tests — PASS — 2026-11-09T20:43Z — commit b721641
Re-run after GATE_FAIL_G1 (WO-2b merged at 0b3d9ac). Clone: git clone /Volumes/T7/nectar-labs /tmp/verify-G1b-1794256819
(HEAD b721641eb16f); PATH += ~/.cargo/bin ~/.local/bin; SDKROOT=.../MacOSX26.5.sdk (gates.md host notes). No secrets used.
$ pnpm i --frozen-lockfile                                         → Done in 3.7s, exit 0
$ (contracts/nectar-core) cargo near build non-reproducible-wasm   → exit 0
     -                  Size: 324.8 KB (324833 bytes)
     - SHA-256 checksum hex : 6bd1ec5125806ad71e370953447ac635d9e86d4ce801100d03dc05eda15e2a46
$ (contracts/mock-ft) cargo near build non-reproducible-wasm       → exit 0
     -                  Size: 152.3 KB (152268 bytes)
     - SHA-256 checksum hex : 28578356a6e426f8ea384051ff7519c51faa2bd7ed9f711e9e4f3a05f3f372c2
  (both identical to the 3bc0de8 run: WO-2b changed tests only)
$ cargo test -p nectar-core -p mock-ft -- --nocapture              → exit 0
     mock_ft unit 11 passed · nectar_core unit 88 passed (incl. model_csv_vectors_match_contract_math)
     tests/sandbox.rs 5 passed; 0 failed (31.65s): owner_setters_and_ft_gas · refunds_and_guards ·
       topup_exit_and_repay · demo_flow_matches_model · preliq_eight_buyers_gas
$ cargo test -p nectar-core 2>&1 | tail -40                        → exit 0 (gates.md line 1; sandbox 5 passed)
$ cargo test -p nectar-core --test sandbox 2>&1 | tail -40         → 5 passed; 0 failed, exit 0 (gates.md line 2)
$ python3 contracts/nectar-core/tests/model.py --check             → model.csv OK (54 rows), exit 0
$ git status --short (clone, after all runs)                       → empty
Gas (max per label, Tgas; 31 labels, all < 100): trigger_preliquidation(8 legs) 46.86 · (2 legs) 19.92 ·
  ft_transfer_call: LockCollateralAndBorrow 11.05 · FundPappusQuote 6.74 · TopUpQuote 6.61 · Repay(refund) 6.50 ·
  Repay(partial) 6.44 · invalid 6.37 · SupplyLendingLiquidity 6.26 · complete_quote_withdrawal 6.72 · claim_fees 6.61 ·
  upsert_collateral 2.34 · initiate_quote_withdrawal 2.30 · apply_price 2.26 · update_owner_price 2.11 · propose_price 2.07 ·
  set_reserve 2.03 · set_dex_depth 2.03 · set_session 2.03 · pause/unpause 1.84 · set_oracle_params 1.81 ·
  set_quote_params 1.81 · set_fee_split 1.81 · set_keeper 1.81 · fund_gas_reserve 1.79 · new 1.75 ·
  mock-ft: ft_transfer 1.94 · mint 1.73 · storage_deposit 1.73 · new 1.53
Coverage check (pub fn ...(&mut self in #[near] impl of the default build vs GAS labels): nectar-core 24/24 covered
  (ft_on_transfer via the 7 ft_transfer_call:* totals); mock-ft 5/5 covered (ft_transfer_call via the same totals).
  Excepted: #[private] callbacks nectar-core on_payout and mock-ft ft_resolve_transfer (gas counted inside their
  callers' totals). p1.rs/p2.rs are cfg(feature) and absent from the default build.
Key scope (PRD §6.10), inside demo_flow_matches_model (passed): keeper adds an FC key scoped to nectar-core
  [trigger_preliquidation, relay_settlement_result]; KEYSCOPE rows: usdc.ft_transfer with 1 yocto, usdc.ft_transfer
  without deposit, and core.pause all rejected-at-validation; contract still unpaused; trigger_preliquidation with the
  scoped key succeeded (19.92 Tgas, no receipt failures).
Explorer: none (G1 is local; no links opened).
Result: PASS. Every criterion met: builds exit 0 with recorded hashes, unit 99/99, sandbox 5/5, model match exact,
  every public change method has a gas row < 100 Tgas, key-scope test passed.
Notes (not fail reasons): the 3 key-scope refusals accept any client-side Err ("unable to broadcast the transaction");
  the test does not assert the specific access-key error. Full log 1528 lines.

### G1 — contract tests — FAIL — 2026-11-09T20:33Z — commit 3bc0de8
Clone: git clone /Volumes/T7/nectar-labs /tmp/verify-G1-1794256025 (HEAD 3bc0de8cb4bd); PATH += ~/.cargo/bin ~/.local/bin;
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk (gates.md host notes). No secrets used.
$ pnpm i --frozen-lockfile                                   → Done in 3.4s
$ (contracts/nectar-core) cargo near build non-reproducible-wasm   → exit 0
     -                  Size: 324.8 KB (324833 bytes)
     - SHA-256 checksum hex : 6bd1ec5125806ad71e370953447ac635d9e86d4ce801100d03dc05eda15e2a46
$ (contracts/mock-ft) cargo near build non-reproducible-wasm       → exit 0
     -                  Size: 152.3 KB (152268 bytes)
     - SHA-256 checksum hex : 28578356a6e426f8ea384051ff7519c51faa2bd7ed9f711e9e4f3a05f3f372c2
  (both hashes identical to the committed evidence/G1/build-*.log)
$ cargo test -p nectar-core -p mock-ft                       → exit 0
     Running unittests src/lib.rs (mock_ft)     test result: ok. 11 passed; 0 failed
     Running unittests src/lib.rs (nectar_core) test result: ok. 88 passed; 0 failed
     Running tests/sandbox.rs                   test result: ok. 4 passed; 0 failed (42.64s)
       refunds_and_guards ok · demo_flow_matches_model ok · topup_exit_and_repay ok · preliq_eight_buyers_gas ok
$ cargo test -p nectar-core 2>&1 | tail -40                  → exit 0 (gates.md line 1)
$ cargo test -p nectar-core --test sandbox 2>&1 | tail -40   → 4 passed; 0 failed (gates.md line 2)
$ python3 contracts/nectar-core/tests/model.py --check       → model.csv OK (54 rows)
  model_csv_vectors_match_contract_math ok (assert_eq, i.e. exact; stricter than ±1 unit)
$ cargo test -p nectar-core --test sandbox -- --nocapture --test-threads=1   (gas capture; 4 passed)
  max Tgas per label: trigger_preliquidation(8 legs) 46.97 · trigger_preliquidation(2 legs) 19.99 ·
  ft_transfer_call:LockCollateralAndBorrow 11.09 · FundPappusQuote 6.76 · complete_quote_withdrawal 6.72 ·
  claim_fees 6.63 · TopUpQuote 6.62 · Repay(refund) 6.51 · Repay(partial) 6.44 · invalid 6.37 ·
  SupplyLendingLiquidity 6.27 · upsert_collateral 2.36 · initiate_quote_withdrawal 2.30 ·
  update_owner_price 2.12 · pause/unpause 1.84 · set_oracle_params 1.82 · set_quote_params 1.81 ·
  fund_gas_reserve 1.80 · new 1.75   (20 labels, same set as committed gas-sandbox.csv; all < 100 Tgas)
Explorer: none (G1 is local; no links opened).
Result: tests green, model match exact, wasm builds reproducible on this host.
FAIL reason (criterion "gas per method < 100 Tgas recorded"): 7 public change methods in the default
  (P0) nectar-core build have no gas measurement in the sandbox output or in evidence/G1/gas-sandbox.csv:
  set_keeper, set_fee_split, set_session, set_dex_depth, set_reserve, propose_price, apply_price.
  (on_payout is a #[private] callback counted inside trigger_preliquidation totals; on_quoter_result /
  relay_settlement_result / on_signature are feature-gated p1/p2 stubs, not in the default build.)
  mock-ft mint / storage_deposit / ft_transfer have no standalone gas row either (ft_transfer runs inside
  the ft_transfer_call totals); flagged for the orchestrator to decide whether G1 scope includes mock-ft.
Notes: clone tree clean after all runs (no files written by tests). Full log 1032 lines.
