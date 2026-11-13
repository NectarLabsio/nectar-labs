# WO-34r3 — researcher — Railway facts + C-023 (< 45 min; FACTS only; commit `docs: FACTS — Railway (plans, CLI, build, logging); C-023`)
Railway only. Keep it tight: 25-turn budget. Commit by turn 20. Primary sources, read this session, F-ids with date, URL and quote. Report ≤ 8 lines.
1. Plans and prices (Free / Trial / Hobby / Pro): included usage, whether volumes are allowed and their size limit, `*.up.railway.app` domains.
2. CLI 5.71.0 syntax from `npx -y @railway/cli@5.71.0 <cmd> --help` (no auth needed): `login`, `init`, `link`, `up` (--service, --detach, path, ignore
   files: does it honour .gitignore / .railwayignore?), `variables --set`, `volume add`, `domain`, `service`.
3. Build: Dockerfile path selection (`RAILWAY_DOCKERFILE_PATH` and/or railway.json `build.dockerfilePath`); whether BuildKit honours
   `<Dockerfile>.dockerignore`; `PORT` injection; healthcheck path setting; one public HTTP port per service.
4. Logging: log retention per plan. Quote the privacy policy on what Railway records about requests to deployed apps.
5. FACTS CONFLICTS **C-023**: WO-34 key line says relayer keys are "restricted to their methods, never full-access". F-328 says @fastnear/x402 needs a
   full-access relayer key, and WO-34k confirms it refuses function-call keys. Consequence: hosted x402 cannot settle under the key line. Recorded, not
   resolved.
Never buy, upgrade, log in, or run commands that need auth.
