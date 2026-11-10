#!/usr/bin/env bash
# G14 prep (addendum §6 WO-25, §9): x402-relayer.nectar.testnet (facilitator relayer, relays NEP-366 delegates) and agent1.nectar.testnet (demo agent).
# Both need FULL-ACCESS keys (F-328: the facilitator rejects function-call keys). Keys are generated locally into ~/.nectar/keys/<name>.json (0600);
# only the public key reaches near-cli; nothing secret is printed. Then agent1 is registered on both mocks and minted 2 mock NVDAx.
source "$(dirname "$0")/_lib.sh"; guard_mainnet
OWNER=$(cfg .accounts.owner); USDC=$(cfg .accounts.usdc_mock); NVDAX=$(cfg .accounts.nvdax_mock)
RELAYER=$(cfg .v7.x402_relayer); AGENT=$(cfg .v7.agent1)
RPC="${NEAR_RPC_URL:-https://rpc.testnet.fastnear.com}"
exists() { curl -s "$RPC" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" | jq -e '.result.amount' >/dev/null; }
genkey() { # file account
  [ -f "$1" ] && return; ( umask 077; node -e '
    const c=require("crypto"),fs=require("fs");const A="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const b58=b=>{let n=BigInt("0x"+(Buffer.from(b).toString("hex")||"0")),s="";while(n>0n){s=A[Number(n%58n)]+s;n/=58n}for(const x of b){if(x)break;s="1"+s}return s};
    const {publicKey,privateKey}=c.generateKeyPairSync("ed25519");
    const pub=publicKey.export({format:"der",type:"spki"}).subarray(-32), seed=privateKey.export({format:"der",type:"pkcs8"}).subarray(-32);
    fs.writeFileSync(process.argv[1],JSON.stringify({account_id:process.argv[2],public_key:"ed25519:"+b58(pub),private_key:"ed25519:"+b58(Buffer.concat([seed,pub]))}),{mode:0o600});
  ' "$1" "$2" ); chmod 600 "$1"; }
mkdir -p "$HOME/.nectar/keys"; chmod 700 "$HOME/.nectar/keys"
for spec in "$RELAYER:1" "$AGENT:0.5"; do
  A="${spec%%:*}"; AMT="${spec##*:}"; F="$HOME/.nectar/keys/${A%%.*}.json"
  genkey "$F" "$A"; PUB=$(jq -r .public_key "$F"); echo "$A pk ${PUB:0:14}… (file under ~/.nectar/keys, 0600)"
  if exists "$A"; then echo "skip $A (exists)"; else
    near account create-account fund-myself "$A" "$AMT NEAR" use-manually-provided-public-key "$PUB" sign-as "$OWNER" \
      network-config testnet sign-with-keychain send </dev/null; fi
done
call() { near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-keychain send </dev/null; }
for t in "$USDC" "$NVDAX"; do call "$t" storage_deposit "{\"account_id\":\"$AGENT\"}"; call "$t" storage_deposit "{\"account_id\":\"$RELAYER\"}"; done
call "$NVDAX" mint "{\"account_id\":\"$AGENT\",\"amount\":\"2000000\"}"
echo "done: $RELAYER, $AGENT (2 mock NVDAx). Run G14 with X402_RELAYER_KEY_PATH=~/.nectar/keys/x402-relayer.json AGENT1_KEY_PATH=~/.nectar/keys/agent1.json"
