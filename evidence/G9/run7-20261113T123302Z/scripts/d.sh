#!/usr/bin/env bash
# G9 run 7 part D: web test counts, v2 fixture tests in verify.log, payload keys, hosted Feed CORS, receipt block of the oracle_updated event.
B=/tmp/verify-G9-r7-20261113T123302Z
L=$B/logs
cd $B/repo
{
echo "## web tests"; grep -E "apps/web test: ℹ (tests|pass|fail|skipped)" $L/verify.log
echo "## v2 fixture tests in verify.log"; grep -E "real nectar-core-v2|De6aVqqN|all fixtures together" $L/verify.log | cut -c1-200
echo "## payload keys"
grep -E '^\{' $L/build-submission.log | head -1 > $B/payload.json
node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log("keys",Object.keys(p).join(","));console.log("website" in p?"website PRESENT":"website absent");console.log("tracks",JSON.stringify(p.tracks));console.log("privacy mentions",JSON.stringify(p).toLowerCase().split("privacy").length-1);console.log("TODO fields",Object.entries(p).filter(([k,v])=>String(v).includes("TODO-H")).map(([k,v])=>k+"="+String(v).match(/TODO-H\d+/)[0]).join(" "))' $B/payload.json
echo "## hosted Feed CORS ($(date -u +%T)Z)"
F=https://feed-production-2f2776c9.up.railway.app
for o in https://nectarlabs.io https://testnet.nectarlabs.io https://status.nectarlabs.io https://docs.nectarlabs.io https://evil.example.com; do
  a=$(curl -s -m 20 -D - -o /dev/null -H "Origin: $o" $F/health | grep -i -E '^access-control-allow-origin' | tr -d '\r')
  pf=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X OPTIONS -H "Origin: $o" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' $F/mcp)
  echo "$o GET /health ACAO=[${a#*: }] preflight /mcp=$pf"
done
echo "## receipt block of the oracle_updated event (De6aVqqN)"
R=https://rpc.testnet.fastnear.com
curl -s -m 30 $R -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tx","params":{"tx_hash":"De6aVqqNvfyemXtpuGP6quaUNcZgN2xP6cCXHXEwvfZG","sender_account_id":"nectar.testnet","wait_until":"NONE"}}' > $B/tx2.json
BH=$(node -e 'const x=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).result;const o=x.receipts_outcome.find(o=>o.outcome.logs.some(l=>l.includes("oracle_updated")));console.log(o.block_hash)' $B/tx2.json)
echo "receipt block_hash $BH"
curl -s -m 20 $R -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"block\",\"params\":{\"block_id\":\"$BH\"}}" | grep -o '"height":[0-9]*' | head -1
echo "## host Feed (not touched) still up"; ps -p 56878 -o pid=,etime=
} > $L/checks-d.txt 2>&1
cat $L/checks-d.txt
