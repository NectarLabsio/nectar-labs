# GATE_FAIL_G3 — 2026-11-09T20:57Z UTC — commit c940dec

**What failed:** (1) `pnpm --filter web e2e` exits 1: 84 pass / 28 fail / 2 skip; all 28 failures are one serious axe rule,
`aria-prohibited-attr`, on the loading skeleton `<div class="stack-sm" aria-busy="true" aria-label="Loading">`
(apps/web/components/states.tsx:79, no role) — seen on /feed, /borrow, /quote/new, /quote/0, /position/0, /console, /keepers,
both themes, desktop + phone. It surfaced only now because live testnet ids make pages show the loading state.
(2) gates.md's `pnpm --filter web lighthouse` does not exist.

**Passed:** all six screens render; Lighthouse 13.6.0 a11y = 100 on /, /feed, /borrow, /quote/new, /console, /keepers in dark and light;
no horizontal scroll at phone width (26 tests); testnet write flow landed (position #1, borrower1, $10); branding check clean;
"testnet" / "mock collateral" disclosures visible. Evidence: docs/EVIDENCE.md §G3, evidence/G3/verifier-20261109T2057Z/.

**Fix (in scope, WO-3b):** give the skeleton a valid live-region role (`role="status"`, keep aria-busy) or drop the label; add an
`apps/web` `lighthouse` script (pinned lighthouse 13.6.0) that audits the six routes in both themes and exits non-zero below 90.
**Re-run:** read-only e2e + lighthouse from a fresh clone. The write flow is not repeated (the fix does not touch the borrow path;
the c940dec evidence is cited) to avoid opening position #2 — stated in the G3 PASS block if it passes.
