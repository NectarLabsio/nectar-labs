#!/bin/bash
# G9 run 9b step 4 probes — public reads only. Usage: bash run9b.sh <clone> <outdir>
set -u
C="$1"; O="$2"; mkdir -p "$O"
cd "$C" || exit 1
{
echo "# repo checks $(date -u +%H:%M:%SZ) HEAD=$(git rev-parse HEAD)"
echo "\$ git diff --stat d863f55 HEAD -- apps packages services contracts"; git diff --stat d863f55 HEAD -- apps packages services contracts; echo "exit=$? (empty above = no product change)"
echo "\$ git diff --stat 1a95022 HEAD -- apps packages"; git diff --stat 1a95022 HEAD -- apps packages; echo "exit=$?"
echo "\$ git diff --stat 37dfec9 HEAD -- services/feed"; git diff --stat 37dfec9 HEAD -- services/feed; echo "exit=$?"
echo "\$ git diff --stat c95cd0c HEAD -- apps/docs-site"; git diff --stat c95cd0c HEAD -- apps/docs-site; echo "exit=$?"
echo "\$ git diff --stat c95cd0c 1a95022 -- apps"; git diff --stat c95cd0c 1a95022 -- apps
for c in 1a95022 c95cd0c 37dfec9 a677689 837cd12 3107a1a 2e16f9b; do printf '%s ' "$c"; git cat-file -t "$c"; done
echo "\$ git diff --stat d863f55 HEAD -- README.md docs/HUMAN_HANDOFF.md docs/EVIDENCE.md"; git diff --stat d863f55 HEAD -- README.md docs/HUMAN_HANDOFF.md docs/EVIDENCE.md
for f in evidence/WO-34/deploy-web-cli-20261113T135102Z.log evidence/WO-34/prod-smoke-20261112T133529Z.log evidence/WO-74/prod-qa-check-20261113T140705Z.log evidence/ops/feed-v2-reindex-20261113T121107Z.log evidence/ops/x402-paid-download-20261113T122853Z.log evidence/WO-71/fields.md; do
  if [ -f "$f" ]; then echo "exists $f ($(wc -l < "$f") lines)"; else echo "MISSING $f"; fi
done
echo "-- deploy log: dpl id / READY / production URL"; /usr/bin/grep -n -E 'dpl_4ExxeLH65Mb2dfWLyaqQFykbpw2K|"readyState": "READY"|Production URL' evidence/WO-34/deploy-web-cli-20261113T135102Z.log | head -5
echo "-- prod-smoke 20261112 summary"; /usr/bin/grep -n -E 'routes|pages|failures' evidence/WO-34/prod-smoke-20261112T133529Z.log | tail -4
echo "-- qa log lines 30, 43, last"; sed -n '30p;43p;$p' evidence/WO-74/prod-qa-check-20261113T140705Z.log | cut -c1-200
echo "-- reindex log: blocks/event/lag"; /usr/bin/grep -n -E '277503800|277503899|277503817|lag' evidence/ops/feed-v2-reindex-20261113T121107Z.log | head -6 | cut -c1-220
echo "-- x402 log: 402/200/rows/tx"; /usr/bin/grep -n -E ' 402| 200|rows|8bXCY34S' evidence/ops/x402-paid-download-20261113T122853Z.log | head -6 | cut -c1-220
echo "-- EVIDENCE G9 run 3 / G14 cites"; /usr/bin/grep -n -E '^### G9 run 3|^### G14' docs/EVIDENCE.md | cut -c1-200
} > "$O/repo-checks.txt" 2>&1

