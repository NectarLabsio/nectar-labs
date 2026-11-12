#!/bin/bash
# G3b run 7 master script (release 2 = 4c2a0bb). Same steps as run 6 (evidence/G3b/verifier-rerun6-20261112T1413Z/run.sh) plus (l) hydrated #chains.
# Own ports only: 3971 local, 3972 hosts, 3973 inventory/crawl, 3974 docs, 3975 feed (views), 3977 web+feed. Never touches host services.
set -u
D=/tmp/verify-G3b-20261112T1530Z
SP=/private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad
R6=$D/evidence/G3b/verifier-rerun6-20261112T1413Z
R5=$D/evidence/G3b/verifier-rerun5-20261112T1041Z
EV=$D/ev
W=$D/apps/web
unset NECTAR_E2E_BORROWER_KEY NEXT_PUBLIC_E2E_KEY_ADAPTER SITE_URL APP_URL FEED_URL NEXT_PUBLIC_FEED_URL DOCS_ORIGIN NECTAR_PRODUCTION
export PW_CHANNEL=chrome
t() { date -u +%H:%M:%SZ; }
P1=$EV/phase1.txt; P2=$EV/phase2.txt
log1() { echo "[$(t)] $*" | tee -a "$P1"; }
log2() { echo "[$(t)] $*" | tee -a "$P2"; }
waitport() { for _ in $(seq 1 60); do curl -s -o /dev/null "$1" && return 0; sleep 1; done; return 1; }
killport() {
  kill "$2" 2>/dev/null; local rc=$?; sleep 2
  local left; left=$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | tr '\n' ' ')
  echo "kill $1 pid $2 -> $rc; listeners left: ${left:-none}"
}
cp "$R5/g3b-selector-probe.mjs" "$R6/g3b-banner-probe.mjs" "$R6/g3b-chamber-probe.mjs" "$SP/g3b-chains-probe.mjs" "$W/"
cp "$R6/inv-compare.cjs" "$R6/landing-check.cjs" "$EV/"
cp "$SP/g3b-chains-probe.mjs" "$SP/run7.sh" "$EV/"

