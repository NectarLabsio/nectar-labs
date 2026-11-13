#!/usr/bin/env bash
# G9 run 6 part 2: command 5 (web dev + README routes), Feed + MCP (own ports), build-submission dry run, greps.
cd /tmp/verify-wo67-20261113T0205Z/repo
L=/tmp/verify-wo67-20261113T0205Z/logs
lsof -iTCP:3100 -iTCP:18788 -iTCP:18789 -sTCP:LISTEN > $L/ports-before.txt 2>&1
# command 5
s=$(date +%s); pnpm --filter web dev > $L/web-dev.log 2>&1 & WP=$!
for i in $(seq 1 90); do curl -s -o /dev/null http://localhost:3100/ && break; sleep 1; done
echo "web dev ready after $(( $(date +%s) - s )) s" > $L/web-dev-routes.txt
for r in / /borrow /feed /feed/NVDAx /quote/new /console /notes /reserve /shield /agents /keepers /security /talk /docs /legal/privacy /legal/cookies /legal/terms /legal/disclaimers /position/0 /quote/0 /note/q-0 /status /markets /earn; do
  printf '%s %s\n' "$(curl -s -o /dev/null -m 120 -w '%{http_code}' "http://localhost:3100$r")" "$r" >> $L/web-dev-routes.txt
done
kill $WP; pkill -f "next dev.*3100" 2>/dev/null; sleep 1
# Feed REST + MCP HTTP on own ports, own DB
FEED_PORT=18788 FEED_MCP_PORT=18789 FEED_DB_PATH=/tmp/verify-wo67-20261113T0205Z/feed.sqlite pnpm --filter feed start > $L/feed-start.log 2>&1 & FP=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:18788/health && break; sleep 1; done
curl -s http://127.0.0.1:18788/health | cut -c1-400 > $L/feed-health-local.txt
node services/feed/wo67-mcp-client.mjs http http://127.0.0.1:18789/mcp > $L/feed-mcp-http.log 2>&1
kill $FP; sleep 1; pkill -f "FEED_PORT=18788" 2>/dev/null
lsof -iTCP:18788 -iTCP:18789 -sTCP:LISTEN -Fp 2>/dev/null | sed 's/^p//' | while read p; do lsof -a -p $p -d cwd | tail -1 | grep -q verify-wo67 && kill $p; done
node services/feed/wo67-mcp-client.mjs stdio > $L/feed-mcp-stdio.log 2>&1
# submission payload, dry run only
node scripts/build-submission.mjs --dry-run > $L/build-submission.log 2>&1; echo "exit=$?" >> $L/build-submission.log
# greps
node scripts/check-no-branding-all.mjs > $L/branding.log 2>&1; echo "exit=$?" >> $L/branding.log
git grep -n -i -I -e "insurance" -e "without liquidation" -- apps packages ':!*.test.*' ':!**/e2e/**' > $L/copy-grep.txt; echo "copy-rule hits: $(wc -l < $L/copy-grep.txt)" >> $L/branding.log
grep -rIil "hackathon" apps/docs-site/build | head > $L/docs-build-hackathon.txt; echo "built docs files with 'hackathon': $(wc -l < $L/docs-build-hackathon.txt)" >> $L/branding.log
git grep -l -a '[/]Users[/][A-Za-z]' -- ':!*.wasm' > $L/home-path-grep.txt; echo "home-path files (excl. wasm): $(wc -l < $L/home-path-grep.txt)" >> $L/branding.log
git rev-list --count HEAD > $L/commit-count.txt
lsof -iTCP:3100 -iTCP:18788 -iTCP:18789 -sTCP:LISTEN > $L/ports-after.txt 2>&1
echo "--- routes"; cat $L/web-dev-routes.txt | tr '\n' ' '; echo
echo "--- feed"; cat $L/feed-health-local.txt; echo; cat $L/feed-mcp-http.log; cat $L/feed-mcp-stdio.log
echo "--- submission"; tail -n 30 $L/build-submission.log | cut -c1-250
echo "--- branding"; cat $L/branding.log; cat $L/copy-grep.txt | cut -c1-200 | head; cat $L/home-path-grep.txt
echo "--- ports after"; cat $L/ports-after.txt
