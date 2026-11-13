#!/usr/bin/env bash
# A2 docs, second pass: local build with the production env value DOCS_URL=https://docs.nectarlabs.io (config: hosted = Boolean(DOCS_URL)).
cd /tmp/verify-wo67-20261113T0205Z/repo/apps/docs-site
EV=/Volumes/T7/nectar-labs/.claude/worktrees/agent-a120e7a0baaef2f5d/evidence/WO-67/A
OUT=$EV/a2-docs-equivalence-prodenv-$(date -u +%Y%m%dT%H%M%SZ).log
{
echo "# $(date -u +%FT%TZ). DOCS_URL=https://docs.nectarlabs.io npx docusaurus build --out-dir /tmp/verify-wo67-20261113T0205Z/docs-prod"
DOCS_URL=https://docs.nectarlabs.io npx docusaurus build --out-dir /tmp/verify-wo67-20261113T0205Z/docs-prod > /tmp/verify-wo67-20261113T0205Z/logs/docs-build-prodenv.log 2>&1; echo "build exit=$?"
B=/tmp/verify-wo67-20261113T0205Z/docs-prod
n=0; same=0; diffl=""
for loc in $(curl -s https://docs.nectarlabs.io/sitemap.xml | grep -o '<loc>[^<]*</loc>' | sed 's/<[^>]*>//g'); do
  p=${loc#https://docs.nectarlabs.io}; f="$B${p%/}/index.html"; [ "$p" = "/" ] && f="$B/index.html"
  n=$((n+1))
  r=$(curl -s "$loc" | shasum -a 256 | cut -c1-64); l=$(shasum -a 256 < "$f" 2>/dev/null | cut -c1-64)
  if [ "$r" = "$l" ]; then same=$((same+1)); else diffl="$diffl $p"; fi
done
echo "sitemap pages: $n  byte-identical html: $same  differing:$diffl"
m=$(grep -o '/assets/js/main\.[a-f0-9]*\.js' $B/index.html | head -1); rt=$(grep -o '/assets/js/runtime~main\.[a-f0-9]*\.js' $B/index.html | head -1); c=$(grep -o '/assets/css/styles\.[a-f0-9]*\.css' $B/index.html | head -1)
for a in $m $rt $c; do echo "asset $a remote $(curl -s "https://docs.nectarlabs.io$a" | shasum -a 256 | cut -c1-16) local $(shasum -a 256 < "$B$a" | cut -c1-16)"; done
} > "$OUT" 2>&1
echo "$OUT"; cat "$OUT"
