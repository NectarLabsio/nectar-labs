#!/usr/bin/env bash
# G9 run 7 part A: pnpm i, demo:testnet, verify, docs build, gitleaks (fresh clone)
B=/tmp/verify-G9-r7-20261113T123302Z
mkdir -p $B/logs
cd $B/repo
L=$B/logs
run() { local name=$1; shift; local s=$(date +%s)
  echo "# $(date -u +%FT%TZ) \$ $*" > "$L/$name.log"
  "$@" >> "$L/$name.log" 2>&1; local rc=$?
  echo "# exit=$rc seconds=$(( $(date +%s) - s ))" >> "$L/$name.log"
  echo "$name exit=$rc seconds=$(( $(date +%s) - s ))" >> "$L/summary.txt"; }
echo "# G9 run 7 commands, clone $(git rev-parse HEAD), start $(date -u +%FT%TZ)" > "$L/summary.txt"
run pnpm-i pnpm i
run demo-testnet pnpm demo:testnet
run verify pnpm verify
run docs-build pnpm --filter docs-site build
run gitleaks gitleaks detect --log-opts=--all
echo "# end $(date -u +%FT%TZ)" >> "$L/summary.txt"
git status --porcelain | head -20 > "$L/clone-status-after.txt"
cat "$L/summary.txt"
