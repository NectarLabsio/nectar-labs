#!/usr/bin/env bash
# A2 docs: compare asset fingerprints and page bytes of docs.nectarlabs.io with a local docs build of the clone (c95cd0c == b7fa381 under apps/).
cd /tmp/verify-wo67-20261113T0205Z/repo/apps/docs-site
EV=/Volumes/T7/nectar-labs/.claude/worktrees/agent-a120e7a0baaef2f5d/evidence/WO-67/A
OUT=$EV/a2-docs-equivalence-$(date -u +%Y%m%dT%H%M%SZ).log
{
echo "# $(date -u +%FT%TZ). docs.nectarlabs.io vs local build (default env, from README: pnpm --filter docs-site build)"
grep -n "url:\|baseUrl\|DOCS_URL" docusaurus.config.ts | head -8
for p in / /start/quick-start /operations/monitoring /integrate/feed-rest; do
  f=build${p%/}/index.html; [ "$p" = / ] && f=build/index.html
  remote=$(curl -s "https://docs.nectarlabs.io$p" | grep -o '/assets/[a-z]*/[A-Za-z0-9~._-]*\.\(js\|css\)' | sort -u)
  local_=$(grep -o '/assets/[a-z]*/[A-Za-z0-9~._-]*\.\(js\|css\)' "$f" | sort -u)
  echo "== $p  remote assets: $(echo "$remote" | wc -l | tr -d ' ')  local assets: $(echo "$local_" | wc -l | tr -d ' ')  identical: $([ "$remote" = "$local_" ] && echo yes || echo no)"
  [ "$remote" = "$local_" ] || diff <(echo "$remote") <(echo "$local_") | head -6
  echo "   remote html sha256 $(curl -s "https://docs.nectarlabs.io$p" | shasum -a 256 | cut -c1-16)  local $(shasum -a 256 < "$f" | cut -c1-16)"
done
echo "== main bundle bytes"
m=$(grep -o '/assets/js/main\.[a-f0-9]*\.js' build/index.html | head -1); echo "main: $m"
echo "   remote $(curl -s "https://docs.nectarlabs.io$m" | shasum -a 256 | cut -c1-16)  local $(shasum -a 256 < "build$m" | cut -c1-16)"
} > "$OUT" 2>&1
echo "$OUT"; cat "$OUT"
