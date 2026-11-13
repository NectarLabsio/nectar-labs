#!/usr/bin/env bash
# WO-87 A: copy what exists now to the worktree evidence dir (coordinator stop at 17:06Z), home-path grep, gitleaks.
B=/tmp/verify-wo87-20261113T170125Z
R=$B/repo
L=$B/logs
W=/Volumes/T7/nectar-labs/.claude/worktrees/agent-abaecfcc8f6503a37
E=$W/evidence/WO-87
S=/private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad
mkdir -p $E/probe $E/html $E/scripts
echo "# snapshot copied $(date -u +%FT%TZ); probe + e2e were still running (stopped by coordinator)" > $E/snapshot.txt
cp $L/clone.txt $L/pnpm-i.log $L/prod-smoke-*.log $L/served-html.txt $L/branding.log $L/deploy-logs.txt $L/web-build.log $L/e2e-chrome.log $E/
cp $L/probe/probe.log $L/probe/site-footer-hydrated.png $E/probe/
cp $L/html/*.html $E/html/
cp $R/apps/web/wo87-probe.mjs $E/probe/
cp $S/wo87-a.sh $S/wo87-e2e.sh $S/wo87-b.sh $S/wo87-deploylog.sh $S/wo87-copy.sh $E/scripts/
find $E -name '._*' -delete
/usr/bin/grep -rl -E '[/]Users[/][A-Za-z]' $E && echo "home path hits above" || echo "no home paths in evidence/WO-87"
gitleaks dir $E --no-banner 2>&1 | tail -2
wc -l $E/probe/probe.log $E/e2e-chrome.log | head -3
ls -R $E | head -40
