# WO-34r — researcher — hosting facts (< 75 min; FACTS only; commit `docs: FACTS — hosting (Vercel, Railway, Next proxy, Docusaurus baseUrl)`)
Context: docs/work/wo-34-deploy.md. Primary sources only, read this session, F-ids with date + URL + short quote. Report ≤ 12 lines.
1. **Next.js 16.4.5** (installed in apps/web; check node_modules/next/package.json + its docs/source):
   - Middleware vs `proxy.ts` (name, file location, runtime, matcher).
   - Host-based branching: `request.headers.get('host')` vs `nextUrl.hostname`.
   - Redirect status codes (`permanent: true` → 308? NextResponse.redirect(url, 301|308)).
   - `rewrites()` to an external origin, `beforeFiles` vs `afterFiles`, `has: [{type:'host'}]`.
   - Whether a rewrite beats an `app/docs/page.tsx` route.
   - Metadata routes `sitemap.ts`/`robots.ts` being dynamic per request host.
2. **Docusaurus 3.10.2**:
   - `baseUrl: '/docs/'` with docs `routeBasePath: '/'` → page URLs.
   - `trailingSlash` behaviour.
   - Sitemap URL, `url` = origin only.
   - Serving behind a reverse-proxy rewrite (asset paths).
   - What `docusaurus serve` does with baseUrl locally.
3. **Vercel**:
   - CLI current version (npm `vercel`).
   - Exact syntax for `vercel link --project`, `vercel pull`, `vercel build`, `vercel deploy --prebuilt [--prod]`, `vercel alias set`, `vercel domains`, `vercel env add`, `vercel login`.
   - Token file location after login.
   - Monorepo/pnpm workspace with `vercel build` from the repo root vs root directory `apps/web` (sourceFilesOutsideRootDirectory).
   - Whether preview deployments get `X-Robots-Tag: noindex` automatically.
   - How multiple `*.vercel.app` aliases attach to one project.
   - **Hobby plan**: commercial-use terms, bandwidth/function limits, cost $0.
   - **Logging**: what request data Vercel records (IP, UA, path), runtime log retention on Hobby, the Vercel privacy policy's description of visitor data.
4. **Railway**:
   - Plans and prices (Free/Trial/Hobby/Pro): included usage, volume availability and size limits per plan, custom domain limits.
   - CLI current version (npm `@railway/cli`) + syntax for `railway login`, `link`, `up` (service, detach, path), `variables --set`, `volume add`, `domain`.
   - How `railway up` treats a monorepo, plus `RAILWAY_DOCKERFILE_PATH` / railway.json `build.dockerfilePath`.
   - `PORT` injection.
   - Healthcheck path config.
   - One public HTTP port per service?
   - Log retention per plan, and what the Railway privacy policy says it logs about requests.
5. **nectarlabs.io**: verify registration status from a primary registry source (`whois -h whois.nic.io nectarlabs.io` or the .io RDAP/WHOIS). If it is
   unregistered: CONFLICTS C-022, "Kunal's brief says nectarlabs.io already answers HTTP; the registry shows no registration (orchestrator pre-check
   2026-11-11: NXDOMAIN, Vercel availability true)". Surfaced, not resolved by preference.
Never buy, register, upgrade or log in to anything. Do not run `vercel`/`railway` commands that need auth (read `--help` via npx only).
