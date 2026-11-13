# WO-41 — web — light-theme contrast on the home page (< 30 min; commit `fix(web): light-theme contrast for .nx-delta.up`)
Write only `apps/web/`, `packages/ui/`. Source: EVIDENCE §G3b — `/` light scored a11y 97, only deduction color-contrast on `<span class="nx-delta up">`.
Fix the colour so it meets WCAG AA (≥ 4.5:1 normal text) on every background it sits on in light theme, without changing dark theme or token meaning
elsewhere (prefer a light-theme-scoped token/override; check other `.nx-delta` / up/down uses for the same issue and fix them too).
Verify: `pnpm --filter web lighthouse` (or axe) on `/` light and dark → a11y 100 on `/` light, no regression on the other routes it covers; `pnpm verify:quick`
exits 0; e2e for the touched screens green. NO Co-Authored-By line. Never --no-verify. Report ≤ 6 lines (before/after ratio, scores).
