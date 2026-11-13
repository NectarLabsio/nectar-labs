#!/usr/bin/env bash
# G9 run 9 part E: payload keys, host Feed untouched, clone status, copy logs + scripts to the worktree evidence dir.
B=/tmp/verify-G9-r9-20261113T141500Z
cd $B/repo
L=$B/logs
{
echo "## payload keys"
grep -E '^\{' $L/build-submission.log | head -1 > $B/payload.json
node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log("keys",Object.keys(p).join(","));console.log("website" in p?"website PRESENT":"website absent");console.log("tracks",JSON.stringify(p.tracks));console.log("projectUrl",JSON.stringify(p.projectUrl));console.log("TODO fields",Object.entries(p).filter(([k,v])=>String(v).includes("TODO-H")).map(([k,v])=>k+"="+String(v).match(/TODO-H\d+/)[0]).join(" "))' $B/payload.json
echo "## host Feed (not touched) still up"; ps -p 56878 -o pid=,etime=
echo "## clone status after all parts"; git status --porcelain | head; echo "(end)"
echo "## e2e summary"; grep -E "passed|failed|flaky|skipped|Running|chrom|headless" $L/e2e.log | head -8
} > $L/checks-e.txt 2>&1
cat $L/checks-e.txt
D=/Volumes/T7/nectar-labs/.claude/worktrees/agent-acd39c8e5fce49b34/evidence/G9/run9-20261113T141044Z
mkdir -p $D/scripts
for f in $(ls $L); do case $f in host-grep.txt) gzip -c $L/$f > $D/host-grep.txt.gz;; *) cp $L/$f $D/;; esac; done
cp /private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad/{a,b,b2,c,d,e}.sh $D/scripts/
echo "redaction check (expanded home paths in copied logs):"; grep -l -r -E '[/]Users[/][A-Za-z]' $D | head
ls $D | tr '\n' ' '
