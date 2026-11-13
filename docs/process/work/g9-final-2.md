# G9 (run 3) — fresh-clone rehearsal after review 2 (verifier; fresh clone of local main, no secrets; budget ≤ 35 turns — commit what you have and report before you run out)
Everything in docs/process/work/g9-final.md steps 1–7 applies unchanged (read it first). Use your OWN ports and DB for any service you start (never stop host services:
keeper :8790, x402 :8791, Feed :8788/:8789, anvil :8545). Additions for this run:
8. Review 2 claims (docs/process/work/review-2-findings.md; SECURITY.md "Review 2" section): every R2 item SECURITY.md calls fixed exists in code at HEAD (spot-check
   R2-03 `request_matches_input`, R2-04 415/413/403/429 on /api/copilot, R2-05 services/x402/src/borrow-guard.ts, R2-06 `1,5` rejected, R2-09 view_account gate,
   R2-11 `..` rejected); every privacy claim in README / SUBMISSION prose / docs-site legal + landing matches review 2 §C as now corrected (no "never joined to
   IPs", no "your private parameters … instead of being published", GA not configured).
9. Security headers: `next build && next start` on your own port; `curl -sI /` shows X-Frame-Options DENY, HSTS, CSP with frame-ancestors 'none'. In Chromium
   (Playwright, PW_CHANNEL=chrome) open `/borrow`, click "Connect wallet": the wallet selector opens and lists testnet wallets; record any console CSP
   violation (a violation that blocks the selector = FAIL; report-only noise = note). Do not sign anything.
10. G14 and G1 2.2.1 gas rows: cite whatever EVIDENCE now says (WO-47 re-check); docs must not claim more than EVIDENCE.
Verdict PASS / FAIL in docs/EVIDENCE.md (G9 run-3 row + section), one commit (no Co-Authored-By, never --no-verify). Report ≤ 15 lines as in g9-final.md, plus
the step 8–9 results.
