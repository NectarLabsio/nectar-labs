#!/usr/bin/env bash
# G9 run 8 part C: public/anonymous repo proof, hosted Feed /health + CORS, production release check (WO-74 marker), smoke-prod, RPC claims, payload keys.
B=/tmp/verify-G9-r8-20261113T134430Z
cd $B/repo
L=$B/logs
{
echo "## $(date -u +%FT%TZ) anonymous access"
echo "\$ curl -s https://api.github.com/repos/NectarLabsio/nectar-labs (no token)"
curl -s -m 20 https://api.github.com/repos/NectarLabsio/nectar-labs | grep -E '"(full_name|private|visibility|default_branch|pushed_at|size)"'
echo "\$ GIT_TERMINAL_PROMPT=0 git -c credential.helper= ls-remote https://github.com/NectarLabsio/nectar-labs.git"
GIT_TERMINAL_PROMPT=0 git -c credential.helper= ls-remote https://github.com/NectarLabsio/nectar-labs.git; echo "(exit $?)"
echo "\$ git diff --stat d92a199 HEAD -- apps packages services contracts"; git diff --stat d92a199 HEAD -- apps packages services contracts
echo "\$ git diff --stat c95cd0c HEAD -- apps contracts | tail -1"; git diff --stat c95cd0c HEAD -- apps contracts | tail -1
echo "\$ git diff --stat 37dfec9 HEAD -- services/feed"; git diff --stat 37dfec9 HEAD -- services/feed; echo "(exit $?)"
echo "\$ git tag -l; git branch -a"; git tag -l; git branch -a
} > $L/public-repo.txt 2>&1

{
echo "## $(date -u +%FT%TZ) production release check: does APP /borrow ship the WO-74 'onClaimed' prop?"
A=https://testnet.nectarlabs.io
curl -s -m 30 $A/borrow -o $B/borrow.html
grep -o -E '/_next/static/[^"]+\.js' $B/borrow.html | sort -u > $B/chunks.txt
echo "chunks referenced by $A/borrow: $(wc -l < $B/chunks.txt)"
n=0; for c in $(cat $B/chunks.txt); do if curl -s -m 30 "$A$c" | grep -q onClaimed; then echo "onClaimed in $c"; n=$((n+1)); fi; done
echo "chunks with onClaimed: $n"
echo "TestAssets marker present in some chunk: $(for c in $(cat $B/chunks.txt); do curl -s -m 30 "$A$c" | grep -l -E 'test-assets-connect' >/dev/null && echo yes; done | sort -u)"
echo "\$ curl -sI $A/borrow | x-vercel-id / age / etag"; curl -sI -m 20 $A/borrow | grep -i -E '^(x-vercel-id|x-vercel-cache|age|etag|last-modified|date):' | tr -d '\r'
} > $L/prod-release.txt 2>&1

{
echo "## $(date -u +%FT%TZ) hosted Feed"
F=https://feed-production-2f2776c9.up.railway.app
for i in 1 2 3; do echo "\$ curl -s $F/health ($(date -u +%T)Z)"; curl -s -m 20 $F/health; echo; sleep 4; done
echo "## CORS ($(date -u +%T)Z)"
for o in https://nectarlabs.io https://testnet.nectarlabs.io https://status.nectarlabs.io https://docs.nectarlabs.io https://evil.example.com; do
  a=$(curl -s -m 20 -D - -o /dev/null -H "Origin: $o" $F/health | grep -i -E '^access-control-allow-origin' | tr -d '\r')
  pf=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X OPTIONS -H "Origin: $o" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' $F/mcp)
  echo "$o GET /health ACAO=[${a#*: }] preflight /mcp=$pf"
done
R=https://rpc.testnet.fastnear.com
for t in "8bXCY34SVYv5b7vJ4GLfWkbJtQdqbSSBJsrzPCE75XRk x402-relayer.nectar.testnet" "De6aVqqNvfyemXtpuGP6quaUNcZgN2xP6cCXHXEwvfZG nectar.testnet"; do
  set -- $t
  echo "\$ RPC tx $1 sender $2"
  curl -s -m 30 $R -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tx\",\"params\":{\"tx_hash\":\"$1\",\"sender_account_id\":\"$2\",\"wait_until\":\"NONE\"}}" > $B/tx.json
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(r.error){console.log("error",JSON.stringify(r.error).slice(0,300));process.exit()}const x=r.result;console.log("status",JSON.stringify(x.status).slice(0,80),"signer",x.transaction.signer_id,"receiver",x.transaction.receiver_id);for(const o of x.receipts_outcome)for(const l of o.outcome.logs)console.log("  log",o.outcome.executor_id,l.slice(0,200))' $B/tx.json
done
} > $L/hosted-claims.txt 2>&1

s=$(date +%s)
scripts/deploy/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io \
  https://nectarlabs.vercel.app=https://nectarlabs.io https://nectarlabs-app.vercel.app=https://testnet.nectarlabs.io \
  https://nectar-labs-web.vercel.app=https://testnet.nectarlabs.io https://nectarlabs-docs.vercel.app=https://docs.nectarlabs.io \
  https://nectar-labs-docs.vercel.app=https://docs.nectarlabs.io > $L/prod-smoke.log 2>&1
echo "# exit=$? seconds=$(( $(date +%s) - s ))" >> $L/prod-smoke.log

{
echo "## payload keys"
grep -E '^\{' $L/build-submission.log | head -1 > $B/payload.json
node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log("keys",Object.keys(p).join(","));console.log("website" in p?"website PRESENT":"website absent");console.log("tracks",JSON.stringify(p.tracks));console.log("projectUrl",JSON.stringify(p.projectUrl));console.log("TODO fields",Object.entries(p).filter(([k,v])=>String(v).includes("TODO-H")).map(([k,v])=>k+"="+String(v).match(/TODO-H\d+/)[0]).join(" "))' $B/payload.json
echo "## web tests"; grep -E "apps/web test: ℹ (tests|pass|fail|skipped)" $L/verify.log
echo "## verify per-package pass/fail lines"; grep -E "test: ℹ (pass|fail) " $L/verify.log | sed -E 's/ +/ /g' | head -20
echo "## host Feed (not touched) still up"; ps -p 56878 -o pid=,etime=
} > $L/checks-c.txt 2>&1

cat $L/public-repo.txt; echo; cat $L/prod-release.txt; echo; cut -c1-700 $L/hosted-claims.txt; echo; tail -n 6 $L/prod-smoke.log; echo; cat $L/checks-c.txt
