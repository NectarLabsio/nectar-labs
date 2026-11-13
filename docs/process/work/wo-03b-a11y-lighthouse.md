# WO-3b — web — G3 fix (small: ≤ 25 tool calls). Context: docs/process/gate-fail-g3.md
1. apps/web/components/states.tsx:79 loading skeleton: valid ARIA, e.g. `role="status" aria-live="polite" aria-busy="true"` with the
   label, or no label. Grep for any other element with aria-label and no role/semantic tag (same axe rule) and fix those too.
2. `apps/web/package.json` script `lighthouse`: `lighthouse` 13.6.0 as a pinned devDependency (or `pnpm dlx lighthouse@13.6.0`) driven by a
   small node script that starts `next start -p 3100` (or expects it running; document which), audits /, /feed, /borrow, /quote/new,
   /console, /keepers with `--only-categories=accessibility`, dark via `--force-dark-mode` and light via
   `--blink-settings=preferredColorScheme=1`, writes JSON under evidence/G3/lighthouse/ (untracked or gitignored), prints a score table,
   and exits 1 if any score is < 90.
3. Run `PW_CHANNEL=chrome pnpm --filter web e2e` (testnet read specs run; the write spec skips without the key) → 0 failures; run the new
   lighthouse script → all ≥ 90. Commit `fix(web):`. Report ≤ 12 lines.
