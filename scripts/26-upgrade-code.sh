#!/usr/bin/env bash
# Code-only upgrade of the live nectar-core (V1 → V1.x): no migrate, the V1 root struct is unchanged (proven by the V1-fixture
# upgrade test in tests/sandbox_p1.rs). Top-up is computed from the storage gap (1E19 yocto/byte, F-014/F-176) plus a margin.
source "$(dirname "$0")/_lib.sh"; guard_mainnet
OWNER=$(cfg .accounts.owner); CORE=$(cfg .accounts.core)
WASM="$ROOT/target/near/nectar_core/nectar_core.wasm"; RPC="${NEAR_RPC_URL:-https://rpc.testnet.near.org}"
acct() { curl -s "$RPC" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}"; }
view() { curl -s "$RPC" -H 'content-type: application/json' -d "$(jq -cn --arg a "$CORE" --arg m "$1" --arg b "$(printf '%s' "${2:-{\}}" | base64)" \
  '{jsonrpc:"2.0",id:1,method:"query",params:{request_type:"call_function",finality:"final",account_id:$a,method_name:$m,args_base64:$b}}')" | jq -c '.result.result | implode | fromjson'; }
(cd "$ROOT/contracts/nectar-core" && cargo near build non-reproducible-wasm 2>&1 | tail -n 2)
NEW_SIZE=$(wc -c <"$WASM" | tr -d ' '); NEW_SHA=$(shasum -a 256 "$WASM" | cut -d' ' -f1)
[ "$(view get_state_version)" = "1" ] || { echo "live state_version is not 1 — use scripts/25 or stop" >&2; exit 3; }
A=$(acct "$CORE"); BAL=$(echo "$A" | jq -r '.result.amount'); USED=$(echo "$A" | jq -r '.result.storage_usage'); LIVE_HASH=$(echo "$A" | jq -r '.result.code_hash')
echo "live code_hash=$LIVE_HASH storage=$USED B balance=$BAL; new wasm sha256=$NEW_SHA size=$NEW_SIZE"
TS=$(date -u +%Y%m%dT%H%MZ); D="$ROOT/evidence/upgrades/$TS"; mkdir -p "$D"
for v in "get_exit_capacity {\"symbol\":\"NVDAx\"}" "list_positions {\"from_index\":0,\"limit\":16}" "list_quotes {\"symbol\":\"NVDAx\",\"from_index\":0,\"limit\":16}" "get_quoter_config {}" "get_pool {}"; do
  set -- $v; view "$1" "$2" > "$D/pre-$1.json"; done
# Old code is replaced: new usage ≈ used − old_code + new_code; + 0.05 NEAR margin for state growth.
OLD_SIZE=$(curl -s "$RPC" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_code\",\"finality\":\"final\",\"account_id\":\"$CORE\"}}" \
  | jq -r '.result.code_base64' | base64 -d | wc -c | tr -d ' ')
echo "live code size=$OLD_SIZE B"; [ "${OLD_SIZE:-0}" -gt 100000 ] || { echo "could not read live code size" >&2; exit 3; }
NEED=$(python3 -c "print(max(0, ($USED - $OLD_SIZE + $NEW_SIZE) * 10**19 + 5*10**22 - $BAL))")
if [ "$NEED" != "0" ]; then
  TOPUP=$(python3 -c "print(f'{$NEED/1e24:.3f}')"); log "top up $CORE by $TOPUP NEAR from $OWNER"
  near tokens "$OWNER" send-near "$CORE" "$TOPUP NEAR" network-config testnet sign-with-keychain send </dev/null
fi
log "deploy (code only, no init call)"
near contract deploy "$CORE" use-file "$WASM" without-init-call network-config testnet sign-with-keychain send </dev/null
sleep 3
echo "state_version=$(view get_state_version) contract_version=$(view contract_version) code_hash=$(acct "$CORE" | jq -r '.result.code_hash')"
for v in get_exit_capacity list_positions list_quotes get_quoter_config get_pool; do
  case $v in get_exit_capacity) a='{"symbol":"NVDAx"}';; list_positions) a='{"from_index":0,"limit":16}';; list_quotes) a='{"symbol":"NVDAx","from_index":0,"limit":16}';; *) a='{}';; esac
  view "$v" "$a" > "$D/post-$v.json"
  if [ "$v" = get_exit_capacity ]; then jq -S 'del(.oracle_age_s)' "$D/pre-$v.json" > "$D/a"; jq -S 'del(.oracle_age_s)' "$D/post-$v.json" > "$D/b"; else jq -S . "$D/pre-$v.json" > "$D/a"; jq -S . "$D/post-$v.json" > "$D/b"; fi
  cmp -s "$D/a" "$D/b" && echo "$v unchanged" || echo "CHANGED: $v (see $D)"
done; rm -f "$D/a" "$D/b"
