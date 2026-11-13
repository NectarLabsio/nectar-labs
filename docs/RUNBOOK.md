# RUNBOOK.md — operations and incidents (testnet now, mainnet shape)

## Ids (testnet, from packages/config/config.yaml; deployed 2026-11-09, G2 PASS 2026-11-09T20:55Z, commit 5f27f44)
```bash
CORE=nectar-core.nectar.testnet
OWNER=nectar.testnet
KEEPER=keeper.nectar.testnet   # function-call key only (D-012); keeper not running continuously
```

## Standing duties (P0 testnet)
1. **Refresh the owner price at least every 24 h while the session is closed.** The oracle max age is 120 s in session and
   86,400 s closed (`max_age_s_session` / `max_age_s_closed` in config.yaml; contract `set_oracle_params`). Past it, borrows and
   `trigger_preliquidation` fail with `oracle stale` (contracts/nectar-core/src/lib.rs). Command: `update_owner_price` (below), sending the
   current `oracle_price_usd_e6` from `get_exit_capacity` (the value in the example line is a placeholder, not the live price). Automated form:
   `scripts/ops/refresh-owner-price.sh` (checks every 30 min, re-asserts the current on-chain price once it is older than 12 h, never changes it,
   signs as `nectar.testnet` via the OS keychain). Only Kunal may start that loop; who runs what is in HUMAN_HANDOFF H-ORACLE.
2. **Keeper allowance.** `keeper.nectar.testnet` has only a function-call key with a 1 NEAR allowance
   (evidence/G2/keeper-key-20261109T2050Z.log) and no full-access key, so it cannot be rotated or topped up in place. When the
   allowance runs out (`/healthz` `allowance` near 0, trigger txs rejected): create a new keeper account, add a function-call key
   for `trigger_preliquidation,relay_settlement_result` on `$CORE`, delete its full-access key, then owner `set_keeper <new>` and
   point `KEEPER_ACCOUNT_ID` / `KEEPER_KEY_PATH` at it.
3. **Owner balance.** `nectar.testnet` holds < 1 NEAR. Top up from the testnet faucet https://near-faucet.io/ (F-154) before
   owner transactions; if the faucet is rate-limited, write H-NEAR-FAUCET.

## Health checks
- Keeper: `curl -s localhost:8787/healthz` → `{ok, last_block_seen, last_tick_at, consecutive_errors, allowance, open_positions, pending_settlements, triggers_sent}`; HTTP 503 when the last tick is older than 3 poll intervals, ≥ 3 consecutive errors, or the key is full-access (services/keeper/src/server.ts).
- Contract: `near contract call-function as-read-only $CORE get_config json-args '{}' network-config testnet now` (P0 interface has no `get_status`; see docs/process/work/interface-p0.md) plus `get_exit_capacity '{"symbol":"NVDAx"}'` for oracle age.
- Feed API: `curl -s $FEED_URL/api/feed | jq '.assets[0]'`.

## Incidents
| Incident | First action (owner) | Then |
| --- | --- | --- |
| Oracle wrong or stale | `pause` | `propose_price` → `apply_price`, or `set_oracle_source` to fallback; `unpause`; EVIDENCE note |
| Quoter compromised / absurd output | `set_quoter_pin ""` (disables TEE pricing → static `max_discount_bps`) | fix WASM, republish, re-pin, re-record sha256 + version_key |
| Keeper key leaked or allowance spent | new keeper account with a function-call key; owner `set_keeper <new>` | point `KEEPER_KEY_PATH` at the new key; restart keeper (old account has no full-access key, so its key cannot be deleted; it is inert once `set_keeper` changes) |
| Position stuck in `Settling` | any keeper relays with `relay_settlement_result` | after `expires`, owner `cancel_settlement` → position back to `Open`; event emitted |
| Gas reserve low (< 1 NEAR) | `fund_gas_reserve` with 5 NEAR | alert threshold in keeper |
| Contract bug | `pause`; write incident note | patch; sandbox migration test; redeploy same account (hackathon) / DAO proposal (PROD) |
| Faucet / airdrop exhausted | retry with backoff ×5 | write H-NEAR-FAUCET / H-SOL-AIRDROP |

## Commands (fill ids from packages/config/config.yaml)
```
near contract call-function as-transaction $CORE pause json-args '{}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
near contract call-function as-transaction $CORE update_owner_price json-args '{"symbol":"NVDAx","price_usd_e6":"180000000"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
near contract call-function as-transaction $CORE propose_price json-args '{"symbol":"NVDAx","price_usd_e6":"150000000"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
near contract call-function as-transaction $CORE apply_price json-args '{"symbol":"NVDAx"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
# P1 only (not in P0 build):
near contract call-function as-transaction $CORE set_quoter_pin json-args '{"version_key":"","wasm_sha256":""}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $OWNER network-config testnet sign-with-keychain send
```
(Exact `call-function` grammar re-confirmed at G0 → F-018.)

