---
name: g11-v7-contract-recipe
description: How to run G11 (v7 contract) efficiently — test naming, gas-row parsing traps, where PRD §6.11 tests live
metadata:
  type: reference
---
- `cargo test -p nectar-core` already runs every sandbox target (~13 min cold); per-target `--nocapture` reruns are needed only for GAS rows (~11 min more). Run in background + wait loop on an EXIT marker.
- Test names: tests_v7/tests_v7b modules have NO `v7_` prefix; only tests_notes/tests_reserve do (filter `v7_` = 81 at 74ce8be). Report both.
- GAS rows come in 3 formats: `GAS,label,n` / `GAS,label,total|<receipt acct>,n` / label containing a comma. `attached,300T` rows are prepaid, not burnt — exclude. Parser kept in EVIDENCE notes (gas-max.csv).
- Forged-attestation (wrong authority) test lives only in sandbox_p2 `remote_refusals_attestation_and_expiry`.
- First run 2026-11-10 (74ce8be) FAILED only on set_shield_params + set_job_config never called in sandbox; see [[g1-gas-scope]] — same strict rule.
- Re-run 2026-11-10 (53f1e63) PASSED: setter rows now in sandbox_v7b; unit test tests_p2::deposit_forged_authority_refused. Method-vs-label diff script (68 &mut methods, 10 #[private], ft_on_transfer via ft_transfer_call:* rows) works; my label parse gives 237 labels vs 129 in FAIL run (different normalisation, harmless). Background run ~23 min total; `sleep` inside a Bash for-loop is allowed for waiting.
- Re-run 2026-11-11 after D-027 (3ab3026, EVIDENCE 5083d30) PASSED: one `cargo test -p nectar-core --no-fail-fast -- --nocapture` run gives every GAS row (no per-target rerun needed); took ~17 min on /tmp APFS. 608 unit + 50 sandbox tests. Compare the wasm sha256 (as base58) with RPC view_account code_hash.
- SR tests are named three ways: Rust `srN_*`, forge `test_SRN_*` (a `\bsr` regex misses these), TS `it('SR-N: …')`. Status per finding is in SECURITY.md. SR-28 is mitigated on the keeper side only.
- The gitleaks pre-commit hook flags the anvil account #1 address in sandbox EVENT_JSON lines (generic-api-key). Elide that line and note it in EVIDENCE. Never use --no-verify.
