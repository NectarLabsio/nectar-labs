# WO-34n — docs — handoff + runbook for the connector deploy path (< 30 min; commit `docs: connector deploy path in RUNBOOK; H-HOST update`)
Write only docs/HUMAN_HANDOFF.md and docs/RUNBOOK.md. Source: docs/work/wo-34m-mcp-deploy.md and scripts/deploy/{artifact.sh,fetch-artifact.mjs,artifacts-function.ts,railway-feed-start.cmd}.
1. HUMAN_HANDOFF H-HOST, rewritten:
   - Kunal chose the connectors over CLI logins (2026-11-12). No CLI login is needed.
   - The one human step left: approve the Vercel connector's access to the team (single-use link from the orchestrator, valid 10 min).
     Once approved, the orchestrator creates nectar-labs-web and nectar-labs-docs and deploys previews.
   - The Railway plan is still not readable through the connector. The bucket, function and Feed run on the workspace now.
   - Default if silent: no Vercel deploy. The Feed alone stays up on Railway, and the submission continues without the hosted app (WO-34 limits).
2. RUNBOOK, new section "Deploy through the connectors (no CLI login)":
   - The artifact flow: `artifact.sh make <commit>` → `upload` → `verify` → `url <commit> <s>`.
   - Where the token lives: ~/.nectar/deploy/artifact-token, 0600; Railway stores only its sha256 as ARTIFACT_TOKEN_SHA256.
   - Rotation: new token, then update the hash variable.
   - Vercel: a deployment carries stub files plus `.nectar-artifact`. installCommand `node ../../scripts/deploy/fetch-artifact.mjs <filter>`; web buildCommand
     `npx -y pnpm@10.34.9 exec next build` (changelog pre-generated).
   - Feed: image node:22.22.2-bookworm, start command file, variables SRC_SHA, SRC_SHA256, SRC_URL (21-day link; source cached on /data), healthcheck /health 900 s.
   - Hosts:
     - Feed: https://feed-production-2f2776c9.up.railway.app
     - artifacts function: https://artifacts-production-bf757206.up.railway.app (it serves only /health and token-gated /presign).
   - Redeploy a new commit: make → upload → verify → new SRC_* variables (Feed) / a new deployment (Vercel).
   - Teardown after the hosted-until date (2026-11-25): delete the function and the bucket objects; the Feed follows WO-34.
   - The CLI path (scripts/deploy/deploy-{vercel,railway}.sh) stays as the fallback.
No secret values, no presigned URLs. Copy rules; no hackathon copy. `node scripts/check-no-branding-all.mjs` exit 0. NO Co-Authored-By. Never --no-verify. Report ≤ 5 lines.
