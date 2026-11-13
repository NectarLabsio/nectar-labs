# WO-34b — web — SITE pages that are true (< 2 h; commit `feat(web): about, status, changelog, brand, contact and security pages`)
Write only `apps/web/`, `packages/ui/`, `packages/sdk/`. Context: docs/process/work/wo-34-deploy.md (Content rules). WO-34a merged: proxy.ts, lib/hosts.ts,
site-meta, sitemap.ts (add new routes + `landingMetadata()`), `siteConfig` in packages/sdk. WO-34c (inventory, CSP, crawl) runs in parallel in apps/web:
don't touch next.config headers / lib/csp. **Local mode stays green** (no SITE_URL/APP_URL → single host).
1. `/about`: what Nectar Labs is (one paragraph consistent with README's first screen) and who runs it (`site.operator`, `site.country`). Nothing more.
2. `/status`, live:
   - Data:
     - /api/health and the Feed `/health` (WO-34k: last block, chain head, lag, contract ids, version), fetched server-side through FEED_URL.
     - Contract ids from config.yaml.
     - A gate table parsed at build time from docs/EVIDENCE.md (gate, PASS/FAIL, date, row link text). Label the source.
   - Say what runs hosted (web, docs, Feed) and what runs on the operator's machine (keeper settlement, x402 paid route, Base local fork). Say when
     settlement runs ("while the operator's keeper is online"). Wording must stay true if H-KEYS later moves the keeper to hosting (read a
     `KEEPER_HOSTED` env flag, default false).
3. `/changelog`, generated at build (prebuild script in apps/web/scripts, output gitignored):
   - Source: `git tag` + conventional commits (feat/fix/perf/docs; skip chore/test/merge), grouped by tag, newest first.
   - Filter out any subject that would break the no-hackathon-branding rule. The page passes `node scripts/check-no-branding-all.mjs`.
   - If not run in a git checkout, show "Built without git history" (fresh clones are checkouts).
4. `/brand`: the logo files from `packages/ui/logo/` (or the existing public/brand copies) with download links and one line of usage. No new artwork.
5. `/talk`:
   - Remove the mailto form (no form that pretends to send).
   - Show `site.contact` with a copy-to-clipboard button (accessible name, live-region confirmation) and `site.x_handle` when set.
   - Replace the `CONTACT_EMAIL` constant in lib/env.ts with `site.contact` everywhere. Do not keep the hard-coded address.
   - null → local-only text "Contact not configured in this build".
6. `/security`: render the repo-root SECURITY.md at build (same pattern as legal/[slug]) plus the reporting contact (`site.contact`).
7. Production content guard: in production builds (`isProductionEnv`), fail the build if any rendered about/legal/security/talk content contains
   `TODO-H` or a null operator field.
8. Landing `/`:
   - The worked example is labelled "Example".
   - Remote chains say "Not live yet" unless EVIDENCE shows their gate PASS (G7 Solana: check EVIDENCE; Base = "local fork").
   - Remove any whitepaper link, or point it at the docs "How it works" page via DOCS_URL. Every link goes to a real page.
9. Consent:
   - The stored choice gates anything non-essential. List in your report what, if anything, is non-essential today.
   - The banner copy must be true about what is stored.
10. SiteChrome footer links to the new pages. Repo links only through `repoHref()`.
11. Tests:
    - e2e for every new page (local mode, axe both themes, phone 400 px).
    - Lighthouse via `LH_BASE_URL=http://localhost:<your port> node apps/web/scripts/lighthouse.mjs`, a11y ≥ 90 both themes on the new routes.
    - `pnpm verify:quick`.
Own port (not 3000/3100/3217/3291/3471/3613/8788–8791/8891). Stop your server. `git merge main` before your final test run. No deploy. NO Co-Authored-By.
Never --no-verify. Report ≤ 10 lines.
