#!/bin/bash
set -e
TS=$(date -u +%Y%m%dT%H%M%SZ)
D=/tmp/verify-wo78-$TS
mkdir -p "$D"
git clone -q /Volumes/T7/nectar-labs "$D/nectar-labs"
cd "$D/nectar-labs"
echo "DIR=$D/nectar-labs"
git log --oneline -1
cat scripts/deploy/smoke-prod.sh | head -80
echo ----
/usr/bin/grep -n "^## WO-34 production" docs/EVIDENCE.md | tail -5
