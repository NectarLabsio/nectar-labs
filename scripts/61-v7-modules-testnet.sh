#!/usr/bin/env bash
# One testnet run per remaining v7 module on nectar-core-v2 (evidence before any UI flag flips; copy rule "never live before EVIDENCE"):
#   shield      borrower1 opens a Weekend Shield position (2 NVDAx, window = next calendar open), sized by preview_borrow(shield)
#   profitlock  borrower1 self-settles position #0 from buyer1's opted-in quote (preview first)
#   reserve     buyer2 joins the Nectar Reserve with $10 (Reserve Note minted)
# Owner price is refreshed first (sessions close after 900 s). Testnet only.
source "$(dirname "$0")/_lib.sh"; guard_mainnet
CORE=$(cfg .accounts.core); USDC=$(cfg .accounts.usdc_mock); NVDAX=$(cfg .accounts.nvdax_mock); OWNER=$(cfg .accounts.owner)
B2=$(cfg .accounts.demo.buyer2); BR=$(cfg .accounts.demo.borrower1); PRICE=${PRICE_E6:-150000000}
call() { near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas "${5:-100 Tgas}" attached-deposit "${6:-0 NEAR}" \
  sign-as "$4" network-config testnet sign-with-keychain send </dev/null 2>&1; }
view() { near contract call-function as-read-only "$CORE" "$1" json-args "$2" network-config testnet now </dev/null 2>/dev/null | sed -n '/^[[{"]/,$p'; }
ftc() { call "$1" ft_transfer_call "$(jq -cn --arg r "$CORE" --arg a "$3" --arg m "$4" '{receiver_id:$r, amount:$a, msg:$m}')" "$2" '300 Tgas' '1 yoctoNEAR'; }
events() { grep -oE 'EVENT_JSON:\{[^│]*' | cut -c1-260 || true; }
call "$CORE" update_owner_price "{\"symbol\":\"NVDAx\",\"price_usd_e6\":\"$PRICE\"}" "$OWNER" '30 Tgas' | events

case "${1:-}" in
shield)
  NOW=$(( $(date -u +%s) * 1000000000 ))
  NEXT=$(view get_session_calendar '{"from_index":0,"limit":100}' | jq -r --arg n "$NOW" '[.[] | select((.[0]|tonumber) > ($n|tonumber))][0][0]')
  echo "weekend window_end_ns (next calendar open) = $NEXT"
  call "$NVDAX" mint "{\"account_id\":\"$BR\",\"amount\":\"2000000\"}" "$OWNER" '30 Tgas' >/dev/null
  SH=$(jq -cn --arg e "$NEXT" '{kind:"Weekend", window_end_ns:$e}')
  P=$(view preview_borrow "$(jq -cn --argjson s "$SH" '{symbol:"NVDAx", units:"2000000", borrow_usd_e6:"1", shield:$s}')")
  echo "preview(shield): $(echo "$P" | jq -c '{b_c_usd_e6, total_fees_usd_e6, ok, reason}')"
  B=$(( $(echo "$P" | jq -r '.b_c_usd_e6') * 9 / 10 )); [ "$B" -ge 5000000 ] || { echo "shield limit below \$5 minimum" >&2; exit 2; }
  ftc "$NVDAX" "$BR" 2000000 "$(jq -cn --arg b "$B" --argjson s "$SH" '{LockCollateralAndBorrow:{collateral:"NVDAx", borrow_usd_e6:$b, pre_liq_ltv_bps:7500, shield:$s}}')" | events ;;
capacity)
  # adds committed capacity (buyer2 $5,000 @ 450 bps, below the Reserve discount) so a weekend-sized Shield has headroom
  call "$USDC" mint "{\"account_id\":\"$B2\",\"amount\":\"5000000000\"}" "$OWNER" '30 Tgas' >/dev/null
  ftc "$USDC" "$B2" 5000000000 '{"FundPappusQuote":{"collateral":"NVDAx","max_discount_bps":450,"notice_period_ns":"604800000000000","buyer_remote_recipient":null}}' | events
  echo "capacity: $(view get_exit_capacity '{"symbol":"NVDAx"}' | jq -c '{q_usd_e6, total_debt_usd_e6, aggregate_headroom_usd_e6, session_open}')" ;;
profitlock)
  ID=${2:-0}; echo "preview: $(view preview_self_settle "{\"position_id\":\"$ID\"}" | jq -c '.')"
  call "$CORE" self_settle "{\"position_id\":\"$ID\"}" "$BR" '300 Tgas' '1 yoctoNEAR' | events ;;
reserve)
  call "$USDC" mint "{\"account_id\":\"$B2\",\"amount\":\"10000000\"}" "$OWNER" '30 Tgas' >/dev/null
  ftc "$USDC" "$B2" 10000000 '{"JoinNectarReserve":{"collateral":"NVDAx"}}' | events
  echo "reserve: $(view get_reserve '{"symbol":"NVDAx"}' | jq -c '.')" ;;
*) sed -n '2,6p' "$0"; exit 2 ;;
esac
