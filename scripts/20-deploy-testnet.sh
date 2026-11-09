#!/usr/bin/env bash
# mocks → core (init) → collateral params → keeper → gas reserve. Grammar per F-017/F-018.
source "$(dirname "$0")/_lib.sh"; guard_mainnet
PARENT="${PARENT:-nectar.testnet}"; CORE="nectar-core.$PARENT"; USDC="usdc-mock.$PARENT"; NVDAX="nvdax-mock.$PARENT"
W="$ROOT/target/near"   # cargo-near output at workspace root (WO-2)
near contract deploy "$USDC"  use-file "$W/mock_ft/mock_ft.wasm" with-init-call new json-args '{"owner_id":"'$PARENT'","name":"Mock USDC","symbol":"USDC","decimals":6}' prepaid-gas '50 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
near contract deploy "$NVDAX" use-file "$W/mock_ft/mock_ft.wasm" with-init-call new json-args '{"owner_id":"'$PARENT'","name":"Mock NVDAx","symbol":"NVDAx","decimals":6}' prepaid-gas '50 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
near contract deploy "$CORE"  use-file "$W/nectar_core/nectar_core.wasm" with-init-call new json-args '{"owner_id":"'$PARENT'","usdc_token":"'$USDC'","keeper":"keeper.'$PARENT'"}' prepaid-gas '50 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
near contract call-function as-transaction "$CORE" upsert_collateral json-args "$(yq -o=json '.collateral.nvdax | .token = "'$NVDAX'"' "$CFG")" prepaid-gas '50 Tgas' attached-deposit '0 NEAR' sign-as "$PARENT" network-config testnet sign-with-keychain send
near contract call-function as-transaction "$CORE" fund_gas_reserve json-args '{}' prepaid-gas '30 Tgas' attached-deposit '5 NEAR' sign-as "$PARENT" network-config testnet sign-with-keychain send
log "update packages/config/config.yaml + docs/FACTS.md §Account ids, then scripts/40-seed-demo.sh"
