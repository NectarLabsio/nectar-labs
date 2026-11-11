# WO-43 — docs — privacy claims that don't hold (< 60 min; commit `docs: review 2 — privacy claims corrected`)
Write only `README.md`, `docs/SUBMISSION.md` (prose only — never tracks / website / TODO-H* fields), `apps/docs-site/docs/**`. Not SECURITY.md (WO-43b
later). Source: docs/work/review-2-findings.md §C (C1–C19) + R2-01, R2-02, R2-05. Every corrected claim must match the code evidence there.
1. **privacy.md**: line ~28 keep "in any log we control" scope and add that the browser talks directly to RPC providers (they see IP + queried account);
   "Third parties actually used" table add FastNEAR RPC (browser + server, both hosts), api.devnet.solana.com (browser), GitHub raw + jsDelivr (wallet
   manifest, only after Connect), the chosen NEAR wallet / Solana wallet, 1Click (Feed server-side, no user data). GA row (C14): analytics are not configured in
   this build (GA_ID unset, no analytics requests) — drop the "anonymised IP" claim. Storage list (C13): near-connect keeps its own storage/IndexedDB.
2. **R2-02 / C1–C4**: quoter-tee.md "Honest limits" + README (~:109) + SUBMISSION privacy prose (~:32, :59): demo parameters are operator-set and published;
   the per-settlement discount reveals q·γ (output inference); the OutLayer coordinator saw plaintext (F-167). Keep what holds (inputs encrypted for the keystore,
   pinned program). PROD path: MM-owned secrets, no plaintext step, coarser outputs.
3. **C18**: "without buyer identity" (feed-mcp.md, feed-rest.md, /agents copy if in docs) must not read as a privacy property — buyer is public on chain.
4. **Copilot (C5)**: describe it as "signed by an attested NEAR AI TEE" (provenance, not advice); do not claim request binding yet (WO-42a adds it; WO-43b updates).
5. **R2-05**: agent-skill-x402.md: agents must rebuild/verify the returned call (receiver, method, args.receiver_id, amount, decoded msg, deposit 1 yocto)
   before signing, and should use a limited key; the reference demo-agent gets that check in WO-44.
`node scripts/check-no-branding-all.mjs` and `pnpm --filter docs-site build` exit 0. Copy rules apply. NO Co-Authored-By. Never --no-verify.
Report ≤ 8 lines incl. a list of each claim changed (file:line, old → new in ≤ 12 words).
