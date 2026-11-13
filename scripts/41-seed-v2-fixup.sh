#!/usr/bin/env bash
# One-off repair of the 2026-11-10 v2 seed (buyer1's quote was refunded as "invalid msg" by an escaping bug in 40-seed-demo.sh, since fixed):
# funds buyer1's $10,000 quote (opted into voluntary fills), then opens position #1 for borrower1 (100 more NVDAx) sized by preview_borrow.
# Idempotent guard: skips the quote if a 250 bps quote from buyer1 already exists.
source "$(dirname "$0")/_lib.sh"; guard_mainnet
CORE=$(cfg .accounts.core); USDC=$(cfg .accounts.usdc_mock); NVDAX=$(cfg .accounts.nvdax_mock); OWNER=$(cfg .accounts.owner)
B1=$(cfg .accounts.demo.buyer1); BR=$(cfg .accounts.demo.borrower1); SEVEN_DAYS_NS=604800000000000
call() { near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas "${5:-100 Tgas}" attached-deposit "${6:-0 NEAR}" \
  sign-as "$4" network-config testnet sign-with-keychain send </dev/null; }
view() { near contract call-function as-read-only "$CORE" "$1" json-args "$2" network-config testnet now </dev/null 2>/dev/null | sed -n '/^[[{]/,/^[]}]/p'; }
ftc() { call "$1" ft_transfer_call "$(jq -cn --arg r "$CORE" --arg a "$3" --arg m "$4" '{receiver_id:$r, amount:$a, msg:$m}')" "$2" '300 Tgas' '1 yoctoNEAR'; }
if view list_quotes '{"symbol":"NVDAx","from_index":0,"limit":20}' | jq -e --arg b "$B1" '.[] | select(.buyer == $b and .max_discount_bps == 250)' >/dev/null; then
  echo "buyer1 quote exists; skip"
else
  ftc "$USDC" "$B1" 10000000000 "$(jq -cn --arg n "$SEVEN_DAYS_NS" '{FundPappusQuote:{collateral:"NVDAx", max_discount_bps:250, notice_period_ns:$n, buyer_remote_recipient:null, accepts_voluntary_fills:true}}')"
fi
call "$NVDAX" mint "{\"account_id\":\"$BR\",\"amount\":\"100000000\"}" "$OWNER" '30 Tgas'
call "$CORE" update_owner_price '{"symbol":"NVDAx","price_usd_e6":"180000000"}' "$OWNER" '30 Tgas'
BC=$(view preview_borrow '{"symbol":"NVDAx","units":"100000000","borrow_usd_e6":"11250000000"}' | jq -r '.b_c_usd_e6')
echo "position #1 borrow sized to $BC e6"
ftc "$NVDAX" "$BR" 100000000 "$(jq -cn --arg b "$BC" '{LockCollateralAndBorrow:{collateral:"NVDAx", borrow_usd_e6:$b, pre_liq_ltv_bps:7500}}')"
