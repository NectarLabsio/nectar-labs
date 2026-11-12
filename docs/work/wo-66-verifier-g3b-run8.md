# WO-66 — verifier — G3b run 8 + G11 delta (mock-ft) + claim checks on release candidate 31809b1 (< 2 h; commit `test: evidence — G3b run 8, G11 mock-ft delta, claims (WO-66)`)
Fresh clone of 31809b1 into a temp dir. No secrets. Write only docs/EVIDENCE.md (rows + blocks, newest first) and evidence/. This run is LOCAL (no
production deploy yet; production acceptance and G9 follow in WO-67 after Kunal approves the deploy). Order: docs/work/g9-g3b-final-4.md items
(a)–(l) as in run 7 (EVIDENCE §G3b re-run 7), with these changes for the custom hosts (config.yaml `site.production_hosts`; FACTS F-455–F-464):
- (b) hosted `e2e/hosts.spec.ts` with all five env vars (SITE_URL, APP_URL, DOCS_URL, STATUS_URL, LEGACY_HOSTS) incl. the browser check
  (`E2E_HOSTED_BROWSER=1`, *.localhost origins, system Chrome if the Playwright headless shell is absent — say which). Status host, docs 308s
  (prefix dropped, query kept), legacy 308 (path + query kept), per-host canonical/og/sitemap/robots.
- (d) crawl --polite in hosted mode with docs served at the ROOT (scripts/serve-docs.mjs as updated by WO-62b).
- (h) replaced: no preview this run (local only).
- NEW (m) claims: `e2e/claims.spec.ts` + `e2e/test-assets.spec.ts` desktop + phone; and by hand: the landing says Base settlement ran on a local fork of
  Base Sepolia (JS off and hydrated); the Reserve amount shown = live `get_reserve` r_usd_e6; LTV/haircut shown = live `get_collateral` (40/70, 10/25);
  no 85% / 4% / 12% parameter figure in apps/web, packages/ui, docs/ui, landing/index.html; rolling counters: server HTML has plain values and no
  "0123456789", hydrated reels aria-hidden.
- NEW (n) G11 delta (mock-ft): `cargo test -p mock-ft` (38 unit) + sandbox_faucet (upgrade from tests/fixtures/mock-ft-deployed.wasm); rebuild
  `cargo near build non-reproducible-wasm` → sha256 must equal the code deployed on usdc-mock.nectar.testnet AND nvdax-mock.nectar.testnet
  (RPC view_code; expected e3d4ded52c1a5e64d4e05750f793ca4f2a177076e13d53cf9d733a99c37c6d14); `faucet_config` on both = config.yaml `faucet`;
  record the real call tx 2A4jN155i6AEbZv35qj8c7XZLV7TjWZejr3mnJmneQrW (borrower1, ft_mint 5 NVDAx) from RPC tx status; nectar-core unit 608 +
  sandbox still green (`cargo test --workspace`).
- NEW (o) grep: `git grep -n -I -e "ac.nectarlabs.io" -e "vercel.app"` — list every hit; PASS if each is redirect config, a historical record
  (EVIDENCE, FACTS, STATE, DECISIONS, docs/work, evidence/, FINAL_REPORT, PRD/BUILD_PROMPT, HUMAN_HANDOFF history lines) or a test fixture.
Gate rule: any product assertion failing = FAIL (write docs/GATE_FAIL_G3B_R8.md with the exact failing items). Third-party rate limits are noted,
not product failures. Report ≤ 20 lines to the orchestrator.
