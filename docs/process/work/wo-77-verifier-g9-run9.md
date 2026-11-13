# WO-77 — verifier — G9 run 9 on the WO-74 commit (< 50 min; commit `test: evidence — G9 run 9 (WO-77)`)
Fresh clone of main at the commit the orchestrator names into a temp dir outside /Volumes/T7. Write only docs/EVIDENCE.md and evidence/.
Since G9 run 7/8: WO-74 web fix (apps/web/components/TestAssets.tsx, borrow/BorrowComposer.tsx, e2e/test-assets.spec.ts; merge 1a95022), deployed to production via the
Vercel CLI as dpl_4ExxeLH65Mb2dfWLyaqQFykbpw2K (evidence/WO-34/deploy-web-cli-*.log); README/SUBMISSION repo URL (WO-75); scripts/demo/**; evidence.
1. Full G9 as run 7 (README quick start with the PUBLIC clone line now in README:82 — clone the local commit, note the URL; every command; claims vs EVIDENCE and live
   hosts; gitleaks; branding; host grep; submission dry run: projectUrl = https://github.com/NectarLabsio/nectar-labs, website absent; handoffs).
2. Web delta: in the clone run `e2e/test-assets.spec.ts` + `e2e/claims.spec.ts` (system Chrome if the headless shell is absent; say which) — the new case must
   pass. Production serves the fix: /borrow chunks contain the onClaimed path (marker check) and smoke-prod.sh is 0. Cite the orchestrator's production QA run
   (evidence/WO-74/prod-qa-check-20261113T140705Z.log: throwaway account, balance 0.00 → 5.00 NVDAx without reload) as SELF-ATTESTED unless you re-run it (do not
   use demo.nectar.testnet or its profile; do not claim from any account).
PASS → EVIDENCE row + block. FAIL on a product claim → docs/process/gate-fail-g9-r9.md. NO Co-Authored-By. Don't touch host services. Report ≤ 10 lines.
