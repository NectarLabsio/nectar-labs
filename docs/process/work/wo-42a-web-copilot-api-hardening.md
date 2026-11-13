# WO-42a — web — copilot binding, /api hardening, headers (< 90 min; commit `fix(web): review 2 — copilot binding, api hardening, headers`)
Write only `apps/web/`, `packages/ui/`, `packages/sdk/`. Source: docs/process/work/review-2-findings.md (R2-03, R2-04, R2-08, R2-11, R2-12, R2-13). Read those sections.
1. **R2-03** CopilotPanel: require `bundle.requestBody === buildRequestBody(<model>, notes.trim())` and `bundle.modelId === <announced model>`; add a required
   check `request_matches_input` to `verifyBundle` (expected request body passed in). G8 (copilot verifier, fixture) must stay green: if the recorded fixture's
   request body can't match, compare against the body that fixture was built from — never regenerate the fixture with a live key.
2. **R2-12** badge text exactly "Signed by an attested NEAR AI TEE" (provenance), caption "Model output, not advice."; show the user's notes beside the answer.
   No tools / function calling in the copilot.
3. **R2-04** /api/copilot: same-origin check (`Origin` / `Sec-Fetch-Site`), `content-type: application/json` required (415 otherwise), body cap 8 KB (413),
   in-memory per-IP token bucket (e.g. 5/min; 429; do not log IPs), `max_tokens` (~400) in the live request body (if that breaks the R2-03 binding for the
   fixture, apply it so both modes still bind), fixture DCAP verdict computed once and cached.
4. **R2-11** /api/health cached 5 s like /api/feed; generic error strings in health/indexer/feed responses (details server-side, no IPs); indexer segment
   patterns reject `.` and `..`.
5. **R2-08** headers in next.config: `X-Frame-Options: DENY`, `Strict-Transport-Security`, and a CSP with at least `frame-ancestors 'none'; object-src 'none';
   base-uri 'self'; form-action 'self'`. A full script-src/connect-src CSP and a pinned near-connect `manifest` (F-096/F-097) only if every e2e + a11y run
   stays green; otherwise leave them and say so in the report (they become disclosed residuals).
6. **R2-13** `import "server-only"` in lib/copilot/server.ts; localhost guard on `E2EKeyAdapter` like `E2EMockAdapter`.
Tests: unit tests for each new check (binding mismatch → not verified; 415/413/429/cross-origin → rejected; `..` → 404). `pnpm verify:quick`, copilot
verifier, web e2e and lighthouse (a11y ≥ 90, both themes) green. Copy rules apply. NO Co-Authored-By line. Never --no-verify. Report ≤ 10 lines.
