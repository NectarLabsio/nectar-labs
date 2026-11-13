#!/usr/bin/env bash
# WO-78 part C: item 5 cites (read-only), copy logs to the worktree evidence dir, gitleaks on it.
B=/tmp/verify-wo78-20261113T142142Z
R=$B/nectar-labs
W=/Volumes/T7/nectar-labs/.claude/worktrees/agent-a64ed60c9cc286f5e
E=$W/evidence/WO-78
L=$B/logs
cd $R
{
echo "## $(date -u +%FT%TZ) item 5 cites (read, not re-run)"
echo "\$ grep G9 run 9 e2e-chrome log"; ls evidence/G9/run9-20261113T141044Z/ | tr '\n' ' '; echo
/usr/bin/grep -h -E "passed|failed" evidence/G9/run9-20261113T141044Z/logs/e2e-chrome.log 2>/dev/null | tail -3
/usr/bin/grep -rh -E "[0-9]+ passed" evidence/G9/run9-20261113T141044Z/ 2>/dev/null | tail -3
echo "\$ prod QA log (orchestrator, self-attested)"; wc -l evidence/WO-74/prod-qa-check-20261113T140705Z.log
/usr/bin/grep -n -i -E "balance|NVDAx|reload|account|privkey|borrow" evidence/WO-74/prod-qa-check-20261113T140705Z.log | cut -c1-200 | head -14
echo "\$ deploy log"; /usr/bin/grep -n -E "dpl_|sha256|READY|Production|1a95022" evidence/WO-34/deploy-web-cli-20261113T135102Z.log | cut -c1-200 | head -10
echo "\$ git log -1 1a95022"; git log --oneline -1 1a95022
echo "\$ git status --porcelain (clone)"; git status --porcelain
} > $L/item5-cites.txt 2>&1
mkdir -p $E/probe
cp $L/prod-smoke-*.log $L/marker.txt $L/clone.txt $L/lighthouse-app-borrow.log $L/lighthouse-summary.txt $L/item5-cites.txt $E/
cp $L/probe/probe.log $L/probe/probe.json $L/probe/app-borrow-hydrated.png $R/apps/web/wo78-probe.mjs $E/probe/
mkdir -p $E/scripts; cp /private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad/{clone,a,b,c}.sh $E/scripts/
for f in $L/m-app/chunks.txt $L/../m-app/sums.txt; do :; done
cp $B/m-app/sums.txt $E/chunk-sums-app.txt; cp $B/m-legacy/sums.txt $E/chunk-sums-legacy.txt
/usr/bin/grep -rl -E '[/]Users[/][A-Za-z]' $E && echo "home path hits above" || echo "no home paths in evidence"
gitleaks dir $E --no-banner 2>&1 | tail -3
cat $L/item5-cites.txt
ls -la $E $E/probe | head -30
