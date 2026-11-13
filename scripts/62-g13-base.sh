#!/usr/bin/env bash
# G13 (P2b, D-026) — Base spoke round trip on nectar-core-v2 (testnet, real MPC domain 0) + NectarVaultBase on the LOCAL FORK of Base Sepolia
# (chain 84532, 127.0.0.1:8545; disclosed). The keeper daemon (BASE_KEEPER_ATTEST=1, because OutLayer cannot reach a local fork) attests deposits and
# relays the EIP-712 settle/release; this script is the borrower/buyer/owner side.
#   setup                 set_extra_remote_chain(NVDAx, base-sepolia, fork vault) + buyer1 quote with its 0x recipient
#   reserve <units>       borrower1 reserve_remote_position(chain base-sepolia), borrow = 98% of preview; prints the id
#   check <id>            stored 0x authority == last20(keccak(x‖y)) of live derived_public_key(base-sepolia/pos/<id>, core, domain 0)  [G13]
#   deposit <id>          borrower1 (EVM keystore) approve + openPosition(id, authority, units) on the vault
#   show|repay|release <id>, price <usd_e6>   as in scripts/58-g7-v2.sh
source "$(dirname "$0")/_lib.sh"; guard_mainnet
CORE=$(cfg .accounts.core); USDC=$(cfg .accounts.usdc_mock); OWNER=$(cfg .accounts.owner)
B1=$(cfg .accounts.demo.buyer1); BR=$(cfg .accounts.demo.borrower1)
RPC=$(cfg .base.rpc_url); VAULT=$(cfg .base.vault); TOK=$(cfg .base.collateral); E="$HOME/.nectar/evm"; PW="$E/password"
[ "$(cast chain-id --rpc-url "$RPC")" = "84532" ] || { echo "Base RPC is not chain 84532" >&2; exit 3; }
call() { near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas "${5:-100 Tgas}" attached-deposit "${6:-0 NEAR}" \
  sign-as "$4" network-config testnet sign-with-keychain send </dev/null 2>&1; }
view() { near contract call-function as-read-only "$1" "$2" json-args "$3" network-config testnet now </dev/null 2>/dev/null | sed -n '/^[[{"]/,$p'; }
ftc() { call "$1" ft_transfer_call "$(jq -cn --arg r "$CORE" --arg a "$3" --arg m "$4" '{receiver_id:$r, amount:$a, msg:$m}')" "$2" '300 Tgas' '1 yoctoNEAR'; }
events() { grep -oE 'EVENT_JSON:\{[^│]*' | cut -c1-280 || true; }
walk_price() { # owner price → $1 in steps of 14% (band 1,500 bps); `oracle_rejected` carries last_usd_e6
  local tgt=$1 out last nxt i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    out=$(call "$CORE" update_owner_price "{\"symbol\":\"NVDAx\",\"price_usd_e6\":\"$tgt\"}" "$OWNER" '30 Tgas')
    echo "$out" | grep -q '"oracle_updated"' && { echo "price $tgt"; return 0; }
    last=$(echo "$out" | grep -oE '"last_usd_e6":"[0-9]+"' | head -1 | grep -oE '[0-9]+')
    [ -n "$last" ] || { echo "price update failed: $(echo "$out" | grep -iE 'error|fail' | head -2)" >&2; return 1; }
    if [ "$tgt" -gt "$last" ]; then nxt=$(( last * 114 / 100 )); else nxt=$(( last * 86 / 100 )); fi
    call "$CORE" update_owner_price "{\"symbol\":\"NVDAx\",\"price_usd_e6\":\"$nxt\"}" "$OWNER" '30 Tgas' | grep -q '"oracle_updated"' \
      || { echo "price step to $nxt rejected" >&2; return 1; }
    echo "price stepped $last → $nxt"
  done
  echo "price walk did not reach $tgt" >&2; return 1; }
evm() { cast wallet address --keystore "$E/$1" --password-file "$PW"; }
csend() { local who="$1"; shift; cast send --rpc-url "$RPC" --keystore "$E/$who" --password-file "$PW" "$@"; }

