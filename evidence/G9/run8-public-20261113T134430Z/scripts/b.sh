#!/usr/bin/env bash
# G9 run 8 part B: web dev + README routes, Feed + MCP (own ports/DB), submission dry run, greps (same as run 7 b.sh, new paths).
B=/tmp/verify-G9-r8-20261113T134430Z
cd $B/repo
L=$B/logs
lsof -iTCP:3100 -iTCP:18788 -iTCP:18789 -iTCP:8788 -iTCP:8789 -sTCP:LISTEN > $L/ports-before.txt 2>&1
# command 5
s=$(date +%s); pnpm --filter web dev > $L/web-dev.log 2>&1 & WP=$!
for i in $(seq 1 90); do curl -s -o /dev/null http://localhost:3100/ && break; sleep 1; done
echo "web dev ready after $(( $(date +%s) - s )) s" > $L/web-dev-routes.txt
for r in / /borrow /feed /feed/NVDAx /quote/new /console /notes /reserve /shield /agents /keepers /security /talk /docs /legal/privacy /legal/cookies /legal/terms /legal/disclaimers /position/0 /quote/0 /note/q-0 /status /markets /earn; do
  printf '%s %s\n' "$(curl -s -o /dev/null -m 120 -w '%{http_code}' "http://localhost:3100$r")" "$r" >> $L/web-dev-routes.txt
done
kill $WP; sleep 2
lsof -iTCP:3100 -sTCP:LISTEN -Fp 2>/dev/null | sed 's/^p//' | while read p; do lsof -a -p $p -d cwd | tail -1 | grep -q verify-G9-r8 && kill $p; done
# Feed REST + MCP HTTP on own ports, own DB
cp /Volumes/T7/nectar-labs/.claude/worktrees/agent-a75983bbc1b1f885c/evidence/WO-67/B/wo67-mcp-client.mjs services/feed/r8-mcp-client.mjs
FEED_PORT=18788 FEED_MCP_PORT=18789 FEED_DB_PATH=$B/feed.sqlite pnpm --filter feed start > $L/feed-start.log 2>&1 & FP=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:18788/health && break; sleep 1; done
sleep 3
curl -s http://127.0.0.1:18788/health | cut -c1-600 > $L/feed-health-local.txt
node services/feed/r8-mcp-client.mjs http http://127.0.0.1:18789/mcp > $L/feed-mcp-http.log 2>&1
kill $FP; sleep 1
lsof -iTCP:18788 -iTCP:18789 -sTCP:LISTEN -Fp 2>/dev/null | sed 's/^p//' | while read p; do lsof -a -p $p -d cwd | tail -1 | grep -q verify-G9-r8 && kill $p; done
FEED_DB_PATH=$B/feed-stdio.sqlite node services/feed/r8-mcp-client.mjs stdio > $L/feed-mcp-stdio.log 2>&1
rm -f services/feed/r8-mcp-client.mjs
# submission payload, dry run only
node scripts/build-submission.mjs --dry-run > $L/build-submission.log 2>&1; echo "exit=$?" >> $L/build-submission.log
# greps
node scripts/check-no-branding-all.mjs > $L/branding.log 2>&1; echo "exit=$?" >> $L/branding.log
git grep -n -i -I -e "insurance" -e "without liquidation" -- apps packages ':!*.test.*' ':!**/e2e/**' > $L/copy-grep.txt; echo "copy-rule hits: $(wc -l < $L/copy-grep.txt)" >> $L/branding.log
grep -rIil "hackathon" apps/docs-site/build | head > $L/docs-build-hackathon.txt; echo "built docs files with 'hackathon': $(wc -l < $L/docs-build-hackathon.txt)" >> $L/branding.log
git grep -n -I -e "ac.nectarlabs.io" -e "vercel.app" > $L/host-grep.txt
grep -v -E "^(evidence/|docs/(EVIDENCE|FACTS|STATE|DECISIONS|FINAL_REPORT|PRD|PRD-v6|BUILD_PROMPT|BUILD_PROMPT_V7|HUMAN_HANDOFF|GATE_FAIL)[^:]*|docs/work/)" $L/host-grep.txt > $L/host-grep-nonhistory.txt
echo "host-grep lines: $(wc -l < $L/host-grep.txt), non-history: $(wc -l < $L/host-grep-nonhistory.txt), ac.nectarlabs.io non-history: $(grep -c ac.nectarlabs.io $L/host-grep-nonhistory.txt)" >> $L/branding.log
lsof -iTCP:3100 -iTCP:18788 -iTCP:18789 -iTCP:8788 -iTCP:8789 -sTCP:LISTEN > $L/ports-after.txt 2>&1
git status --porcelain > $L/clone-status-after-b.txt
echo "--- routes"; cat $L/web-dev-routes.txt | tr '\n' ' '; echo
echo "--- feed"; cat $L/feed-health-local.txt; echo; cat $L/feed-mcp-http.log; cat $L/feed-mcp-stdio.log
echo "--- submission"; tail -n 6 $L/build-submission.log | cut -c1-250
echo "--- branding"; cat $L/branding.log | tail -n 8; cut -c1-160 $L/copy-grep.txt | head -5; cut -c1-160 $L/host-grep-nonhistory.txt
echo "--- ports"; cat $L/ports-before.txt; echo ...; cat $L/ports-after.txt; echo "--- clone status"; cat $L/clone-status-after-b.txt
