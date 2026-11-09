---
name: g1-gas-scope
description: How the verifier judges G1 "gas per method < 100 Tgas recorded" — every default-build public change method needs a recorded gas row
metadata:
  type: feedback
---
G1 gas criterion is judged strictly: compare the list of `pub fn ...(&mut self` in nectar-core default build (p1.rs/p2.rs are feature-gated stubs, excluded; #[private] callbacks count inside their caller's total) against GAS labels from `cargo test -p nectar-core --test sandbox -- --nocapture`. Any unmeasured method = FAIL reason.
**Why:** first G1 run (2026-11-09, commit 3bc0de8) failed only on 7 unmeasured owner setters/price methods; tests and model were green.
**How to apply:** on G1 reruns, diff method list vs GAS labels first; the run shell is zsh, so wrap pipelines in `bash -c` to get real exit codes.
