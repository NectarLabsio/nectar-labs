#!/bin/bash
# G3b run 8 (n) G11 delta (mock-ft): unit + sandbox_faucet, reproducible rebuild vs deployed code on both tokens, faucet_config, real call
# tx status, cargo test --workspace. Read-only on chain (views + tx status only). Own clone on the internal disk.
set -u
D=/tmp/verify-G3b-r8-20261112T2019Z
EV=$D/ev/n
mkdir -p "$EV"
L=$EV/cargo-phase.txt
t() { date -u +%H:%M:%SZ; }
log() { echo "[$(t)] $*" | tee -a "$L"; }
cd "$D" || exit 1
log "rustc $(rustc --version) / cargo-near $(cargo near --version 2>/dev/null)"
cargo test -p mock-ft > "$EV/mockft-test.log" 2>&1; log "cargo test -p mock-ft exit $?"
log "mock-ft results: $(/usr/bin/grep -E '^test result:|Running ' "$EV/mockft-test.log" | tr '\n' ' ' | cut -c1-600)"
(cd contracts/mock-ft && cargo near build non-reproducible-wasm > "$EV/mockft-build.log" 2>&1); RC=$?; log "cargo near build (mock-ft) exit $RC"
if [ $RC -ne 0 ]; then
  (cd contracts/mock-ft && SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk cargo near build non-reproducible-wasm > "$EV/mockft-build-sdkroot.log" 2>&1); log "retry with SDKROOT=MacOSX26.5.sdk exit $?"
fi
W=$(ls -t target/near/mock_ft*.wasm target/near/mock_ft/*.wasm 2>/dev/null | head -1)
log "built wasm: $W $(wc -c < "$W" 2>/dev/null) bytes sha256 $(shasum -a 256 "$W" | cut -d' ' -f1)"
shasum -a 256 "$W" > "$EV/mockft-built.sha256"
node "$D/ev/n/chain-views.mjs" "$W" "$EV" > "$EV/chain-views.log" 2>&1; log "chain views exit $?"
cat "$EV/chain-views.log" | tee -a "$L"
git status --porcelain | head > "$EV/git-status-after-build.txt"; log "tracked changes after build: $(wc -l < "$EV/git-status-after-build.txt" | tr -d ' ')"
log "workspace test start"
cargo test --workspace > "$EV/workspace-test.log" 2>&1; log "cargo test --workspace exit $?"
log "workspace results: $(/usr/bin/grep -E '^test result:' "$EV/workspace-test.log" | awk '{p+=$4; f+=$6; i+=$8} END {print "passed " p ", failed " f ", ignored " i}')"
/usr/bin/grep -E 'Running |^test result:' "$EV/workspace-test.log" > "$EV/workspace-summary.txt"
log "cargo done"
