#!/bin/bash
D=$1; L=$D/evidence/G11/rerun-d027; mkdir -p $L; cd $D
export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
date -u +%FT%TZ > $L/start.txt
cargo test -p nectar-core --no-fail-fast -- --nocapture > $L/cargo-test-nectar-core.log 2>&1; echo "EXIT=$?" >> $L/cargo-test-nectar-core.log
cargo test -p mock-ft > $L/cargo-test-mock-ft.log 2>&1; echo "EXIT=$?" >> $L/cargo-test-mock-ft.log
python3 contracts/nectar-core/tests/model.py --check --v7 > $L/model-check.log 2>&1; echo "EXIT=$?" >> $L/model-check.log
(cd contracts/nectar-core && cargo near build non-reproducible-wasm) > $L/cargo-near-build.log 2>&1; echo "EXIT=$?" >> $L/cargo-near-build.log
W=$(ls target/near/nectar_core/nectar_core.wasm 2>/dev/null || find target/near -name 'nectar_core.wasm' | head -1)
{ echo "wasm=$W"; stat -f '%z bytes' $W; shasum -a 256 $W; python3 -c "import hashlib,sys;import base64;d=hashlib.sha256(open('$W','rb').read()).digest();A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';n=int.from_bytes(d,'big');s='';
while n: n,r=divmod(n,58); s=A[r]+s
print('base58',s)"; } > $L/wasm-hash.txt 2>&1
date -u +%FT%TZ > $L/end.txt; echo DONE > $L/DONE
