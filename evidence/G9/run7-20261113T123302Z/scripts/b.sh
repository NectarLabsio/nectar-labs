#!/usr/bin/env bash
# G9 run 7 part B: web dev + README routes, Feed + MCP (own ports/DB), submission dry run, greps, hosted REST + RPC claims.
B=/tmp/verify-G9-r7-20261113T123302Z
cd $B/repo
L=$B/logs
lsof -iTCP:3100 -iTCP:18788 -iTCP:18789 -sTCP:LISTEN > $L/ports-before.txt 2>&1
# command 5
s=$(date +%s); pnpm --filter web dev > $L/web-dev.log 2>&1 & WP=$!
for i in $(seq 1 90); do curl -s -o /dev/null http://localhost:3100/ && break; sleep 1; done
echo "web dev ready after $(( $(date +%s) - s )) s" > $L/web-dev-routes.txt
for r in / /borrow /feed /feed/NVDAx /quote/new /console /notes /reserve /shield /agents /keepers /security /talk /docs /legal/privacy /legal/cookies /legal/terms /legal/disclaimers /position/0 /quote/0 /note/q-0 /status /markets /earn; do
  printf '%s %s\n' "$(curl -s -o /dev/null -m 120 -w '%{http_code}' "http://localhost:3100$r")" "$r" >> $L/web-dev-routes.txt
done
kill $WP; pkill -f "next dev.*3100" 2>/dev/null; sleep 2
lsof -iTCP:3100 -sTCP:LISTEN -Fp 2>/dev/null | sed 's/^p//' | while read p; do lsof -a -p $p -d cwd | tail -1 | grep -q verify-G9-r7 && kill $p; done
# Feed REST + MCP HTTP on own ports, own DB
cp /Volumes/T7/nectar-labs/.claude/worktrees/agent-a95c83df57599d272/evidence/WO-67/B/wo67-mcp-client.mjs services/feed/r7-mcp-client.mjs
FEED_PORT=18788 FEED_MCP_PORT=18789 FEED_DB_PATH=$B/feed.sqlite pnpm --filter feed start > $L/feed-start.log 2>&1 & FP=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:18788/health && break; sleep 1; done
sleep 3
curl -s http://127.0.0.1:18788/health | cut -c1-600 > $L/feed-health-local.txt
node services/feed/r7-mcp-client.mjs http http://127.0.0.1:18789/mcp > $L/feed-mcp-http.log 2>&1
kill $FP; sleep 1
lsof -iTCP:18788 -iTCP:18789 -sTCP:LISTEN -Fp 2>/dev/null | sed 's/^p//' | while read p; do lsof -a -p $p -d cwd | tail -1 | grep -q verify-G9-r7 && kill $p; done
node services/feed/r7-mcp-client.mjs stdio > $L/feed-mcp-stdio.log 2>&1
rm -f services/feed/r7-mcp-client.mjs
# submission payload, dry run only
node scripts/build-submission.mjs --dry-run > $L/build-submission.log 2>&1; echo "exit=$?" >> $L/build-submission.log
# greps
node scripts/check-no-branding-all.mjs > $L/branding.log 2>&1; echo "exit=$?" >> $L/branding.log
git grep -n -i -I -e "insurance" -e "without liquidation" -- apps packages ':!*.test.*' ':!**/e2e/**' > $L/copy-grep.txt; echo "copy-rule hits: $(wc -l < $L/copy-grep.txt)" >> $L/branding.log
grep -rIil "hackathon" apps/docs-site/build | head > $L/docs-build-hackathon.txt; echo "built docs files with 'hackathon': $(wc -l < $L/docs-build-hackathon.txt)" >> $L/branding.log
git grep -l -a '[/]Users[/][A-Za-z]' -- ':!*.wasm' > $L/home-path-grep.txt; echo "home-path files (excl. wasm): $(wc -l < $L/home-path-grep.txt)" >> $L/branding.log
git grep -n -I -e "ac.nectarlabs.io" -e "vercel.app" > $L/host-grep.txt
grep -v -E "^(evidence/|docs/(EVIDENCE|FACTS|STATE|DECISIONS|FINAL_REPORT|PRD|PRD-v6|BUILD_PROMPT|BUILD_PROMPT_V7|HUMAN_HANDOFF|GATE_FAIL)[^:]*|docs/work/)" $L/host-grep.txt > $L/host-grep-nonhistory.txt
echo "host-grep lines: $(wc -l < $L/host-grep.txt), non-history: $(wc -l < $L/host-grep-nonhistory.txt), ac.nectarlabs.io non-history: $(grep -c ac.nectarlabs.io $L/host-grep-nonhistory.txt)" >> $L/branding.log
git rev-list --count HEAD > $L/commit-count.txt
lsof -iTCP:3100 -iTCP:18788 -iTCP:18789 -sTCP:LISTEN > $L/ports-after.txt 2>&1
# hosted REST + RPC claims
{
F=https://feed-production-2f2776c9.up.railway.app
grep -n -o -E "'/api/feed[a-z_/:]*'|\`/api/feed[^\`]*\`" services/feed/src/api.ts | head -20
for p in /api/feed/events /api/feed/events?limit=5 /api/feed/history /api/feed/NVDAx /api/feed; do echo "\$ GET $p -> $(curl -s -o $B/r.json -m 20 -w '%{http_code}' "$F$p")"; cut -c1-500 $B/r.json; echo; done
R=https://rpc.testnet.fastnear.com
for t in "8bXCY34SVYv5b7vJ4GLfWkbJtQdqbSSBJsrzPCE75XRk x402-relayer.nectar.testnet" "De6aVqqNvfyemXtpuGP6quaUNcZgN2xP6cCXHXEwvfZG nectar.testnet"; do
  set -- $t
  echo "\$ RPC tx $1 sender $2"
  curl -s -m 30 $R -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tx\",\"params\":{\"tx_hash\":\"$1\",\"sender_account_id\":\"$2\",\"wait_until\":\"NONE\"}}" > $B/tx.json
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(r.error){console.log("error",JSON.stringify(r.error).slice(0,300));process.exit()}const x=r.result;console.log("status",JSON.stringify(x.status).slice(0,80),"signer",x.transaction.signer_id,"receiver",x.transaction.receiver_id,"block_hash",x.transaction_outcome.block_hash);for(const o of x.receipts_outcome)for(const l of o.outcome.logs)console.log("  log",o.outcome.executor_id,l.slice(0,220))' $B/tx.json
done
} > $L/hosted-claims.txt 2>&1
echo "--- routes"; cat $L/web-dev-routes.txt | tr '\n' ' '; echo
echo "--- feed"; cat $L/feed-health-local.txt; echo; cat $L/feed-mcp-http.log; cat $L/feed-mcp-stdio.log
echo "--- submission"; tail -n 25 $L/build-submission.log | cut -c1-250
echo "--- branding"; cat $L/branding.log; cut -c1-200 $L/copy-grep.txt | head; cat $L/home-path-grep.txt; cut -c1-200 $L/host-grep-nonhistory.txt
echo "--- ports"; cat $L/ports-before.txt; echo ...; cat $L/ports-after.txt
echo "--- hosted claims"; cat $L/hosted-claims.txt
