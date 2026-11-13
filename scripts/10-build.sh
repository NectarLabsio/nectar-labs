#!/usr/bin/env bash
source "$(dirname "$0")/_lib.sh"
MODE="${1:-non-reproducible-wasm}"   # reproducible-wasm for the submitted artifact
log "contracts ($MODE)"
for c in nectar-core mock-ft; do (cd "$ROOT/contracts/$c" && cargo near build "$MODE" 2>&1 | tail -n 40); done
if [ -f "$ROOT/quoter/build.sh" ]; then log "quoter (path-remapped, reproducible sha = version_key, D-014)"; bash "$ROOT/quoter/build.sh" 2>&1 | tail -n 20; fi
if [ -f "$ROOT/solana/Anchor.toml" ]; then (cd "$ROOT/solana" && anchor build 2>&1 | tail -n 20); fi