{
echo "# live host probes (public GET/HEAD/OPTIONS only)"
echo "== APP /borrow $(date -u +%H:%M:%SZ)"
curl -sSL -D "$O/borrow-headers.txt" -o "$O/borrow.html" -w 'status=%{http_code} redirects=%{num_redirects} final=%{url_effective}\n' https://testnet.nectarlabs.io/borrow
/usr/bin/grep -i -E '^(age|x-vercel-cache|etag|x-vercel-id|last-modified):' "$O/borrow-headers.txt"
/usr/bin/grep -o -E '/_next/static/[^"]+\.js' "$O/borrow.html" | sort -u > "$O/borrow-chunks.txt"
echo "chunks: $(wc -l < "$O/borrow-chunks.txt")"
: > "$O/chunk-sums.txt"; hits=0
while read -r p; do
  curl -sS -o "$O/chunk.tmp" "https://testnet.nectarlabs.io$p"
  echo "$(shasum -a 256 "$O/chunk.tmp" | cut -c1-64) $p" >> "$O/chunk-sums.txt"
  if /usr/bin/grep -q 'onClaimed' "$O/chunk.tmp"; then
    hits=$((hits+1)); echo "onClaimed in $p:"
    /usr/bin/grep -o -E 'function [A-Za-z_$]+\(\{onClaimed:[a-z]\}=\{\}\)' "$O/chunk.tmp" | head -2
    /usr/bin/grep -o -E '\{onClaimed:[A-Za-z_$]+\.reload\}' "$O/chunk.tmp" | head -2
    /usr/bin/grep -c 'test-assets-connect' "$O/chunk.tmp" | sed 's/^/test-assets-connect count in chunk: /'
  fi
done < "$O/borrow-chunks.txt"
rm -f "$O/chunk.tmp"; echo "chunks with onClaimed: $hits"
echo "== DOCS / $(date -u +%H:%M:%SZ)"
curl -sS -o /dev/null -D - https://docs.nectarlabs.io/ | /usr/bin/grep -i -E '^(HTTP|last-modified|age|x-vercel-cache|etag):'
echo "== DOCS old path"; curl -sS -o /dev/null -w '%{http_code} -> %{redirect_url}\n' 'https://docs.nectarlabs.io/docs/start/quick-start?x=1'
echo "== Status host"; for u in https://status.nectarlabs.io/ https://nectarlabs.io/status https://testnet.nectarlabs.io/status; do printf '%s ' "$u"; curl -sS -o /dev/null -w '%{http_code} -> %{redirect_url}\n' "$u"; done
echo "== SITE /borrow (test assets not on SITE)"; curl -sS -o /dev/null -w '%{http_code} -> %{redirect_url}\n' https://nectarlabs.io/borrow
echo "== legacy hosts"; for h in nectarlabs.vercel.app nectarlabs-app.vercel.app nectar-labs-web.vercel.app nectarlabs-docs.vercel.app nectar-labs-docs.vercel.app; do printf '%s ' "$h"; curl -sS -o /dev/null -w '%{http_code} -> %{redirect_url}\n' "https://$h/feed?y=2"; done
F=https://feed-production-2f2776c9.up.railway.app
echo "== Feed /health x3"
for i in 1 2 3; do printf '%s ' "$(date -u +%H:%M:%SZ)"; curl -sS -m 10 "$F/health"; echo; sleep 3; done
echo "== Feed CORS"
for o in https://nectarlabs.io https://testnet.nectarlabs.io https://status.nectarlabs.io https://docs.nectarlabs.io https://evil.example.com; do
  acao=$(curl -sS -m 10 -o /dev/null -D - -H "Origin: $o" "$F/health" | /usr/bin/grep -i '^access-control-allow-origin:' | tr -d '\r')
  pf=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' -X OPTIONS -H "Origin: $o" -H 'Access-Control-Request-Method: POST' "$F/mcp")
  echo "$o GET-ACAO=[${acao}] preflight-mcp=$pf"
done
} > "$O/live-probes.txt" 2>&1

echo "== smoke-prod $(date -u +%H:%M:%SZ)" > "$O/prod-smoke.log"
scripts/deploy/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io \
  https://nectarlabs.vercel.app=https://nectarlabs.io https://nectarlabs-app.vercel.app=https://testnet.nectarlabs.io \
  https://nectar-labs-web.vercel.app=https://testnet.nectarlabs.io https://nectarlabs-docs.vercel.app=https://docs.nectarlabs.io \
  https://nectar-labs-docs.vercel.app=https://docs.nectarlabs.io >> "$O/prod-smoke.log" 2>&1
echo "smoke exit=$?" >> "$O/prod-smoke.log"
echo "clone status: [$(git status --porcelain)]" >> "$O/repo-checks.txt"
echo done
