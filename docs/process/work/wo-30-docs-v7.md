# WO-30 — docs — v7 documentation (first pass) (< 2 h; commit `docs: v7 modules (first pass)`)
Read first: PRD v7 §1A, §4.2, §4.6, §4.7, §4.11, §9B, §10.5 (only); docs/EVIDENCE.md (what is evidenced); D-017–D-021; CLAUDE.md copy rules
(never "insurance", never "without liquidations", never "live" before EVIDENCE shows it; no hackathon branding in apps/docs-site).
Write apps/docs-site and docs/*.md except FACTS/EVIDENCE.
1. Docs site pages:
   - Concepts: aggregate borrowing limit (two-sided check), Weekend Oracle Guard (fails closed; calendar windows; 900 s), corporate-action multiplier,
     fee stack + referrals;
   - Integrations: remote collateral lifecycle on Solana (reserve → deposit → attested confirm → settle or release; per-position derived key),
     agent skill (MCP tools) + x402 paid export.
   Each page carries a status line: "built and tested in the sandbox; testnet deployment pending" unless EVIDENCE shows a testnet run.
2. README: add a "v7 in progress" section below "What is live", one row per module with its status (built + tested / deployed / gate), and the
   Solana devnet program id `ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW` with its explorer link labelled "deployed; round trip pending G7". Keep every
   existing live row unchanged. The quick start must still work (do not change commands).
3. `docs/process/market-task.md` (for H20): the task text Kunal may post on market.near.ai himself (≤ 150 words, no claims beyond EVIDENCE).
4. `pnpm --filter docs-site build` green. Report ≤ 20 lines.
