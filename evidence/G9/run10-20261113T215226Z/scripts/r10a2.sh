#!/usr/bin/env bash
# G9 run 10 part A2: default FastNear RPC answered -429 for list_positions / get_health; re-run with README's documented override (NEAR_RPC_URL), WO-97 names rpc.testnet.near.org.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
C=/tmp/g9-run10-20261113T215226Z
L=$C.logs
cd $C
run() { local name=$1; shift; local s=$(date +%s)
  echo "# $(date -u +%FT%TZ) \$ NEAR_RPC_URL=$NEAR_RPC_URL $*" > "$L/$name.log"
  "$@" >> "$L/$name.log" 2>&1; local rc=$?
  echo "# exit=$rc seconds=$(( $(date +%s) - s ))" >> "$L/$name.log"
  echo "$name exit=$rc seconds=$(( $(date +%s) - s ))" >> "$L/summary.txt"; }
echo "# part A2 start $(date -u +%FT%TZ): re-run with NEAR_RPC_URL=https://rpc.testnet.near.org (README: override with NEAR_RPC_URL)" >> "$L/summary.txt"
export NEAR_RPC_URL=https://rpc.testnet.near.org
run demo-testnet-2 pnpm demo:testnet
sleep 3
run verify-2 pnpm verify
echo "# end A2 $(date -u +%FT%TZ)" >> "$L/summary.txt"
git status --porcelain > "$L/clone-status-after-a2.txt"
tail -n 5 "$L/summary.txt"
grep -v '^$' "$L/demo-testnet-2.log" | tail -n 25 | cut -c1-200
grep -E 'RPC read failed|ELIFECYCLE|# exit=' "$L/verify-2.log" | cut -c1-200
