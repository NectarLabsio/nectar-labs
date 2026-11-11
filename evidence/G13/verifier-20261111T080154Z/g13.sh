#!/bin/bash
S=$(dirname "$0"); RPC=http://127.0.0.1:8545; V=0xC64b733424C8d25fB574F275007ED8756e261226; TOK=0x634F88DAEf0a1f77645c523C3FA351Fe37aaf81d
DEP=0x85D051D8CD3fEe54FdE043499C75fa95eeB9F30A; BUY=0xcA61FE6F57a6A36Dedf2b99E1D4D8923b1D71fa1; KEEPER_EOA=0xe4a5fb078aead3d67c7acdb7d0c2895bdb47c991
lc() { echo "$1" | tr 'A-F' 'a-f'; }
echo "fork chain-id $(cast chain-id --rpc-url $RPC) block $(cast block-number --rpc-url $RPC) vault code bytes $(( ($(cast code $V --rpc-url $RPC | wc -c) - 3) / 2 )) token code bytes $(( ($(cast code $TOK --rpc-url $RPC | wc -c) - 3) / 2 ))"
run() { p=$1; AUTH=$2; TX=$3; NMSG=$4; SIG=$5; HSIG=$6; NIDX=$7
  echo "## position $p"
  DPK=$($S/nv.sh v1.signer-prod.testnet derived_public_key "{\"path\":\"base-sepolia/pos/$p\",\"predecessor\":\"nectar-core-v2.nectar.testnet\",\"domain_id\":0}" | tr -d '"')
  HEX=$(node -e "const A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const c of process.argv[1].split(':')[1])n=n*58n+BigInt(A.indexOf(c));console.log(n.toString(16).padStart(128,'0'))" "$DPK")
  ADDR=0x$(cast keccak 0x$HEX | cut -c27-66)
  echo "derived_public_key(base-sepolia/pos/$p, domain 0) = $DPK -> keccak addr $ADDR ; NEAR authority $AUTH ; $( [ "$(lc $ADDR)" = "$AUTH" ] && echo MATCH || echo MISMATCH)"
  R=$(cast receipt $TX --rpc-url $RPC --json </dev/null); BN=$(( $(echo $R | jq -r .blockNumber) ))
  echo "relay tx $TX status=$(echo $R | jq -r .status) block=$BN from=$(echo $R | jq -r .from) to=$(echo $R | jq -r .to)"
  IN=$(cast tx $TX input --rpc-url $RPC </dev/null)
  cast decode-calldata "$SIG" $IN </dev/null | sed -E 's/ \[[^]]*\]//g' > $S/dec.txt
  ST=$(sed -n 1p $S/dec.txt); DD=$(sed -n 2p $S/dec.txt); VV=$(sed -n 3p $S/dec.txt); RR=$(sed -n 4p $S/dec.txt); SS=$(sed -n 5p $S/dec.txt)
  echo "decoded: struct=$ST depositor=$DD v=$VV r=$RR s=$SS"
  DG=$(cast call $V "$HSIG" "$ST" --rpc-url $RPC </dev/null)
  echo "vault digest $DG ; NEAR signed message $NMSG ; $( [ "$DG" = "$NMSG" ] && echo EQUAL || echo DIFFERENT)"
  REC=0x$(cast call 0x0000000000000000000000000000000000000001 --data $(cast concat-hex $DG $(cast to-uint256 $VV </dev/null) $RR $SS </dev/null) --rpc-url $RPC </dev/null | cut -c27-66)
  echo "ecrecover(digest,v,r,s) = $REC ; authority $AUTH ; $( [ "$(lc $REC)" = "$AUTH" ] && echo MATCH || echo MISMATCH)"
  echo "positionOf($p, depositor) = $(cast call $V 'positionOf(uint64,address)(address,address,uint256,uint8)' $p $DEP --rpc-url $RPC </dev/null | tr '\n' ' ')"
  SK=$(cast keccak $(cast abi-encode 'f(uint64,address)' $p $DEP </dev/null) </dev/null); N=$(echo "$ST" | tr -d '() ' | cut -d, -f$NIDX)
  echo "nonceUsed(slotKey=$SK, nonce=$N) = $(cast call $V 'nonceUsed(bytes32,uint64)(bool)' $SK $N --rpc-url $RPC </dev/null)"
  for A in $DEP $BUY; do echo "token balance $A @$((BN-1)) $(cast call $TOK 'balanceOf(address)(uint256)' $A --block $((BN-1)) --rpc-url $RPC </dev/null) -> @$BN $(cast call $TOK 'balanceOf(address)(uint256)' $A --block $BN --rpc-url $RPC </dev/null) ; latest $(cast call $TOK 'balanceOf(address)(uint256)' $A --rpc-url $RPC </dev/null)"; done
  echo "replay relay calldata from $KEEPER_EOA: $(cast call $V --data $IN --from $KEEPER_EOA --rpc-url $RPC </dev/null 2>&1 | tr '\n' ' ' | cut -c1-220)"
}
run 11 0x9de489d16f5cf59f168b0fda16e5342d977246fe 0x12f5c29b6c57b46d8ca7540d49b7227f82b8d4971f24baed01d2b4dc00600cd5 0xfc9d2e23c34bb318153bbf72c4687fd8c0c71fca2fd56aafb2a2944b945d1c49 "release((uint64,address,uint64,uint64),address,uint8,bytes32,bytes32)" "hashRelease((uint64,address,uint64,uint64))(bytes32)" 3
run 12 0x8a8a0125c5b3c1085ba3c4bd5e3da8628c98c313 0xa2fea901d3798eceb466a50007568b481db96858971fb4981d25cf477839c648 0x088c5a6f6c392396a0cf9d936cac49ab59e8c56703f4a2bead8f687fbe1a4153 "settle((uint64,uint64,uint256,uint256,address,uint64,uint64,uint8),address,uint8,bytes32,bytes32)" "hashSettle((uint64,uint64,uint256,uint256,address,uint64,uint64,uint8))(bytes32)" 6
echo "NonceUsed(uint64) selector: $(cast sig 'NonceUsed(uint64)')"
