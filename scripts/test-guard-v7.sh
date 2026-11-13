#!/usr/bin/env bash
# expect: 0 = allowed, 2 = blocked
cd /Volumes/T7/nectar-labs
t() { printf '%s' "{\"tool_input\":{\"command\":$(jq -Rn --arg c "$2" '$c')}}" | env -u HUMAN_CONFIRMED bash .claude/hooks/guard.sh >/dev/null 2>&1; r=$?; [ "$r" = "$1" ] && echo "ok   $r :: $2" || echo "FAIL got $r want $1 :: $2"; }
t 0 'cast send --rpc-url https://sepolia.base.org --chain 84532 --account deployer'
t 2 'cast send --chain 8453 --account deployer'
t 2 'cast call --chain base 0xabc'
t 2 'forge script X --rpc-url https://mainnet.base.org'
t 2 'cast wallet address --private-key abc'
t 2 'curl -X POST https://market.near.ai/api/tasks -d x'
t 0 'curl -s https://market.near.ai/docs'
t 0 'near contract call-function as-read-only x y json-args {} network-config testnet now'
t 2 'git push origin main'
t 2 'bash scripts/submit.sh'
t 0 'bash scripts/submit.sh --dry-run'
