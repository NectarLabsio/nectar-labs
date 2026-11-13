#!/usr/bin/env bash
# Read-only checks against public testnet state; used by G2 and by `pnpm demo:testnet`. No keys, no near CLI.
# Implementation: scripts/demo-testnet.mjs (ABI docs/process/work/interface-p0.md, ids packages/config/config.yaml).
set -euo pipefail
exec node "$(dirname "$0")/demo-testnet.mjs" "$@"
