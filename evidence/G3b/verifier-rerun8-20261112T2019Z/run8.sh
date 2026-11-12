#!/bin/bash
# G3b run 8 master script (release candidate 31809b1). Run-7 steps (a)–(l) without (h), custom hosts (five env vars), (m) claims, (n) cargo job
# (separate script, started at phase 2), docs at the ROOT. Own ports only: 3981 local, 3982 hosted (site/app/status/legacy *.localhost),
# 3984 docs, 3985 Feed (views), 3987 web + FEED_URL. Never touches host services (8545, 8788-8791).
set -u
D=/tmp/verify-G3b-r8-20261112T2019Z
SP=/private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad
R7=$D/evidence/G3b/verifier-rerun7-20261112T1530Z
R6=$D/evidence/G3b/verifier-rerun6-20261112T1413Z
R5=$D/evidence/G3b/verifier-rerun5-20261112T1041Z
EV=$D/ev
W=$D/apps/web
unset NECTAR_E2E_BORROWER_KEY NEXT_PUBLIC_E2E_KEY_ADAPTER SITE_URL APP_URL DOCS_URL STATUS_URL LEGACY_HOSTS FEED_URL NEXT_PUBLIC_FEED_URL DOCS_ORIGIN NECTAR_PRODUCTION REPO_URL
export PW_CHANNEL=chrome
t() { date -u +%H:%M:%SZ; }
P1=$EV/phase1.txt; P2=$EV/phase2.txt
log1() { echo "[$(t)] $*" | tee -a "$P1"; }
log2() { echo "[$(t)] $*" | tee -a "$P2"; }
waitport() { for _ in $(seq 1 90); do curl -s -o /dev/null "$1" && return 0; sleep 1; done; return 1; }
killport() {
  kill "$2" 2>/dev/null; local rc=$?; sleep 2
  local left; left=$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | tr '\n' ' ')
  echo "kill $1 pid $2 -> $rc; listeners left: ${left:-none}"
}
cp "$R5/g3b-selector-probe.mjs" "$R6/g3b-banner-probe.mjs" "$R6/g3b-chamber-probe.mjs" "$R7/g3b-chains-probe.mjs" "$SP/g3b-claims-probe.mjs" "$W/"
cp "$R6/inv-compare.cjs" "$R6/landing-check.cjs" "$EV/"
mkdir -p "$EV/n"
cp "$SP/g3b-claims-probe.mjs" "$SP/docs-sweep.mjs" "$SP/run8.sh" "$SP/r8-cargo.sh" "$SP/chain-views.mjs" "$SP/r8-setup.sh" "$EV/"
cp "$SP/chain-views.mjs" "$EV/n/"

