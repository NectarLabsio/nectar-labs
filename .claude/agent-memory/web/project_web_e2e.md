---
name: web-e2e-patterns
description: How apps/web E2E tests flag-gated UI (pinFlags, v2 view fixture, mock wallet) and how to run the suite locally
metadata:
  type: project
---

Never trust config.yaml `features.*` in specs: as of 2026-11-11 most flags are ON (shields, notes, reserve, agent_skill, x402, solana_remote, profit_lock, weekend_guard; base/pay_to/multiplier/referrals off). Specs pin flags with `pinFlags(page, [...])`.
E2E for v2 UI routes `**/*fastnear.com/**` and answers core view calls from `apps/web/e2e/fixtures/v2-views.json`;
writes use the localhost-only `window.__NECTAR_E2E_MOCK__.near` wallet that records intents in `__NECTAR_E2E_CALLS__`.

Args-dependent views (preview_borrow with `shield`, etc.): decode `params.args_base64` in a per-spec route (see e2e/shields.spec.ts).
Running E2E: run `npx next start -p <port>` in background and set `E2E_BASE_URL`; full suite ≈ 5 min, 1 worker. `formatUsdE6` shows 2 dp truncated.
Landing v2 (WO-33a): `/` uses CSS module `components/landing/landing.module.css` (local names avoid components.css collisions); module ids are #borrow (shields), #reserve, #spend, #notes, #chains; agent_skill is a div inside #code.
Browsers: the shared Playwright cache can lag the pinned version (1248 vs 1254 on 2026-11-11); use `PW_CHANNEL=chrome` rather than installing. design*.spec and screens.spec write to evidence/, so skip them when the work order limits writes.
Remote spec answers `getAccountInfo` by address, deriving the PDAs with `@nectar/sdk` in the spec: a wrong seed in the app makes the card vanish, so the flow tests also cover seeds.
Nav strict-mode traps: no `session-badge` testid and no role=dialog in the shell (specs use unscoped getByRole("dialog")).

**Why:** gates pass at different times; the UI must be tested and must not claim "live".
**How to apply:** add new views to the fixture; never use the word "live" in /agents copy (E2E asserts it).
