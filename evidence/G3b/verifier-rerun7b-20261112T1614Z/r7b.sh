#!/bin/bash
# G3b re-run 7b (d) on release 3 = 5f011bb. Fresh clone on the internal disk, install, docs build, hosted-mode web build,
# serve-docs, crawl --polite, curl every railway Feed href in the docs build. Own ports only: 3983 web (site/app), 3984 docs.
set -u
D=/tmp/verify-G3b-r7b-20261112T1614Z
SP=/private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad
EV=$D/ev
W=$D/apps/web
unset NECTAR_E2E_BORROWER_KEY NEXT_PUBLIC_E2E_KEY_ADAPTER SITE_URL APP_URL FEED_URL NEXT_PUBLIC_FEED_URL DOCS_ORIGIN NECTAR_PRODUCTION
export PW_CHANNEL=chrome
t() { date -u +%H:%M:%SZ; }
mkdir -p "$D.logs"
L=$D.logs/run.txt
log() { echo "[$(t)] $*" | tee -a "$L"; }
waitport() { for _ in $(seq 1 90); do curl -s -o /dev/null "$1" && return 0; sleep 1; done; return 1; }
killport() {
  kill "$2" 2>/dev/null; local rc=$?; sleep 2
  local left; left=$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | tr '\n' ' ')
  echo "kill $1 pid $2 -> $rc; listeners left: ${left:-none}"
}
log "start"
git clone /Volumes/T7/nectar-labs "$D" > "$D.logs/clone.log" 2>&1; log "clone exit $?"
cd "$D" || exit 1
git checkout 5f011bb7f2ddc1df18c11c1464cdf12f3b993dd0 >> "$D.logs/clone.log" 2>&1; log "checkout exit $? HEAD $(git rev-parse HEAD)"
mkdir -p ev; mv "$D.logs/clone.log" ev/; cp "$SP/r7b.sh" ev/
log "diff 4c2a0bb..HEAD (apps packages services contracts): $(git diff --stat 4c2a0bb HEAD -- apps packages services contracts | tail -1)"
pnpm install --frozen-lockfile > ev/install.log 2>&1; log "install exit $?"
pnpm --filter docs-site build > ev/build-docs.log 2>&1; log "pnpm --filter docs-site build exit $?"
tail -5 ev/build-docs.log >> "$L"
# railway Feed hrefs in the docs build
B=apps/docs-site/build
/usr/bin/grep -rhoE 'href="https://feed-production-2f2776c9\.up\.railway\.app[^"]*"' "$B" | sed 's/^href="//; s/"$//' | sort | uniq -c > ev/feed-hrefs.txt
/usr/bin/grep -rlE 'href="https://feed-production-2f2776c9\.up\.railway\.app' "$B" | sed "s|^$B/||" | sort > ev/feed-href-pages.txt
log "feed hrefs (count url): $(tr '\n' ';' < ev/feed-hrefs.txt) on $(wc -l < ev/feed-href-pages.txt | tr -d ' ') pages"
: > ev/feed-curl.txt
for u in $(awk '{print $2}' ev/feed-hrefs.txt); do
  echo "$u -> $(curl -s -o /dev/null -w '%{http_code} %{time_total}s' --max-time 20 "$u")" >> ev/feed-curl.txt
done
echo "-- bare origin (control) -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 20 https://feed-production-2f2776c9.up.railway.app)" >> ev/feed-curl.txt
log "feed curl: $(tr '\n' ';' < ev/feed-curl.txt)"
curl -s --max-time 20 https://feed-production-2f2776c9.up.railway.app/health | head -c 400 > ev/feed-health.json
# docs source lines
/usr/bin/grep -n 'railway' apps/docs-site/docs/integrate/feed-rest.md apps/docs-site/docs/operations/monitoring.md > ev/docs-src-railway.txt
# hosted-mode crawl
node apps/web/scripts/serve-docs.mjs --port 3984 > ev/server-docs.log 2>&1 & DP=$!
waitport http://localhost:3984/docs/ && log "docs :3984 up pid $DP"
(cd "$W" && SITE_URL=http://site.localhost:3983 APP_URL=http://app.localhost:3983 DOCS_ORIGIN=http://localhost:3984 pnpm build > "$EV/build-hosted.log" 2>&1); log "build-hosted exit $?"
(cd "$W" && SITE_URL=http://site.localhost:3983 APP_URL=http://app.localhost:3983 DOCS_ORIGIN=http://localhost:3984 exec ./node_modules/.bin/next start -p 3983 > "$EV/server-hosted.log" 2>&1) & IP=$!
waitport http://localhost:3983/ && log "hosted :3983 up pid $IP; app /docs/integrate/feed-rest -> $(curl -s -o /dev/null -w '%{http_code}' http://app.localhost:3983/docs/integrate/feed-rest)"
log "crawl start"
node apps/web/scripts/crawl.mjs --polite --site http://site.localhost:3983 --app http://app.localhost:3983 --out "$EV/crawl" > "$EV/crawl.log" 2>&1; log "(d) crawl exit $?"
log "$(killport 3983 $IP)"
log "$(killport 3984 $DP)"
log "listeners 3983/3984: $(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -cE ':398[34] ')"
log "git status: $(git status --porcelain | grep -v '^?? ev/' | wc -l | tr -d ' ') changed tracked/untracked (excl ev/)"
cp "$L" ev/
log "r7b done"
