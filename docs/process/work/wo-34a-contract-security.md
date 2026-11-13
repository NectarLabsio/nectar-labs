# WO-34a — contract — security fixes, settlement liveness (< 2 h; commit `fix(contract): SR-3/5/7/8/10/17/18 (2.2.0-v7)`)
Read docs/process/work/security-review-v7.md (SR-3, SR-5, SR-7, SR-8 contract part, SR-10, SR-17, SR-18 — full failure scenarios and fixes) and
docs/process/work/interface-v7.md §E (binding names), D-027. Write only contracts/. NO Co-Authored-By line.
Must remain a **code-only upgrade over the live 2.1.0-v7 state**: new data under new raw storage keys; extend the upgrade sandbox test
(tests/fixtures: add the live 2.1.0 wasm built from main@HEAD before your change) so it upgrades 2.1 → 2.2 and re-runs NEAR, Solana and Base flows.
contract_version "2.2.0-v7". For each SR: a unit or sandbox test that reproduces the failure scenario on the old code path and passes on the new code
(name tests `sr3_*`, `sr5_*`, …). Keep every existing test green; gas < 100 Tgas per receipt (record new rows). Report ≤ 20 lines with a per-SR line.
