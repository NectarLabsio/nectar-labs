# WO-34e — evm — SR-1, SR-8, SR-30, phantom-token guard (< 1.5 h; commit `fix(evm): authority-scoped nonces, depositor-keyed slots, expiry`)
Read docs/work/security-review-v7.md (SR-1 EVM part, SR-8, SR-30, coverage gap "no-code phantom deposit") and docs/work/interface-v7.md §E (binding).
Write only evm/. No broadcasts, keys or --private-key. Typed data and digest stay UNCHANGED (NEAR side signs the same digests); regenerate
evm/test/eip712_vectors.json only if its fields change (they should not). Forge tests: reproduce each SR on the old behaviour and pass on the new; keep all
74 existing tests (adapt to positionOf(id, depositor) and the extra depositor arg). Phantom guard must keep B20 precompile tokens (no code, F-347) working —
e.g. allow no-code only for the B20 address prefix, with a test. NO Co-Authored-By line. Report ≤ 15 lines.
