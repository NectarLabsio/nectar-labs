#!/usr/bin/env bash
# shared helpers: fail loudly on missing vars, read config.yaml, retry with backoff.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG="$ROOT/packages/config/config.yaml"
need() { for v in "$@"; do [ -n "${!v:-}" ] && [ "${!v}" != "TODO-G2" ] || { echo "missing: $v (see .env.example / FACTS §Account ids)" >&2; exit 2; }; done; }
cfg() { command -v yq >/dev/null || { echo "yq required (brew install yq / pip install yq)" >&2; exit 2; }; yq -r "$1" "$CFG"; }
retry() { local n=0 max=${RETRIES:-5} delay=${DELAY:-90}; until "$@"; do n=$((n+1)); [ $n -ge $max ] && return 1; echo "retry $n/$max in ${delay}s" >&2; sleep "$delay"; done; }
log() { printf '\n== %s ==\n' "$*" >&2; }
guard_mainnet() { [ "${NEAR_NETWORK:-testnet}" = "testnet" ] || { echo "mainnet is HUMAN-only (H6)" >&2; exit 3; }; }
# macOS host quirk (WO-2, 2026-11-10): the default MacOSX27 SDK breaks ld for some build scripts; use the 26.x SDK if present.
if [ "$(uname -s)" = "Darwin" ] && [ -z "${SDKROOT:-}" ]; then
  for sdk in /Library/Developer/CommandLineTools/SDKs/MacOSX26*.sdk; do [ -d "$sdk" ] && export SDKROOT="$sdk"; done
fi
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
