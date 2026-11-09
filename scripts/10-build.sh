#!/usr/bin/env bash
source "$(dirname "$0")/_lib.sh"
MODE="${1:-non-reproducible-wasm}"   # reproducible-wasm for the submitted artifact
log "contracts ($MODE)"
for c in nectar-core mock-ft; do (cd "$ROOT/contracts/$c" && cargo near build "$MODE" 2>&1 | tail -n 40); done
if [ -f "$ROOT/quoter/Cargo.toml" ]; then (cd "$ROOT/quoter" && cargo build --release --target wasm32-wasip2 2>&1 | tail -n 20 && shasum -a 256 target/wasm32-wasip2/release/*.wasm); fi
if [ -f "$ROOT/solana/Anchor.toml" ]; then (cd "$ROOT/solana" && anchor build 2>&1 | tail -n 20); fi
