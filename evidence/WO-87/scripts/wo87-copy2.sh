#!/usr/bin/env bash
# WO-87 A: copy Lighthouse + e2e (3100) logs and the finished probe into the worktree evidence dir; home-path grep; gitleaks.
L=/tmp/verify-wo87-20261113T170125Z/logs
E=/Volumes/T7/nectar-labs/.claude/worktrees/agent-abaecfcc8f6503a37/evidence/WO-87
S=/private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad
cp $L/lighthouse-site.log $L/lighthouse-app.log $L/lighthouse-docs.log $L/lighthouse-summary.txt $L/lighthouse-docs-light-contrast.txt $L/e2e-chrome-3100.log $E/
cp $L/probe/probe.log $L/probe/probe.json $E/probe/
cp $S/wo87-e2e2.sh $S/wo87-copy2.sh $E/scripts/
find $E -name '._*' -delete
/usr/bin/grep -rl -E '[/]Users[/][A-Za-z]' $E && echo "home path hits above" || echo "no home paths in evidence/WO-87"
gitleaks dir $E --no-banner 2>&1 | tail -1
tail -2 $E/probe/probe.log
