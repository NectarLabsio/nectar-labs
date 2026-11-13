# GATE_FAIL_WO67: G9 run 6, step 3 (docs only)

Verifier, 2026-11-13T02:05Z–02:40Z. Fresh clone of b7fa381; product code = deployed c95cd0c (`git diff --stat c95cd0c b7fa381 -- apps packages services contracts` is empty).
Production acceptance on the custom hosts (WO-67 A): PASS, 8/8. Every G9 command passes. The one failure is the README hosted-demo section, which still describes production before release c95cd0c.
Evidence: docs/EVIDENCE.md §G9 run 6 and §WO-34 production (custom hosts); evidence/WO-67/.

## README lines to fix (the claim and what production shows)
| Line | README says | Production (verifier, 2026-11-13 ~02:10Z) |
| --- | --- | --- |
| README:14 | "no verifier run on these hosts is recorded yet" | EVIDENCE §WO-34 production (custom hosts), c95cd0c: PASS |
| README:15–18 | status host, docs at the docs root and the "Get test assets" button "come with the next production release … not deployed … Until then status.nectarlabs.io shows the landing page … docs.nectarlabs.io redirects to its `/docs/` path. From that release on, the earlier platform hosts redirect (308)" | STATUS / is the status page (h1 "Status"). The 56 docs pages answer at the root of https://docs.nectarlabs.io, and DOCS /docs/<path> 308s to /<path>. All 5 platform hosts 308 with path + query kept. APP /borrow shows "Get test assets: connect a wallet first. Mock assets, no value" |
| README:24 | Status row: "status page from the next release; until then https://nectarlabs.io/status" | https://status.nectarlabs.io serves the status page; SITE /status and APP /status 308 → STATUS/ |
| README:25 | Feed: "CORS allows the Site and App origins only" | FEED_CORS_ORIGINS also allows https://status.nectarlabs.io (exact-origin ACAO, 204 preflight); evil.example.com is refused (403) |
| README:35 | faucet "web button is merged but not deployed" | deployed on APP /borrow (absent on SITE and STATUS) |

## Notes (not README claims; not counted)
- docs/DEMO_SCRIPT.md:18 has the same "next production release … not deployed" text.
- docs/process/human-handoff.md H-DEPLOY still reads `status: OPEN`. The WO-67 order says Kunal approved and the release is deployed.

## Remedy
Docs only (docs agent): update the README hosted-demo section (lines 14–18, 24, 25, 35). DEMO_SCRIPT:18 and H-DEPLOY need the same update. No product change is needed.
Re-check: G9 step 3 only (claims vs production) on the docs commit.

## Tooling notes from the same run (not gate failures)
- `scripts/deploy/smoke-prod.sh` exits 126 "Permission denied" in a fresh clone: all 67 `*.sh` files are git mode 100644. /Volumes/T7 is exFAT, where every file shows +x. The fix is `git update-index --chmod=+x` on the scripts that are run by path.
- `apps/web/scripts/crawl-hosts.mjs:87` expects 301 for www → apex. Production sends 308, which matches FACTS F-456 and smoke-prod.sh. The crawler also string-compares relative `location` headers (APP / → /feed, STATUS /status → /) against absolute URLs.
- Web /api/health exposes no commit or build id. The deployed commit was shown by content and by docs bundle bytes instead.

**Resolved 2026-11-13T02:40Z (verifier, WO-67b):** G9 run 6b, step 3 re-check on 8a54b4c (product = c95cd0c), PASS. README, DEMO_SCRIPT step 3, H-DEPLOY and H-NEARDATA match EVIDENCE and the live hosts, and smoke-prod.sh runs from a fresh clone with exit 0 (docs/EVIDENCE.md §G9 run 6b; evidence/WO-67b/).
