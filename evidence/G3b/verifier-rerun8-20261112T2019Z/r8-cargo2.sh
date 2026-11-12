#!/bin/bash
# G3b run 8 (n) re-run of the cargo tests with the host SDK workaround (env only, not a repo change): the default CLT SDK MacOSX27.0
# .tbd files name arm64e.x1 architectures that ld rejects ("tapi error: malformed file"), so build scripts fail to link.
set -u
D=/tmp/verify-G3b-r8-20261112T2019Z
EV=$D/ev/n
L=$EV/cargo-phase.txt
export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
t() { date -u +%H:%M:%SZ; }
log() { echo "[$(t)] $*" | tee -a "$L"; }
cd "$D" || exit 1
cp /private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad/r8-cargo2.sh "$D/ev/"
log "re-run with SDKROOT=$SDKROOT"
cargo test -p mock-ft > "$EV/mockft-test-sdkroot.log" 2>&1; log "cargo test -p mock-ft exit $?"
log "mock-ft results: $(/usr/bin/grep -E 'Running |^test result:' "$EV/mockft-test-sdkroot.log" | tr '\n' ' ' | cut -c1-700)"
log "workspace test start"
cargo test --workspace > "$EV/workspace-test-sdkroot.log" 2>&1; log "cargo test --workspace exit $?"
/usr/bin/grep -E 'Running |^test result:' "$EV/workspace-test-sdkroot.log" > "$EV/workspace-summary.txt"
log "workspace results: $(/usr/bin/grep -E '^test result:' "$EV/workspace-test-sdkroot.log" | awk '{p+=$4; f+=$6; i+=$8} END {print "passed " p ", failed " f ", ignored " i}')"
log "cargo2 done"
