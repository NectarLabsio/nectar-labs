#!/usr/bin/env bash
# WO-6a (addendum §5, D-018, D-019): deploy nectar-core v2 BESIDE v1 (no migrate) and configure it. v1 stays untouched as evidence.
#   1. funds check (owner needs ~8 NEAR: H-NEAR-FAUCET)     2. nectar-core-v2 + keeper-v2 accounts
#   3. keeper-v2 function-call key generated locally into ~/.nectar/keys/keeper-v2.function-call.json (0600; only the public key is
#      passed to near-cli; the private key is never printed), then keeper-v2's full-access key is deleted (D-012 pattern)
#   4. mock-ft code-only upgrade (multiplier() + update_multiplier under a raw key, WO-19)   5. v2 deploy with `new`
#   6. collateral, owner price, session calendar (22-session-calendar.mjs), signer, remote chain (Solana vault), gas reserve, keeper attestation
#      flag (testnet fallback, labelled on the Feed)   7. config switch ONLY with --switch (after G2b passes the orchestrator re-runs with it)
# Usage: scripts/21-deploy-v2.sh [--switch]
source "$(dirname "$0")/_lib.sh"; guard_mainnet
RPC="${NEAR_RPC_URL:-https://test.rpc.fastnear.com}"
OWNER=$(cfg .accounts.owner); USDC=$(cfg .accounts.usdc_mock); NVDAX=$(cfg .accounts.nvdax_mock)
CORE2=$(cfg .v7.core_v2); KEEPER2=$(cfg .v7.keeper_v2)
W="$ROOT/target/near"; CORE_WASM="$W/nectar_core/nectar_core.wasm"; FT_WASM="$W/mock_ft/mock_ft.wasm"
[ -f "$CORE_WASM" ] && [ -f "$FT_WASM" ] || { echo "run scripts/10-build.sh first" >&2; exit 2; }
CORE2_NEAR=${CORE2_NEAR:-9}; KEEPER2_NEAR=${KEEPER2_NEAR:-0.5}; GAS_RESERVE_NEAR=${GAS_RESERVE_NEAR:-1}

rpc() { curl -s "$RPC" -H 'content-type: application/json' -d "$1"; }
acct() { rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}"; }
near_bal() { acct "$1" | jq -r '(.result.amount // "0") | tonumber / 1e24'; }
exists() { acct "$1" | jq -e '.result.amount' >/dev/null; }
code_hash() { acct "$1" | jq -r '.result.code_hash // "none"'; }
call() { near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas "${5:-50 Tgas}" attached-deposit "${6:-0 NEAR}" \
  sign-as "$4" network-config testnet sign-with-keychain send </dev/null; }
owner_call() { call "$CORE2" "$1" "$2" "$OWNER" "${3:-50 Tgas}" "${4:-0 NEAR}"; }

log "1: funds"
NEED=$(echo "$CORE2_NEAR + $KEEPER2_NEAR + $GAS_RESERVE_NEAR + 0.5" | bc)
HAVE=$(near_bal "$OWNER"); echo "owner $OWNER has $HAVE NEAR; needs ~$NEED (skips already-created accounts)"
if ! exists "$CORE2" && [ "$(echo "$HAVE < $NEED" | bc)" = 1 ]; then
  echo "insufficient testnet NEAR → H-NEAR-FAUCET (docs/HUMAN_HANDOFF.md). Nothing was changed." >&2; exit 2; fi

log "2: accounts"
create() { exists "$1" && { echo "skip $1 (exists)"; return; }
  near account create-account fund-myself "$1" "$2 NEAR" autogenerate-new-keypair save-to-keychain sign-as "$OWNER" \
    network-config testnet sign-with-keychain send </dev/null; }
create "$CORE2" "$CORE2_NEAR"; create "$KEEPER2" "$KEEPER2_NEAR"

