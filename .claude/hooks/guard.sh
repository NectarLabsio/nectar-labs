#!/usr/bin/env bash
# PreToolUse guard for Bash. Reads the tool input JSON on stdin, blocks irreversible or
# public actions unless HUMAN_CONFIRMED=1 is present in the environment (set only by Kunal
# in his own shell, never by an agent). Exit 2 = block with the message shown to the model.
set -euo pipefail
input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -z "$cmd" ] && exit 0

block() { echo "BLOCKED by .claude/hooks/guard.sh: $1. This needs Kunal (see docs/HUMAN_HANDOFF.md). Write the handoff and move on." >&2; exit 2; }

if [ "${HUMAN_CONFIRMED:-0}" != "1" ]; then
  echo "$cmd" | grep -Eq '(^|[;&| ])git push'                               && block "git push"
  echo "$cmd" | grep -Eq 'gh repo (edit|create).*(--visibility|--public)'    && block "repo visibility change"
  echo "$cmd" | grep -Eq 'gh repo create'                                    && block "repo create"
  echo "$cmd" | grep -Eq 'network-config +mainnet|--networkId +mainnet'      && block "NEAR mainnet"
  echo "$cmd" | grep -Eq 'solana .*(-um|--url +(m|mainnet|mainnet-beta))'    && block "Solana mainnet"
  echo "$cmd" | grep -Eq 'anchor deploy.*mainnet'                            && block "Anchor mainnet deploy"
  echo "$cmd" | grep -Eq 'nearhackathon\.com/api.*(-X *POST|--data|-d )'     && block "submission API send"
  echo "$cmd" | grep -Eq 'submit\.sh( |$)' && ! echo "$cmd" | grep -q -- '--dry-run' && block "submit.sh without --dry-run"
  echo "$cmd" | grep -Eq '(twitter|x)\.com/.*(intent|api)|xurl|twurl'        && block "posting to X"
  echo "$cmd" | grep -Eq 'near account delete-account'                       && block "account deletion"
fi

# Secrets never go into the repo in any mode.
echo "$cmd" | grep -Eq 'ed25519:[1-9A-HJ-NP-Za-km-z]{80,}' && block "a private key appears in the command"
exit 0