case "${1:-}" in
setup)
  call "$CORE" set_extra_remote_chain "$(jq -cn --arg v "$VAULT" --arg r "$RPC" '{symbol:"NVDAx", remote_chain:{chain_id:"base-sepolia", vault_program:$v, mpc_domain_id:0}, rpc_url:$r}')" "$OWNER" '30 Tgas' | events
  echo "remote chains: $(view "$CORE" get_remote_chains '{"symbol":"NVDAx"}' | jq -c .)"
  RCP=$(evm buyer1)
  if view "$CORE" list_quotes '{"symbol":"NVDAx","from_index":0,"limit":50}' | jq -e --arg r "$RCP" '.[] | select(.buyer_remote_recipient == $r and ((.remaining_usd_e6 | tonumber) >= 1000000000))' >/dev/null; then echo "base quote with >= \$1,000 exists"; else
    call "$USDC" mint "{\"account_id\":\"$B1\",\"amount\":\"1000000000\"}" "$OWNER" '30 Tgas' >/dev/null
    ftc "$USDC" "$B1" 1000000000 "$(jq -cn --arg r "$RCP" '{FundPappusQuote:{collateral:"NVDAx", max_discount_bps:300, notice_period_ns:"604800000000000", buyer_remote_recipient:$r}}')" | events
  fi
  echo "borrower1 EVM $(evm borrower1) MockB20 balance $(cast call "$TOK" 'balanceOf(address)(uint256)' "$(evm borrower1)" --rpc-url "$RPC")" ;;
reserve)
  U=${2:?units}; walk_price 150000000 || exit 1
  BC=$(view "$CORE" preview_borrow "{\"symbol\":\"NVDAx\",\"units\":\"$U\",\"borrow_usd_e6\":\"1\"}" | jq -r '.b_c_usd_e6'); B=$(( BC * 98 / 100 )); echo "b_c=$BC borrow=$B"
  call "$CORE" reserve_remote_position "$(jq -cn --arg u "$U" --arg b "$B" --arg d "$(evm borrower1)" '{collateral:"NVDAx", units:$u, borrow_usd_e6:$b, pre_liq_ltv_bps:7500, chain:"base-sepolia", depositor:$d}')" "$BR" '150 Tgas' '0.05 NEAR' | events ;;
check)
  ID=${2:?id}; A=$(view "$CORE" get_position "{\"position_id\":\"$ID\"}" | jq -r '.remote.authority')
  K=$(view v1.signer-prod.testnet derived_public_key "$(jq -cn --arg p "base-sepolia/pos/$ID" --arg c "$CORE" '{path:$p, predecessor:$c, domain_id:0}')" | tr -d '"')
  HEX=$(node -e 'const A="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";let n=0n;for(const c of process.argv[1])n=n*58n+BigInt(A.indexOf(c));let h=n.toString(16);console.log(h.padStart(128,"0"))' "${K#secp256k1:}")
  ADDR="0x$(cast keccak "0x$HEX" | cut -c27-66)"
  echo "stored=$A derived_key=$K address=$ADDR"
  [ "$(echo "$A" | tr A-F a-f)" = "$(echo "$ADDR" | tr A-F a-f)" ] && echo "AUTHORITY MATCH" || { echo "AUTHORITY MISMATCH" >&2; exit 1; } ;;
deposit)
  ID=${2:?id}; P=$(view "$CORE" get_position "{\"position_id\":\"$ID\"}"); A=$(echo "$P" | jq -r '.remote.authority'); U=$(echo "$P" | jq -r '.remote.reserved_units')
  csend borrower1 "$TOK" 'approve(address,uint256)' "$VAULT" "$U" | grep -E 'status|transactionHash'
  csend borrower1 "$VAULT" 'openPosition(uint64,address,uint256)' "$ID" "$A" "$U" | grep -E 'status|transactionHash'
  echo "vault positions($ID): $(cast call "$VAULT" 'positionOf(uint64,address)(address,address,uint256,uint8)' "$ID" "$(evm borrower1)" --rpc-url "$RPC" | tr '\n' ' ')" ;;
show)
  ID=${2:?id}; view "$CORE" get_position "{\"position_id\":\"$ID\"}" | jq -c '{debt_usd_e6, units, remote: (.remote | {status, chain_id, authority, depositor, source, paid_usd_e6})}'
  view "$CORE" get_pending_settlement_evm "{\"position_id\":\"$ID\"}" | jq -c . 2>/dev/null | cut -c1-300
  view "$CORE" get_pending_release_evm "{\"position_id\":\"$ID\"}" | jq -c . 2>/dev/null | cut -c1-300
  echo "vault positions($ID): $(cast call "$VAULT" 'positionOf(uint64,address)(address,address,uint256,uint8)' "$ID" "$(evm borrower1)" --rpc-url "$RPC" | tr '\n' ' ')" ;;
repay)
  ID=${2:?id}; DEBT=$(view "$CORE" get_position "{\"position_id\":\"$ID\"}" | jq -r '.debt_usd_e6')
  ftc "$USDC" "$BR" "$DEBT" "$(jq -cn --arg i "$ID" '{Repay:{position_id:$i}}')" | events ;;
release)
  ID=${2:?id}; call "$CORE" request_remote_release "{\"position_id\":\"$ID\"}" "$BR" '150 Tgas' | events ;;
price)
  walk_price "${2:?usd_e6}" ;;
*) sed -n '2,11p' "$0"; exit 2 ;;
esac
