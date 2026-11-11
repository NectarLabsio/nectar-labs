# WO-40 — security review 2 (read-only; < 90 min)
Independent reviewer. **Do not edit any repo file**; do not run anything that signs or sends a transaction; do not start/stop host services.
Full report → `/private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad/review2.md`; ≤ 40-line summary back.
Context: NEAR testnet hub + Solana devnet + Base Sepolia fork; mock collateral; not deployed publicly. Review 1 (docs/work/security-review-v7.md, SR-xx in
SECURITY.md) covered contracts, solana, evm, keeper, quoter, x402 facilitator. This review covers what it did not:

A. **apps/web + packages/sdk + packages/ui** — API routes (apps/web/app/api/**: copilot, feed, health, indexer): SSRF, open proxying, input validation, error
   leakage, caching of per-user data; secrets reaching the client bundle (NEXT_PUBLIC_*, server-only imports); XSS (dangerouslySetInnerHTML, rendering chain /
   Feed / token-metadata / Notes SVG strings); wallet flows: does every transaction the UI or SDK builds match what the user sees (receiver, method, args,
   deposit, amounts, decimals, slippage, `_e6` rounding), network/mainnet guards, account-id validation, preimage/msg builders; headers/CSP; dependency red flags.
B. **Copilot prompt injection** — apps/web/app/api/copilot/route.ts, lib/copilot/{server,verify}.ts, components/CopilotPanel.tsx, scripts/*copilot*: which
   untrusted text reaches the model (user input, Feed data, chain strings, memos, metadata)? Can injected text make the copilot propose an action that
   verify.ts accepts but the user did not ask for (other receiver/method, bigger amount, deposit, someone else's account)? Is any action auto-executed or
   always user-signed? API key handling, cost abuse / rate limits, fixture-vs-live mode, what is logged.
C. **Privacy claims** — enumerate every privacy / confidentiality / "private" / "not stored" / "no tracking" / TEE claim in README.md, SECURITY.md,
   docs/SUBMISSION.md (privacy track text), apps/docs-site/docs/** (legal/privacy.md, security/*, concepts/*), landing + app UI copy. For each: HOLDS /
   PARTIAL / DOES NOT HOLD, with code evidence (what is on chain, what quoter inputs/outputs reveal, what Feed/keeper/x402/copilot log or persist, cookies,
   localStorage, analytics, third-party requests: fonts, CDNs, RPCs, LLM provider).
Format per finding: id (R2-nn), severity (high/med/low/info), file:line, failure scenario (concrete input → wrong outcome), suggested fix, owning dir.
Rank most severe first. Only report what you verified in code; mark anything inferred as such.
