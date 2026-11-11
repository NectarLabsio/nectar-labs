---
name: legal-pages-dual-render
description: apps/docs-site/docs/legal/*.md render in both the docs site (baseUrl /docs/) and apps/web /legal/[slug] via marked; link, markup, comment and marker rules that work in both
metadata:
  type: project
---
The four legal pages are one source rendered twice: Docusaurus (baseUrl `/docs/`) and apps/web `app/legal/[slug]/page.tsx` (marked, frontmatter stripped, no link rewriting). SITE serves only `/`, `/about`, `/security`, `/status`, `/changelog`, `/brand`, `/talk`, `/legal/*` (apps/web/lib/hosts.ts); anything else on SITE 308s to APP, and APP serves docs only under `/docs/*`.
**Why:** a link like `/security/disclosure` builds fine in Docusaurus but 404s from the SITE copy (WO-34e1, 2026-11-12).
**How to apply:** link docs pages as `/docs/<slug>` (Docusaurus does not double-prefix; broken-link and anchor checks still run), shared routes as `/legal/...` and `/changelog`. No JSX or raw HTML in legal md: marked passes it through. Operator/country/contact use the literal `TODO-H-LEGAL` marker.

Production content guard (apps/web/lib/config.server.ts `guardContent`) refuses a prod build if legal page text contains ANY `TODO-H` string, so never leave TODO-H4/TODO-H7-style markers on legal pages; only TODO-H-LEGAL, which is meant to block until filled.
Comments: neither renderer handles `<!-- -->` or `{/* */}` uniformly, so put source/FACTS-id notes as YAML `#` comments inside frontmatter (both strip it). Avoid `{#custom-id}` heading ids (marked shows them literally); rely on the auto slug ("Cookie settings" → `cookie-settings`).
Privacy page host list must cover every third-party host in apps/web/content/data-inventory.json as `` `host` `` code text (WO-34e2 check: exclude j.site/j.app hosts); wallets get one subsection each.
