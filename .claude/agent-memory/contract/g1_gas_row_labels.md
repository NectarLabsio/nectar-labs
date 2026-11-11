---
name: g1-gas-row-labels
description: G1 verifier requires a sandbox GAS row for every non-private change method; label must equal the method name or be name( / name+
metadata:
  type: project
---

G1 (verifier diff.py, evidence/G1/verifier-221-*) lists every `pub fn (&mut self` in contracts/nectar-core/src and
FAILs if any non-#[private] one has no `GAS,<label>,...` line in `cargo test --nocapture` output. A label counts when it
equals the method name or matches `name(` / `name+` (e.g. `update_owner_price(oracle_rejected)`); `mock-ft:` labels are
ignored; ft_on_transfer is aliased to ft_transfer_call/msg labels. Unit tests alone do not count (WO-45 fix, 2026-11-11).

**Why:** GATE_FAIL_G1_221 was a single owner setter (`remove_extra_remote_chain`) with unit tests only.
**How to apply:** whenever adding a public change method, add a sandbox call through `gas("<method>", &r)` in the
same WO; owner setters can ride `owner_call` (it prints the row).
