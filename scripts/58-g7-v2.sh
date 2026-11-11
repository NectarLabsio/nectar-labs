#!/usr/bin/env bash
# G7 (v7) on nectar-core-v2 + Solana devnet — the user side of the remote lifecycle. The keeper daemon (keeper-v2 key + devnet fee payer)
# does the rest: confirm_remote_deposit (OutLayer vault_read), trigger, and relaying settle/release to Solana.
#   prep                 Solana wallets for borrower1 (depositor) + buyer1 (recipient), mint mock NVDAx, buyer1 remote-recipient quote
#   reserve <units>      borrower1 reserve_remote_position (0.05 NEAR deposit), borrow sized by preview_borrow (98%); prints the position id
#   check <id>           stored authority vs live derived_public_key(solana-devnet/pos/<id>, predecessor core, domain 1)  [G7 criterion]
#   deposit <id>         borrower1 open_position on the vault with the stored authority
#   show <id>            position + remote + pending settlement/release
#   withdraw <id>        borrower1 pulls its tokens from the vault after settle/release (vault v2)
#   repay <id>           borrower1 repays the full debt (USDC ft_transfer_call Repay)
#   release <id>         request_remote_release (the keeper relays the signed release to Solana)
#   price <usd_e6>       owner price (band 1,500 bps per step; disclosed demo control)
# Devnet + testnet only. Keys: OS keychain (NEAR), ~/.nectar/solana/*.json (0600). Nothing is printed but public keys.
source "$(dirname "$0")/_lib.sh"; guard_mainnet
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
CORE=$(cfg .accounts.core); USDC=$(cfg .accounts.usdc_mock); OWNER=$(cfg .accounts.owner)
B1=$(cfg .accounts.demo.buyer1); BR=$(cfg .accounts.demo.borrower1)
PROG=$(cfg .solana.vault_program); MINT=$(cfg .solana.mint); K=~/.nectar/solana; URL=https://api.devnet.solana.com
SPL_TOKEN=spl-token; spl-token --version >/dev/null 2>&1 || SPL_TOKEN=$(ls -d "$HOME"/.local/share/solana/install/releases/stable-*/solana-release/bin/spl-token | tail -1)
call() { near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas "${5:-100 Tgas}" attached-deposit "${6:-0 NEAR}" \
  sign-as "$4" network-config testnet sign-with-keychain send </dev/null; }
view() { near contract call-function as-read-only "$1" "$2" json-args "$3" network-config testnet now </dev/null 2>/dev/null | sed -n '/^[[{"]/,$p'; }
ftc() { call "$1" ft_transfer_call "$(jq -cn --arg r "$CORE" --arg a "$3" --arg m "$4" '{receiver_id:$r, amount:$a, msg:$m}')" "$2" '300 Tgas' '1 yoctoNEAR'; }
kp() { [ -f "$K/$1.json" ] || solana-keygen new --no-bip39-passphrase --silent -o "$K/$1.json" >/dev/null 2>&1; chmod 600 "$K/$1.json"; solana-keygen pubkey "$K/$1.json"; }

case "${1:-}" in
prep)
  DEP=$(kp borrower1-sol); RCP=$(kp buyer1-sol); echo "depositor=$DEP recipient=$RCP"
  [ "$(solana balance "$DEP" --url $URL | awk '{print int($1*100)}')" -ge 5 ] || solana transfer "$DEP" 0.08 --allow-unfunded-recipient --keypair $K/deployer.json --url $URL
  ATA=$("$SPL_TOKEN" address --token "$MINT" --owner "$DEP" --verbose --url $URL 2>/dev/null | awk '/Associated token address/{print $NF}')
  solana account "$ATA" --url $URL >/dev/null 2>&1 || "$SPL_TOKEN" create-account "$MINT" --owner "$DEP" --fee-payer $K/deployer.json --url $URL
  "$SPL_TOKEN" mint "$MINT" 10 "$ATA" --mint-authority $K/deployer.json --fee-payer $K/deployer.json --url $URL
  "$SPL_TOKEN" balance --address "$ATA" --url $URL
  if view "$CORE" list_quotes '{"symbol":"NVDAx","from_index":0,"limit":20}' | jq -e '.[] | select(.buyer_remote_recipient != null and (.buyer_remote_recipient | startswith("0x") | not) and ((.remaining_usd_e6 | tonumber) >= 1000000000))' >/dev/null; then echo "Solana remote quote with >= \$1,000 exists"; else
    call "$USDC" mint "{\"account_id\":\"$B1\",\"amount\":\"1000000000\"}" "$OWNER" '30 Tgas'
    ftc "$USDC" "$B1" 1000000000 "$(jq -cn --arg r "$RCP" '{FundPappusQuote:{collateral:"NVDAx", max_discount_bps:300, notice_period_ns:"604800000000000", buyer_remote_recipient:$r}}')"
  fi ;;
