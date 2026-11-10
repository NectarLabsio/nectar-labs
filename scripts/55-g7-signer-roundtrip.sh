#!/usr/bin/env bash
# G7 (partial, cut-order fallback): NEAR-side Chain Signatures round trip on testnet — nectar-core builds the settlement preimage,
# v1.signer-prod.testnet signs it (Ed25519, raw bytes, D-016), `settlement_signed` is emitted, and the signature is verified off-chain
# against the vault authority (ed25519:6QPGoVj8…, live derived_public_key match). The Solana vault is NOT deployed (H-TOOLCHAIN-SOLANA),
# so the preimage names a PLACEHOLDER program id and nothing is relayed; the position stays Settling (disclosed in EVIDENCE/README).
source "$(dirname "$0")/_lib.sh"; guard_mainnet
OWNER=$(cfg .accounts.owner); CORE=$(cfg .accounts.core); USDC=$(cfg .accounts.usdc_mock); NVDAX=$(cfg .accounts.nvdax_mock)
B1=$(cfg .accounts.demo.buyer1); BR=$(cfg .accounts.demo.borrower1); KEEPER=$(cfg .accounts.keeper)
KEEPER_KEY="${KEEPER_KEY_PATH:-$HOME/.nectar/keys/keeper.function-call.json}"
AUTH=$(cfg .signer.authority)
# Throwaway base58 addresses (private keys generated and discarded): placeholder vault program + the buyer's Solana recipient.
rand_addr() { node -e "const c=require('crypto');const A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+c.randomBytes(32).toString('hex')),s='';while(n>0n){s=A[Number(n%58n)]+s;n/=58n}console.log(s)"; }
VAULT_PLACEHOLDER="${VAULT_PROGRAM:-$(rand_addr)}"; RECIPIENT="${BUYER_SOL_RECIPIENT:-$(rand_addr)}"
echo "vault_program(placeholder)=$VAULT_PLACEHOLDER recipient=$RECIPIENT authority=$AUTH"
call() { near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas "${5:-30 Tgas}" attached-deposit "${6:-0 NEAR}" sign-as "$4" network-config testnet sign-with-keychain send </dev/null; }
ftc() { ARGS=$(jq -cn --arg r "$CORE" --arg a "$3" --arg m "$4" '{receiver_id:$r, amount:$a, msg:$m}'); call "$1" ft_transfer_call "$ARGS" "$2" '300 Tgas' '1 yoctoNEAR'; }
health() { bash "$ROOT/scripts/50-verify.sh" 2>/dev/null | sed -n '/== quotes ==/,/== explorer ==/p'; }

log "1: signer config + remote chain (placeholder vault program)"
if [ "${SKIP_CONFIG:-0}" != 1 ]; then
  call "$CORE" set_signer_config "$(jq -cn --arg a "$(cfg .signer.account)" --arg p "$(cfg .signer.path)" '{account:$a, path:$p, gas_tgas:30, expiry_s:3600}')" "$OWNER"
  call "$CORE" set_remote_chain "$(jq -cn --arg v "$VAULT_PLACEHOLDER" '{symbol:"NVDAx", remote_chain:{chain_id:"solana-devnet", vault_program:$v, mpc_domain_id:1}}')" "$OWNER"
fi
# The remote leg settles only if its priced fill is the cheapest quote (settlement order) — keep QUOTE_MAX_BPS below other fills.
QMAX=${QUOTE_MAX_BPS:-300}; QAMT=${QUOTE_USD_E6:-1000000000}
P_OPEN=${PRICE_OPEN_E6:-112000000}; P_DROP=${PRICE_DROP_E6:-100000000}; BORROW=${BORROW_E6:-235000000}
log "2: buyer1 funds a quote ($QAMT e6 @ $QMAX bps) with a Solana recipient"
call "$USDC" mint "{\"account_id\":\"$B1\",\"amount\":\"$QAMT\"}" "$OWNER"
ftc "$USDC" "$B1" "$QAMT" "$(jq -cn --arg r "$RECIPIENT" --argjson q "$QMAX" '{FundPappusQuote:{collateral:"NVDAx", max_discount_bps:$q, notice_period_ns:"604800000000000", buyer_remote_recipient:$r}}')"
log "3: borrower1 opens 3 NVDAx / $BORROW e6 at price $P_OPEN e6"
call "$NVDAX" mint "{\"account_id\":\"$BR\",\"amount\":\"3000000\"}" "$OWNER"
call "$CORE" update_owner_price "{\"symbol\":\"NVDAx\",\"price_usd_e6\":\"$P_OPEN\"}" "$OWNER"
ftc "$NVDAX" "$BR" 3000000 "$(jq -cn --arg b "$BORROW" '{LockCollateralAndBorrow:{collateral:"NVDAx", borrow_usd_e6:$b, pre_liq_ltv_bps:7500}}')"
log "4: price $P_DROP e6 → triggerable"; call "$CORE" update_owner_price "{\"symbol\":\"NVDAx\",\"price_usd_e6\":\"$P_DROP\"}" "$OWNER"; health
P=$(bash "$ROOT/scripts/50-verify.sh" 2>/dev/null | grep TRIGGERABLE | sed -E 's/^#([0-9]+).*/\1/' | head -1)
[ -n "$P" ] || { echo "no triggerable position" >&2; exit 2; }
log "5: keeper triggers #$P (expect quoter → sign → settlement_signed)"
near contract call-function as-transaction "$CORE" trigger_preliquidation json-args "{\"position_id\":\"$P\"}" prepaid-gas '300 Tgas' \
  attached-deposit '0 NEAR' sign-as "$KEEPER" network-config testnet sign-with-access-key-file "$KEEPER_KEY" send </dev/null
sleep 30; health
log "6: off-chain verification of the MPC signature against the vault authority"
PEND=$(curl -s "${NEAR_RPC_URL:-https://rpc.testnet.fastnear.com}" -H 'content-type: application/json' -d "$(jq -cn --arg a "$CORE" --arg b "$(printf '{"position_id":"%s"}' "$P" | base64)" \
  '{jsonrpc:"2.0",id:1,method:"query",params:{request_type:"call_function",finality:"final",account_id:$a,method_name:"get_pending_settlement",args_base64:$b}}')" | jq -c '.result.result | implode | fromjson')
echo "pending=$PEND"
node "$ROOT/scripts/verify-ed25519.mjs" "$AUTH" "$PEND"
