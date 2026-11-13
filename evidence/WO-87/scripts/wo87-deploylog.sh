#!/usr/bin/env bash
# WO-87 A: read the orchestrator deploy logs committed in 345445a (clone is checked out at c9fd56b, so read via git show).
B=/tmp/verify-wo87-20261113T170125Z
R=$B/repo
L=$B/logs
cd $R
{
echo "# $(date -u +%FT%TZ) deploy logs from 345445a (git show), read only"
for f in evidence/WO-34/deploy-web-cli-20261113T165654Z.log evidence/WO-34/deploy-docs-cli-20261113T165742Z.log; do
  echo "== $f ($(git show 345445a:$f | wc -l | tr -d ' ') lines)"
  git show 345445a:$f | /usr/bin/grep -n -i -E "dpl_|sha256|readyState|Production URL|\"target\"|c9fd56b|tarball|commit" | cut -c1-200 | head -10
done
echo "== evidence/WO-34/prod-smoke-custom-20261113T165911Z.log (orchestrator)"
git show 345445a:evidence/WO-34/prod-smoke-custom-20261113T165911Z.log | tail -2
} > $L/deploy-logs.txt 2>&1
cat $L/deploy-logs.txt
