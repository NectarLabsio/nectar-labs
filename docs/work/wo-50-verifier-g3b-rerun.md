# WO-50 — verifier — G3b re-run after WO-49 (fresh clone, no secrets; ≤ 35 turns — commit what you have and report before you run out)
Same as docs/work/wo-48-verifier-g3b-review2.md (read it; own port, never the host services; set PORT / E2E_BASE_URL / LH_BASE_URL as WO-48 did) on a
fresh clone of HEAD, plus `pnpm verify` and `node scripts/check-no-branding-all.mjs` on the same clone. Read docs/GATE_FAIL_G3B_R2.md. PASS needs 0 failed in
the full e2e (desktop + phone, incl. screens.spec). Stop every server you start (if a kill is refused, say so — don't work around it).
EVIDENCE: G3b re-run 2 row + section; logs under evidence/G3/verifier-<ts>/. Commit `test: evidence — G3b re-run after WO-49`. NO Co-Authored-By. Report ≤ 10 lines.
