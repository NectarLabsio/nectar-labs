#!/usr/bin/env bash
# Mint MOCK USDC (usdc-mock.nectar.testnet, testnet only) to one demo account — nothing else (40-seed-demo.sh also seeds pool/quotes/positions).
# Usage: scripts/42-mint-usdc.sh <account|buyer1|buyer2|borrower1> <amount_usd_e6>     e.g. scripts/42-mint-usdc.sh buyer2 5000000000   ($5,000)
# Signed by the owner key in the OS keychain.
source "$(dirname "$0")/_lib.sh"; guard_mainnet
USDC=$(cfg .accounts.usdc_mock); OWNER=$(cfg .accounts.owner)
WHO=${1:?account}; AMT=${2:?amount_usd_e6}
case "$WHO" in buyer1|buyer2|borrower1) WHO=$(cfg ".accounts.demo.$WHO");; esac
[[ "$WHO" == *.testnet ]] || { echo "testnet accounts only: $WHO" >&2; exit 3; }
[[ "$AMT" =~ ^[0-9]+$ ]] || { echo "amount must be an integer in e6 units" >&2; exit 2; }
near contract call-function as-transaction "$USDC" mint "{\"account_id\":\"$WHO\",\"amount\":\"$AMT\"}" prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as "$OWNER" network-config testnet sign-with-keychain send </dev/null 2>&1 | grep -E 'succeeded|Error|Failed' | head -2
near contract call-function as-read-only "$USDC" ft_balance_of json-args "{\"account_id\":\"$WHO\"}" network-config testnet now </dev/null 2>/dev/null \
  | sed -n '/^"/p' | sed "s/^/$WHO mock USDC (e6): /"
