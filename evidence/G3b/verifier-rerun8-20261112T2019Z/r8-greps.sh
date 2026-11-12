#!/bin/bash
# G3b run 8 (k) + (o) review helpers (read-only git grep in the fresh clone).
D=/tmp/verify-G3b-r8-20261112T2019Z
cd "$D" || exit 1
echo "== (k) git grep -l /Users/ (non-sha lines)"; /usr/bin/grep -v '^[0-9a-f]\{64\}' ev/k-git-grep.log
echo "== (k) strict hits with line"; git grep -n '/Users/[A-Za-z]' -- ':!*.wasm' | cut -c1-220
echo "== (k) /Users/ hits outside wasm, with line"; git grep -n "/Users/" -- ':!*.wasm' | cut -c1-200 | head -20
echo "== (o) files by hit count"; cut -d: -f1 ev/o-git-grep.log | sort | uniq -c | sort -rn
