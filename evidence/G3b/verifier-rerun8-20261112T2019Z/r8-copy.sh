#!/bin/bash
# Copy G3b run 8 evidence from the fresh clone into the verifier worktree (one screenshot only).
set -u
D=/tmp/verify-G3b-r8-20261112T2019Z
WT=/Volumes/T7/nectar-labs/.claude/worktrees/agent-aeacf67e814dd2aa3
OUT=$WT/evidence/G3b/verifier-rerun8-20261112T2019Z
SP=/private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad
mkdir -p "$OUT/crawl" "$OUT/n" "$OUT/m"
cd "$D/ev" || exit 1
for f in *; do [ -f "$f" ] && case "$f" in *.png) ;; *) cp "$f" "$OUT/";; esac; done
cp crawl/crawl.json crawl/crawl.md "$OUT/crawl/"
cp sel/selector-visibility.json "$OUT/selector-visibility.json"
cp m/* "$OUT/m/"
for f in cargo-phase.txt chain-views.json chain-views.log mockft-built.sha256 mockft-test-sdkroot.log workspace-summary.txt cargo-master.log git-status-after-build.txt fixture-archival.log fixture-archival.mjs chain-views.mjs; do cp "n/$f" "$OUT/n/" 2>/dev/null; done
tail -30 n/mockft-test.log > "$OUT/n/mockft-test-default-sdk.tail.log"
tail -30 n/mockft-build.log > "$OUT/n/mockft-build-default-sdk.tail.log"
tail -12 n/workspace-test.log > "$OUT/n/workspace-test-default-sdk.tail.log"
/usr/bin/grep -E '^test |Running |^test result:|panicked|FAILED' n/workspace-test-sdkroot.log | /usr/bin/grep -v EVENT_JSON > "$OUT/n/workspace-tests-list.log"
cp claims-how.png "$WT/evidence/G3b/claims-how-20261112T2019Z.png"
cp "$D.logs/run-master.log" "$D.logs/clone.log" "$D.logs/cargo2-master.log" "$SP/r8-copy.sh" "$SP/r8-greps.sh" "$SP/r8-paramgrep.sh" "$OUT/"
(cd "$D" && git status --porcelain | wc -l | tr -d ' ' > "$OUT/clone-tracked-changes.txt"; git status --porcelain | cut -c4- | sed 's#/[^/]*$##' | sort | uniq -c >> "$OUT/clone-tracked-changes.txt")
find "$WT/evidence/G3b" -name '._*' -delete
du -sh "$OUT"; ls "$OUT" | wc -l
lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | /usr/bin/grep -E ':(8545|878[89]|879[01]|398[0-9]) ' | awk '{print $1,$9}'
