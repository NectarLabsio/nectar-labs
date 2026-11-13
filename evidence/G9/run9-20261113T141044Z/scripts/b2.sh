#!/usr/bin/env bash
# G9 run 9 part B2: e2e re-run with system Chrome (headless shell 1254 absent; only 1248 cached), local Feed /health re-probe (429 at first poll).
B=/tmp/verify-G9-r9-20261113T141500Z
cd $B/repo
L=$B/logs
echo "run 8 local /health: $(cut -c1-60 /Volumes/T7/nectar-labs/evidence/G9/run8-public-20261113T134430Z/feed-health-local.txt) source=$(grep -o '"source":"[^"]*"' /Volumes/T7/nectar-labs/evidence/G9/run8-public-20261113T134430Z/feed-health-local.txt)" > $L/feed-health-reprobe.txt
lsof -iTCP:3100 -iTCP:18788 -iTCP:18789 -sTCP:LISTEN >> $L/feed-health-reprobe.txt 2>&1
FEED_PORT=18788 FEED_MCP_PORT=18789 FEED_DB_PATH=$B/feed2.sqlite pnpm --filter feed start > $L/feed-start-2.log 2>&1 & FP=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:18788/health && break; sleep 1; done
for i in 1 2 3 4 5 6; do sleep 10; echo "$(date -u +%T)Z $(curl -s http://127.0.0.1:18788/health | grep -o -E '"(ok|indexer_cursor|last_error|source|events_indexed)":("[^"]*"|[a-z0-9]+)' | tr '\n' ' ')" >> $L/feed-health-reprobe.txt; done
kill $FP; sleep 1
lsof -iTCP:18788 -iTCP:18789 -sTCP:LISTEN -Fp 2>/dev/null | sed 's/^p//' | while read p; do lsof -a -p $p -d cwd | tail -1 | grep -q verify-G9-r9 && kill $p; done
grep -c poll_failed $L/feed-start-2.log >> $L/feed-health-reprobe.txt
echo "feed indexer default:"; grep -n -i -E "FEED_INDEXER|neardata" services/feed/src/*.ts | grep -i -E "default|\?\?|env" | head -5 | cut -c1-200 >> $L/feed-health-reprobe.txt
echo "chrome: $(/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --version 2>/dev/null)" > $L/e2e-chrome.log
s=$(date +%s); (cd apps/web && PW_CHANNEL=chrome npx --no-install playwright test e2e/test-assets.spec.ts e2e/claims.spec.ts --reporter=list) >> $L/e2e-chrome.log 2>&1; echo "# exit=$? seconds=$(( $(date +%s) - s ))" >> $L/e2e-chrome.log
lsof -iTCP:3100 -sTCP:LISTEN -Fp 2>/dev/null | sed 's/^p//' | while read p; do lsof -a -p $p -d cwd | tail -1 | grep -q verify-G9-r9 && kill $p; done
cat $L/feed-health-reprobe.txt | cut -c1-300
grep -E "✓|✘|passed|failed|flaky|skipped|exit=|chrome:" $L/e2e-chrome.log | cut -c1-200 | tail -40
lsof -iTCP:3100 -iTCP:18788 -iTCP:18789 -iTCP:8788 -iTCP:8789 -sTCP:LISTEN > $L/ports-after.txt 2>&1; cat $L/ports-after.txt
git status --porcelain