# ---------- phase 1 ----------
cd "$D" || exit 1
log1 "HEAD $(git rev-parse HEAD); spec diff 3126773..HEAD: $(git diff --stat 3126773..HEAD -- apps/web/e2e apps/web/playwright.config.ts | tail -1)"
git grep -l "/Users/" > "$EV/k-git-grep.log" 2>&1; log1 "(k) git grep -l /Users/ -> $(wc -l < "$EV/k-git-grep.log" | tr -d ' ') files; non-fixture: $(grep -vc '^contracts/nectar-core/tests/fixtures/.*\.wasm$' "$EV/k-git-grep.log")"
shasum -a 256 $(cat "$EV/k-git-grep.log") >> "$EV/k-git-grep.log" 2>&1
pnpm --filter ./services/feed test > "$EV/feed-test.log" 2>&1; log1 "(j) feed unit tests exit $?"
pnpm --filter ./services/keeper test > "$EV/keeper-test.log" 2>&1; log1 "(j) keeper unit tests exit $?"
(cd "$W" && pnpm build > "$EV/build-local.log" 2>&1); log1 "build-local exit $?"
node apps/web/scripts/check-trace.mjs > "$EV/check-trace.log" 2>&1; log1 "(g) check-trace exit $?"
(cd "$W" && exec ./node_modules/.bin/next start -p 3971 > "$EV/server-local.log" 2>&1) & LP=$!
waitport http://localhost:3971/ && log1 "local :3971 up pid $LP"
: > "$EV/headers-local.txt"
for r in / /borrow /api/health /docs /about; do echo "== $r" >> "$EV/headers-local.txt"; curl -sI "http://localhost:3971$r" >> "$EV/headers-local.txt"; done
curl -s http://localhost:3971/api/health > "$EV/health-local.json"; log1 "health $(head -c 300 "$EV/health-local.json")"
curl -s http://localhost:3971/ > "$EV/landing.html"; log1 "(i) landing.html saved ($(wc -c < "$EV/landing.html") bytes)"
node "$EV/landing-check.cjs" "$EV/landing.html" > "$EV/landing-check.log" 2>&1; log1 "(i) landing-check exit $?"
(cd "$W" && node g3b-chamber-probe.mjs http://localhost:3971 > "$EV/chamber-probe.json" 2> "$EV/chamber-probe.err"); log1 "(i) chamber probe exit $?"
(cd "$W" && node g3b-chains-probe.mjs http://localhost:3971 "$EV/chains-probe.json" "$EV/chains-hydrated-desktop.png" > "$EV/chains-probe.log" 2>&1); log1 "(l) chains hand probe exit $?"
(cd "$W" && PORT=3971 E2E_BASE_URL=http://localhost:3971 npx playwright test e2e/v7.spec.ts -g "landing #chains" > "$EV/e2e-v7-chains.log" 2>&1); log1 "(l) v7.spec #chains exit $?"
log1 "e2e start"
(cd "$W" && PORT=3971 E2E_BASE_URL=http://localhost:3971 pnpm e2e > "$EV/e2e-local.log" 2>&1); log1 "e2e exit $?"
log1 "lh start"
(cd "$W" && LH_BASE_URL=http://localhost:3971 pnpm lighthouse > "$EV/lh.log" 2>&1); log1 "lh exit $?"
(cd "$W" && node g3b-selector-probe.mjs http://localhost:3971 "$EV/sel" > "$EV/selector-probe.log" 2>&1); log1 "selector exit $?"
mkdir -p "$D/.feedtmp"
(cd "$D/services/feed" && FEED_INDEXER=views FEED_PORT=3975 FEED_MCP_PORT=off FEED_DB_PATH="$D/.feedtmp/feed.sqlite" CORE_ACCOUNT_ID=nectar-core-v2.nectar.testnet \
  exec node --disable-warning=ExperimentalWarning src/main.ts > "$EV/server-feed.log" 2>&1) & FP=$!
waitport http://localhost:3975/healthz && log1 "feed :3975 up pid $FP"
sleep 25
curl -s http://localhost:3975/health > "$EV/feed-health.json"; log1 "(j) feed /health $(head -c 600 "$EV/feed-health.json")"
curl -s http://localhost:3975/healthz > "$EV/feed-healthz.json"
curl -s "http://localhost:3975/api/settlements?limit=5" > "$EV/feed-settlements.json"
curl -s -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"block","params":{"finality":"final"}}' https://test.rpc.fastnear.com > "$EV/rpc-final.json"
log1 "rpc final height $(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).result.header.height)}catch{console.log("n/a")}' "$EV/rpc-final.json")"
(cd "$W" && FEED_URL=http://localhost:3975 exec ./node_modules/.bin/next start -p 3977 > "$EV/server-webfeed.log" 2>&1) & WP=$!
waitport http://localhost:3977/ && log1 "web+feed :3977 up pid $WP"
curl -s http://localhost:3977/api/indexer/healthz > "$EV/web-indexer-healthz.json"; log1 "web /api/indexer/healthz $(head -c 300 "$EV/web-indexer-healthz.json")"
(cd "$W" && node g3b-banner-probe.mjs http://localhost:3977 http://localhost:3971 "$EV/banner-probe.json" > "$EV/banner-probe.log" 2>&1); log1 "(i) banner probe exit $?"
curl -s http://localhost:3975/health > "$EV/feed-health-2.json"; log1 "(j) feed /health (2nd) $(head -c 400 "$EV/feed-health-2.json")"
log1 "$(killport 3977 $WP)"
log1 "$(killport 3975 $FP)"
log1 "$(killport 3971 $LP)"
log1 "phase1 done"

# ---------- phase 2 ----------
pnpm --filter ./apps/docs-site build > "$EV/build-docs.log" 2>&1; log2 "build-docs exit $?"
node apps/web/scripts/serve-docs.mjs --port 3974 > "$EV/server-docs.log" 2>&1 & DP=$!
waitport http://localhost:3974/docs/ && log2 "docs :3974 up pid $DP"
(cd "$W" && SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test DOCS_ORIGIN=http://localhost:3974 pnpm build > "$EV/build-hosts.log" 2>&1); log2 "build-hosts exit $?"
(cd "$W" && SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test DOCS_ORIGIN=http://localhost:3974 exec ./node_modules/.bin/next start -p 3972 > "$EV/server-hosts.log" 2>&1) & HP=$!
waitport http://localhost:3972/ && log2 "hosts :3972 up pid $HP"
(cd "$W" && E2E_HOSTED=1 E2E_DOCS=1 E2E_BASE_URL=http://localhost:3972 npx playwright test e2e/hosts.spec.ts --project=desktop > "$EV/e2e-hosts.log" 2>&1); log2 "(b) e2e-hosts exit $?"
log2 "$(killport 3972 $HP)"
(cd "$W" && SITE_URL=http://site.localhost:3973 APP_URL=http://app.localhost:3973 DOCS_ORIGIN=http://localhost:3974 pnpm build > "$EV/build-inv.log" 2>&1); log2 "build-inv exit $?"
(cd "$W" && SITE_URL=http://site.localhost:3973 APP_URL=http://app.localhost:3973 DOCS_ORIGIN=http://localhost:3974 exec ./node_modules/.bin/next start -p 3973 > "$EV/server-inv.log" 2>&1) & IP=$!
waitport http://localhost:3973/ && log2 "inv :3973 up pid $IP; app /docs/start/quick-start -> $(curl -s -o /dev/null -w '%{http_code}' http://app.localhost:3973/docs/start/quick-start)"
cp "$W/content/data-inventory.json" "$EV/data-inventory.committed.json"
log2 "inventory start"
(cd "$W" && E2E_INVENTORY=1 INV_SITE=http://site.localhost:3973 INV_APP=http://app.localhost:3973 E2E_BASE_URL=http://localhost:3973 npx playwright test --project=inventory > "$EV/e2e-inventory.log" 2>&1); log2 "(c) inventory exit $?"
cp "$W/content/data-inventory.json" "$EV/data-inventory.measured.json"; cp "$W/content/data-inventory.md" "$EV/data-inventory.measured.md" 2>/dev/null
node "$EV/inv-compare.cjs" "$EV/data-inventory.committed.json" "$EV/data-inventory.measured.json" apps/docs-site/docs/legal/privacy.md > "$EV/inv-compare.log" 2>&1; log2 "(c) inv-compare exit $?"
git checkout -- apps/web/content
log2 "crawl start"
node apps/web/scripts/crawl.mjs --polite --site http://site.localhost:3973 --app http://app.localhost:3973 --out "$EV/crawl" > "$EV/crawl.log" 2>&1; log2 "(d) crawl exit $?"
log2 "$(killport 3973 $IP)"
log2 "$(killport 3974 $DP)"
(cd "$W" && NECTAR_PRODUCTION=1 SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test pnpm build > "$EV/build-prod.log" 2>&1); log2 "(f) build-prod (operator filled) exit $? (expect 0)"
node apps/web/scripts/check-trace.mjs > "$EV/check-trace-prod.log" 2>&1; log2 "(g) check-trace after prod build exit $?"
sed -i '' 's/^\(  operator: \).*$/\1null/' packages/config/config.yaml
log2 "$(git diff --stat -- packages/config/config.yaml | tail -1) / $(grep -n '^  operator:' packages/config/config.yaml)"
(cd "$W" && NECTAR_PRODUCTION=1 SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test pnpm build > "$EV/build-prod-guard.log" 2>&1); log2 "(f) build-prod (operator null) exit $? (expect non-zero)"
log2 "guard msg: $(grep -m1 -o 'Production build refused[^"]*' "$EV/build-prod-guard.log")"
git checkout -- packages/config/config.yaml; log2 "config restored: $(git status --porcelain -- packages/config | wc -l | tr -d ' ') changed files under packages/config"
pnpm verify > "$EV/verify.log" 2>&1; log2 "pnpm verify exit $?"
node scripts/check-no-branding-all.mjs > "$EV/branding.log" 2>&1; log2 "branding exit $?"
log2 "listeners 3971-3977: $(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -cE ':397[1-7] ')"
log2 "phase2 done"
