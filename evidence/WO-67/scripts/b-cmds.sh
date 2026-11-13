#!/usr/bin/env bash
# G9 run 6: README quick start commands 3-4 + optional docs build + gitleaks, in the fresh clone.
cd /tmp/verify-wo67-20261113T0205Z/repo
EV=/Volumes/T7/nectar-labs/.claude/worktrees/agent-a120e7a0baaef2f5d/evidence/WO-67/B
L=/tmp/verify-wo67-20261113T0205Z/logs
run() { # name cmd...
  local name=$1; shift
  local s=$(date +%s)
  echo "# $(date -u +%FT%TZ) \$ $*" > "$L/$name.log"
  "$@" >> "$L/$name.log" 2>&1
  local rc=$?
  echo "# exit=$rc seconds=$(( $(date +%s) - s ))" >> "$L/$name.log"
  echo "$name exit=$rc seconds=$(( $(date +%s) - s ))" >> "$L/summary.txt"
}
echo "# G9 run 6 commands, clone $(git rev-parse HEAD), start $(date -u +%FT%TZ)" > "$L/summary.txt"
cp "$L/pnpm-install.log" "$L/pnpm-i.log" 2>/dev/null
run demo-testnet pnpm demo:testnet
run verify pnpm verify
run docs-build pnpm --filter docs-site build
run gitleaks gitleaks detect --log-opts=--all
echo "# end $(date -u +%FT%TZ)" >> "$L/summary.txt"
git status --porcelain | head -20 > "$L/clone-status-after.txt"
cat "$L/summary.txt"
