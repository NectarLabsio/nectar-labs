#!/bin/bash
# Copy G3b run 7 evidence from the fresh clone into the verifier worktree (one screenshot only).
set -u
D=/tmp/verify-G3b-20261112T1530Z
WT=/Volumes/T7/nectar-labs/.claude/worktrees/agent-a686c515d360a1405
OUT=$WT/evidence/G3b/verifier-rerun7-20261112T1530Z
SP=/private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad
mkdir -p "$OUT/crawl"
cd "$D/ev" || exit 1
for f in *; do [ -f "$f" ] && case "$f" in *.png) ;; *) cp "$f" "$OUT/";; esac; done
cp crawl/crawl.json crawl/crawl.md "$OUT/crawl/"
cp sel/selector-visibility.json "$OUT/selector-visibility.json"
cp chains-hydrated-desktop.png "$WT/evidence/G3b/chains-hydrated-20261112T1530Z.png"
cp "$D.logs/run-master.log" "$D.logs/clone.log" "$SP/r7-setup.sh" "$SP/r7-copy.sh" "$OUT/"
cp "$D/apps/web/test-results/remote-Solana-remote-borro-2c406-t-→-OutLayer-confirm-failed-phone/error-context.md" "$OUT/flaky-remote-199-phone-error-context.md" 2>/dev/null
curl -s -o /dev/null -w 'GET / -> %{http_code}\n' --max-time 15 https://feed-production-2f2776c9.up.railway.app/ > "$OUT/feed-root-probe.txt"
curl -s -o /dev/null -w 'GET /health -> %{http_code}\n' --max-time 15 https://feed-production-2f2776c9.up.railway.app/health >> "$OUT/feed-root-probe.txt"
date -u +'probed %Y-%m-%dT%H:%M:%SZ' >> "$OUT/feed-root-probe.txt"
find "$WT/evidence/G3b" -name '._*' -delete
du -sh "$OUT"; ls "$OUT" | wc -l; cat "$OUT/feed-root-probe.txt"
lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -E ':(8545|878[89]|879[01]) ' | awk '{print $1,$9}'
