#!/usr/bin/env bash
# WO-6 deploy: contract accounts → mocks → core (init) → collateral params → owner price. Grammar F-017/F-018.
# ABI: docs/work/interface-p0.md (merged WO-2). Budget: parent got 10 NEAR from the faucet; wasm storage is
# nectar_core 324,833 B ≈ 3.25 NEAR, mock_ft 152,268 B ≈ 1.52 NEAR (F-014), so accounts get 3.6 / 1.7 / 1.7 NEAR.
# P0 needs no gas reserve (no MPC/OutLayer deposits): fund_gas_reserve is skipped until P1.
source "$(dirname "$0")/_lib.sh"; guard_mainnet
PARENT="${PARENT:-nectar.testnet}"; CORE="nectar-core.$PARENT"; USDC="usdc-mock.$PARENT"; NVDAX="nvdax-mock.$PARENT"
W="$ROOT/target/near"
[ -f "$W/nectar_core/nectar_core.wasm" ] && [ -f "$W/mock_ft/mock_ft.wasm" ] || { echo "run scripts/10-build.sh first" >&2; exit 2; }
code_hash() { curl -s "${NEAR_RPC_URL:-https://test.rpc.fastnear.com}" -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" | jq -r '.result.code_hash // "none"'; }
EMPTY=11111111111111111111111111111111

CORE_NEAR=${CORE_NEAR:-3.6} MOCK_FT_NEAR=${MOCK_FT_NEAR:-1.7} bash "$ROOT/scripts/00-accounts.sh" contracts

deploy() { # account wasm init_args
  if [ "$(code_hash "$1")" != "$EMPTY" ]; then echo "skip deploy $1 (code present: $(code_hash "$1"))"; return; fi
  log "deploy $1"
  near contract deploy "$1" use-file "$2" with-init-call new json-args "$3" \
    prepaid-gas '50 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send </dev/null
}
deploy "$USDC"  "$W/mock_ft/mock_ft.wasm" '{"owner":"'$PARENT'","name":"Mock USDC","symbol":"USDC","decimals":6}'
deploy "$NVDAX" "$W/mock_ft/mock_ft.wasm" '{"owner":"'$PARENT'","name":"Mock NVDAx","symbol":"NVDAx","decimals":6}'
deploy "$CORE"  "$W/nectar_core/nectar_core.wasm" '{"owner":"'$PARENT'","usdc_token":"'$USDC'","keeper":"keeper.'$PARENT'"}'

owner_call() { near contract call-function as-transaction "$CORE" "$1" json-args "$2" prepaid-gas '50 Tgas' attached-deposit '0 NEAR' sign-as "$PARENT" network-config testnet sign-with-keychain send </dev/null; }
log "upsert_collateral NVDAx from config.yaml (D-009)"
COLL="$(yq -o=json -I=0 '.collateral.nvdax | .token = "'$NVDAX'" | .remote_chain = null
  | .verified_dex_depth_usd_e6 = (.verified_dex_depth_usd_e6 | tostring) | .nectar_reserve_usd_e6 = (.nectar_reserve_usd_e6 | tostring)' "$CFG")"
owner_call upsert_collateral '{"symbol":"NVDAx","config":'"$COLL"'}'
log "owner price (P0 owner oracle, disclosed): \$180.00"
owner_call update_owner_price '{"symbol":"NVDAx","price_usd_e6":"180000000"}'

yq -i '.accounts.core = "'$CORE'" | .accounts.usdc_mock = "'$USDC'" | .accounts.nvdax_mock = "'$NVDAX'" | .collateral.nvdax.token = "'$NVDAX'"' "$CFG"
log "deployed. ids written to packages/config/config.yaml; next: scripts/40-seed-demo.sh"
for a in "$CORE" "$USDC" "$NVDAX"; do echo "https://testnet.nearblocks.io/address/$a  code_hash=$(code_hash "$a")"; done
