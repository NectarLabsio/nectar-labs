# WO-35r — researcher — costs, neardata key, advisories, zod path (< 40 min; commit `docs(facts): F-444.. costs, neardata key, advisories`)
Write only docs/FACTS.md: next free ids, date 2026-11-12, a primary URL read this session (or a local command + output for repo facts). ≤ 6 page reads.
Kunal, 2026-11-12: costs on his current plans; neardata signup + env var; classify the Docusaurus advisories; re-check zod via @x402/core with grep evidence;
remove absolute home-directory paths (keep ~/.nectar).
1. Railway usage pricing (docs.railway.com/pricing…): memory per GB per minute/month, vCPU per minute/month, volume per GB-month, egress per GB; what happens
   when the Free plan's $1 credit or Hobby's included $5 runs out (services stop? volumes kept?). F-404/F-405/F-417 hold the plan prices and bucket rate.
   Observed Feed usage (Railway metrics, last 24 h): RAM avg 0.059 GB / max 0.232 GB, CPU avg 0.0008 vCPU / max 0.076, volume 0.22 GB, egress ≈ 0.
   Compute a monthly estimate for the Feed + the sleeping `artifacts` function + the bucket (~20 MB), on Free and on Hobby. Show the arithmetic.
2. neardata.xyz API key: is there a key or paid tier, the signup steps (exact URL and click path), how a key is sent (header / query param name), and the
   documented rate limits with and without one. Context: Railway's egress gets HTTP 429 from neardata (C-024/F-4xx notes in STATE), so the hosted Feed runs
   `FEED_INDEXER=views`.
3. Docusaurus advisories: run `pnpm audit --json` in the repo (read-only). For each advisory on the docs-site dependency tree: GHSA id, package, severity,
   dependency path, and whether the vulnerable code is **build-time only** (dev server / bundler / CLI) or **shipped in the static output** (check: is the
   package's code present in apps/docs-site/build after `pnpm --filter docs-site build`? grep the built JS for the package name / a distinctive symbol).
   Is there a patch release within @docusaurus 3.10.x (`npm view @docusaurus/core versions --json`) or a transitive patch that fixes it?
4. zod GHSA-mrhx-c7xc-m3w5 via @x402/core: advisory details (affected versions, vulnerable API), the installed version (`pnpm why zod`), and grep evidence of
   every import of zod / @x402/core in our source (services/x402, packages, apps) and whether the vulnerable API is called with untrusted input. F-383–F-385.
5. Absolute paths: replace every absolute home-directory paths in docs/FACTS.md with `~/` (or a repo-relative path). Do not touch other files.
Report ≤ 10 lines: ids, the monthly cost estimate per plan, the neardata steps + key param, the advisory table (build-time vs shipped), the zod verdict.
NO Co-Authored-By. Never --no-verify. Stop at 30 turns: commit what you have.
