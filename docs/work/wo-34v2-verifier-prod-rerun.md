# WO-34v2 — verifier — production acceptance re-run on the release (3974b5b) (≤ 35 turns)
Order: docs/work/wo-34v-verifier-prod.md, narrowed. Inputs: SITE https://nectarlabs.vercel.app · APP https://nectarlabs-app.vercel.app · DOCS = APP/docs ·
docs origin https://nectarlabs-docs.vercel.app (new short alias; the app proxies to it) · FEED https://feed-production-2f2776c9.up.railway.app.
Deployed: release 3974b5bb2df4ff98772c758621a68932db30f653 = frozen 3126773 (G3b re-run 6 PASS) + WO-35g docs fixes. Vercel web dpl_5YACVWKHkdB6RKZY788okPYRF7Uk,
docs dpl_9SobCo6o34dpRvhgwpBnUqq8jjoj; Railway feed from SRC_SHA 3974b5b. Fresh clone of 3974b5b into /tmp for the scripts (never install under /Volumes/T7).
1. The three WO-34v FAILs, each PASS/FAIL with the curl output:
   - no `x-robots-tag: noindex` on APP /docs, /docs/start/quick-start and 5 more docs pages (and none on SITE / or APP /feed);
   - docs origin https://nectarlabs-docs.vercel.app/docs/ sends X-Frame-Options DENY + CSP frame-ancestors 'none' (the `/` 307 may lack them, F-453);
   - no href to 127.0.0.1/localhost anywhere in the APP /docs pages (crawl or grep of all 56).
2. Regression: crawl --polite of SITE + APP (incl. /docs/*): 0 failures, 0 of our console errors; host check vs /legal/privacy (12 hosts) with the selector
   opened (never sign); headers on SITE/APP as before; Feed /health shows `history`, `chain_head_source`, `rpc` and chain_head ≥ last block; CORS SITE/APP
   allowed, other origin refused.
3. Landing claims on production (rendered + hydrated in Chrome): no "0123456789"; Base "local fork"; TEE "verifiable" (no private/confidential); worked
   example 40/70 and 10/25; the event-history banner on /feed and /keepers (the hosted Feed is views mode).
4. Lighthouse a11y ≥ 90: landing (both themes) and 5 docs routes (both themes) only — the rest passed at ca34111 and the app code is unchanged.
5. Record nectar-labs-web.vercel.app behaviour (info only). PW_CHANNEL=chrome. Never stop host services; own ports.
EVIDENCE: row "WO-34 production (release 3974b5b)" + section; commit `test: evidence — WO-34 production acceptance (release)`, no Co-Authored-By.
Report ≤ 10 lines.
