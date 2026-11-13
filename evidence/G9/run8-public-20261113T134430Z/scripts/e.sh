#!/usr/bin/env bash
# G9 run 8 part E: verify per-package counts, hosted Feed commit, gitleaks commit count vs non-merge commits, clone status, copy logs to the worktree.
B=/tmp/verify-G9-r8-20261113T134430Z
cd $B/repo
L=$B/logs
{
echo "## verify per-package counts"
grep -E "test: (# |ℹ )(tests|pass|fail|skipped) [0-9]+" $L/verify.log | sed -E 's/ +/ /g'
grep -E "check-no-branding|ok 28 - real nectar-core-v2" $L/verify.log | head -3 | cut -c1-160
echo "## hosted Feed commit"
curl -s -m 20 https://feed-production-2f2776c9.up.railway.app/health | grep -o -E '"commit":"[0-9a-f]+"|"events_indexed":[0-9]+'
echo "## commits: all / non-merge (gitleaks scanned 553)"
git rev-list --count --all; git rev-list --count --no-merges --all
echo "## clone status after all parts"; git status --porcelain | head; echo "(end)"
echo "## demo-testnet open positions"; grep -E "Open" $L/demo-testnet.log | cut -c1-60 | tr '\n' ' '; echo
} > $L/checks-e.txt 2>&1
cat $L/checks-e.txt
D=/Volumes/T7/nectar-labs/.claude/worktrees/agent-a75983bbc1b1f885c/evidence/G9/run8-public-20261113T134430Z
for f in $(ls $L); do case $f in host-grep.txt) gzip -c $L/$f > $D/host-grep.txt.gz;; *) cp $L/$f $D/;; esac; done
ls $D | tr '\n' ' '
