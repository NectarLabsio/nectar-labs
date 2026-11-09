#!/usr/bin/env bash
# Dry test for .claude/hooks/guard.sh (WO-0 acceptance). Feeds synthetic tool inputs; nothing is executed.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail=0
check() { # expected_exit command
  local want="$1" cmd="$2" got
  printf '{"tool_input":{"command":%s}}' "$(jq -Rn --arg c "$cmd" '$c')" \
    | env -u HUMAN_CONFIRMED bash "$ROOT/.claude/hooks/guard.sh" >/dev/null 2>&1; got=$?
  if [ "$got" = "$want" ]; then echo "ok   exit=$got  $cmd"; else echo "FAIL exit=$got want=$want  $cmd"; fail=1; fi
}
P=push; V=--public; M=mainnet
check 2 "git $P origin main"
check 2 "gh repo create nectar-labs $V"
check 2 "near tokens a.testnet send-near b '1 NEAR' network-config $M sign-with-keychain send"
check 2 "solana airdrop 1 -u$(printf m)"
check 2 "bash scripts/submit.sh"
check 0 "bash scripts/submit.sh --dry-run"
check 2 "near account delete-account foo.testnet beneficiary bar.testnet"
check 2 "echo ed25519:$(printf '3%.0s' $(seq 1 88))"
check 0 "git status"
check 0 "near contract call-function as-read-only a.testnet get_pool json-args {} network-config testnet now"
exit $fail