# ---------- phase 1 (local single-host mode) ----------
cd "$D" || exit 1
log1 "HEAD $(git rev-parse HEAD)"
log1 "spec diff 4c2a0bb..HEAD (e2e, playwright.config): $(git diff --stat 4c2a0bb..HEAD -- apps/web/e2e apps/web/playwright.config.ts | tail -1)"
git diff --stat 4c2a0bb..HEAD -- apps/web/e2e apps/web/playwright.config.ts > "$EV/spec-diff-stat.txt"
git grep -l "/Users/" > "$EV/k-git-grep.log" 2>&1; log1 "(k) git grep -l /Users/ -> $(wc -l < "$EV/k-git-grep.log" | tr -d ' ') files; non-fixture: $(/usr/bin/grep -vc '\.wasm$' "$EV/k-git-grep.log")"
git grep -l '/Users/[A-Za-z]' -- ':!*.wasm' > "$EV/k-git-grep-strict.log" 2>&1; log1 "(k) strict '/Users/[A-Za-z]' non-wasm -> $(wc -l < "$EV/k-git-grep-strict.log" | tr -d ' ') files"
shasum -a 256 $(/usr/bin/grep '\.wasm$' "$EV/k-git-grep.log") >> "$EV/k-git-grep.log" 2>&1
git grep -n -I -e "ac.nectarlabs.io" -e "vercel.app" > "$EV/o-git-grep.log" 2>&1; log1 "(o) git grep ac.nectarlabs.io|vercel.app -> $(wc -l < "$EV/o-git-grep.log" | tr -d ' ') lines in $(cut -d: -f1 "$EV/o-git-grep.log" | sort -u | wc -l | tr -d ' ') files"
pnpm --filter ./services/feed test > "$EV/feed-test.log" 2>&1; log1 "(j) feed unit tests exit $?"
pnpm --filter ./services/keeper test > "$EV/keeper-test.log" 2>&1; log1 "(j) keeper unit tests exit $?"
(cd "$W" && pnpm build > "$EV/build-local.log" 2>&1); log1 "build-local exit $?"
node apps/web/scripts/check-trace.mjs > "$EV/check-trace.log" 2>&1; log1 "(g) check-trace exit $?"
(cd "$W" && exec ./node_modules/.bin/next start -p 3981 > "$EV/server-local.log" 2>&1) & LP=$!
waitport http://localhost:3981/ && log1 "local :3981 up pid $LP"
: > "$EV/headers-local.txt"
for r in / /borrow /api/health /docs /about /status; do echo "== $r" >> "$EV/headers-local.txt"; curl -sI "http://localhost:3981$r" >> "$EV/headers-local.txt"; done
curl -s http://localhost:3981/api/health > "$EV/health-local.json"; log1 "health $(head -c 300 "$EV/health-local.json")"
curl -s http://localhost:3981/ > "$EV/landing.html"; log1 "(i) landing.html saved ($(wc -c < "$EV/landing.html") bytes)"
node "$EV/landing-check.cjs" "$EV/landing.html" > "$EV/landing-check.log" 2>&1; log1 "(i) landing-check exit $?"
(cd "$W" && node g3b-chamber-probe.mjs http://localhost:3981 > "$EV/chamber-probe.json" 2> "$EV/chamber-probe.err"); log1 "(i) chamber probe exit $?"
(cd "$W" && node g3b-chains-probe.mjs http://localhost:3981 "$EV/chains-probe.json" "$EV/chains-hydrated-desktop.png" > "$EV/chains-probe.log" 2>&1); log1 "(l) chains hand probe exit $?"
(cd "$W" && PORT=3981 E2E_BASE_URL=http://localhost:3981 npx playwright test e2e/v7.spec.ts -g "landing #chains" > "$EV/e2e-v7-chains.log" 2>&1); log1 "(l) v7.spec #chains exit $?"
(cd "$W" && node g3b-claims-probe.mjs http://localhost:3981 "$EV/claims-probe.json" "$EV/claims-how.png" > "$EV/claims-probe.log" 2>&1); log1 "(m) claims hand probe exit $?"
(cd "$W" && PORT=3981 E2E_BASE_URL=http://localhost:3981 npx playwright test e2e/claims.spec.ts e2e/test-assets.spec.ts > "$EV/e2e-claims-assets.log" 2>&1); log1 "(m) claims.spec + test-assets.spec (desktop + phone) exit $?"
log1 "e2e start"
(cd "$W" && PORT=3981 E2E_BASE_URL=http://localhost:3981 pnpm e2e > "$EV/e2e-local.log" 2>&1); log1 "e2e exit $?"
log1 "lh start"
(cd "$W" && LH_BASE_URL=http://localhost:3981 pnpm lighthouse > "$EV/lh.log" 2>&1); log1 "lh exit $?"
(cd "$W" && node g3b-selector-probe.mjs http://localhost:3981 "$EV/sel" > "$EV/selector-probe.log" 2>&1); log1 "selector exit $?"
mkdir -p "$D/.feedtmp"
(cd "$D/services/feed" && FEED_INDEXER=views FEED_PORT=3985 FEED_MCP_PORT=off FEED_DB_PATH="$D/.feedtmp/feed.sqlite" CORE_ACCOUNT_ID=nectar-core-v2.nectar.testnet \
  exec node --disable-warning=ExperimentalWarning src/main.ts > "$EV/server-feed.log" 2>&1) & FP=$!
waitport http://localhost:3985/healthz && log1 "feed :3985 up pid $FP"
sleep 25
curl -s http://localhost:3985/health > "$EV/feed-health.json"; log1 "(j) feed /health $(head -c 600 "$EV/feed-health.json")"
curl -s http://localhost:3985/healthz > "$EV/feed-healthz.json"
curl -s -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"block","params":{"finality":"final"}}' https://test.rpc.fastnear.com > "$EV/rpc-final.json"
log1 "rpc final height $(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).result.header.height)}catch{console.log("n/a")}' "$EV/rpc-final.json")"
(cd "$W" && FEED_URL=http://localhost:3985 exec ./node_modules/.bin/next start -p 3987 > "$EV/server-webfeed.log" 2>&1) & WP=$!
waitport http://localhost:3987/ && log1 "web+feed :3987 up pid $WP"
curl -s http://localhost:3987/api/indexer/healthz > "$EV/web-indexer-healthz.json"; log1 "web /api/indexer/healthz $(head -c 300 "$EV/web-indexer-healthz.json")"
(cd "$W" && node g3b-banner-probe.mjs http://localhost:3987 http://localhost:3981 "$EV/banner-probe.json" > "$EV/banner-probe.log" 2>&1); log1 "(i) banner probe exit $?"
curl -s http://localhost:3985/health > "$EV/feed-health-2.json"; log1 "(j) feed /health (2nd) $(head -c 400 "$EV/feed-health-2.json")"
log1 "$(killport 3987 $WP)"
log1 "$(killport 3985 $FP)"
log1 "$(killport 3981 $LP)"
log1 "phase1 done"

# ---------- phase 2 (hosted: five env vars on *.localhost; docs at the ROOT) ----------
nohup bash "$SP/r8-cargo.sh" > "$EV/n/cargo-master.log" 2>&1 &
log2 "cargo job started pid $!"
pnpm --filter ./apps/docs-site build > "$EV/build-docs.log" 2>&1; log2 "build-docs exit $?"
node apps/web/scripts/serve-docs.mjs --port 3984 > "$EV/server-docs.log" 2>&1 & DP=$!
waitport http://localhost:3984/ && log2 "docs :3984 up pid $DP; / -> $(curl -s -o /dev/null -w '%{http_code}' http://docs.localhost:3984/) ; /start/quick-start -> $(curl -s -o /dev/null -w '%{http_code}' http://docs.localhost:3984/start/quick-start)"
HS="SITE_URL=http://site.localhost:3982 APP_URL=http://app.localhost:3982 DOCS_URL=http://docs.localhost:3984 STATUS_URL=http://status.localhost:3982 LEGACY_HOSTS=old-site.localhost:3982=site,old-app.localhost:3982=app"
log2 "hosted env: $HS"
(cd "$W" && env $HS pnpm build > "$EV/build-hosted.log" 2>&1); log2 "build-hosted exit $?"
(cd "$W" && exec env $HS ./node_modules/.bin/next start -p 3982 > "$EV/server-hosted.log" 2>&1) & HP=$!
waitport http://localhost:3982/api/health && log2 "hosted :3982 up pid $HP"
E2EH="E2E_HOSTED=1 E2E_HOSTED_BROWSER=1 E2E_BASE_URL=http://localhost:3982 E2E_SITE_URL=http://site.localhost:3982 E2E_APP_URL=http://app.localhost:3982 E2E_DOCS_URL=http://docs.localhost:3984 E2E_STATUS_URL=http://status.localhost:3982"
(cd "$W" && env $E2EH E2E_LEGACY_HOST=old-app.localhost:3982=app npx playwright test e2e/hosts.spec.ts --project=desktop > "$EV/e2e-hosts.log" 2>&1); log2 "(b) hosts.spec (all, incl. browser; legacy old-app=app) exit $?"
(cd "$W" && env $E2EH E2E_LEGACY_HOST=old-site.localhost:3982=site npx playwright test e2e/hosts.spec.ts --project=desktop -g "legacy host" > "$EV/e2e-hosts-legacy-site.log" 2>&1); log2 "(b) hosts.spec legacy old-site=site exit $?"
: > "$EV/hosted-curl.txt"
for u in "status.localhost:3982 /" "site.localhost:3982 /docs/integrate/sdk?x=1" "app.localhost:3982 /docs?x=1" "old-app.localhost:3982 /feed?x=1" "old-site.localhost:3982 /about?y=2" "site.localhost:3982 /status?x=1" "status.localhost:3982 /robots.txt" "status.localhost:3982 /sitemap.xml"; do
  set -- $u; echo "== Host $1 GET $2: $(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H "host: $1" "http://localhost:3982$2")" >> "$EV/hosted-curl.txt"
done
node "$EV/docs-sweep.mjs" apps/docs-site/build/sitemap.xml http://docs.localhost:3984 http://site.localhost:3982 http://app.localhost:3982 http://status.localhost:3982 "$EV/docs-sweep.json" > "$EV/docs-sweep.log" 2>&1; log2 "(d+) docs-at-root sweep exit $? : $(head -1 "$EV/docs-sweep.log")"
cp "$W/content/data-inventory.json" "$EV/data-inventory.committed.json"
log2 "inventory start"
(cd "$W" && E2E_INVENTORY=1 INV_SITE=http://site.localhost:3982 INV_APP=http://app.localhost:3982 E2E_BASE_URL=http://localhost:3982 npx playwright test --project=inventory > "$EV/e2e-inventory.log" 2>&1); log2 "(c) inventory exit $?"
cp "$W/content/data-inventory.json" "$EV/data-inventory.measured.json"; cp "$W/content/data-inventory.md" "$EV/data-inventory.measured.md" 2>/dev/null
node "$EV/inv-compare.cjs" "$EV/data-inventory.committed.json" "$EV/data-inventory.measured.json" apps/docs-site/docs/legal/privacy.md > "$EV/inv-compare.log" 2>&1; log2 "(c) inv-compare exit $?"
git checkout -- apps/web/content
log2 "crawl start"
node apps/web/scripts/crawl.mjs --polite --site http://site.localhost:3982 --app http://app.localhost:3982 --docs http://docs.localhost:3984 --out "$EV/crawl" > "$EV/crawl.log" 2>&1; log2 "(d) crawl exit $?"
log2 "$(killport 3982 $HP)"
log2 "$(killport 3984 $DP)"
PS="SITE_URL=https://nectarlabs.io APP_URL=https://testnet.nectarlabs.io DOCS_URL=https://docs.nectarlabs.io STATUS_URL=https://status.nectarlabs.io LEGACY_HOSTS=old-site.example.dev=site,old-app.example.dev=app"
(cd "$W" && env NECTAR_PRODUCTION=1 $PS pnpm build > "$EV/build-prod.log" 2>&1); log2 "(f) build-prod (five env, operator filled) exit $? (expect 0)"
node apps/web/scripts/check-trace.mjs > "$EV/check-trace-prod.log" 2>&1; log2 "(g) check-trace after prod build exit $?"
sed -i '' 's/^\(  operator: \).*$/\1null/' packages/config/config.yaml
log2 "$(git diff --stat -- packages/config/config.yaml | tail -1) / $(/usr/bin/grep -n '^  operator:' packages/config/config.yaml)"
(cd "$W" && env NECTAR_PRODUCTION=1 $PS pnpm build > "$EV/build-prod-guard.log" 2>&1); log2 "(f) build-prod (operator null) exit $? (expect non-zero)"
log2 "guard msg: $(/usr/bin/grep -m1 -o 'Production build refused[^"]*' "$EV/build-prod-guard.log")"
git checkout -- packages/config/config.yaml; log2 "config restored: $(git status --porcelain -- packages/config | wc -l | tr -d ' ') changed files under packages/config"
pnpm verify > "$EV/verify.log" 2>&1; log2 "pnpm verify exit $?"
node scripts/check-no-branding-all.mjs > "$EV/branding.log" 2>&1; log2 "branding exit $?"
log2 "listeners 3981-3987: $(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | /usr/bin/grep -cE ':398[1-7] ')"
log2 "host services: $(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | /usr/bin/grep -E ':(8545|878[89]|879[01]) ' | awk '{print $9}' | tr '\n' ' ')"
log2 "phase2 done"
