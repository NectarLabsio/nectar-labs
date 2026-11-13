# WO-43d — docs — G9 run 3 result + README guesses (< 30 min; commit `docs: G9 run 3 PASS; README MCP argument`)
Write only `README.md`, `SECURITY.md`, `docs/SUBMISSION.md` (prose only — never tracks / website / TODO-H*), `apps/docs-site/docs/**`.
Source: docs/EVIDENCE.md "G9 run 3" row + section (merge 1a46931; fresh clone 3107a1a: PASS, quick start ~2.3 min, verify 36 s, gitleaks 305 commits clean,
0 unbacked claims, review 2 fixes present in code, headers present, wallet selector opens in Chrome with 0 CSP errors). G3b: EVIDENCE records a FAIL
(b1728aa; screens.spec only) and a fix (WO-49, a2387b5); a verifier re-run is in progress — cite only what EVIDENCE shows; claim no G3b PASS.
1. Replace G9 status/timings wherever README / docs-site evidence + quick-start / SUBMISSION quote an older G9 run with run 3 (cite its EVIDENCE row).
2. README Feed MCP section: name the tool argument the verifier had to guess — `symbol` (e.g. `get_exit_capacity {"symbol":"NVDAx"}`; check services/feed
   tools/list for the exact names before writing).
3. README position snapshot (2026-11-11, stops at #13): add #14 and #15 (G14 verifier runs, both Open) or reword as "as of <time>" — verify on chain via
   the get_position view before writing.
4. SECURITY.md "Review 2": the "web fixes have not been through a verifier gate" sentence → G9 run 3 checked the fixes in code (cite); G3b re-run status as
   EVIDENCE shows it (FAIL → WO-49 fix → re-run in progress). No PASS claim.
`node scripts/check-no-branding-all.mjs`, `pnpm --filter docs-site build` exit 0. NO Co-Authored-By. Never --no-verify. Report ≤ 5 lines.
