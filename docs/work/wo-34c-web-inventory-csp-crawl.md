# WO-34c — web — data inventory, exact-host CSP, crawler (< 2 h; commit `feat(web): data inventory, exact-host CSP, crawl script`)
Write only `apps/web/`. Context: docs/work/wo-34-deploy.md. WO-34b (new SITE pages) runs in parallel. Don't touch app/ pages or SiteChrome.
1. Inventory (`apps/web/e2e/inventory.spec.ts`, opt-in project, needs network, not in the default e2e run):
   - Setup:
     - Real Chrome (PW_CHANNEL=chrome), fresh profile.
     - Hosted mode on your own port: SITE_URL=http://site.localhost:<p>, APP_URL=http://app.localhost:<p>.
     - DOCS_ORIGIN = a local `docusaurus serve` on another own port.
   - Visit every route on both hosts (both themes):
     - Accept AND decline consent.
     - On /borrow open the REAL near-connect selector and one wallet's iframe. Do not sign.
   - Record:
     - Every request host, per page.
     - Every cookie (name, domain, expiry).
     - Every localStorage / sessionStorage / IndexedDB key (name, origin).
   - Fill in purpose + lifetime + who sets it (our code vs near-connect vs a wallet) by grepping the code and node_modules.
   - Output: `apps/web/content/data-inventory.json` + `apps/web/content/data-inventory.md` (a table the privacy and cookie pages will be written from).
2. CSP from the inventory:
   - Set `connect-src`, `frame-src`, `img-src`, `font-src`, `style-src`, `script-src` to exactly the measured hosts plus `'self'`, in `lib/csp.ts` used by
     next.config.
   - Keep `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`.
   - Verify in real Chrome under the new CSP: near-connect selector opens, one wallet iframe loads, zero CSP violations in the console on every route.
   - If a strict `script-src` breaks a wallet, keep that one directive as today and say why.
   - Feed/x402 are server-side (no browser CSP entry) unless you measure otherwise.
3. Crawler (`apps/web/scripts/crawl.mjs`, reused by the production verifier):
   - Inputs: SITE, APP and DOCS base URLs.
   - Follows every internal link (including /docs via the rewrite).
   - Asserts 200 after redirects, the redirect codes from WO-34a, and external links answering < 400 (GET with a timeout).
   - Collects console errors (Playwright) per route, both themes, at 1440 and 400 px.
   - Writes JSON + markdown reports to a path given by `--out`.
   - Run it locally in hosted mode and fix what is yours. List the rest (pages from WO-34b, docs links) in your report.
4. `git merge main` (WO-34b may have merged), then re-run the inventory and the crawl before reporting. `pnpm verify:quick`.
Own ports (not 3000/3100/3217/3291/3471/3613/8788–8791/8891). Stop your servers. No deploy. NO Co-Authored-By. Never --no-verify. Report ≤ 10 lines with
the host list.
