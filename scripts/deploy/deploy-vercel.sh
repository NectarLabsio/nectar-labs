#!/usr/bin/env bash
# WO-34: build + deploy one Vercel project from an exact (G3b-passed) commit. Orchestrator-run only; agents never run it.
# Usage: scripts/deploy/deploy-vercel.sh <web|docs> <preview|production> <commit>
# Prereqs:
#   - Kunal ran `npx -y vercel@65.14.0 login` in his own shell (H-HOST; token in ~/Library/Application Support/com.vercel.cli, F-398).
#   - The project and its env vars exist; the orchestrator creates them via the Vercel API.
#   - The env vars are non-secret URLs only. Any secret is added by Kunal in the dashboard.
# Facts: F-396 (link/pull/build), F-397 (deploy --prebuilt --prod), F-399 (run from the monorepo root), F-400 (previews noindex).
set -euo pipefail
APP=${1:?web|docs}; TARGET=${2:?preview|production}; COMMIT=${3:?commit}
VERCEL=(npx -y vercel@65.14.0)
SCOPE=kunals-projects-35d3a237
case "$APP" in web) PROJECT=nectar-labs-web ;; docs) PROJECT=nectar-labs-docs ;; *) echo "app must be web|docs" >&2; exit 2 ;; esac
case "$TARGET" in preview) ENV=preview; PROD=() ;; production) ENV=production; PROD=(--prod) ;; *) echo "target must be preview|production" >&2; exit 2 ;; esac
ROOT=$(git rev-parse --show-toplevel)
SHA=$(git -C "$ROOT" rev-parse --verify "$COMMIT^{commit}")
LOGDIR="$ROOT/evidence/WO-34"; mkdir -p "$LOGDIR"
LOG="$LOGDIR/deploy-$APP-$TARGET-$(date -u +%Y%m%dT%H%M%SZ).log"
WT=$(mktemp -d "${TMPDIR:-/tmp}/nectar-deploy-XXXXXX")
git -C "$ROOT" worktree add --detach "$WT" "$SHA" >/dev/null
cleanup() { git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cd "$WT"
{
  echo "deploy $APP $TARGET commit=$SHA $(date -u +%FT%TZ)"
  pnpm install --frozen-lockfile --silent
  "${VERCEL[@]}" link --yes --scope "$SCOPE" --project "$PROJECT"
  "${VERCEL[@]}" pull --yes --environment "$ENV" --scope "$SCOPE"
  "${VERCEL[@]}" build "${PROD[@]}" --scope "$SCOPE"
  "${VERCEL[@]}" deploy --prebuilt "${PROD[@]}" --scope "$SCOPE"
} 2>&1 | tee "$LOG"
echo "log: $LOG"
