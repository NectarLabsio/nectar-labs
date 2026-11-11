# WO-34e1 — docs — terms and disclaimers; D-031 (< 60 min; commit `docs: terms and disclaimers for the hosted demo; D-031`)
Write only `apps/docs-site/docs/legal/{terms,disclaimers}.md`, `docs/DECISIONS.md`. These two files are rendered on SITE (/legal/terms,
/legal/disclaimers) by apps/web AND in the docs site, so one source, no duplication. Context: docs/work/wo-34-deploy.md. Privacy and cookies come later
(WO-34e2, written from the WO-34c data inventory). Don't touch them now.
1. Terms + disclaimers, true and specific:
   - testnet only;
   - mock collateral with no value (mock NVDAx stands in for xStocks);
   - unaudited code;
   - not investment advice;
   - no token;
   - the owner oracle and the other disclosed fallbacks (FACTS / README live-mock-fallback table);
   - the known limitations in SECURITY.md (link, and summarise the user-facing ones: C-020, remote Loan Note release-to-depositor, Base = local fork);
   - service availability (hosted demo until at least 2026-11-25, no SLA);
   - on-chain data is public and permanent;
   - governing law and operator: write the literal marker `TODO-H-LEGAL` where OPERATOR / COUNTRY / CONTACT go (production builds refuse pages that
     contain `TODO-H`).
   Copy rules: never "insurance", never "without liquidations", no "live" beyond EVIDENCE.
   No hackathon copy (these pages are product UI).
2. DECISIONS D-031: hosted x402 is not deployed. @fastnear/x402 needs a full-access relayer key (F-328; FACTS C-023 by WO-34r3), and Kunal's key line
   forbids full-access keys on Railway. The x402 paid route stays on the operator's machine (G14 evidence). Railway hosts the Feed only (+ keeper only
   if H-KEYS = yes; Base settlement stays local either way, D-026).
`pnpm --filter docs-site build` exit 0, `node scripts/check-no-branding-all.mjs` exit 0. `git merge main` before committing. NO Co-Authored-By. Never
--no-verify. Report ≤ 5 lines.