## Upgrades
Hackathon: redeploy on the same account; tag commit; `contract_version()` bumped; borsh layouts versioned.
PROD: Sputnik DAO owner, 48 h timelock on `upsert_collateral` / `set_oracle_source`, instant `pause`, public changelog.

## Backups
All state on-chain; SQLite rebuilt with `pnpm --filter feed index:rebuild`. Keys: `near account export-account` once → encrypted offline file (HUMAN).

## Deploy through the connectors (no CLI login) (WO-34m, 2026-11-12)
Kunal chose the Vercel and Railway connectors over CLI logins (H-HOST). The connectors cannot take a local tree as an upload (WO-34m "Why a new
path"), so a pinned source tarball moves through a private Railway bucket and its bytes never pass through a tool argument. Orchestrator-run only;
only from a G3b-passed commit, and the sha and sha256 go to EVIDENCE. No secret value or presigned URL is ever written to git, a log, EVIDENCE or chat.
- **Artifact flow** (`scripts/deploy/artifact.sh`; set `ARTIFACT_URL` to the artifacts function origin below):
  1. `artifact.sh make <commit>` → `~/.nectar/deploy/artifacts/src-<sha>.tar.gz` (0600); prints `<name> <sha256>`. Contents: `git archive` of the
     exact commit without evidence/ contracts/ evm/ solana/ quoter/ landing/ .claude/ (every pnpm importer's package.json stays), plus
     apps/web/lib/generated/changelog.json, made by the repo's own script in a worktree of that commit.
  2. `artifact.sh upload <commit>` → presigned PUT (URL valid 900 s).
  3. `artifact.sh verify <commit>` → downloads through a 5-minute GET and compares the sha256 with the local file: `verify ok …`, exit 4 on a mismatch.
  4. `artifact.sh url <commit> <s>` → a presigned GET valid `<s>` seconds (the function caps it at 30 days). Stdout only: redirect it straight into
     the deployment file or variable, never echo it.
- **Token.** `~/.nectar/deploy/artifact-token`, 0600, on the operator's machine only. Railway stores only its sha256, as `ARTIFACT_TOKEN_SHA256` on the
  function; Vercel holds no token. The bucket keys reach the function only as reference variables `${{artifacts-bucket.*}}`, so the bucket secret
  never leaves Railway.
  - Rotation: write a new token to the file first (random, 32 bytes, kept 0600), then set `ARTIFACT_TOKEN_SHA256` to the hex sha256 of the file's text
    without the trailing newline (artifact.sh sends `$(cat <file>)`): `printf %s "$(cat ~/.nectar/deploy/artifact-token)" | shasum -a 256`.
    Check: `POST /presign` without a token → 401, and `artifact.sh verify <commit>` → `verify ok`.
  - Rotating the token does not revoke presigned URLs already issued: they are signed with the bucket keys (scripts/deploy/artifacts-function.ts)
    and stay valid until they expire (Feed `SRC_URL`: 21 days).
- **Vercel** (projects nectar-labs-web, rootDirectory apps/web; nectar-labs-docs, rootDirectory apps/docs-site; created once H-HOST is approved).
  A deployment carries stub files only (root package.json, pnpm-workspace.yaml, the app's package.json, scripts/deploy/fetch-artifact.mjs) plus
  `.nectar-artifact` (line 1 `src-<sha>.tar.gz <sha256>`, line 2 a 1 h presigned GET from `artifact.sh url <commit> 3600`).
  - installCommand `node ../../scripts/deploy/fetch-artifact.mjs <filter>` (`web` or `docs-site`; it runs in rootDirectory, F-424): download, sha256
    check, extract over the stubs, delete `.nectar-artifact`, then `pnpm@10.34.9 install --frozen-lockfile --filter <filter>...`. Node only, because
    the build image does not document curl or sha256sum (F-425).
  - buildCommand: web `npx -y pnpm@10.34.9 exec next build` (the changelog is pre-generated in the tarball; the build has no .git). Docs: `pnpm build`
    per WO-34m; not deployed yet, so confirm it at the first docs deployment.
  - Env: the WO-34 deploy env list in docs/process/state.md. Previews first (`VERCEL_ENV=preview`); `target: production` only after H-LEGAL and the G3b re-run.
    After the first web deployment, set `FEED_CORS_ORIGINS` on the Feed to the web origins.
  - Docs: its own project and host, https://docs.nectarlabs.io, pages at the root (WO-64; section "Hosts and docs" below).
- **Feed** (Railway service `feed`, project nectar-labs, environment production): image `node:22.22.2-bookworm`, volume at `/data`, start command =
  the one line in scripts/deploy/railway-feed-start.cmd.
  - First boot: download `SRC_URL`, check `SRC_SHA256` with sha256sum, extract into `/data/src/<SRC_SHA>`, run
    `pnpm@10.34.9 install --frozen-lockfile --prod --ignore-scripts --filter feed`, mark the tree done. Later boots reuse the cached tree, so restarts
    work after the URL expires. It then runs `node src/main.ts` in services/feed as the `node` user.
  - Variables: the WO-34 Feed list plus `SRC_SHA` (40-hex commit), `SRC_SHA256` and `SRC_URL` (`artifact.sh url <commit> 1814400`, a 21-day link).
  - Healthcheck `/health`, timeout 900 s (Railway default 300 s, no documented maximum, F-423).
  - Old `/data/src/<sha>` trees stay on the volume (Free: 0.5 GB, H-HOST); remove stale ones before the volume fills.
- **Hosts** (Railway domains):
  - Feed: https://feed-production-2f2776c9.up.railway.app (`curl -s <host>/health`).
  - artifacts function: https://artifacts-production-bf757206.up.railway.app. It serves only `GET /health` (`{"ok":true}`) and token-gated
    `POST /presign`; any other route 404, a missing or wrong token 401, a key outside `src-<40 hex>.tar.gz` 400.
- **Redeploy a new commit:** `make` → `upload` → `verify` for that commit, then
  - Feed: set `SRC_SHA`, `SRC_SHA256` and a new 21-day `SRC_URL` together (the new sha gets its own `/data/src/<sha>` tree);
  - Vercel: a new deployment per project, each with a fresh `.nectar-artifact` (1 h GET).
  The verifier records the sha, sha256 and deployment ids in EVIDENCE.
- **Teardown after the hosted-until date** (2026-11-25, `site.hosted_until` in packages/config/config.yaml): delete the artifacts function and the
  bucket objects (`src-*.tar.gz`). The Feed follows WO-34 (docs/process/work/wo-34-deploy.md). Testnet accounts are never deleted.
- **Fallback:** the CLI path, `scripts/deploy/deploy-vercel.sh` and `scripts/deploy/deploy-railway.sh`, stays in the repo. It needs the CLI logins that
  H-HOST no longer asks for.

## Hosts and docs (WO-62b, WO-64; hosts in config.yaml `site.production_hosts`)
- **Hosts.** Site https://nectarlabs.io (www 308 → apex) · App https://testnet.nectarlabs.io · Docs https://docs.nectarlabs.io · Status
  https://status.nectarlabs.io. Vercel DNS, no records needed from Kunal (F-458, H-DNS closed). Feed REST stays on Railway (above).
- **Web env** (apps/web/.env.example): `SITE_URL`, `APP_URL`, `DOCS_URL`, `STATUS_URL`, `LEGACY_HOSTS` (comma list `host=site|app|docs|status`; the real
  platform-host list lives only in the Vercel env), `FEED_URL`, `REPO_URL`. SITE/APP `/docs` and `/docs/<rest>` 308 to `DOCS_URL/<rest>`; SITE/APP
  `/status` 308 to the status host; STATUS_URL unset keeps `/status` on SITE.
- **Docs env** (apps/docs-site/docusaurus.config.ts): `DOCS_URL` (origin only, F-391; sitemap and canonicals use it, F-459), `APP_URL`, `SITE_URL`,
  `STATUS_URL`; unset hosts fall back to the production hosts when `DOCS_URL` is set, to localhost otherwise. `REPO_URL` empty (until H2) hides
  every GitHub link.
- **Local.** `pnpm --filter docs-site start` → http://localhost:3000/; `pnpm --filter docs-site build && pnpm --filter docs-site serve` → same URL.
- **apps/docs-site/vercel.json.** `cleanUrls` (F-428). Permanent (308) redirects: the two platform docs hosts (host-scoped `has`, F-456) →
  `https://docs.nectarlabs.io/<path>` (root and `/docs/<path>` in one hop); `/docs`, `/docs/` → `/` and `/docs/:path*` → `/:path*` for old links (F-437,
  F-459). Headers on `/(.*)`: X-Frame-Options, `frame-ancestors 'none'`, nosniff, Referrer-Policy (F-452). Checked offline with
  @vercel/routing-utils 6.6.1 (F-453); confirm after the deploy: `curl -sI https://<platform docs host>/start/quick-start` → 308 to the docs host.
- **Production deploys need Kunal's approval** in this session (HUMAN_HANDOFF H-DEPLOY). Until the release with WO-62b/WO-64 is deployed, the
  status host shows the landing page and docs.nectarlabs.io redirects to `/docs/`.
