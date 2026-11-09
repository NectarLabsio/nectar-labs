#!/usr/bin/env bash
# Reproducible quoter build (WO-9). The wasm sha256 is the OutLayer version_key (F-045), so the bytes must not
# depend on the builder's home directory: panic locations embed dependency source paths, which we remap.
# Same rustc (see rust-version in Cargo.toml; built with 1.95.0) + same Cargo.lock → same sha256.
# Usage: quoter/build.sh   → prints "<sha256>  <bytes>  <path>" as the last line.
set -euo pipefail
cd "$(dirname "$0")"
CARGO_HOME_DIR="${CARGO_HOME:-$HOME/.cargo}"
export RUSTFLAGS="--remap-path-prefix=${CARGO_HOME_DIR}/registry/src=/cargo/registry/src --remap-path-prefix=$PWD=/quoter"
cargo build --locked --release --target wasm32-wasip2 >&2
WASM=target/wasm32-wasip2/release/nectar_quoter.wasm
SHA=$( (command -v sha256sum >/dev/null && sha256sum "$WASM" || shasum -a 256 "$WASM") | cut -d' ' -f1)
echo "rustc: $(rustc --version)" >&2
echo "$SHA  $(wc -c < "$WASM" | tr -d ' ')  $PWD/$WASM"
