#!/usr/bin/env bash
# P1 upgrade of the live nectar-core: P0 wasm → V1 wasm + migrate, in one deploy+init-call transaction (a failed migrate
# reverts the deploy). Proven in the sandbox by WO-10a (tests/sandbox_p1.rs: P0 wasm → seed → V1 → migrate → P0 views equal).
# Budget: V1 wasm is ~57 KB larger (~0.57 NEAR storage, F-014); the owner tops nectar-core up first.
source "$(dirname "$0")/_lib.sh"; guard_mainnet
OWNER=$(cfg .accounts.owner); CORE=$(cfg .accounts.core)
P0_CODE_HASH="8FtHHN134KPuXtA6VyyYgH57166gdixvA5tFiXXyf2gV"   # G1/G2-verified P0 build (F-140)
WASM="$ROOT/target/near/nectar_core/nectar_core.wasm"
RPC="${NEAR_RPC_URL:-https://rpc.testnet.fastnear.com}"
acct() { curl -s "$RPC" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}"; }
view() { curl -s "$RPC" -H 'content-type: application/json' -d "$(jq -cn --arg a "$CORE" --arg m "$1" --arg b "$(printf '%s' "${2:-{\}}" | base64)" \
  '{jsonrpc:"2.0",id:1,method:"query",params:{request_type:"call_function",finality:"final",account_id:$a,method_name:$m,args_base64:$b}}')" | jq -c '.result.result | implode | fromjson'; }

(cd "$ROOT/contracts/nectar-core" && cargo near build non-reproducible-wasm 2>&1 | tail -n 3)
NEW_SHA=$(shasum -a 256 "$WASM" | cut -d' ' -f1); NEW_SIZE=$(wc -c <"$WASM" | tr -d ' ')
LIVE=$(acct "$CORE" | jq -r '.result.code_hash')
echo "live code_hash=$LIVE  new wasm sha256=$NEW_SHA size=$NEW_SIZE"
if [ "$LIVE" != "$P0_CODE_HASH" ]; then
  if [ "$(view get_state_version 2>/dev/null)" = "1" ]; then echo "already upgraded (state_version 1); nothing to do"; exit 0; fi
  echo "live code is neither the P0 build nor a migrated V1 — stop (GATE_FAIL candidate)" >&2; exit 3
fi
mkdir -p "$ROOT/evidence/G4"; view get_exit_capacity '{"symbol":"NVDAx"}' > "$ROOT/evidence/G4/pre-upgrade-exit-capacity.json"
view list_positions '{"from_index":0,"limit":16}' > "$ROOT/evidence/G4/pre-upgrade-positions.json"
view list_quotes '{"symbol":"NVDAx","from_index":0,"limit":16}' > "$ROOT/evidence/G4/pre-upgrade-quotes.json"

log "top up $CORE storage from $OWNER (${UPGRADE_TOPUP_NEAR:-0.45} NEAR)"
near tokens "$OWNER" send-near "$CORE" "${UPGRADE_TOPUP_NEAR:-0.45} NEAR" network-config testnet sign-with-keychain send </dev/null
log "deploy V1 + migrate (one transaction, signed by $CORE)"
near contract deploy "$CORE" use-file "$WASM" with-init-call migrate json-args '{}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
  network-config testnet sign-with-keychain send </dev/null
sleep 3
echo "state_version=$(view get_state_version)  contract_version=$(view contract_version)  code_hash=$(acct "$CORE" | jq -r '.result.code_hash')"
view list_positions '{"from_index":0,"limit":16}' > "$ROOT/evidence/G4/post-upgrade-positions.json"
view list_quotes '{"symbol":"NVDAx","from_index":0,"limit":16}' > "$ROOT/evidence/G4/post-upgrade-quotes.json"
for f in positions quotes; do
  cmp -s "$ROOT/evidence/G4/pre-upgrade-$f.json" "$ROOT/evidence/G4/post-upgrade-$f.json" && echo "$f unchanged by migrate" || echo "WARNING: $f differ — inspect evidence/G4/*-$f.json"
done
