#!/usr/bin/env bash
# P1 / G4: publish the quoter to OutLayer without `outlayer login` (D-014), then pin it in nectar-core.
#   scripts/30-quoter-publish.sh publish   FastFS upload (F-057) → verify served bytes → create_project / add_version (F-058)
#   scripts/30-quoter-publish.sh pin       set_quoter_pin + set_quoter_config on nectar-core (interface-p1; needs the WO-10a contract)
# Signing: near-cli + OS keychain as the owner (F-059). The version_key is the wasm sha256 (F-045), reproducible via quoter/build.sh.
source "$(dirname "$0")/_lib.sh"; guard_mainnet
OWNER=$(cfg .accounts.owner); CORE=$(cfg .accounts.core); OUTLAYER=$(cfg .outlayer.account)
NAME="${QUOTER_PROJECT_NAME:-nectar-quoter}"; PROJECT_ID="$OWNER/$NAME"
WASM="$ROOT/quoter/target/wasm32-wasip2/release/nectar_quoter.wasm"
bash "$ROOT/quoter/build.sh" >/dev/null
SHA=$(shasum -a 256 "$WASM" | cut -d' ' -f1)
SERVED=$(mktemp -t nectar-quoter); trap 'rm -f "$SERVED"' EXIT
URL="https://test.fastfs.io/$OWNER/$OUTLAYER/$SHA.wasm"
echo "wasm=$WASM sha256=$SHA size=$(wc -c <"$WASM" | tr -d ' ')"
rpc_view() { curl -s "${NEAR_RPC_URL:-https://rpc.testnet.fastnear.com}" -H 'content-type: application/json' -d "$(jq -cn --arg a "$1" --arg m "$2" --arg b "$(printf '%s' "$3" | base64)" \
  '{jsonrpc:"2.0",id:1,method:"query",params:{request_type:"call_function",finality:"final",account_id:$a,method_name:$m,args_base64:$b}}')"; }

case "${1:-}" in
publish)
  if curl -sf "$URL" -o "$SERVED" && [ "$(shasum -a 256 "$SERVED" | cut -d' ' -f1)" = "$SHA" ]; then
    echo "FastFS already serves $URL (sha matches); skip upload"
  else
    log "FastFS upload (F-057): __fastdata_fastfs on $OUTLAYER, gas 1 (fails by design; data is indexed)"
    B64=$(python3 -I - "$WASM" "$SHA.wasm" <<'PY'
import sys, struct, base64
wasm = open(sys.argv[1], 'rb').read(); path = sys.argv[2].encode(); mime = b'application/wasm'
s = lambda b: struct.pack('<I', len(b)) + b                      # borsh String / Vec<u8>
payload = b'\x00' + s(path) + b'\x01' + s(mime) + s(wasm)        # enum Simple, Option::Some(FastfsFileContent)
assert len(wasm) <= 1_000_000, 'chunked upload not implemented (>1 MB)'
print(base64.b64encode(payload).decode())
PY
)
    near contract call-function as-transaction "$OUTLAYER" __fastdata_fastfs base64-args "$B64" \
      prepaid-gas '0.000000001 Ggas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-keychain send </dev/null \
      2>&1 | grep -E 'Transaction ID|Error|error' | head -4 || true
    log "waiting for FastFS to serve $URL"
    for i in $(seq 1 20); do
      if curl -sf "$URL" -o "$SERVED" && [ "$(shasum -a 256 "$SERVED" | cut -d' ' -f1)" = "$SHA" ]; then echo "served, sha matches"; break; fi
      [ "$i" = 20 ] && { echo "FastFS did not serve matching bytes after ~5 min → GATE_FAIL_G4 candidate" >&2; exit 2; }
      sleep 15
    done
  fi
  SRC=$(jq -cn --arg u "$URL" --arg h "$SHA" '{WasmUrl:{url:$u,hash:$h,build_target:"wasm32-wasip2"}}')
  # get_project view name is unverified (not in FACTS); a miss falls through to create_project, correct for a first publish.
  if rpc_view "$OUTLAYER" get_project "{\"project_id\":\"$PROJECT_ID\"}" | jq -e '.result.result | length > 4' >/dev/null 2>&1; then
    log "add_version to $PROJECT_ID (F-058)"; ARGS=$(jq -cn --arg n "$NAME" --argjson s "$SRC" '{project_name:$n, source:$s, set_active:true}'); M=add_version
  else
    log "create_project $PROJECT_ID (F-058)"; ARGS=$(jq -cn --arg n "$NAME" --argjson s "$SRC" '{name:$n, source:$s}'); M=create_project
  fi
  near contract call-function as-transaction "$OUTLAYER" "$M" json-args "$ARGS" prepaid-gas '100 Tgas' attached-deposit '0.1 NEAR' \
    sign-as "$OWNER" network-config testnet sign-with-keychain send </dev/null
  yq -i '.outlayer.project_id = "'"$PROJECT_ID"'" | .outlayer.version_key = "'"$SHA"'" | .outlayer.wasm_sha256 = "'"$SHA"'" | .outlayer.wasm_url = "'"$URL"'"' "$CFG"
  log "cost estimate (F-046)"; rpc_view "$OUTLAYER" estimate_execution_cost "$(cat "$ROOT/packages/config/outlayer-limits.json")" | jq -r '.result.result | implode'
  ;;
