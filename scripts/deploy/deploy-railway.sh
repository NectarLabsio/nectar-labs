#!/usr/bin/env bash
# WO-34: upload + deploy one Railway service from an exact (G3b-passed) commit. Orchestrator-run only; agents never run it.
# Usage: scripts/deploy/deploy-railway.sh <feed> <commit>
# Prereqs:
#   - Kunal ran `npx -y @railway/cli@5.71.0 login` in his own shell (H-HOST).
#   - Project "nectar-labs", service, volume (/data), variables (incl. RAILWAY_DOCKERFILE_PATH) and domain exist; the orchestrator creates them via the
#     Railway API/MCP.
#   - The variables are non-secret only. Keys only if Kunal confirms H-KEYS (keeper), never x402 (D-031).
# Facts: F-407 (link/up), F-409 (.railwayignore + .gitignore are honoured, .dockerignore is not), F-410 (RAILWAY_DOCKERFILE_PATH), F-411 (PORT).
set -euo pipefail
SERVICE=${1:?feed}; COMMIT=${2:?commit}
case "$SERVICE" in feed) ;; *) echo "only the Feed is hosted (D-031); keeper needs H-KEYS" >&2; exit 2 ;; esac
RAILWAY=(npx -y @railway/cli@5.71.0)
PROJECT=nectar-labs
ROOT=$(git rev-parse --show-toplevel)
SHA=$(git -C "$ROOT" rev-parse --verify "$COMMIT^{commit}")
LOGDIR="$ROOT/evidence/WO-34"; mkdir -p "$LOGDIR"
LOG="$LOGDIR/deploy-railway-$SERVICE-$(date -u +%Y%m%dT%H%M%SZ).log"
WT=$(mktemp -d "${TMPDIR:-/tmp}/nectar-railway-XXXXXX")
git -C "$ROOT" worktree add --detach "$WT" "$SHA" >/dev/null
cleanup() { git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cd "$WT"
{
  echo "railway up $SERVICE commit=$SHA $(date -u +%FT%TZ)"
  "${RAILWAY[@]}" link --project "$PROJECT" --service "$SERVICE" --environment production
  "${RAILWAY[@]}" up --service "$SERVICE" --detach
} 2>&1 | tee "$LOG"
echo "log: $LOG"
