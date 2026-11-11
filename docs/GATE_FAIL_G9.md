# GATE_FAIL_G9 — 2026-11-11 (verifier, fresh clone of c5f6349; EVIDENCE 1aabf5f, evidence/G9/20261111T084317Z/)
**Cause (single):** NEAR Hackathon copy in the product UI. `apps/docs-site/docs/project/evidence.md:11` ("…being built for the NEAR Hackathon…") is in the docs
sidebar (Project › Evidence) and ships in the built site + search index. CLAUDE.md §1: hackathon context only in README.md, docs/EVIDENCE.md, docs/SUBMISSION.md.
**Why it slipped:** `apps/web/scripts/check-no-branding.mjs` scans web/ui sources only. **Guard added:** `scripts/check-no-branding-all.mjs` (landing, web, ui,
docs-site pages/nav/static) — finds exactly this line; wired into `pnpm verify:quick` once the fix merges.
Everything else in G9 passed: quick start ~3 min, `pnpm verify` green, docs build, gitleaks (268 commits) clean, Feed MCP live from the README (agents claimable),
no unbacked claim, mock-ft upgrade now recorded.
**Fix (WO-38, docs):** remove the sentence; README staleness the verifier hit (Feed env line 68, date/timings, routes, MCP pointer); HUMAN_HANDOFF H-NEAR-FAUCET → DONE.
**Then:** wire the check, re-run G9 (verifier, fresh clone). Status: OPEN.
