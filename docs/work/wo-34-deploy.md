# WO-34 — hosted production (Vercel + Railway) — master work order
Source: Kunal's message, 2026-11-11 ~19:30Z. **Kunal confirmed in session: "Deploy to production on Vercel (frontend, docs) and Railway (backend) for the
domains below."** Nothing pushed to git, posted or sent. Hosting never blocks H1. Hard stop: production green by **2026-11-13 18:00 UTC**, else keep only
what passes (landing alone is fine) and continue the submission without hosting.

## Pre-check (orchestrator, 2026-11-11 19:40Z) — report before any deploy
- **nectarlabs.io is NOT registered.** The .io registry returns NXDOMAIN (Cloudflare DoH, authority a0.nic.io). Vercel registry lookup: `available: true`,
  $14.99 first year, $46 renewal. Nothing serves it. That contradicts the brief ("it already answers HTTP") → FACTS conflict (WO-34r) + handoff H-DOMAIN.
  Agents never buy a domain.
- Vercel: account `kunal-drall`, team "kunal's projects" (team_MiLz0ltfLtDKKXhS27w1K5QR), plan **Hobby** (non-commercial terms; WO-34r records limits).
  Existing pre-repo projects (nectar-landing, nectar-frontend, docs-site-nectar) are NOT reused. New projects are created at deploy time.
  Domains in the team on Vercel DNS include nectar.monster, nectarnetwork.fun, nectarn.wtf. Not used unless Kunal says so.
- Railway: user kunaldrall29, personal workspace "kunal drall's Projects" (5 pre-repo projects, not reused). The plan is not readable through the API → H-HOST.
- Neither the Vercel CLI nor the Railway CLI is installed or logged in. The Vercel MCP can only deploy inline files. The Railway MCP needs a GitHub repo (no
  remote until H2) → a CLI login is a human step (H-HOST). Use the CLIs through `npx` at the versions WO-34r pins.
- Key line: Kunal's paste kept the line "[delete this line if not approved] New testnet-only function-call keys… may be stored as Railway secrets", but
  OPERATOR/COUNTRY/CONTACT/X_HANDLE were left as template placeholders. **Treated as not yet confirmed (H-KEYS).** Code supports env-held keys. No key
  leaves `~/.nectar/` until Kunal confirms.

## Targets (env-driven; all unset = local single-host mode, G9 unchanged)
SITE_URL (landing, about, legal, security, status, changelog, brand, talk) · APP_URL (all app routes; `/` → `/feed`) · DOCS_URL = APP_URL + `/docs` ·
FEED_URL (server-side) · REPO_URL (empty until H2; GitHub links hidden while empty). Intended: nectarlabs.io / ac.nectarlabs.io / ac.nectarlabs.io/docs;
www → SITE 301; app routes on SITE → APP 308; landing-only routes on APP → SITE 308.
**Default if H-DOMAIN is silent by 2026-11-13 06:00 UTC:** two `*.vercel.app` aliases on the one web project (SITE and APP), docs on its own
`*.vercel.app` (rewritten under APP `/docs`), Feed on `*.up.railway.app`. A domain swap later = env + alias change, no code change.

## Operator fields
`packages/config/config.yaml` `site:` (operator, country, contact, x_handle, hosted_until 2026-11-25). null until Kunal answers H-LEGAL. Pages read
them from there. A production build with any of operator/country/contact null must fail (guard), so no page ships a blank operator. **Default if silent by
2026-11-13 12:00 UTC:** no production promotion (previews only, noindex) → submission continues without hosting.

## Sub-work orders (ownership per CLAUDE.md §4)
| Round | WO | Agent | Scope |
| --- | --- | --- | --- |
| 1 | wo-34r-facts-hosting.md | researcher | FACTS: Next 16.4.5 proxy/rewrites/redirects, Docusaurus 3.10.2 baseUrl, Vercel CLI + Hobby + logging, Railway plans/CLI/volumes/logging, nectarlabs.io conflict |
| 1 | wo-34a-web-hosts.md | web | host routing, redirects, /docs rewrite, env, CSP, HSTS, noindex previews, sitemap/robots/canonical, OG/favicon, production guard |
| 1 | wo-34k-keeper-railway.md | keeper | Feed + x402 Railway-ready (Dockerfile, PORT, volume, head start, RPC fallback, /health, CORS, single-port MCP, env-held keys) |
| 1 | wo-34d-docs-baseurl-handoffs.md | docs | docs-site baseUrl `/docs/`, HUMAN_HANDOFF H-DOMAIN/H-DNS/H-LEGAL/H-KEYS/H-HOST, DECISIONS D-030 |
| 2 | wo-34b-web-site-pages.md | web | about, status (live /health), changelog (tags + conventional commits), brand, talk (contact copy button), security from SECURITY.md, consent gating, data-inventory capture |
| 2 | wo-34e-docs-legal.md | docs | privacy (from the inventory + FACTS), cookies (same keys), terms/disclaimers (testnet, mock collateral, unaudited, not advice, owner oracle, SECURITY.md limits, governing law) |
| 3 | orchestrator | — | G3b re-run 3 on the code-final commit → Vercel/Railway projects, env, deploy that commit (scripts/deploy/*) → H-DNS records |
| 3 | wo-34v-verifier-prod.md | verifier | production acceptance: crawl, host check vs privacy list, both themes 1440/400, Lighthouse ≥ 90, wallet connect, x402 if H-KEYS |
| 3 | docs | docs | README "Hosted demo" (URLs, hosted vs local, up until ≥ 2026-11-25), real-wallet borrow steps for Kunal |
| 3 | g9 | verifier | G9 run 4 from a fresh clone on the final commit → submission-rc |

## Content rules (all pages)
Every link leads to a real page with true content or is removed. No lorem, "coming soon", invented metrics/partners/team/audits/testimonials. No
hackathon copy in product UI. App numbers from views via packages/sdk. Landing worked example labelled "Example". Remote chains "Not live yet" until their
gates pass; Base "local fork". Analytics off. The three corrected privacy claims stay corrected. Talk to us: no form that pretends to send. CONTACT +
copy button + X_HANDLE. No new whitepaper: link docs "How it works" or remove the link.

## Acceptance (verifier, against production): see wo-34v. EVIDENCE gets deployment ids, URLs, response headers, crawl + host-check reports.
