# GATE_FAIL_G3B_R2 — 2026-11-11 (verifier, fresh clone of 3107a1a; EVIDENCE b1728aa, evidence/G3/verifier-20261111T1530Z/)
**Check:** G3b re-run after the review 2 web fixes (WO-41, WO-42a, WO-42b, WO-42c).
**Cause (single):** all 40 e2e failures are `screens.spec` screenshot tests: `waitForLoadState("networkidle")` times out (60 s, and on retry). Probe: one
request never settles — Next's RSC prefetch of the footer "Status" link → `/api/health` (apps/web/components/SiteChrome.tsx:107). The link pre-dates
review 2; `/api/health` changed in WO-42a (5 s cache, generic errors) — regression, root cause not yet confirmed.
Everything else green: 362 passed (all functional, a11y, phone-scroll specs), Lighthouse 28/28 route×theme = 100, headers present (XFO DENY, HSTS, CSP
frame-ancestors 'none').
**Fix (WO-49, web):** find why the prefetch never settles (route handler + cache vs RSC prefetch), fix it at the root, and make the footer link not prefetch
an API route. **Then:** verifier re-runs G3b from a fresh clone. Status: OPEN.
