#!/usr/bin/env bash
# WO-61 rollout: code-only upgrade of the two mock tokens to the faucet build, then set_faucet from config.yaml `faucet`.
# Kunal approved 2026-11-12 (docs/process/state.md): account ids unchanged, balances and state kept, nectar-core untouched. Orchestrator-run only.
# Steps: 1 wasm size vs each token account's free storage (top up from the owner if short) · 2 views before · 3 code-only deploy (scripts/29 syntax)
#        4 views after = before · 5 set_faucet per token · 6 faucet_config views. Log: evidence/rollout/mockft-faucet-<ts>.log
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel); cd "$ROOT"
. scripts/_lib.sh
TS=$(date -u +%Y%m%dT%H%M%SZ); LOG="evidence/rollout/mockft-faucet-$TS.log"; mkdir -p evidence/rollout
exec > >(tee -a "$LOG") 2>&1
OWNER=$(cfg .accounts.owner); USDC=$(cfg .accounts.usdc_mock); NVDAX=$(cfg .accounts.nvdax_mock); CORE=$(cfg .accounts.core)
WASM="$ROOT/target/near/mock_ft/mock_ft.wasm"
RPC=${NEAR_RPC_URL:-https://test.rpc.fastnear.com}
[ -f "$WASM" ] || { echo "build first: (cd contracts/mock-ft && cargo near build non-reproducible-wasm)"; exit 2; }
echo "wasm $(wc -c <"$WASM" | tr -d ' ') B sha256 $(shasum -a 256 "$WASM" | awk '{print $1}') commit $(git rev-parse --short HEAD)"

rpc() { curl -fsS "$RPC" -H 'content-type: application/json' -d "$1"; }
view() { # view <contract> <method> <json-args>
  local a; a=$(printf '%s' "$3" | base64 | tr -d '\n')
  rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$a\"}}" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j.error||j.result.error){console.log("ERR",JSON.stringify(j.error||j.result.error).slice(0,160));return}console.log(Buffer.from(j.result.result).toString())})'
}
acct() { rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).result;console.log(r.amount, r.storage_usage)})'; }
snapshot() { for t in "$USDC" "$NVDAX"; do
  echo "$t supply $(view "$t" ft_total_supply '{}') meta $(view "$t" ft_metadata '{}' | head -c 120)"
  for a in "$CORE" "$OWNER" buyer1.nectar.testnet agent1.nectar.testnet; do echo "  $a $(view "$t" ft_balance_of "{\"account_id\":\"$a\"}")"; done
done; }

echo "== 1 storage headroom"
NEW=$(wc -c <"$WASM" | tr -d ' ')
for t in "$USDC" "$NVDAX"; do
  read -r AMT USE < <(acct "$t")
  CODE=$(rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_code\",\"finality\":\"final\",\"account_id\":\"$t\"}}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Buffer.from(JSON.parse(s).result.code_base64,"base64").length))')
  NEED=$(node -e "const amt=BigInt('$AMT'),use=BigInt($USE),d=BigInt($NEW)-BigInt($CODE);const need=(use+d+2000n)*10n**19n;console.log(need>amt?((need-amt)/10n**21n+1n).toString():'0')")
  echo "$t balance_yocto $AMT storage $USE code $CODE → new $NEW; top-up milliNEAR needed: $NEED"
  if [ "$NEED" != "0" ]; then near tokens "$OWNER" send-near "$t" "$(node -e "console.log(($NEED+20)/1000)") NEAR" network-config testnet sign-with-keychain send </dev/null 2>&1 | tail -n 2; fi
done

echo "== 2 before"; snapshot > "/tmp/mockft-before-$TS.txt"; cat "/tmp/mockft-before-$TS.txt"
echo "== 3 deploy (code-only)"
for t in "$USDC" "$NVDAX"; do near contract deploy "$t" use-file "$WASM" without-init-call network-config testnet sign-with-keychain send </dev/null 2>&1 | tail -n 2; done
sleep 3
echo "== 4 after"; snapshot > "/tmp/mockft-after-$TS.txt"; cat "/tmp/mockft-after-$TS.txt"
if diff -q "/tmp/mockft-before-$TS.txt" "/tmp/mockft-after-$TS.txt" >/dev/null; then echo "state unchanged: OK"; else echo "STATE CHANGED — stop"; diff "/tmp/mockft-before-$TS.txt" "/tmp/mockft-after-$TS.txt"; exit 5; fi

echo "== 5 set_faucet"
COOL=$(cfg .faucet.cooldown_s)
for i in 0 1; do
  T=$(cfg ".faucet.tokens[$i].token"); AMTC=$(cfg ".faucet.tokens[$i].amount_per_claim"); CAP=$(cfg ".faucet.tokens[$i].cap_per_account")
  near contract call-function as-transaction "$T" set_faucet json-args "{\"amount_per_claim\":\"$AMTC\",\"cap_per_account\":\"$CAP\",\"cooldown_s\":$COOL,\"enabled\":true}" \
    prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-keychain send </dev/null 2>&1 | tail -n 3
done
echo "== 6 faucet_config"
for t in "$USDC" "$NVDAX"; do echo "$t $(view "$t" faucet_config '{}')"; done
echo "done: $LOG"
