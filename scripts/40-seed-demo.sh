#!/usr/bin/env bash
# WO-6 seed: the PRD demo pre-state, numbers = contracts/nectar-core/tests/model.csv demo_* rows.
#   pool $50,000 (owner) · quote #0 buyer1 $10,000 @ 250 bps · quote #1 buyer2 $5,000 @ 400 bps (7-day notice, D-009)
#   borrower1 locks 100 NVDAx at $180 and borrows $11,250 (= B_c; static limit $7,200) with pre_liq_ltv 7,500 bps.
# Demo control (disclosed): `update_owner_price NVDAx 155/140` makes the position triggerable (model rows demo_price_*).
source "$(dirname "$0")/_lib.sh"; guard_mainnet
CORE=$(cfg .accounts.core); USDC=$(cfg .accounts.usdc_mock); NVDAX=$(cfg .accounts.nvdax_mock); OWNER=$(cfg .accounts.owner)
B1=$(cfg .accounts.demo.buyer1); B2=$(cfg .accounts.demo.buyer2); BR=$(cfg .accounts.demo.borrower1)
for v in CORE USDC NVDAX OWNER B1 B2 BR; do need "$v"; done
SEVEN_DAYS_NS=604800000000000
call() { # contract method args signer [gas] [deposit]
  near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas "${5:-100 Tgas}" \
    attached-deposit "${6:-0 NEAR}" sign-as "$4" network-config testnet sign-with-keychain send </dev/null; }
ftc() { # token signer amount msg_json  (ft_transfer_call, 1 yocto, F-013)
  call "$1" ft_transfer_call "$(jq -cn --arg r "$CORE" --arg a "$3" --arg m "$4" '{receiver_id:$r, amount:$a, msg:$m}')" "$2" '300 Tgas' '1 yoctoNEAR'; }

log "register accounts on both mocks (shim accepts 0 deposit; F-013 storage note)"
for a in "$CORE" "$OWNER" "$B1" "$B2" "$BR"; do
  for t in "$USDC" "$NVDAX"; do call "$t" storage_deposit '{"account_id":"'$a'"}' "$OWNER" '30 Tgas' '0 NEAR'; done
done
log "mint mocks (owner-only faucet)"
call "$USDC"  mint '{"account_id":"'$OWNER'","amount":"50000000000"}' "$OWNER" '30 Tgas'
call "$USDC"  mint '{"account_id":"'$B1'","amount":"10000000000"}' "$OWNER" '30 Tgas'
call "$USDC"  mint '{"account_id":"'$B2'","amount":"5000000000"}' "$OWNER" '30 Tgas'
call "$USDC"  mint '{"account_id":"'$BR'","amount":"1000000000"}' "$OWNER" '30 Tgas'     # $1,000 for repay demo
call "$NVDAX" mint '{"account_id":"'$BR'","amount":"100000000"}' "$OWNER" '30 Tgas'      # 100 NVDAx
log "pool + quotes + position"
ftc "$USDC"  "$OWNER" 50000000000 '"SupplyLendingLiquidity"'
ftc "$USDC"  "$B1"    10000000000 "{\"FundPappusQuote\":{\"collateral\":\"NVDAx\",\"max_discount_bps\":250,\"notice_period_ns\":\"$SEVEN_DAYS_NS\",\"buyer_remote_recipient\":null}}"
ftc "$USDC"  "$B2"     5000000000 "{\"FundPappusQuote\":{\"collateral\":\"NVDAx\",\"max_discount_bps\":400,\"notice_period_ns\":\"$SEVEN_DAYS_NS\",\"buyer_remote_recipient\":null}}"
ftc "$NVDAX" "$BR"      100000000 '{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"11250000000","pre_liq_ltv_bps":7500}}'
log "seeded; check with: pnpm demo:testnet"
