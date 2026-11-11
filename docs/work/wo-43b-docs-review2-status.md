# WO-43b — docs — review 2 status, G14 verifier-run, copilot binding (< 60 min; commit `docs: review 2 status — SECURITY.md, G14, copilot binding`)
Write only `SECURITY.md`, `README.md`, `docs/SUBMISSION.md` (prose only — never tracks / website / TODO-H*), `docs/DEMO_SCRIPT.md`, `apps/docs-site/**`.
Sources: docs/work/review-2-findings.md; merged fixes WO-42a (2111b71), WO-42b (313f660), WO-42c (0bd0cb3), WO-43 (fb3f05c), WO-44 (b1931ea);
EVIDENCE G14 re-run row (2e16f9b). Verify each "fixed" claim in the code before writing it.
1. **SECURITY.md**: section "Review 2 (2026-11-11): web, SDK, copilot, privacy claims" — table R2-01…R2-12 with disposition (fixed + WO / disclosed).
   Disclosed residuals: R2-07 on-chain fee bound (contract, PROD); R2-08 no full script-src/connect-src CSP, near-connect manifest not pinned, real-wallet
   flow under the new headers not covered by e2e (mock wallets); R2-10 Solana genesis-hash check skipped (not in FACTS); R2-02 MM-owned secrets / coarser
   outputs (PROD); zod advisory still reaches services/x402 via @x402/core (needs zod 3, no patched 3.x); docs-site build-time criticals (tinypool,
   serialize-javascript; build only); elliptic (low, web); FACTS C-020 (implicit-account definitions differ; SDK takes the safe side). Drop web/SDK/copilot/
   privacy from the "Not reviewed" item.
2. **G14**: the HTTP 402 → 200 leg is now verifier-run (EVIDENCE 2e16f9b, fresh clone 45ed1f3). Replace every "self-attested / not re-run / pending" for it
   (README, docs-site evidence.md, agent-skill-x402.md ~:49, live-on-testnet.md, SUBMISSION). G1 gas rows on 2.2.1: one owner setter lacked a row
   (docs/GATE_FAIL_G1_221.md), test added in WO-45; say the re-check is recorded in EVIDENCE — no PASS claim until EVIDENCE shows it.
3. **Copilot**: request binding now exists (`request_matches_input` + model id) — replace "not yet tied to the question typed" (README ~:32, live-on-testnet
   ~:32, trust-model ~:22, privacy.md, SUBMISSION ~:32) with "bound to the question you typed and the announced model"; keep "provenance, not advice".
   Mention /api/copilot same-origin + rate limits where the copilot is described.
4. **agent-skill-x402.md**: the reference demo agent now enforces the check (services/x402/src/borrow-guard.ts; signs its own rebuilt call).
5. **DEMO_SCRIPT "Before recording"**: (a) connect a real testnet wallet once (wallet selector + sign) — new security headers, e2e uses mock wallets;
   (b) re-run `bash scripts/60-x402-accounts.sh` (tops agent1 up with 2 mock NVDAx) before the x402 segment.
6. apps/docs-site/src/theme/Root.tsx: drop the no-op `anonymize_ip: true` (GA4 ignores it).
`node scripts/check-no-branding-all.mjs`, `pnpm --filter docs-site build` exit 0. Copy rules apply. NO Co-Authored-By. Never --no-verify. Report ≤ 8 lines.