pin)
  PID=$(cfg .outlayer.project_id); VK=$(cfg .outlayer.version_key)
  case "$PID$VK" in *TODO*) echo "run '$0 publish' first" >&2; exit 2;; esac
  RL=$(jq -c '.resource_limits' "$ROOT/packages/config/outlayer-limits.json")
  owner_call() { near contract call-function as-transaction "$CORE" "$1" json-args "$2" prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-keychain send </dev/null; }
  owner_call set_quoter_config "$(jq -cn --argjson r "$RL" --arg d "${QUOTER_DEPOSIT_YOCTO:-10000000000000000000000}" --arg g "$(cfg .outlayer.gas_tgas)" \
    '{deposit_yocto:$d, gas_tgas:($g|tonumber), max_instructions:($r.max_instructions|tostring), max_memory_mb:$r.max_memory_mb, max_execution_seconds:$r.max_execution_seconds}')"
  owner_call set_vol_bps "$(jq -cn --argjson v "$(cfg .collateral.nvdax.vol_bps)" '{symbol:"NVDAx", vol_bps:$v}')"
  owner_call set_quoter_pin "$(jq -cn --arg p "${PIN_PROJECT_ID:-$PID}" --arg v "${PIN_VERSION_KEY:-$VK}" '{project_id:$p, version_key:$v}')"
  if rpc_view "$CORE" contract_version '{}' | jq -r '.result.result | implode' | grep -q '"2\.'; then
    log "v2: vault_read + calendar/multiplier jobs on the same pinned version (WO-21/WO-23a/WO-24)"
    D="${QUOTER_DEPOSIT_YOCTO:-10000000000000000000000}"; G="$(cfg .outlayer.gas_tgas)"
    owner_call set_vault_read_config "$(jq -cn --arg p "${PIN_PROJECT_ID:-$PID}" --arg v "${PIN_VERSION_KEY:-$VK}" --arg d "$D" --arg g "$G" '{project_id:$p, version_key:$v, deposit_yocto:$d, gas_tgas:($g|tonumber)}')"
    for job in calendar multiplier; do
      owner_call set_job_config "$(jq -cn --arg j "$job" --arg p "${PIN_PROJECT_ID:-$PID}" --arg v "${PIN_VERSION_KEY:-$VK}" --arg d "$D" --arg g "$G" '{job:$j, project_id:$p, version_key:$v, deposit_yocto:$d, gas_tgas:($g|tonumber)}')"
    done
  fi
  log "gas reserve for OutLayer deposits ($(cfg .outlayer.gas_reserve_near) NEAR)"
  near contract call-function as-transaction "$CORE" fund_gas_reserve json-args '{}' prepaid-gas '30 Tgas' attached-deposit "$(cfg .outlayer.gas_reserve_near) NEAR" \
    sign-as "$OWNER" network-config testnet sign-with-keychain send </dev/null
  log "quoter config now"; rpc_view "$CORE" get_quoter_config '{}' | jq -r '.result.result | implode'
  ;;
*) echo "usage: $0 publish|pin" >&2; exit 2 ;;
esac
