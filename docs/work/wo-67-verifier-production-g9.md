# WO-67 — verifier — production acceptance on the custom hosts + G9 on the frozen commit (< 2 h; commit `test: evidence — production (custom hosts) + G9 run 6 (WO-67)`)
Runs only after the orchestrator has deployed the G3b-passed commit (web + docs on Vercel, Feed CORS on Railway). Write only docs/EVIDENCE.md and evidence/.
Hosts: SITE https://nectarlabs.io · APP https://testnet.nectarlabs.io · DOCS https://docs.nectarlabs.io · STATUS https://status.nectarlabs.io ·
legacy: nectarlabs.vercel.app→SITE, nectarlabs-app.vercel.app→APP, nectar-labs-web.vercel.app→APP, nectarlabs-docs.vercel.app→DOCS, nectar-labs-docs.vercel.app→DOCS.
A. Production acceptance (new block "WO-34 production (custom hosts)"):
  1. `scripts/deploy/smoke-prod.sh SITE APP DOCS STATUS <5 legacy pairs>` exit 0 (28 app routes, 56 docs pages + assets at the root, host split,
     status host, docs 308s with query kept, legacy 308s with path + query kept, www → apex, HSTS/CSP, no noindex).
  2. Deployed commit: the web /api/health (or build id) and the docs build reference the commit the orchestrator names; Feed /health commit.
  3. Hydrated Chrome on SITE / and STATUS /: 0 hydration / console errors (our code). Landing Base sentence says local fork of Base Sepolia.
  4. APP /borrow: "Get test assets" button + label "Mock assets, no value" present after connect-prompt state; absent on SITE.
  5. Real wallet selector on APP: 6/6 wallets reach their prompt (no signing); 0 CSP violations.
  6. Lighthouse a11y SITE / and APP /borrow, both themes ≥ 90; crawl --polite over the four hosts: 0 failures.
  7. Feed: /health ok, CORS allows SITE + APP (+ STATUS if configured), refuses evil.example.com.
  8. Oracle: `get_exit_capacity` oracle_age_s < 86,400; if the Railway refresher runs, its key on nectar.testnet is FunctionCall to nectar-core-v2 with
     method_names exactly ["update_owner_price"] and the last refresh tx is visible.
B. G9 run 6 on the same commit (fresh clone, README quick start < 15 min, every command; claims vs EVIDENCE; gitleaks; branding; the
   `ac.nectarlabs.io` / `vercel.app` grep with the allowed exceptions; hosted URLs answer as README says).
Gate rule: a product assertion failing = FAIL + docs/GATE_FAIL_<id>.md. Third-party limits are notes. Report ≤ 20 lines.
