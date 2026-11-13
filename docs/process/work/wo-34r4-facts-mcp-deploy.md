# WO-34r4 — researcher — facts for the connector deploy path (wo-34m-mcp-deploy.md) (< 40 min; commit `docs(facts): F-414.. connector deploy path`)
Write only docs/FACTS.md: new ids from F-414, date 2026-11-12, a primary URL read this session for each. Short entries, one fact each.
Contradictions go under CONFLICTS. Do not edit anything else. Budget: at most 10 page reads. If a page is missing, record "not documented" and move on.

1. Railway Storage Buckets (docs.railway.com/storage-buckets, /storage-buckets/uploading-serving):
   - private, S3-compatible;
   - presigned GET and PUT supported;
   - reference variable names for a bucket (ENDPOINT, BUCKET, REGION, ACCESS_KEY_ID, SECRET_ACCESS_KEY) and URL style (virtual-hosted vs path);
   - availability and price on the Free/Trial/Hobby plans.
2. Railway Functions (docs.railway.com, search "functions"):
   - Bun runtime, one file, imports auto-installed;
   - the listen port comes from PORT;
   - sleep/serverless behaviour;
   - whether reference variables work on a function.
3. Bun S3 client (bun.sh/docs/api/s3):
   - `S3Client` constructor option names (accessKeyId, secretAccessKey, bucket, endpoint, region, virtualHostedStyle);
   - `presign()` options (method, expiresIn) and the maximum expiry.
4. Railway:
   - `${{Service.VAR}}` reference variables across services;
   - a service from a public Docker image with a custom start command;
   - volume data persists across redeploys;
   - healthcheck timeout default and maximum (docs.railway.com/variables, /volumes, /healthchecks or /deployments/healthchecks).
5. Vercel (vercel.com/docs/monorepos, /docs/builds/configure-a-build, /docs/builds/build-image):
   - the directory installCommand and buildCommand run in when rootDirectory is set;
   - whether files outside rootDirectory are available ("include files outside root directory");
   - the build image OS and whether curl, tar and sha256sum exist;
   - Node 22.x is available.
6. Vercel sensitive environment variables are available during the build (vercel.com/docs/environment-variables/sensitive-environment-variables).
7. pnpm 10 `install --frozen-lockfile --filter <pkg>...` in a workspace where every importer's package.json is present but other sources are absent (pnpm.io/cli/install, pnpm.io/filtering).
   If not documented, say so.
Report ≤ 15 lines to the orchestrator: the ids, one line each, plus anything that contradicts wo-34m. NO Co-Authored-By. Never --no-verify.
