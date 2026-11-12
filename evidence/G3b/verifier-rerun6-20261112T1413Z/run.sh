#!/bin/bash
# G3b run 6 master script: phase 1 (local build, e2e, LH, selector, views-mode Feed banner) then phase 2 (hosted, inventory, crawl, prod guard, verify).
# Own ports only: 3961 local, 3962 hosts, 3963 inventory/crawl, 3964 docs, 3965 feed (views), 3967 web+feed. Never touches host services.
set -u
D=/tmp/verify-G3b-20261112T1413Z
SP=/private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad
R5=/Volumes/T7/nectar-labs/evidence/G3b/verifier-rerun5-20261112T1041Z
EV=$D/ev
W=$D/apps/web
unset NECTAR_E2E_BORROWER_KEY NEXT_PUBLIC_E2E_KEY_ADAPTER SITE_URL APP_URL FEED_URL NEXT_PUBLIC_FEED_URL DOCS_ORIGIN NECTAR_PRODUCTION
export PW_CHANNEL=chrome
t() { date -u +%H:%M:%SZ; }
P1=$EV/phase1.txt; P2=$EV/phase2.txt
log1() { echo "[$(t)] $*" | tee -a "$P1"; }
log2() { echo "[$(t)] $*" | tee -a "$P2"; }
waitport() { for _ in $(seq 1 60); do curl -s -o /dev/null "$1" && return 0; sleep 1; done; return 1; }
killport() { # kill my own server by pid; report; then confirm the port is free
  kill "$2" 2>/dev/null; local rc=$?; sleep 2
  local left; left=$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | tr '\n' ' ')
  echo "kill $1 pid $2 -> $rc; listeners left: ${left:-none}"
}
cp "$R5/g3b-selector-probe.mjs" "$W/g3b-selector-probe.mjs"
cp "$SP/g3b-banner-probe.mjs" "$W/g3b-banner-probe.mjs"
cp "$R5/inv-compare.cjs" "$EV/inv-compare.cjs"
cp "$SP/g3b-banner-probe.mjs" "$SP/run.sh" "$EV/"

