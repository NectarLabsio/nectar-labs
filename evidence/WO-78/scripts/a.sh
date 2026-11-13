#!/usr/bin/env bash
# WO-78 part A: install, smoke-prod (exact), /borrow chunk marker on APP and on nectarlabs-app.vercel.app's redirect target.
B=/tmp/verify-wo78-20261113T142142Z
R=$B/nectar-labs
L=$B/logs; mkdir -p $L
cd $R
{ echo "# $(date -u +%FT%TZ) clone HEAD $(git rev-parse HEAD)"; git status --porcelain | head; echo "\$ git diff --stat c95cd0c 1a95022 -- apps"; git diff --stat c95cd0c 1a95022 -- apps; echo "\$ git diff --stat 1a95022 HEAD -- apps packages"; git diff --stat 1a95022 HEAD -- apps packages; echo "(exit $?)"; } > $L/clone.txt 2>&1
( pnpm i --frozen-lockfile > $L/pnpm-i.log 2>&1; echo "pnpm i exit $?" >> $L/pnpm-i.log ) &
TS=$(date -u +%Y%m%dT%H%M%SZ)
{
echo "# $(date -u +%FT%TZ)"
echo "\$ scripts/deploy/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io https://nectarlabs.vercel.app=https://nectarlabs.io https://nectarlabs-app.vercel.app=https://testnet.nectarlabs.io https://nectar-labs-web.vercel.app=https://testnet.nectarlabs.io https://nectarlabs-docs.vercel.app=https://docs.nectarlabs.io https://nectar-labs-docs.vercel.app=https://docs.nectarlabs.io"
s=$(date +%s)
scripts/deploy/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io \
  https://nectarlabs.vercel.app=https://nectarlabs.io https://nectarlabs-app.vercel.app=https://testnet.nectarlabs.io \
  https://nectar-labs-web.vercel.app=https://testnet.nectarlabs.io https://nectarlabs-docs.vercel.app=https://docs.nectarlabs.io \
  https://nectar-labs-docs.vercel.app=https://docs.nectarlabs.io
echo "exit=$? ($(( $(date +%s) - s )) s)"
} > $L/prod-smoke-$TS.log 2>&1

marker() { # label url
  local lab=$1 url=$2 d=$B/m-$1; mkdir -p $d
  echo "## $(date -u +%FT%TZ) $lab: curl -sL $url"
  curl -sL -m 30 -o $d/borrow.html -w 'final_url=%{url_effective} http=%{http_code} redirects=%{num_redirects}\n' "$url"
  local origin; origin=$(curl -sL -m 30 -o /dev/null -w '%{url_effective}' "$url" | sed -E 's#(https://[^/]+).*#\1#')
  /usr/bin/grep -o -E '/_next/static/[^"]+\.js[^"\\]*' $d/borrow.html | sort -u > $d/chunks.txt
  echo "chunks referenced: $(wc -l < $d/chunks.txt | tr -d ' '); dpl ids in HTML: $(/usr/bin/grep -o -E 'dpl_[A-Za-z0-9]+' $d/borrow.html | sort -u | tr '\n' ' ')"
  local n=0
  : > $d/sums.txt
  for c in $(cat $d/chunks.txt); do
    curl -s -m 30 "$origin$c" -o $d/chunk.js
    echo "$(shasum -a 256 $d/chunk.js | cut -c1-16) ${c%%\?*}" >> $d/sums.txt
    if /usr/bin/grep -q onClaimed $d/chunk.js; then
      n=$((n+1)); echo "onClaimed in ${c%%\?*}:"; /usr/bin/grep -o -E '.{0,40}onClaimed.{0,60}' $d/chunk.js | head -4 | sed 's/^/    /'
    fi
    /usr/bin/grep -q test-assets-connect $d/chunk.js && echo "test-assets-connect marker in ${c%%\?*}"
  done
  echo "chunks with onClaimed: $n"
  echo "\$ curl -sI $origin/borrow"; curl -sI -m 20 "$origin/borrow" | /usr/bin/grep -i -E '^(x-vercel-id|x-vercel-cache|age|etag|date|x-matched-path):' | tr -d '\r'
}
{
marker app https://testnet.nectarlabs.io/borrow
marker legacy "https://nectarlabs-app.vercel.app/borrow"
echo "## chunk list + sha256 prefix diff (app vs legacy redirect target)"
diff $B/m-app/sums.txt $B/m-legacy/sums.txt && echo "identical: $(wc -l < $B/m-app/sums.txt | tr -d ' ') chunks, same paths and sha256"
echo "## docs host unchanged?"; curl -sI -m 20 https://docs.nectarlabs.io/ | /usr/bin/grep -i -E '^(x-vercel-cache|age|etag|last-modified|date):' | tr -d '\r'
} > $L/marker.txt 2>&1
wait
tail -3 $L/pnpm-i.log
tail -6 $L/prod-smoke-$TS.log
cat $L/marker.txt
cat $L/clone.txt
