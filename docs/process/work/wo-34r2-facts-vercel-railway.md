# WO-34r2 — researcher — the rest of the hosting facts (< 60 min; FACTS only; commit `docs: FACTS — Vercel and Railway (CLI, plans, logging)`)
Continue WO-34r. Items still unverified are listed under F-395. Primary sources only, read this session. F-ids with date, URL and a short quote.
Work in your worktree. Run `git merge main` before committing. Report ≤ 10 lines.

**Vercel (CLI 65.14.0):**
1. Exact syntax, from `npx -y vercel@65.14.0 <cmd> --help` (no auth needed for --help) and the docs, for these commands: `login`, `link --project --yes`, `pull --environment`, `build [--prod]`, `deploy --prebuilt [--prod]`, `alias set`, `domains add/inspect`, `env add`, `project add`.
2. Where the token is stored after `vercel login` on macOS.
3. Monorepo:
   - `vercel build` run from the repo root with Root Directory `apps/web`.
   - `sourceFilesOutsideRootDirectory`.
   - pnpm workspace install.
4. Previews:
   - Whether preview deployments get `X-Robots-Tag: noindex` automatically.
   - How several `*.vercel.app` aliases attach to one project.
   - Whether the request Host header reaches the Next proxy unchanged on Vercel (closes F-389).
5. Hobby plan: the commercial-use terms (quote them), the relevant limits (bandwidth, function invocations or duration), and the price ($0).
6. Logging:
   - What request data Vercel records about visitors (IP, user agent, path).
   - Runtime log retention on Hobby.
   - Quote the privacy policy's section on end-user / visitor data.

**Railway (CLI 5.71.0):**
7. Plans and prices (Free, Trial, Hobby, Pro): included usage, volumes and their size limit per plan, custom domains.
8. CLI syntax: `login`, `link`, `up` (--service, --detach, path), `variables --set`, `volume add`, `domain`, `service create` or equivalent.
9. Builds and networking:
   - `railway up` with a monorepo; `RAILWAY_DOCKERFILE_PATH` or railway.json `build.dockerfilePath`.
   - `PORT` injection.
   - Healthcheck path setting.
   - Whether a service gets one public HTTP port.
   - Generated `*.up.railway.app` domains.
10. Logging: log retention per plan, and quote what the privacy policy says Railway logs about requests to a deployed app.

Never buy, register, upgrade or log in. Never run commands that need auth.
