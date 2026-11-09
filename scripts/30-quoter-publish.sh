#!/usr/bin/env bash
# P1: publish the quoter WASM to OutLayer, pin it in nectar-core. Exact `outlayer` CLI grammar is F-045 (VERIFY G4).
source "$(dirname "$0")/_lib.sh"; guard_mainnet
WASM="$ROOT/quoter/target/wasm32-wasip2/release/nectar_quoter.wasm"; [ -f "$WASM" ] || { echo "build first (scripts/10-build.sh)"; exit 2; }
SHA=$(sha256sum "$WASM" | cut -d' ' -f1); echo "sha256=$SHA"
log "cost estimate (F-042)"; near contract call-function as-read-only outlayer.testnet estimate_execution_cost json-args "$(cat "$ROOT/packages/config/outlayer-limits.json")" network-config testnet now
log "publish (F-045 — confirm at G4)"; outlayer upload "$WASM" && outlayer deploy --project "${OUTLAYER_PROJECT_ID:?}" || { echo "publish failed → GATE_FAIL_G4 or UI publish by HUMAN"; exit 2; }
log "pin"; near contract call-function as-transaction "$(cfg .accounts.core)" set_quoter_pin json-args '{"version_key":"'${OUTLAYER_VERSION_KEY:?}'","wasm_sha256":"'$SHA'"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$(cfg .accounts.owner)" network-config testnet sign-with-keychain send
