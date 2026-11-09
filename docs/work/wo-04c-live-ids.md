# WO-4c — docs — real testnet ids after WO-6 (small: ≤ 25 tool calls)
Deployed 2026-11-09T20:5xZ UTC (commit 5f27f44). Source of truth: packages/config/config.yaml, evidence/G2/*.log, `pnpm demo:testnet`.
- nectar-core.nectar.testnet (code_hash 8FtHHN134KPuXtA6VyyYgH57166gdixvA5tFiXXyf2gV; wasm sha256 6bd1ec5125806ad71e370953447ac635d9e86d4ce801100d03dc05eda15e2a46)
- usdc-mock.nectar.testnet, nvdax-mock.nectar.testnet (mock NEP-141, code_hash 3iUhtF1eC3hiRiasN37tDb6VGzAsvEDXs7czbnYJcXsF)
- owner nectar.testnet; keeper keeper.nectar.testnet (one function-call key, 2 methods, no full-access key — D-012)
- demo: buyer1/buyer2/borrower1 .nectar.testnet. State: pool $50,000; quote #0 $10,000 @ 250 bps, #1 $5,000 @ 400 bps; position #0
  100 NVDAx, debt $11,250 (limit $11,250 vs static $7,200), LTV 6,250 / pre-liq 7,500; owner oracle $180 (disclosed); session closed.
Do: README "Live on testnet" table → real ids with https://testnet.nearblocks.io/address/<id> links; status "live (testnet)" for core
and mocks, "owner oracle (P0, disclosed)", "static discount (P0)", keeper "not running continuously (run locally)"; quick start says
`pnpm demo:testnet` works now. docs-site start/live-on-testnet page, RUNBOOK and DEMO_SCRIPT: replace TODO-G2 ids.
Keep "G2 verification pending" wording until docs/EVIDENCE.md G2 says PASS. No hackathon wording in docs-site. Build green. Commit `docs:`.
