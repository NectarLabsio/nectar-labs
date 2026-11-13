# WO-34y — docs — README "Hosted demo" + handoff fixes from the final audit (< 45 min; commit `docs: hosted demo section; handoffs after production`)
Write only README.md, docs/process/human-handoff.md, docs/DEMO_SCRIPT.md (`<APP_URL>` only). Dispatched only after the orchestrator's public production smoke
passed (evidence/WO-34/prod-smoke-*.log). Facts and evidence: docs/process/state.md top blocks, docs/process/final-report.md, docs/EVIDENCE.md "G3b re-run 5".

Production (deployed commit **ca34111**, G3b re-run 5 PASS with one deviation; Vercel dpl ids in STATE):
- SITE https://nectarlabs.vercel.app · APP https://nectarlabs-app.vercel.app · DOCS https://nectarlabs-app.vercel.app/docs
- Feed https://feed-production-2f2776c9.up.railway.app (Railway). Runs `FEED_INDEXER=views`: it reads contract state views; the event history is empty because
  neardata.xyz rate-limits Railway's egress (H-NEARDATA, optional key). CORS allows SITE and APP only.
- Keeper and x402 run on the operator's machine (keys in the OS keychain / `0600` files under `~/.nectar/`; x402 is not hosted, D-031; hosted keeper
  needs H-KEYS). Hosted until at least 2026-11-25 (config.yaml `site.hosted_until`). Platform `*.vercel.app` addresses until Kunal sets a domain.

1. README: a "Hosted demo" section near the top (after the first-screen disclosure): the four URLs, what is hosted vs local, the views-mode limitation,
   testnet + mock collateral, hosted-until date. Only claims the evidence supports; never "live" for anything EVIDENCE does not show live.
   Fix the stale rows the audit found: line ~31 Feed "no public host" → hosted (views mode, events not indexed); line ~33 → "G3b re-run 5 (ca34111): PASS,
   one deviation (Node 22 runtime covered by the engines pin, not observable)"; the status paragraph (~line 120) → current gate status from EVIDENCE.
2. docs/process/human-handoff.md:
   - legend: add `CLOSED`.
   - H-HOST → CLOSED 2026-11-12 (connectors used instead of CLI logins; Vercel team access approved by Kunal; Railway connector had access).
   - H-DOMAIN → CLOSED 2026-11-12: Kunal "go for it, i will set domain later" → production on `*.vercel.app`. Add how to switch later: Kunal names the
     domain (owned or bought by him) → orchestrator adds it to nectar-labs-web, updates SITE_URL/APP_URL/DOCS_URL (web) and APP_URL/DOCS_ORIGIN_URL (docs),
     redeploys the same commit, writes the DNS records into H-DNS. No code change.
   - H-DNS → N/A until a domain is named.
   - H2: the tag already exists, so `git tag submission-rc` fails. The orchestrator moves the tag (`git tag -f submission-rc <commit>`) after G9 run 4;
     Kunal's step is only `git remote add origin <url> && git push -u origin main --tags`, then make the repo public. Keep the order: repo public → demo
     post → send.
3. docs/DEMO_SCRIPT.md: replace `<APP_URL>` with https://nectarlabs-app.vercel.app.
4. Copy rules: no hackathon wording in product UI (README may carry it); never "insurance", never "without liquidations".
Tests: `pnpm verify:quick` → 0; branding check → 0. NO Co-Authored-By. Never --no-verify. Report ≤ 6 lines.
