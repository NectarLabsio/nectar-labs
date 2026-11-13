#!/usr/bin/env bash
# G9 run 10 part B: web dev + every README route, Feed + MCP (own ports/DB), submission dry run, branding / copy / host greps, built docs grep.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
C=/tmp/g9-run10-20261113T215226Z
L=$C.logs
cd $C
mine() { lsof -iTCP:$1 -sTCP:LISTEN -Fp 2>/dev/null | sed 's/^p//' | while read p; do lsof -a -p $p -d cwd | tail -1 | grep -q g9-run10 && kill $p; done; }
s=$(date +%s); pnpm --filter web dev > $L/web-dev.log 2>&1 & WP=$!
for i in $(seq 1 90); do curl -s -o /dev/null http://localhost:3100/ && break; sleep 1; done
echo "web dev first answer after $(( $(date +%s) - s )) s (README: ready in 4 s)" > $L/web-dev-routes.txt
for r in / /feed /feed/NVDAx /borrow /quote/new /console /notes /reserve /shield /agents /keepers /security /talk /docs /legal/privacy /legal/cookies /legal/terms /legal/disclaimers /position/22 /quote/0 /note/q-0; do
  printf '%s %s\n' "$(curl -s -o /dev/null -m 120 -w '%{http_code}' "http://localhost:3100$r")" "$r" >> $L/web-dev-routes.txt
done
curl -s -m 60 http://localhost:3100/borrow -o $L/local-borrow.html; echo "local /borrow html bytes: $(wc -c < $L/local-borrow.html)" >> $L/web-dev-routes.txt
kill $WP; sleep 2; mine 3100; sleep 1
cp evidence/WO-67/B/wo67-mcp-client.mjs services/feed/r10-mcp-client.mjs
FEED_PORT=18788 FEED_MCP_PORT=18789 FEED_DB_PATH=$C.logs/feed.sqlite pnpm --filter feed start > $L/feed-start.log 2>&1 & FP=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:18788/health && break; sleep 1; done
sleep 8
curl -s http://127.0.0.1:18788/health | cut -c1-700 > $L/feed-health-local.txt
node services/feed/r10-mcp-client.mjs http http://127.0.0.1:18789/mcp > $L/feed-mcp-http.log 2>&1
kill $FP; sleep 1; mine 18788; mine 18789
FEED_DB_PATH=$C.logs/feed-stdio.sqlite node services/feed/r10-mcp-client.mjs stdio > $L/feed-mcp-stdio.log 2>&1
rm -f services/feed/r10-mcp-client.mjs
node scripts/build-submission.mjs --dry-run > $L/build-submission.log 2>&1; echo "exit=$?" >> $L/build-submission.log
node scripts/check-no-branding-all.mjs > $L/branding.log 2>&1; echo "exit=$?" >> $L/branding.log
git grep -n -i -I -e "insurance" -e "without liquidation" -- apps packages ':!*.test.*' ':!**/e2e/**' > $L/copy-grep.txt; echo "copy-rule hits apps+packages: $(wc -l < $L/copy-grep.txt)" >> $L/branding.log
git grep -n -i -I -e "insurance" -e "without liquidation" -e "powered by NEAR" -e "exit liquidity" -- README.md docs/SUBMISSION.md docs/process/x-post.md > $L/copy-grep-readme.txt; echo "banned-word hits README/SUBMISSION/x-post: $(wc -l < $L/copy-grep-readme.txt)" >> $L/branding.log
grep -rIil "hackathon" apps/docs-site/build | head > $L/docs-build-hackathon.txt; echo "built docs files with 'hackathon': $(wc -l < $L/docs-build-hackathon.txt)" >> $L/branding.log
grep -c -i hackathon $L/local-borrow.html | sed 's/^/local \/borrow html hackathon count: /' >> $L/branding.log
git grep -n -I -e "ac.nectarlabs.io" -e "vercel.app" > $L/host-grep.txt
grep -v -E "^(evidence/|docs/(EVIDENCE|FACTS)\.md|docs/process/)" $L/host-grep.txt > $L/host-grep-nonhistory.txt
echo "host-grep lines: $(wc -l < $L/host-grep.txt), outside evidence/EVIDENCE/FACTS/docs/process: $(wc -l < $L/host-grep-nonhistory.txt), ac.nectarlabs.io there: $(grep -c ac.nectarlabs.io $L/host-grep-nonhistory.txt)" >> $L/branding.log
lsof -iTCP:3000 -iTCP:3100 -iTCP:18788 -iTCP:18789 -iTCP:8788 -iTCP:8789 -sTCP:LISTEN > $L/ports-after-b.txt 2>&1
git status --porcelain > $L/clone-status-after-b.txt
echo "--- routes"; cat $L/web-dev-routes.txt | tr '\n' ' '; echo
echo "--- feed"; cat $L/feed-health-local.txt; echo; cut -c1-300 $L/feed-mcp-http.log | head -20; cut -c1-300 $L/feed-mcp-stdio.log | head -20
echo "--- submission"; tail -n 6 $L/build-submission.log | cut -c1-300
echo "--- branding"; cat $L/branding.log | tail -n 8; cut -c1-160 $L/copy-grep.txt | head -5; cut -c1-160 $L/copy-grep-readme.txt | head; cut -c1-160 $L/host-grep-nonhistory.txt | head
echo "--- ports after"; cat $L/ports-after-b.txt; echo "--- clone status"; cat $L/clone-status-after-b.txt
