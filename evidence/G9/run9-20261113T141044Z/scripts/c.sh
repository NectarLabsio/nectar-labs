#!/usr/bin/env bash
# G9 run 9 part C: public URL note, production release check (WO-74 onClaimed marker), hosted Feed /health + CORS, RPC claims, smoke-prod.
B=/tmp/verify-G9-r9-20261113T141500Z
cd $B/repo
L=$B/logs
{
echo "## $(date -u +%FT%TZ) public URL (README:82) vs the local commit"
echo "\$ curl -s https://api.github.com/repos/NectarLabsio/nectar-labs (no token)"
curl -s -m 20 https://api.github.com/repos/NectarLabsio/nectar-labs | grep -E '"(full_name|private|visibility|default_branch|pushed_at)"'
echo "\$ GIT_TERMINAL_PROMPT=0 git -c credential.helper= ls-remote https://github.com/NectarLabsio/nectar-labs.git"
GIT_TERMINAL_PROMPT=0 git -c credential.helper= ls-remote https://github.com/NectarLabsio/nectar-labs.git; echo "(exit $?)"
echo "\$ git diff --stat b6d6f41 HEAD -- apps packages services contracts scripts/deploy"; git diff --stat b6d6f41 HEAD -- apps packages services contracts scripts/deploy; echo "(exit $?)"
echo "\$ git diff --stat c95cd0c HEAD -- apps/web | tail -4"; git diff --stat c95cd0c HEAD -- apps/web | tail -4
echo "\$ git diff --stat c95cd0c HEAD -- apps/docs-site | tail -1"; git diff --stat c95cd0c HEAD -- apps/docs-site | tail -1; echo "(exit $?)"
echo "\$ git diff --stat 37dfec9 HEAD -- services/feed"; git diff --stat 37dfec9 HEAD -- services/feed; echo "(exit $?)"
echo "\$ git log --oneline 1a95022 -1; merge-base check 1a95022 ancestor of HEAD"; git log --oneline -1 1a95022; git merge-base --is-ancestor 1a95022 HEAD && echo "1a95022 is an ancestor of HEAD"
} > $L/public-repo.txt 2>&1

{
echo "## $(date -u +%FT%TZ) production release check: does APP /borrow ship the WO-74 'onClaimed' path?"
A=https://testnet.nectarlabs.io
curl -s -m 30 $A/borrow -o $B/borrow.html
grep -o -E '/_next/static/[^"]+\.js[^"]*' $B/borrow.html | sort -u > $B/chunks.txt
echo "chunks referenced by $A/borrow: $(wc -l < $B/chunks.txt)"
echo "dpl ids in /borrow HTML: $(grep -o -E 'dpl_[A-Za-z0-9]+' $B/borrow.html | sort -u | tr '\n' ' ')"
n=0; for c in $(cat $B/chunks.txt); do curl -s -m 30 "$A$c" -o $B/chunk.js; if grep -q onClaimed $B/chunk.js; then echo "onClaimed in $c: $(grep -o -E '.{60}onClaimed.{80}' $B/chunk.js | head -2 | tr '\n' ' ')"; n=$((n+1)); fi; if grep -q test-assets-connect $B/chunk.js; then echo "test-assets-connect marker in $c"; fi; done
echo "chunks with onClaimed: $n"
echo "\$ curl -sI $A/borrow"; curl -sI -m 20 $A/borrow | grep -i -E '^(x-vercel-id|x-vercel-cache|age|etag|last-modified|date|x-matched-path):' | tr -d '\r'
echo "\$ docs host headers (docs unchanged since release 4?)"; curl -sI -m 20 https://docs.nectarlabs.io/ | grep -i -E '^(x-vercel-cache|age|etag|last-modified|date):' | tr -d '\r'
echo "\$ landing (SITE) dpl ids"; curl -s -m 30 https://nectarlabs.io/ | grep -o -E 'dpl_[A-Za-z0-9]+' | sort -u | tr '\n' ' '; echo
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

cat $L/public-repo.txt; echo; cat $L/prod-release.txt | cut -c1-400; echo; cut -c1-600 $L/hosted-claims.txt; echo; tail -n 4 $L/prod-smoke.log
