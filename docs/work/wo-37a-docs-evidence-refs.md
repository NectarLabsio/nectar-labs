# WO-37a — docs — replace "verifier record pending" with EVIDENCE references (< 45 min; commit `docs: cite the D-027 gate re-runs`)
Write only `README.md`, `SECURITY.md`, `apps/docs-site/**`. Do NOT touch `docs/DEMO_SCRIPT.md` or `docs/SUBMISSION.md` (WO-37b is editing them).
WO-35d left 21 "verifier record pending" notes. Two verifier runs have since been recorded in `docs/EVIDENCE.md` — read those sections, cite them, don't paraphrase beyond them:
- **b8784c1** (chain gates after the D-027 rollout): G2b on 2.2.1-v7, G7 re-run (positions 8/9/10), G13 local-fork re-run (11/12, replays revert), G14 re-run
  (chain claims verified; the HTTP 402→200 step was NOT re-run by the verifier — it stands on the orchestrator log in evidence/G14/rerun/).
- **5083d30** (G11 + G3b + suites after D-027): G11 PASS (608 unit + 50 sandbox, mock-ft 23, model.csv 132 rows, max receipt 67.69 Tgas); every SR-1…SR-33 has a named
  test, 124 contract `sr*` tests pass; Solana 10 cargo + 55 TS; forge 105 pass / 3 skip; keeper 293, x402 17, feed 63, sdk 178; G3b PASS (e2e 392 pass, 82 skip; a11y ≥ 90 on
  all 22 route/theme pairs, home light 97; no horizontal scroll at 400 px). The G1 "every method has a gas row" check was NOT RUN on 2.2.1.
Rebuild claim, exact wording only: the 2.2.1-v7 wasm rebuilt from a fresh clone with `cargo near build non-reproducible-wasm` matched the deployed code hash
(3mv4LRm6…) on the verifier's machine; it is not the Docker reproducible build. Do not write "reproducible" for 2.2.x.
Rule: each pending note becomes a reference (EVIDENCE section + commit) or stays "pending" only where EVIDENCE lacks it (402→200 verifier re-run, G1 gas-row check).
After editing, `grep -rn "verifier record pending" README.md SECURITY.md apps/docs-site` and list every survivor with its reason. `pnpm --filter docs-site build` exits 0.
No hackathon branding in docs-site. Copy rules apply. NO Co-Authored-By line. Never --no-verify. Report ≤ 8 lines.