log "3: keeper-v2 function-call key (D-019 methods) + delete its full-access key"
KF="$HOME/.nectar/keys/keeper-v2.function-call.json"; mkdir -p "$HOME/.nectar/keys"; chmod 700 "$HOME/.nectar" "$HOME/.nectar/keys"
if [ ! -f "$KF" ]; then
  ( umask 077; node -e '
    const c=require("crypto"),fs=require("fs");const A="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const b58=b=>{let n=BigInt("0x"+(Buffer.from(b).toString("hex")||"0")),s="";while(n>0n){s=A[Number(n%58n)]+s;n/=58n}for(const x of b){if(x)break;s="1"+s}return s};
    const {publicKey,privateKey}=c.generateKeyPairSync("ed25519");
    const pub=publicKey.export({format:"der",type:"spki"}).subarray(-32), seed=privateKey.export({format:"der",type:"pkcs8"}).subarray(-32);
    fs.writeFileSync(process.argv[1],JSON.stringify({account_id:process.argv[2],public_key:"ed25519:"+b58(pub),private_key:"ed25519:"+b58(Buffer.concat([seed,pub]))}),{mode:0o600});
  ' "$KF" "$KEEPER2" )
fi
chmod 600 "$KF"; FC_PUB=$(jq -r .public_key "$KF"); echo "keeper-v2 function-call public key: $FC_PUB"
KEYS=$(rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key_list\",\"finality\":\"final\",\"account_id\":\"$KEEPER2\"}}")
if ! echo "$KEYS" | jq -e --arg k "$FC_PUB" '.result.keys[] | select(.public_key == $k)' >/dev/null; then
  near account add-key "$KEEPER2" grant-function-call-access --allowance '0.4 NEAR' --contract-account-id "$CORE2" \
    --function-names 'trigger_preliquidation,relay_settlement_result,confirm_remote_deposit,keeper_attest_deposit,relay_release_result' \
    use-manually-provided-public-key "$FC_PUB" network-config testnet sign-with-keychain send </dev/null
fi
FULL=$(echo "$KEYS" | jq -r '.result.keys[] | select(.access_key.permission == "FullAccess") | .public_key' | head -1)
if [ -n "$FULL" ]; then near account delete-keys "$KEEPER2" public-keys "$FULL" network-config testnet sign-with-keychain send </dev/null; fi

log "4: mock-ft code-only upgrade (multiplier under a raw key)"
for t in "$USDC" "$NVDAX"; do
  near contract deploy "$t" use-file "$FT_WASM" without-init-call network-config testnet sign-with-keychain send </dev/null
  near contract call-function as-read-only "$t" multiplier json-args '{}' network-config testnet now </dev/null | tail -n 1
done

log "5: deploy v2"
if [ "$(code_hash "$CORE2")" = "11111111111111111111111111111111" ]; then
  near contract deploy "$CORE2" use-file "$CORE_WASM" with-init-call new \
    json-args "$(jq -cn --arg o "$OWNER" --arg u "$USDC" --arg k "$KEEPER2" '{owner:$o, usdc_token:$u, keeper:$k}')" \
    prepaid-gas '50 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send </dev/null
else echo "skip deploy (code present)"; fi
near contract call-function as-read-only "$CORE2" contract_version json-args '{}' network-config testnet now </dev/null | tail -n 1

log "6: configure"
COLL="$(yq -o=json -I=0 '.collateral.nvdax | .token = "'$NVDAX'" | .remote_chain = null | .price_kind = "Underlying"
  | .verified_dex_depth_usd_e6 = (.verified_dex_depth_usd_e6 | tostring) | del(.nectar_reserve_usd_e6)' "$CFG")"
owner_call upsert_collateral '{"symbol":"NVDAx","config":'"$COLL"'}'
owner_call update_owner_price '{"symbol":"NVDAx","price_usd_e6":"180000000"}'
node "$ROOT/scripts/22-session-calendar.mjs" > "$ROOT/evidence/merge/v2-calendar-args.json"
owner_call set_session_calendar "$(cat "$ROOT/evidence/merge/v2-calendar-args.json")" '100 Tgas'
owner_call set_signer_config "$(jq -cn --arg a "$(cfg .signer.account)" '{account:$a, path:"solana-devnet-v1", gas_tgas:30, expiry_s:3600}')"
VAULT=$(cfg .solana.vault_program)
[ "$VAULT" != "TODO-G7" ] && owner_call set_remote_chain "$(jq -cn --arg v "$VAULT" '{symbol:"NVDAx", remote_chain:{chain_id:"solana-devnet", vault_program:$v, mpc_domain_id:1}}')"
owner_call set_allow_keeper_deposit_attestation '{"allow":true}'
# Nectar Reserve (WO-23b, D-024): discount above every demo quote ceiling (250/400 bps), notice pinned to the PRD's 7 days.
owner_call set_reserve_params '{"symbol":"NVDAx","discount_bps":600,"notice_ns":"604800000000000"}'
# Profit-Lock is off until a daily voluntary-fill cap is set (WO-23a default 0): testnet demo cap $5,000/day.
owner_call set_max_voluntary_fill '{"symbol":"NVDAx","max_usd_e6_per_day":"5000000000"}'
owner_call fund_gas_reserve '{}' '30 Tgas' "$GAS_RESERVE_NEAR NEAR"
# Quoter pin + vault_read job config are set by scripts/30-quoter-publish.sh pin (after WO-24 publishes a new version_key).

if [ "${1:-}" = "--switch" ]; then
  log "7: switch config to v2 (v1 kept under accounts.core_v1)"
  yq -i '.accounts.core_v1 = .accounts.core | .accounts.core = "'$CORE2'" | .accounts.keeper_v1 = .accounts.keeper | .accounts.keeper = "'$KEEPER2'"' "$CFG"
fi
echo "https://testnet.nearblocks.io/address/$CORE2  code_hash=$(code_hash "$CORE2")"
echo "next: scripts/40-seed-demo.sh (after --switch), then the verifier runs G2b/G3b"
