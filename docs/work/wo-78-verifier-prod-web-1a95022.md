# WO-78 — verifier — EVIDENCE §"WO-34 production (web 1a95022, WO-74)" (< 25 min; commit `test: evidence — production web 1a95022 (WO-78)`)
Write only docs/EVIDENCE.md, evidence/. Exact section title: `WO-34 production (web 1a95022, WO-74)` (docs WO-79 links to it).
Production web since 2026-11-13 13:51Z: Vercel dpl_4ExxeLH65Mb2dfWLyaqQFykbpw2K (CLI deploy, src 1a95022 tarball sha256 74626b00…; evidence/WO-34/deploy-web-cli-20261113T135102Z.log).
Docs unchanged: dpl_DpqAmb6WtoFAm1m8agyK1cEw6yrE (c95cd0c). Product diff c95cd0c → 1a95022 in apps/: WO-74 only (TestAssets.tsx, BorrowComposer.tsx, e2e/test-assets.spec.ts).
Re-check now: (1) scripts/deploy/smoke-prod.sh SITE APP DOCS STATUS + the 5 legacy pairs (full origins) exit 0; (2) /borrow chunk marker for onClaimed→reload on
testnet.nectarlabs.io and the same chunks on nectarlabs-app.vercel.app's redirect target; (3) hydrated Chrome on APP /borrow and SITE /: 0 console/hydration
errors; (4) Lighthouse a11y APP /borrow both themes ≥ 90; (5) cite G9 run 9 web-delta specs 28/28 and the orchestrator's production QA log
(evidence/WO-74/prod-qa-check-20261113T140705Z.log) as SELF-ATTESTED. Do not claim from any account; do not use demo.nectar.testnet. NO Co-Authored-By. Report ≤ 8 lines.
