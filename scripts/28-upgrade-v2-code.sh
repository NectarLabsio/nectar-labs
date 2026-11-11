#!/usr/bin/env bash
# P2b (D-026, WO-29a): code-only upgrade of the LIVE nectar-core-v2 to the Base-signing build — no migrate, no layout change (sandbox-proven:
# tests/sandbox_evm upgrade-over-v2). Snapshots views before/after and fails if anything but contract_version changes. Storage top-up computed
# from the wasm size delta (1E19 yocto/byte, F-014) plus a margin.
source "$(dirname "$0")/_lib.sh"; guard_mainnet
OWNER=$(cfg .accounts.owner); CORE=$(cfg .accounts.core); RPC="${NEAR_RPC_URL:-https://test.rpc.fastnear.com}"
WASM="$ROOT/target/near/nectar_core/nectar_core.wasm"
(cd "$ROOT/contracts/nectar-core" && cargo near build non-reproducible-wasm 2>&1 | tail -n 2)
q() { curl -s "$RPC" -H 'content-type: application/json' -d "$1"; }
acct() { q "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$CORE\"}}"; }
view() { q "$(jq -cn --arg a "$CORE" --arg m "$1" --arg b "$(printf '%s' "$2" | base64)" '{jsonrpc:"2.0",id:1,method:"query",params:{request_type:"call_function",finality:"final",account_id:$a,method_name:$m,args_base64:$b}}')" | jq -c '.result.result | implode | fromjson'; }
snap() { for v in 'get_config|{}' 'get_pool|{}' 'list_quotes|{"symbol":"NVDAx","from_index":0,"limit":50}' 'list_positions|{"from_index":0,"limit":50}' \
  'get_reserve|{"symbol":"NVDAx"}' 'nft_total_supply|{}' 'get_session_calendar|{"from_index":0,"limit":5}' 'get_remote_config|{}' 'get_quoter_config|{}'; do
  echo "${v%%|*} $(view "${v%%|*}" "${v#*|}" | jq -c 'if type=="object" then del(.contract_version) else . end')"; done; }
VER0=$(view contract_version '{}'); echo "live version $VER0"
case "$VER0" in *'2.0.'*|*'2.1.'*|*'2.2.'*) ;; *) echo "unexpected live version $VER0 — stop" >&2; exit 3;; esac
snap > /tmp/nectar-v2-before.$$
NEW=$(wc -c <"$WASM" | tr -d ' '); A=$(acct); USED=$(echo "$A" | jq -r .result.storage_usage); AMT=$(echo "$A" | jq -r .result.amount)
OLD=$(q "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_code\",\"finality\":\"final\",\"account_id\":\"$CORE\"}}" | jq -r '.result.code_base64 | length * 3 / 4 | floor')
NEED=$(python3 -c "print(max(0, ($USED - $OLD + $NEW) * 10**19 + 5*10**22 - $AMT))")
echo "wasm old≈$OLD new=$NEW storage_usage=$USED balance=$AMT topup_yocto=$NEED"
if [ "$NEED" != "0" ]; then near tokens "$OWNER" send-near "$CORE" "$(python3 -c "print(f'{$NEED/1e24+0.01:.4f}')") NEAR" network-config testnet sign-with-keychain send </dev/null; fi
near contract deploy "$CORE" use-file "$WASM" without-init-call network-config testnet sign-with-keychain send </dev/null
sleep 3; echo "new version $(view contract_version '{}')"
snap > /tmp/nectar-v2-after.$$
if diff /tmp/nectar-v2-before.$$ /tmp/nectar-v2-after.$$ >/dev/null; then echo "VIEWS IDENTICAL (except contract_version)"; else
  echo "VIEWS CHANGED:" >&2; diff /tmp/nectar-v2-before.$$ /tmp/nectar-v2-after.$$ | head -20 >&2; fi
echo "remote chains now: $(view get_remote_chains '{"symbol":"NVDAx"}')"
rm -f /tmp/nectar-v2-before.$$ /tmp/nectar-v2-after.$$
