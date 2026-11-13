# WO-65 — docs — custom hosts everywhere, DEMO_SCRIPT ≤ 2 min, snapshot, handoffs (< 2 h; commit `docs: custom hosts, 2-minute demo script, handoffs (WO-65)`)
Write only README.md, docs/*.md (not FACTS/EVIDENCE/STATE) and apps/docs-site/ (content + vercel.json). Hosts (config.yaml `site.production_hosts`):
site https://nectarlabs.io · app https://testnet.nectarlabs.io · docs https://docs.nectarlabs.io (root; no `/docs` prefix) · status https://status.nectarlabs.io ·
Feed REST unchanged (Railway). Merged code: WO-62b (status host, docs 308s, LEGACY_HOSTS) + WO-64 (docs baseUrl "/"). Production still runs release 3
code with custom-host env (dpl_22L1aJ6…); the release with WO-62b/WO-64 is not deployed yet (needs Kunal's production-deploy approval) — README must
not claim more than is deployed: point to EVIDENCE §"WO-34 production" for the deployed commit and result, as it does today.
1. Replace the vercel.app hosts with the custom hosts in README (hosted-demo table, links), docs/SUBMISSION.md, docs/process/x-post.md, docs/DEMO_SCRIPT.md,
   docs/RUNBOOK.md, docs/process/human-handoff.md and docs-site pages. Then run `git grep -n -I -e "ac.nectarlabs.io" -e "vercel.app"`: 0 hits allowed outside
   (a) redirect config (item 2), (b) historical records: docs/EVIDENCE.md, docs/FACTS.md, docs/process/state.md, docs/process/decisions.md, docs/process/work/, evidence/,
   docs/process/final-report.md (regenerated at the freeze), (c) tests/fixtures that exercise the legacy redirect. List every remaining hit + reason in the report.
2. apps/docs-site/vercel.json: host-scoped permanent redirects (`has: [{type: "host", value: …}]`, F-456/F-459) so nectarlabs-docs.vercel.app and
   nectar-labs-docs.vercel.app → https://docs.nectarlabs.io/:path* (308). Keep cleanUrls, the /docs → / redirects and every header.
3. docs/DEMO_SCRIPT.md rewritten for at most 2 minutes, one table row per beat with time, screen, action, caption:
   0:00–0:06 intro "[INTRO — Kunal supplies]" · the new account demo.nectar.testnet (created 2026-11-12, tx 5NbjrugATtcyoqz5sjo9vGmAQz5EmMNkdafK5Em3bTC7)
   gets test assets with "Get test assets" on testnet.nectarlabs.io (label "Mock assets, no value"; if the button is cut at the 12:00 UTC timebox, the
   orchestrator mints to the account before recording — write both paths) · borrow with the Weekend Shield · the position page and its explorer link ·
   the agent's x402 paid call (terminal; the local x402 on :8791 reads the hosted Feed) · end card with the four URLs.
   "Before recording": NYSE hours 14:30–21:00 UTC; fresh oracle price (the Railway refresher re-asserts every 10 min in session; if it is not running,
   RUNBOOK one-shot `update_owner_price` with the CURRENT price within 15 min before); wallet import of demo.nectar.testnet: the phrase is only in
   ~/.nectar/keys/demo.nectar.testnet.json and Kunal shows it in his own terminal with
   `node -e 'console.log(require(process.env.HOME + "/.nectar/keys/demo.nectar.testnet.json").seed_phrase)'` — never on screen, never in a file
   in the repo. Keep `pnpm demo:capture` as the captioned fallback.
4. Retake the DEMO_SCRIPT state snapshot with `pnpm demo:testnet` (read-only) and date it.
5. docs/process/human-handoff.md: H-DNS CLOSED (Vercel DNS, no records needed, F-458); H-DOMAIN = nectarlabs.io (Kunal 2026-11-12); H-ORACLE = option A on
   Railway: service oracle-refresher is STAGED; Kunal applies the staged changes in the Railway dashboard (the accept-deploy approval was declined
   twice), then the orchestrator adds the function-call key (update_owner_price only, 1 NEAR allowance) and confirms the first refresh;
   new H-DEPLOY: production deploys need Kunal's approval this session (the web production deploy was denied by the auto-mode classifier) — approve
   the prompt or add a permission rule for the Vercel create_deployment tool; contact email kept (Kunal 2026-11-12); demo-account phrase command.
6. Copy rules: no hackathon branding in product docs; no unbacked "live"; never "insurance" / "without liquidations".
Tests: `pnpm --filter docs-site build` exit 0; `pnpm verify:quick` 0; branding 0. DISK RULE: no pnpm install in the worktree (symlink node_modules).
NO Co-Authored-By. Report ≤ 20 lines.
