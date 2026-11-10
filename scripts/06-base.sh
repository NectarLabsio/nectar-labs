#!/usr/bin/env bash
# P2b (addendum §9, D-026): Foundry keystores for the Base spoke — deployer, keeper, borrower1, buyer1 — under ~/.nectar/evm (0700), one random
# password file (0600). Prints addresses only. Keys are never passed with --private-key (guard, H-GUARD-V7) and never printed.
source "$(dirname "$0")/_lib.sh"; guard_mainnet
D="$HOME/.nectar/evm"; PW="$D/password"
mkdir -p "$D" && chmod 700 "$D"
[ -f "$PW" ] || { ( umask 077; openssl rand -hex 24 > "$PW" ); }
chmod 600 "$PW"
for name in deployer keeper borrower1 buyer1; do
  [ -f "$D/$name" ] || cast wallet new "$D" "$name" --unsafe-password "$(cat "$PW")" >/dev/null
  chmod 600 "$D/$name"
  echo "$name $(cast wallet address --keystore "$D/$name" --password-file "$PW")"
done
