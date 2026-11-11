# WO-34f — web — every wallet under the CSP, no cross-host prefetch, RPC load (< 2 h; commit `fix(web): all selector wallets under the CSP; no cross-host prefetch; RPC coalescing`)
Write only `apps/web/`, `packages/ui/`, `packages/sdk/`. Context: WO-34c report (merged).
1. **Wallets.** Today's CSP and inventory cover only Meteor. In real Chrome (fresh profile, hosted mode, your own ports), open the REAL near-connect
   selector and, one by one, every wallet it lists. Load each wallet's iframe or flow up to the point where it would ask to sign or connect. Never sign;
   never enter a seed.
   - Record each wallet's hosts and storage keys. Add them to `lib/csp.ts` and to `apps/web/content/data-inventory.{json,md}`, grouped per wallet.
   - Zero CSP violations for every wallet.
   - If a wallet cannot work under an exact-host CSP (for example it loads arbitrary hosts), say so. Then either keep it working with the narrowest
     directive that does, or record it as a known limitation. Never silently break a wallet.
   - Note in the report that the near-connect wallet manifest is fetched unpinned (an existing residual), so a manifest change can add hosts.
2. **Cross-host prefetch.** Links from SITE pages to APP routes (SiteChrome, landing) and from APP to SITE must not prefetch across origins:
   `prefetch={false}` or plain `<a>` for cross-host hrefs. This removes the CORS console errors. Keep same-host prefetch.
3. **RPC load.** A page must not spray RPC.
   - SDK view calls get in-flight de-duplication plus a short TTL cache (for example 5–10 s) per (contract, method, args).
   - Backoff on 429 without console.error noise from our code.
   - crawl.mjs gets a politeness mode (concurrency 1, per-page delay flag), and its report separates "our console errors" from third-party network
     failures (but still lists both).
   - Re-run the crawl in hosted mode with politeness on. Target: 0 console errors.
4. Re-run the inventory spec + crawl. Update the inventory files. `pnpm verify:quick`. e2e local mode still green.
Own ports (not 3000/3100/3217/3291/3471/3613/3741/3742/3857/8788–8791/8891). Stop your servers. `git merge main` before the final runs. No deploy.
NO Co-Authored-By. Never --no-verify. Report ≤ 10 lines with the per-wallet host list.