# ---------- phase 1 ----------
cd "$D" || exit 1
pnpm --filter ./services/feed test > "$EV/feed-test.log" 2>&1; log1 "(j) feed unit tests exit $?"
pnpm --filter ./services/keeper test > "$EV/keeper-test.log" 2>&1; log1 "(j) keeper unit tests exit $?"
(cd "$W" && pnpm build > "$EV/build-local.log" 2>&1); log1 "build-local exit $?"
node apps/web/scripts/check-trace.mjs > "$EV/check-trace.log" 2>&1; log1 "(g) check-trace exit $?"
(cd "$W" && exec ./node_modules/.bin/next start -p 3961 > "$EV/server-local.log" 2>&1) & LP=$!
waitport http://localhost:3961/ && log1 "local :3961 up pid $LP"
: > "$EV/headers-local.txt"
for r in / /borrow /api/health /docs /about; do echo "== $r" >> "$EV/headers-local.txt"; curl -sI "http://localhost:3961$r" >> "$EV/headers-local.txt"; done
curl -s http://localhost:3961/api/health > "$EV/health-local.json"; log1 "health $(head -c 300 "$EV/health-local.json")"
curl -s http://localhost:3961/ > "$EV/landing.html"; log1 "(i) landing.html saved ($(wc -c < "$EV/landing.html") bytes)"
log1 "e2e start"
(cd "$W" && PORT=3961 E2E_BASE_URL=http://localhost:3961 pnpm e2e > "$EV/e2e-local.log" 2>&1); log1 "e2e exit $?"
log1 "lh start"
(cd "$W" && LH_BASE_URL=http://localhost:3961 pnpm lighthouse > "$EV/lh.log" 2>&1); log1 "lh exit $?"
(cd "$W" && node g3b-selector-probe.mjs http://localhost:3961 "$EV/sel" > "$EV/selector-probe.log" 2>&1); log1 "selector exit $?"
# (i)+(j) views-mode Feed from this clone on :3965 (no MCP port, fresh DB in the clone), web on :3967 with FEED_URL
mkdir -p "$D/.feedtmp"
(cd "$D/services/feed" && FEED_INDEXER=views FEED_PORT=3965 FEED_MCP_PORT=off FEED_DB_PATH="$D/.feedtmp/feed.sqlite" CORE_ACCOUNT_ID=nectar-core-v2.nectar.testnet \
  exec node --disable-warning=ExperimentalWarning src/main.ts > "$EV/server-feed.log" 2>&1) & FP=$!
waitport http://localhost:3965/healthz && log1 "feed :3965 up pid $FP"
sleep 25
curl -s http://localhost:3965/health > "$EV/feed-health.json"; log1 "(j) feed /health $(head -c 600 "$EV/feed-health.json")"
curl -s http://localhost:3965/healthz > "$EV/feed-healthz.json"
curl -s "http://localhost:3965/api/settlements?limit=5" > "$EV/feed-settlements.json"
curl -s -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"block","params":{"finality":"final"}}' https://test.rpc.fastnear.com > "$EV/rpc-final.json"
log1 "rpc final height $(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).result.header.height)}catch{console.log("n/a")}' "$EV/rpc-final.json")"
(cd "$W" && FEED_URL=http://localhost:3965 exec ./node_modules/.bin/next start -p 3967 > "$EV/server-webfeed.log" 2>&1) & WP=$!
waitport http://localhost:3967/ && log1 "web+feed :3967 up pid $WP"
curl -s http://localhost:3967/api/indexer/healthz > "$EV/web-indexer-healthz.json"; log1 "web /api/indexer/healthz $(head -c 300 "$EV/web-indexer-healthz.json")"
(cd "$W" && node g3b-banner-probe.mjs http://localhost:3967 http://localhost:3961 "$EV/banner-probe.json" > "$EV/banner-probe.log" 2>&1); log1 "(i) banner probe exit $?"
curl -s http://localhost:3965/health > "$EV/feed-health-2.json"; log1 "(j) feed /health (2nd) $(head -c 400 "$EV/feed-health-2.json")"
log1 "$(killport 3967 $WP)"
log1 "$(killport 3965 $FP)"
log1 "$(killport 3961 $LP)"
log1 "phase1 done"

# ---------- phase 2 ----------
pnpm --filter ./apps/docs-site build > "$EV/build-docs.log" 2>&1; log2 "build-docs exit $?"
node apps/web/scripts/serve-docs.mjs --port 3964 > "$EV/server-docs.log" 2>&1 & DP=$!
waitport http://localhost:3964/docs/ && log2 "docs :3964 up pid $DP"
(cd "$W" && SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test DOCS_ORIGIN=http://localhost:3964 pnpm build > "$EV/build-hosts.log" 2>&1); log2 "build-hosts exit $?"
(cd "$W" && SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test DOCS_ORIGIN=http://localhost:3964 exec ./node_modules/.bin/next start -p 3962 > "$EV/server-hosts.log" 2>&1) & HP=$!
waitport http://localhost:3962/ && log2 "hosts :3962 up pid $HP"
(cd "$W" && E2E_HOSTED=1 E2E_DOCS=1 E2E_BASE_URL=http://localhost:3962 npx playwright test e2e/hosts.spec.ts --project=desktop > "$EV/e2e-hosts.log" 2>&1); log2 "(b) e2e-hosts exit $?"
log2 "$(killport 3962 $HP)"
(cd "$W" && SITE_URL=http://site.localhost:3963 APP_URL=http://app.localhost:3963 DOCS_ORIGIN=http://localhost:3964 pnpm build > "$EV/build-inv.log" 2>&1); log2 "build-inv exit $?"
(cd "$W" && SITE_URL=http://site.localhost:3963 APP_URL=http://app.localhost:3963 DOCS_ORIGIN=http://localhost:3964 exec ./node_modules/.bin/next start -p 3963 > "$EV/server-inv.log" 2>&1) & IP=$!
waitport http://localhost:3963/ && log2 "inv :3963 up pid $IP; app /docs/start/quick-start -> $(curl -s -o /dev/null -w '%{http_code}' http://app.localhost:3963/docs/start/quick-start)"
cp "$W/content/data-inventory.json" "$EV/data-inventory.committed.json"
log2 "inventory start"
(cd "$W" && E2E_INVENTORY=1 INV_SITE=http://site.localhost:3963 INV_APP=http://app.localhost:3963 E2E_BASE_URL=http://localhost:3963 npx playwright test --project=inventory > "$EV/e2e-inventory.log" 2>&1); log2 "(c) inventory exit $?"
cp "$W/content/data-inventory.json" "$EV/data-inventory.measured.json"; cp "$W/content/data-inventory.md" "$EV/data-inventory.measured.md" 2>/dev/null
node "$EV/inv-compare.cjs" "$EV/data-inventory.committed.json" "$EV/data-inventory.measured.json" apps/docs-site/docs/legal/privacy.md > "$EV/inv-compare.log" 2>&1; log2 "(c) inv-compare exit $?"
git checkout -- apps/web/content
log2 "crawl start"
node apps/web/scripts/crawl.mjs --polite --site http://site.localhost:3963 --app http://app.localhost:3963 --out "$EV/crawl" > "$EV/crawl.log" 2>&1; log2 "(d) crawl exit $?"
log2 "$(killport 3963 $IP)"
log2 "$(killport 3964 $DP)"
(cd "$W" && NECTAR_PRODUCTION=1 SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test pnpm build > "$EV/build-prod.log" 2>&1); log2 "(f) build-prod (operator filled) exit $? (expect 0)"
node apps/web/scripts/check-trace.mjs > "$EV/check-trace-prod.log" 2>&1; log2 "(g) check-trace after prod build exit $?"
sed -i '' 's/^\(  operator: \).*$/\1null/' packages/config/config.yaml
log2 "$(git diff --stat -- packages/config/config.yaml | tail -1) / $(grep -n '^  operator:' packages/config/config.yaml)"
(cd "$W" && NECTAR_PRODUCTION=1 SITE_URL=https://site.nectar.test APP_URL=https://app.nectar.test pnpm build > "$EV/build-prod-guard.log" 2>&1); log2 "(f) build-prod (operator null) exit $? (expect non-zero)"
log2 "guard msg: $(grep -m1 -o 'Production build refused[^"]*' "$EV/build-prod-guard.log")"
git checkout -- packages/config/config.yaml; log2 "config restored: $(git status --porcelain -- packages/config | wc -l | tr -d ' ') changed files under packages/config"
pnpm verify > "$EV/verify.log" 2>&1; log2 "pnpm verify exit $?"
node scripts/check-no-branding-all.mjs > "$EV/branding.log" 2>&1; log2 "branding exit $?"
log2 "listeners 3961-3967: $(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -cE ':396[1-7] ')"
log2 "phase2 done"
