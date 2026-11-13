#!/usr/bin/env bash
# RUNBOOK standing duty 1, automated: keep the owner (fallback) oracle price fresh by re-asserting the CURRENT on-chain price before it
# passes max_age_s_closed (86,400 s; config.yaml). It never changes the price: it reads oracle_price_usd_e6 and sends that same value.
# Only acts while oracle_source is "Owner". Signs as $OWNER through the OS keychain (no key file read here). Testnet only.
# Usage (host, background): scripts/ops/refresh-owner-price.sh >> evidence/ops/owner-price-refresher-<ts>.log 2>&1
set -uo pipefail
CORE="${CORE:-nectar-core-v2.nectar.testnet}"; OWNER="${OWNER:-nectar.testnet}"; SYMBOL="${SYMBOL:-NVDAx}"
REFRESH_AFTER_S="${REFRESH_AFTER_S:-43200}"   # refresh once older than 12 h (half the closed-session max age)
CHECK_EVERY_S="${CHECK_EVERY_S:-1800}"        # look every 30 min
while true; do
  ts=$(date -u +%FT%TZ)
  out=$(near contract call-function as-read-only "$CORE" get_exit_capacity json-args "{\"symbol\":\"$SYMBOL\"}" network-config testnet now 2>&1)
  age=$(printf %s "$out" | grep -o '"oracle_age_s": "[0-9]*"' | grep -o '[0-9][0-9]*' | head -1)
  price=$(printf %s "$out" | grep -o '"oracle_price_usd_e6": "[0-9]*"' | grep -o '[0-9][0-9]*' | head -1)
  src=$(printf %s "$out" | grep -o '"oracle_source": "[A-Za-z]*"' | sed -E 's/.*"([A-Za-z]+)"$/\1/')
  if [ -z "${age:-}" ] || [ -z "${price:-}" ]; then
    echo "$ts read_failed"
  elif [ "$src" != "Owner" ]; then
    echo "$ts skip oracle_source=$src"
  elif [ "$age" -ge "$REFRESH_AFTER_S" ]; then
    r=$(near contract call-function as-transaction "$CORE" update_owner_price json-args "{\"symbol\":\"$SYMBOL\",\"price_usd_e6\":\"$price\"}" \
      prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-keychain send 2>&1)
    tx=$(printf %s "$r" | grep -o 'Transaction ID: [A-Za-z0-9]*' | head -1)
    if printf %s "$r" | grep -q 'succeeded'; then echo "$ts refreshed price=$price age_was=$age ${tx}"; else echo "$ts refresh_failed age=$age"; fi
  else
    echo "$ts fresh age=$age price=$price"
  fi
  sleep "$CHECK_EVERY_S"
done
