#!/bin/bash
set -u
D=/tmp/verify-G3b-r7b-20261112T1614Z
O=/Volumes/T7/nectar-labs/.claude/worktrees/agent-aad22b182b741c9ae/evidence/G3b/verifier-rerun7b-20261112T1614Z
mkdir -p "$O"
cp -R "$D/ev/." "$O/"
cp /private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad/r7b-master.log "$O/run-master.log"
cp /private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad/r7b-copy.sh "$O/"
find "$O" -name '._*' -delete
du -sh "$O"; ls "$O" "$O/crawl"
echo "node $(node -v) pnpm $(pnpm -v)"
