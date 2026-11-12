#!/bin/bash
# G3b run 8b master script (WO-66b) on c95cd0c: (d) hosted crawl --polite, (k) strict home-path grep, (p) hydration probe.
# Fresh clone on the internal disk. Own ports only: 3992 hosted web (site/app/status/legacy *.localhost), 3994 docs.
# Never touches host services (8545, 8788-8791).
set -u
TS=20261112T2132Z
D=/tmp/verify-G3b-r8b-$TS
SP=/private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad
EV=$D.ev
mkdir -p "$EV"
unset NECTAR_E2E_BORROWER_KEY NEXT_PUBLIC_E2E_KEY_ADAPTER SITE_URL APP_URL DOCS_URL STATUS_URL LEGACY_HOSTS FEED_URL NEXT_PUBLIC_FEED_URL DOCS_ORIGIN NECTAR_PRODUCTION REPO_URL
export PW_CHANNEL=chrome
t() { date -u +%H:%M:%SZ; }
L=$EV/run.txt
log() { echo "[$(t)] $*" | tee -a "$L"; }
waitport() { for _ in $(seq 1 120); do curl -s -o /dev/null "$1" && return 0; sleep 1; done; return 1; }
killport() {
  kill "$2" 2>/dev/null; local rc=$?; sleep 2
  local left; left=$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | tr '\n' ' ')
  echo "kill $1 pid $2 -> $rc; listeners left: ${left:-none}"
}
log "start; node $(node -v); pnpm $(pnpm -v)"
git clone /Volumes/T7/nectar-labs "$D" > "$EV/clone.log" 2>&1; log "clone exit $?"
cd "$D" || exit 1
git checkout c95cd0c >> "$EV/clone.log" 2>&1; log "checkout exit $?; HEAD $(git rev-parse HEAD)"
git diff --stat 31809b1 c95cd0c -- apps packages services contracts > "$EV/diff-stat-31809b1-c95cd0c.txt"; log "diff --stat 31809b1 c95cd0c -- apps packages services contracts:"; cat "$EV/diff-stat-31809b1-c95cd0c.txt" | tee -a "$L"
git diff --stat 31809b1 c95cd0c -- docs/ui > "$EV/diff-stat-docs-ui.txt"; log "docs/ui diff: $(tail -1 "$EV/diff-stat-docs-ui.txt")"
# (k) strict home-path grep, as in run 8 (non-wasm files) + the loose one for context.
git grep -n '/Users/[A-Za-z]' -- ':!*.wasm' > "$EV/k-git-grep-strict.log" 2>&1; log "(k) git grep -n '/Users/[A-Za-z]' -- ':!*.wasm' -> $(wc -l < "$EV/k-git-grep-strict.log" | tr -d ' ') lines"
git grep -l "/Users/" > "$EV/k-git-grep-l.log" 2>&1; log "(k) git grep -l /Users/ -> $(wc -l < "$EV/k-git-grep-l.log" | tr -d ' ') files ($(/usr/bin/grep -c '\.wasm$' "$EV/k-git-grep-l.log") wasm)"
git grep -n "/Users/" -- ':!*.wasm' | cut -c1-220 > "$EV/k-git-grep-nonwasm-lines.log" 2>&1
git grep -n "/Users/" -- evidence/WO-62b/hosts-spec-20261112T195948Z.log > "$EV/k-wo62b-log.txt" 2>&1; log "(k) WO-62b hosts-spec log /Users/ lines: $(wc -l < "$EV/k-wo62b-log.txt" | tr -d ' ')"
pnpm install --frozen-lockfile > "$EV/install.log" 2>&1; log "install exit $?"
W=$D/apps/web
cp "$SP/hydration-probe.mjs" "$W/"
(cd "$W" && node --test scripts/crawl-hosts.test.mjs > "$EV/crawl-hosts-test.log" 2>&1); log "crawl-hosts.test.mjs exit $? ($(/usr/bin/grep -E '^# (pass|fail)' "$EV/crawl-hosts-test.log" | tr '\n' ' '))"
HS="SITE_URL=http://site.localhost:3992 APP_URL=http://app.localhost:3992 DOCS_URL=http://docs.localhost:3994 STATUS_URL=http://status.localhost:3992 LEGACY_HOSTS=old-site.localhost:3992=site,old-app.localhost:3992=app"
log "hosted env: $HS"
env $HS pnpm --filter ./apps/docs-site build > "$EV/build-docs.log" 2>&1; log "build-docs (hosted env) exit $?"
log "docs sitemap first loc: $(/usr/bin/grep -o '<loc>[^<]*</loc>' apps/docs-site/build/sitemap.xml | head -1); locs $(/usr/bin/grep -o '<loc>' apps/docs-site/build/sitemap.xml | wc -l | tr -d ' ')"
node apps/web/scripts/serve-docs.mjs --port 3994 > "$EV/server-docs.log" 2>&1 & DP=$!
waitport http://localhost:3994/ && log "docs :3994 up pid $DP; / -> $(curl -s -o /dev/null -w '%{http_code}' http://docs.localhost:3994/)"
(cd "$W" && env $HS pnpm build > "$EV/build-hosted.log" 2>&1); log "build-hosted exit $?"
(cd "$W" && exec env $HS ./node_modules/.bin/next start -p 3992 > "$EV/server-hosted.log" 2>&1) & HP=$!
waitport http://localhost:3992/api/health && log "hosted :3992 up pid $HP; site / $(curl -s -o /dev/null -w '%{http_code}' http://site.localhost:3992/), status / $(curl -s -o /dev/null -w '%{http_code}' http://status.localhost:3992/), app / $(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://app.localhost:3992/)"
curl -s http://app.localhost:3992/api/health > "$EV/health-hosted.json"; log "health $(head -c 200 "$EV/health-hosted.json")"
# (p) hydration, ordered method first.
log "(p) plain start"
(cd "$W" && node hydration-probe.mjs http://site.localhost:3992 http://status.localhost:3992 "$EV/hydration-plain.json" plain 10 > "$EV/hydration-plain.log" 2>&1); log "(p) plain exit $? : $(/usr/bin/grep '^SUMMARY' "$EV/hydration-plain.log" | cut -c1-600)"
# (d) the ordered crawl.
log "(d) crawl --polite start"
env $HS node apps/web/scripts/crawl.mjs --polite --out "$EV/crawl" > "$EV/crawl.log" 2>&1; log "(d) crawl exit $? : $(tail -1 "$EV/crawl.log")"
# Supplements (not PASS criteria): crawler-style parallel hydration loads, then a fast (non-polite) crawl like the WO-62d agent's.
log "(p+) crawlstyle start"
(cd "$W" && node hydration-probe.mjs http://site.localhost:3992 http://status.localhost:3992 "$EV/hydration-crawlstyle.json" crawlstyle 10 > "$EV/hydration-crawlstyle.log" 2>&1); log "(p+) crawlstyle exit $? : $(/usr/bin/grep '^SUMMARY' "$EV/hydration-crawlstyle.log" | cut -c1-600)"
log "(d+) fast crawl start"
env $HS node apps/web/scripts/crawl.mjs --out "$EV/crawl-fast" > "$EV/crawl-fast.log" 2>&1; log "(d+) fast crawl exit $? : $(tail -1 "$EV/crawl-fast.log")"
log "(p) plain re-run after load start"
(cd "$W" && node hydration-probe.mjs http://site.localhost:3992 http://status.localhost:3992 "$EV/hydration-plain-2.json" plain 10 > "$EV/hydration-plain-2.log" 2>&1); log "(p) plain-2 exit $? : $(/usr/bin/grep '^SUMMARY' "$EV/hydration-plain-2.log" | cut -c1-600)"
log "$(killport 3992 $HP)"
log "$(killport 3994 $DP)"
log "listeners 3990-3999: $(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | /usr/bin/grep -cE ':399[0-9] ')"
log "host services: $(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | /usr/bin/grep -E ':(8545|878[89]|879[01]) ' | awk '{print $9}' | tr '\n' ' ')"
log "clone tracked changes: $(git status --porcelain | wc -l | tr -d ' ')"
git status --porcelain > "$EV/clone-status.txt"
log "done"
