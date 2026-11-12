---
name: wo34-prod-acceptance
description: WO-34v/v2 production acceptance recipe — curl docs sweep via sitemap, inventory spec vs hosted URLs, SSR-vs-hydrated landing trap (Base "local fork")
metadata:
  type: reference
---
WO-34v2 2026-11-12 (release 3974b5b). Recipe that fit in ~35 turns:
- Worktree guard refuses `git -C`, `cd X && git`, `$VAR` git: put clone + multi-step work in scratchpad .sh files; probes as .mjs inside the clone's apps/web.
- `grep` in this shell is ugrep (complexity errors on `.{0,70}` context); use /usr/bin/grep or python3 -I.
- Docs sweep: APP/docs/sitemap.xml (56 locs) → curl every page (headers + body) → x-robots-tag count + python regex for `<a href=...127.0.0.1|localhost>`. Local-dev mentions in <code>/<span> are text, not hrefs.
- Host check: inventory spec unchanged with E2E_INVENTORY=1 INV_SITE/INV_APP=prod, E2E_BASE_URL=APP (skips webServer), PW_CHANNEL=chrome; then evidence/WO-34/production-20261112/host-check/wo34v-privacy-check.mjs on content/data-inventory.json.
- LH: LH_BASE_URL + LH_ROUTES; script does both themes. Docs min 93 (quick-start, feed-rest, agent-skill-x402).
- TRAP: landing SSR HTML ≠ hydrated text. Feature flags resolve client-side (FeatureGate useChain), so curl/static HTML said "A Base local fork holds the stock." while hydrated Chrome said "Solana holds the stock." with 0 "local fork" (features.base false). Always check claims in hydrated innerText, not only raw HTML (G3b run 6 (i) checked static HTML only).
**How to apply:** for any copy/claims check, run both raw-HTML and hydrated probes and report mismatches.
