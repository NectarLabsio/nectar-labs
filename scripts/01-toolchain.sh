#!/usr/bin/env bash
# Install the pinned P0 toolchain into the user's home (no sudo). Idempotent: skips what is present.
# Pins are FACTS F-010/F-011 + G0 entries (F-022..F-025). Anchor/Solana are P2 (`--with-solana`).
# Usage: scripts/01-toolchain.sh [--with-solana]
set -euo pipefail
RUST_VERSION="${RUST_VERSION:-1.95.0}"
NEAR_CLI_TAG="v0.31.1"
CARGO_NEAR_TAG="cargo-near-v0.23.0"
GITLEAKS_VERSION="8.30.1"
YQ_VERSION="v4.54.3"
PNPM_VERSION="10.34.9"
BIN="$HOME/.local/bin"; mkdir -p "$BIN"
export PATH="$HOME/.cargo/bin:$BIN:$PATH"
log() { printf '\n== %s ==\n' "$*" >&2; }
os="$(uname -s | tr '[:upper:]' '[:lower:]')"; arch="$(uname -m)"; [ "$arch" = "x86_64" ] && garch=amd64 || garch=arm64

if ! command -v rustup >/dev/null; then
  log "rustup + Rust $RUST_VERSION"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain "$RUST_VERSION"
fi
rustup toolchain install "$RUST_VERSION" --profile minimal --component rustfmt,clippy
rustup default "$RUST_VERSION"
rustup target add wasm32-unknown-unknown wasm32-wasip2

if ! command -v near >/dev/null; then
  log "near-cli-rs $NEAR_CLI_TAG"
  curl --proto '=https' --tlsv1.2 -LsSf "https://github.com/near/near-cli-rs/releases/download/$NEAR_CLI_TAG/near-cli-rs-installer.sh" | sh
fi
if ! cargo near --version >/dev/null 2>&1; then
  log "cargo-near $CARGO_NEAR_TAG"
  curl --proto '=https' --tlsv1.2 -LsSf "https://github.com/near/cargo-near/releases/download/$CARGO_NEAR_TAG/cargo-near-installer.sh" | sh
fi
if ! command -v gitleaks >/dev/null; then
  log "gitleaks $GITLEAKS_VERSION"
  curl -sSL "https://github.com/gitleaks/gitleaks/releases/download/v$GITLEAKS_VERSION/gitleaks_${GITLEAKS_VERSION}_${os}_${garch/amd64/x64}.tar.gz" | tar -xz -C "$BIN" gitleaks
fi
if ! command -v yq >/dev/null; then
  log "yq $YQ_VERSION"
  curl -sSL -o "$BIN/yq" "https://github.com/mikefarah/yq/releases/download/$YQ_VERSION/yq_${os}_${garch}" && chmod +x "$BIN/yq"
fi
log "pnpm $PNPM_VERSION via corepack"
corepack enable --install-directory "$BIN" pnpm 2>/dev/null || corepack enable pnpm
corepack prepare "pnpm@$PNPM_VERSION" --activate

if [ "${1:-}" = "--with-solana" ]; then
  command -v solana >/dev/null || sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
  command -v avm >/dev/null || cargo install --git https://github.com/solana-foundation/anchor avm --force
  avm install 0.32.1 && avm use 0.32.1
fi

log "versions"
for c in "rustc --version" "cargo near --version" "near --version" "node -v" "pnpm -v" "gitleaks version" "yq --version"; do
  printf '%-22s %s\n' "$c" "$($c 2>&1 | head -1)"
done
echo "Add to PATH if missing: \$HOME/.cargo/bin and $BIN"