reserve)
  U=${2:?units}; call "$CORE" update_owner_price '{"symbol":"NVDAx","price_usd_e6":"180000000"}' "$OWNER" '30 Tgas' >/dev/null
  BC=$(view "$CORE" preview_borrow "{\"symbol\":\"NVDAx\",\"units\":\"$U\",\"borrow_usd_e6\":\"1\"}" | jq -r '.b_c_usd_e6')
  B=$(( BC * 98 / 100 )); echo "b_c=$BC borrow=$B"
  call "$CORE" reserve_remote_position "$(jq -cn --arg u "$U" --arg b "$B" --arg d "$(kp borrower1-sol)" '{collateral:"NVDAx", units:$u, borrow_usd_e6:$b, pre_liq_ltv_bps:7500, depositor:$d}')" "$BR" '100 Tgas' '0.05 NEAR' \
    | grep -oE 'EVENT_JSON:\{.*"remote_reserved".*' | head -1 ;;
check)
  ID=${2:?id}; A=$(view "$CORE" get_position "{\"position_id\":\"$ID\"}" | jq -r '.remote.authority')
  D=$(view v1.signer-prod.testnet derived_public_key "$(jq -cn --arg p "solana-devnet/pos/$ID" --arg c "$CORE" '{path:$p, predecessor:$c, domain_id:1}')" | tr -d '"')
  echo "stored=$A derived=$D"; [ "$A" = "$D" ] && echo "AUTHORITY MATCH" || { echo "AUTHORITY MISMATCH" >&2; exit 1; } ;;
deposit)
  ID=${2:?id}; P=$(view "$CORE" get_position "{\"position_id\":\"$ID\"}"); A=$(echo "$P" | jq -r '.remote.authority'); U=$(echo "$P" | jq -r '.remote.reserved_units // .units')
  node "$ROOT/scripts/59-vault-open.mjs" "$PROG" "$MINT" "$K/borrower1-sol.json" "$ID" "$A" "$U" ;;
resign)
  # SR-3: an expired, unrelayed signed leg gets a fresh-nonce signature (anyone may call)
  ID=${2:?id}; call "$CORE" resign_remote_settlement "{\"position_id\":\"$ID\"}" "$BR" '100 Tgas' 2>&1 | grep -oE 'EVENT_JSON:\{.*' | cut -c1-260 ;;
withdraw)
  # vault v2 (D-027): after settle/release the depositor pulls its tokens
  ID=${2:?id}; node "$ROOT/scripts/59-vault-open.mjs" withdraw "$PROG" "$MINT" "$K/borrower1-sol.json" "$ID" ;;
show)
  ID=${2:?id}; view "$CORE" get_position "{\"position_id\":\"$ID\"}" | jq -c '{state, debt_usd_e6, units, remote: (.remote | {status, authority, depositor, source, paid_usd_e6})}'
  view "$CORE" get_pending_settlement "{\"position_id\":\"$ID\"}" | jq -c '.' 2>/dev/null | cut -c1-300
  view "$CORE" get_pending_release "{\"position_id\":\"$ID\"}" | jq -c '.' 2>/dev/null | cut -c1-300 ;;
repay)
  ID=${2:?id}; DEBT=$(view "$CORE" get_position "{\"position_id\":\"$ID\"}" | jq -r '.debt_usd_e6')
  ftc "$USDC" "$BR" "$DEBT" "$(jq -cn --arg i "$ID" '{Repay:{position_id:$i}}')" | grep -oE 'EVENT_JSON:\{.*"repaid".*' | head -1 ;;
release)
  ID=${2:?id}; call "$CORE" request_remote_release "{\"position_id\":\"$ID\"}" "$BR" '100 Tgas' | grep -oE 'EVENT_JSON:\{.*' | cut -c1-260 ;;
price)
  call "$CORE" update_owner_price "{\"symbol\":\"NVDAx\",\"price_usd_e6\":\"${2:?usd_e6}\"}" "$OWNER" '30 Tgas' | grep -oE 'EVENT_JSON:\{.*' | cut -c1-200 ;;
*) sed -n '2,13p' "$0"; exit 2 ;;
esac
