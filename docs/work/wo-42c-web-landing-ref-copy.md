# WO-42c — web — design-reference landing copy + GA no-op (< 20 min; commit `fix(web): review 2 — reference landing TEE copy; drop no-op anonymize_ip`)
Write only `landing/index.html` (design reference page, DESIGN_SYSTEM §3b), `apps/web/components/SiteChrome.tsx`.
1. landing/index.html ~:569 and ~:691: replace the "your private parameters …" / "reads private market-maker parameters" copy with the same wording
   WO-42b put in apps/web/components/landing/Landing.tsx (operator-set demo parameters, published in the docs; each settlement's discount reveals their
   product). Also apply the WO-42b banner wording if this page has the "never joined to IPs" line.
2. SiteChrome.tsx: remove `anonymize_ip: true` (no effect in GA4; review 2 C14) — nothing else in the gtag block changes.
`node scripts/check-no-branding-all.mjs`, `pnpm verify:quick` exit 0. Copy rules apply. NO Co-Authored-By. Never --no-verify. Report ≤ 3 lines.
