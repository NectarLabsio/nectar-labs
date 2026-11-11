# WO-48 — verifier — G3b re-run after the review 2 web fixes (fresh clone, no secrets; ≤ 35 turns — commit what you have and report before you run out)
Write only `docs/EVIDENCE.md`, `evidence/`. Commands = gates.md line "G3" (PW_CHANNEL=chrome; full e2e incl. phone projects; lighthouse on every route the
script covers, both themes, a11y ≥ 90). Fresh clone of HEAD into /tmp/verify-g3b-<ts>. Use YOUR OWN port for next start (not 3000/3471/8788–8791/8891) —
set the env the e2e/lighthouse scripts read for base URL/port; never stop host services; another verifier runs G9 in parallel on other ports.
Web changed since the last G3b (5083d30): WO-41 contrast (b2a9641), WO-42a copilot/api/headers (2111b71), WO-42b amounts/intent/note-transfer/network guards
(313f660), WO-42c (0bd0cb3). Also confirm `curl -sI` on your server shows X-Frame-Options DENY, HSTS and a CSP with frame-ancestors 'none'.
EVIDENCE: G3b re-run row (counts passed/failed/skipped per project, a11y min per theme, route×theme pairs) + section; logs under evidence/G3/verifier-<ts>/.
Commit `test: evidence — G3b re-run after review 2 web fixes`. NO Co-Authored-By. Never --no-verify. Report ≤ 10 lines.
