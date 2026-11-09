#!/usr/bin/env bash
# Mint mocks to demo accounts, supply pool, fund two quotes, open one position (PRD demo pre-state).
source "$(dirname "$0")/_lib.sh"; guard_mainnet
CORE=$(cfg .accounts.core); USDC=$(cfg .accounts.usdc_mock); NVDAX=$(cfg .accounts.nvdax_mock); OWNER=$(cfg .accounts.owner)
B1=$(cfg .accounts.demo.buyer1); B2=$(cfg .accounts.demo.buyer2); BR=$(cfg .accounts.demo.borrower1)
call() { near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas "${5:-100 Tgas}" attached-deposit "${6:-0 NEAR}" sign-as "$4" network-config testnet sign-with-keychain send; }
for a in "$B1" "$B2" "$BR" "$OWNER"; do call "$USDC" storage_deposit '{"account_id":"'$a'"}' "$OWNER" '30 Tgas' '0.00125 NEAR'; call "$NVDAX" storage_deposit '{"account_id":"'$a'"}' "$OWNER" '30 Tgas' '0.00125 NEAR'; done
call "$USDC" storage_deposit '{"account_id":"'$CORE'"}' "$OWNER" '30 Tgas' '0.00125 NEAR'; call "$NVDAX" storage_deposit '{"account_id":"'$CORE'"}' "$OWNER" '30 Tgas' '0.00125 NEAR'
call "$USDC" mint '{"account_id":"'$OWNER'","amount":"200000000000"}' "$OWNER"; call "$USDC" mint '{"account_id":"'$B1'","amount":"40000000000"}' "$OWNER"; call "$USDC" mint '{"account_id":"'$B2'","amount":"35000000000"}' "$OWNER"
call "$NVDAX" mint '{"account_id":"'$BR'","amount":"400000000"}' "$OWNER"
call "$CORE" propose_price '{"token":"'$NVDAX'","price_e6":"185000000","conf_e6":"50000"}' "$OWNER" '30 Tgas'; call "$CORE" apply_price '{"token":"'$NVDAX'"}' "$OWNER" '30 Tgas'
call "$USDC" ft_transfer_call '{"receiver_id":"'$CORE'","amount":"200000000000","msg":"{\"SupplyLendingLiquidity\":{}}"}' "$OWNER" '100 Tgas' '1 yoctoNEAR'
call "$USDC" ft_transfer_call '{"receiver_id":"'$CORE'","amount":"40000000000","msg":"{\"FundPappusQuote\":{\"asset\":\"'$NVDAX'\",\"max_discount_bps\":180,\"notice_period_s\":604800}}"}' "$B1" '100 Tgas' '1 yoctoNEAR'
call "$USDC" ft_transfer_call '{"receiver_id":"'$CORE'","amount":"25000000000","msg":"{\"FundPappusQuote\":{\"asset\":\"'$NVDAX'\",\"max_discount_bps\":250,\"notice_period_s\":86400}}"}' "$B2" '100 Tgas' '1 yoctoNEAR'
call "$NVDAX" ft_transfer_call '{"receiver_id":"'$CORE'","amount":"300000000","msg":"{\"LockCollateralAndBorrow\":{\"borrow_usd_e6\":\"28000000000\"}}"}' "$BR" '150 Tgas' '1 yoctoNEAR'
log "seeded; run scripts/50-verify.sh"
