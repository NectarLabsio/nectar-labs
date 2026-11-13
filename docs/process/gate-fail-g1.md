# GATE_FAIL_G1 — 2026-11-09T20:33Z UTC — commit 3bc0de8

**What failed:** pass criterion "gas per method < 100 Tgas recorded". 7 public state-changing methods in the default
nectar-core build have no gas measurement: `set_keeper`, `set_fee_split`, `set_session`, `set_dex_depth`, `set_reserve`,
`propose_price`, `apply_price`. Everything else passed: builds (hashes match), unit 88/88 + 11/11, sandbox 4/4,
model.py --check 54 rows, contract matches model.csv exactly; all 20 measured methods < 100 Tgas (max 46.97 trigger_preliquidation, 8 legs).
Evidence: docs/EVIDENCE.md §G1, evidence/G1/verifier-20261109T2033Z.log.

**Why:** WO-2's sandbox gas table covered the money paths and the most common owner calls only.

**Options:** (a) add sandbox calls with GAS output for the 7 methods (in scope, ~30 min) · (b) waive for owner-only setters (rejected: the
gate criterion says every method).

**Chosen:** (a), plus gas rows for mock-ft `mint` / `storage_deposit` / `ft_transfer` (removes the scope question) and the PRD §6.10
key-scope sandbox test that WO-2 left undone. Work order docs/process/work/wo-02b-gas-and-key-scope.md. Re-run G1 from a fresh clone after merge.
No phase progress (WO-6 deploy) until G1 PASS.
