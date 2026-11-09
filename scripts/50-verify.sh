#!/usr/bin/env bash
# Read-only checks against public testnet state; used by G2 and by `pnpm demo:testnet`. No keys needed.
source "$(dirname "$0")/_lib.sh"
CORE=$(cfg .accounts.core); NVDAX=$(cfg .accounts.nvdax_mock)
view() { near contract call-function as-read-only "$CORE" "$1" json-args "$2" network-config testnet now; }
log "status"; view get_status '{}'
log "collateral"; view get_collateral '{"token":"'$NVDAX'"}'
log "quotes"; view list_quotes '{"asset":"'$NVDAX'","from_index":0,"limit":16}'
log "positions"; view list_positions '{"status":"Open","from_index":0,"limit":16}'
log "limit for 300 NVDAx"; view preview_limit '{"token":"'$NVDAX'","collateral_units":"300000000"}'
echo "explorer: https://testnet.nearblocks.io/address/$CORE"
