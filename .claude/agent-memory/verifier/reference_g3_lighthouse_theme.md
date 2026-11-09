---
name: g3-lighthouse-theme
description: How to run G3 (e2e, lighthouse script, theme proof, write-flow avoidance) from a fresh clone; history of the axe FAIL and the PASS rerun
metadata:
  type: reference
---
G3 FAILED 2026-11-09T20:57Z (c940dec): axe aria-prohibited-attr on the loading skeleton, and no lighthouse script. PASSED on rerun 21:15Z (176914f) after WO-3b.
- `pnpm --filter web lighthouse` now = apps/web/scripts/lighthouse.mjs; LH_START=1 starts/stops next on :3100 itself; reports go to <clone>/evidence/G3/lighthouse/ (copy them out).
- Theme proof: `.fullPageScreenshot.screenshot.data` (webp) -> `sips -s format bmp` -> mean brightness via a small node BMP reader (no PIL). Dark ~35, light ~235.
- Testnet write spec skips on its own when NECTAR_E2E_BORROWER_KEY / NEXT_PUBLIC_E2E_KEY_ADAPTER are unset, so a plain e2e run gives 2 skips. Each write run opens a new position, so cite the 20:57Z write evidence (06/07/08) and confirm with `pnpm demo:testnet`.
- The `### G2 ... 2026-11-10T19:42Z 3f9c1a2` block at the top of EVIDENCE.md is the format template, not a real run.
- Rewriting EVIDENCE.md with mv from /private/tmp warns "set owner/group" on the T7 volume, but the content still lands. Check wc -l afterwards.
**How to apply:** on G3 reruns, reuse these steps; about 18 tool calls is enough.
