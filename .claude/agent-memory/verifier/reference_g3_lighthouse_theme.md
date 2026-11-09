---
name: g3-lighthouse-theme
description: How to run G3 Lighthouse per theme and prove which theme rendered; gates.md lighthouse script missing; axe vs Lighthouse disagreement
metadata:
  type: reference
---
G3 run 2026-11-09T20:57Z (commit c940dec) FAILED only because the e2e axe check flagged aria-prohibited-attr on the loading skeleton (apps/web/components/states.tsx:79). Lighthouse gave 100 everywhere.
- App has no ?theme; without localStorage `nectar-theme` it follows prefers-color-scheme. Lighthouse CLI dark = `--force-dark-mode`, light = `--blink-settings=preferredColorScheme=1`.
- `--only-categories=accessibility` drops final-screenshot; use `.fullPageScreenshot.screenshot.data` (webp) -> `sips -s format bmp` -> mean RGB (no PIL on host).
- `pnpm --filter web lighthouse` (gates.md) has no script in apps/web; record it as a discrepancy.
- `pkill -f "next start"` misses the server; kill the PID that `lsof -iTCP:3100` reports.
- Write flow: borrower1 key file has no account_id field; config gives borrower1.nectar.testnet (FullAccess key). Each G3 write adds a position (#1 after first run).
**How to apply:** on G3 reruns, reuse these steps and keep within the coordinator's tool-call budget.
