#!/usr/bin/env bash
# D-027: one coordinated rollout of the security fix wave. Testnet/devnet/local fork only. Stop the keeper first (old code cannot read vault v2).
#   1 build all         2 nectar-core-v2 code-only → 2.2.0-v7 (scripts/28; views compared)     3 mock-ft code-only (SR-27)
#   4 Solana vault: refuse if any v1-layout position exists, `program extend`, in-place upgrade to the v2 layout
#   5 quoter: publish new wasm, re-store secrets with Or(v1 access, v2 access on the new hash), pin (quote + vault_read + jobs)
#   6 Base: redeploy the vault on the fork (BASE_RPC_URL, default local fork), swap the extra remote chain
#   7 clear a latched forced_closed from the old job behaviour (SR-13)
# Usage: scripts/29-security-upgrade.sh [from-step]   (idempotent per step; re-run from a step after fixing a failure)
source "$(dirname "$0")/_lib.sh"; guard_mainnet
FROM=${1:-1}
export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
OWNER=$(cfg .accounts.owner); CORE=$(cfg .accounts.core); USDC=$(cfg .accounts.usdc_mock); NVDAX=$(cfg .accounts.nvdax_mock)
PROG=$(cfg .solana.vault_program); URL=https://api.devnet.solana.com; K=~/.nectar/solana; RPC="${NEAR_RPC_URL:-https://test.rpc.fastnear.com}"
call() { near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas "${5:-50 Tgas}" attached-deposit "${6:-0 NEAR}" sign-as "$4" network-config testnet sign-with-keychain send </dev/null 2>&1; }
step() { [ "$FROM" -le "$1" ]; }

if step 1; then log "1: build"; find "$ROOT/solana" "$ROOT/evm" -name '._*' -delete; bash "$ROOT/scripts/10-build.sh"; fi

if step 2; then log "2: nectar-core-v2 code-only upgrade"; bash "$ROOT/scripts/28-upgrade-v2-code.sh"; fi

if step 3; then
  log "3: mock-ft code-only upgrade (SR-27)"
  for t in "$USDC" "$NVDAX"; do near contract deploy "$t" use-file "$ROOT/target/near/mock_ft/mock_ft.wasm" without-init-call network-config testnet sign-with-keychain send </dev/null 2>&1 | tail -n 2; done
fi

if step 4; then
  log "4: Solana vault v2 (in-place upgrade)"
  N=$(curl -s "$URL" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getProgramAccounts\",\"params\":[\"$PROG\",{\"encoding\":\"base64\",\"dataSlice\":{\"offset\":0,\"length\":0},\"filters\":[{\"dataSize\":123}]}]}" | jq '.result | length')
  [ "$N" = "0" ] || { echo "$N v1-layout positions exist; v2 cannot read them — stop" >&2; exit 3; }
  SO="$ROOT/solana/target/deploy/nectar_vault.so"; NEW=$(wc -c <"$SO" | tr -d ' ')
  CUR=$(solana program show "$PROG" --url $URL | awk '/Data Length/{print $3}')
  if [ "$NEW" -gt "$CUR" ]; then solana program extend "$PROG" $((NEW - CUR)) --keypair $K/deployer.json --url $URL; fi
  (cd "$ROOT/solana" && anchor upgrade --program-id "$PROG" --provider.cluster devnet --provider.wallet $K/deployer.json target/deploy/nectar_vault.so 2>&1 | tail -n 3)
  solana program show "$PROG" --url $URL | grep -E 'Data Length|Last Deployed'
fi

if step 5; then
  log "5: quoter publish + secrets + pin"
  OLD_V1=3ce17749ae1b997971d97efa8f79110b586273e39bf9ca00c61a2bdf14ea6cc2
  bash "$ROOT/scripts/30-quoter-publish.sh" publish 2>&1 | grep -E 'wasm=|Version added|Error' || true
  NEW_VK=$(yq -r .outlayer.version_key "$CFG"); echo "version_key=$NEW_VK"
  export SECRETS_ACCESS_JSON=$(jq -cn --arg o "$OLD_V1" --arg n "$NEW_VK" --arg k1 "$(cfg .accounts.keeper_v1)" --arg c1 "$(cfg .accounts.core_v1)" --arg k2 "$(cfg .accounts.keeper)" --arg c2 "$CORE" \
    '{Logic:{operator:"Or",conditions:[{Logic:{operator:"And",conditions:[{Whitelist:{accounts:[$k1]}},{Predecessor:{condition:{Whitelist:{accounts:[$c1]}}}},{WasmHash:{hash:$o}}]}},{Logic:{operator:"And",conditions:[{Whitelist:{accounts:[$k2]}},{Predecessor:{condition:{Whitelist:{accounts:[$c2]}}}},{WasmHash:{hash:$n}}]}}]}}')
  node "$ROOT/scripts/35-quoter-secrets.mjs" --quote 0:3000:2000 --quote 1:3000:2000 --quote 2:3000:2000 --quote 3:3000:2000 --profile mm-demo 2>&1 | grep -E 'Secrets stored|Error' | cut -c1-160
  bash "$ROOT/scripts/30-quoter-publish.sh" pin 2>&1 | grep -E 'quoter_pin_set|vault_read_config_set|job_config_set|Error' | cut -c1-200
fi

if step 6; then
  log "6: Base vault redeploy (local fork unless BASE_RPC_URL says otherwise) + extra chain swap"
  bash "$ROOT/scripts/26-deploy-base.sh" | tail -n 1
  VAULT=$(cfg .base.vault); BRPC=$(cfg .base.rpc_url)
  call "$CORE" remove_extra_remote_chain '{"symbol":"NVDAx","chain_id":"base-sepolia"}' "$OWNER" | grep -oE 'EVENT_JSON:\{[^│]*' | cut -c1-200 || true
  call "$CORE" set_extra_remote_chain "$(jq -cn --arg v "$VAULT" --arg r "$BRPC" '{symbol:"NVDAx", remote_chain:{chain_id:"base-sepolia", vault_program:$v, mpc_domain_id:0}, rpc_url:$r}')" "$OWNER" | grep -oE 'EVENT_JSON:\{[^│]*' | cut -c1-200
fi

if step 7; then
  log "7: clear any latched forced_closed (SR-13)"
  call "$CORE" force_session_closed '{"symbol":"NVDAx","closed":false}' "$OWNER" | grep -oE 'EVENT_JSON:\{[^│]*' | cut -c1-200 || true
fi
log "done. Next: restart the keeper, reseed remote-capable quotes, then re-run G11, G2b, G7, G13, G14."
