# WO-87 — brand deploy (WO-85 + WO-86) checks before the takes (Kunal: done by 19:30Z; if anything fails, revert and leave the brand change until after judging)
Production since 2026-11-13 ~16:58Z, both from c9fd56b (tarball sha256 d5986558…; CLI deploys, evidence/WO-34/deploy-{web,docs}-cli-2026111316*.log):
web dpl_F8NmBUE5PzpsdYRw94QWsRX85hgH (footer "A Nectar Labs product · testnet · mock collateral", copyright "© 2026 Nectar Labs"), docs dpl_2gj8GAFNtCHUDHTtWYwmS55Yu2ks
(copyright "© 2026 Nectar Labs"; docs content = 963ab62 + copyright). Product diff 963ab62 → c9fd56b in apps/packages: Nav.tsx (2 lines), docusaurus.config.ts (1 line),
landing/index.html (not deployed). Orchestrator smoke-prod 17:00Z: 0 failures.
A (verifier; write only docs/EVIDENCE.md, evidence/): section `WO-34 production (web + docs c9fd56b, WO-85/86 brand)` = targeted G3b: (1) smoke-prod.sh SITE APP DOCS
STATUS + 5 legacy pairs exit 0; (2) footer text + copyright on SITE /, APP /borrow, APP /feed, STATUS /, DOCS / and DOCS /project/team (rendered DOM, hydrated Chrome),
no "Nectar Network product" / "2026 Nectar Network" anywhere in the served HTML of those pages; (3) 0 console/hydration errors on SITE /, APP /borrow, STATUS /, DOCS /
(desktop + 400 px); (4) Lighthouse a11y SITE /, APP /borrow, DOCS / both themes ≥ 90 (footer contrast); (5) branding check exit 0 on c9fd56b; e2e claims.spec +
test-assets.spec still green (system Chrome). Commit `test: evidence — brand deploy c9fd56b (WO-87)`. NO Co-Authored-By. Report ≤ 6 lines. FAIL → say so at once.
B (docs; write only README.md, docs/HUMAN_HANDOFF.md): README lines naming the production deploys → web + docs = c9fd56b (web dpl_F8NmBUE5…, docs dpl_2gj8GAFN…, CLI
16:58Z, brand change approved by Kunal), cite EVIDENCE §"WO-34 production (web + docs c9fd56b, WO-85/86 brand)" (written by A). H-DEPLOY: add both deploys.
Commit `docs: production = c9fd56b brand (WO-87)`. Symlink node_modules. NO Co-Authored-By. Report ≤ 4 lines.
