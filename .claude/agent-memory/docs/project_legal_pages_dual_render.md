---
name: legal-pages-dual-render
description: apps/docs-site/docs/legal/*.md render in both the docs site (baseUrl /docs/) and apps/web /legal/[slug] via marked; link and markup rules that work in both
metadata:
  type: project
---
The four legal pages are one source rendered twice: Docusaurus (baseUrl `/docs/`) and apps/web `app/legal/[slug]/page.tsx` (marked, frontmatter stripped, no link rewriting). SITE serves only `/`, `/about`, `/security`, `/status`, `/changelog`, `/brand`, `/talk`, `/legal/*` (apps/web/lib/hosts.ts); anything else on SITE 308s to APP, and APP serves docs only under `/docs/*`.
**Why:** a link like `/security/disclosure` builds fine in Docusaurus but 404s from the SITE copy (WO-34e1, 2026-11-12).
**How to apply:** link docs pages as `/docs/<slug>` (Docusaurus does not double-prefix; broken-link and anchor checks still run), shared routes as `/legal/...` and `/changelog`. No JSX or raw HTML (`<p className=...>`) in legal md: marked passes it through. Operator/country/contact use the literal `TODO-H-LEGAL` marker (prod guard refuses `TODO-H`). In local single-host mode `/docs/*` from the web copy 404s (only `/docs` exists); accepted.
