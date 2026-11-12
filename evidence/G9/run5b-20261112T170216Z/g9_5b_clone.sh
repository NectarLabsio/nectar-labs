#!/bin/bash
set -e
TS=$(date -u +%Y%m%dT%H%M%SZ)
D=/tmp/verify-G9-5b-$TS
git clone -q /Volumes/T7/nectar-labs "$D"
cd "$D"
git checkout -q 88b99b3
echo "CLONE=$D"
echo "HEAD=$(git rev-parse HEAD)"
echo "--- diff --stat 5f011bb 88b99b3 -- apps packages services contracts (lines):"
git diff --stat 5f011bb 88b99b3 -- apps packages services contracts | wc -l
echo "--- files changed 5f011bb..88b99b3:"
git diff --name-only 5f011bb 88b99b3
echo "--- README lines mentioning EVIDENCE:"
/usr/bin/grep -n -i "EVIDENCE" README.md
echo "--- EVIDENCE headings matching WO-34 / G9 / G3b:"
/usr/bin/grep -n -E "^#+ .*(WO-34|G9|G3b)" docs/EVIDENCE.md
echo "--- EVIDENCE table rows WO-34 / G9 / G3b:"
/usr/bin/grep -n -E "^\| *(WO-34|G9|G3b)" docs/EVIDENCE.md
