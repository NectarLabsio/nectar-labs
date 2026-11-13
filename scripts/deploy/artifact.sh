#!/usr/bin/env bash
# WO-34m: the source tarball for the connector deploy path (docs/process/work/wo-34m-mcp-deploy.md). Orchestrator-run only; agents never run it.
# The tarball moves local → private Railway bucket through presigned URLs issued by the artifacts function. Its bytes never pass through a tool argument.
#
# Usage:
#   scripts/deploy/artifact.sh make    <commit>              build ~/.nectar/deploy/artifacts/src-<sha>.tar.gz, print "<name> <sha256>"
#   scripts/deploy/artifact.sh upload  <commit>              presigned PUT of that file
#   scripts/deploy/artifact.sh url     <commit> <expires_s>  print a presigned GET URL (stdout only; callers redirect it, never echo it to logs)
#   scripts/deploy/artifact.sh verify  <commit>              download through a 5-minute GET URL and compare the sha256 with the local file
# Env: ARTIFACT_URL = the function's public origin. The token is read from ~/.nectar/deploy/artifact-token (0600) and sent from a 0600 header file.
#
# Contents: `git archive` of the exact commit without evidence/ contracts/ evm/ solana/ quoter/ landing/ .claude/ (not read by web, docs or Feed;
# every pnpm importer's package.json stays). It adds apps/web/lib/generated/changelog.json, made by the repo's own script in a worktree of that commit
# with git present. The Vercel build has no .git, so the web buildCommand is `next build` without re-running the changelog script.
set -euo pipefail
CMD=${1:?make|upload|url|stat}; COMMIT=${2:?commit}
ROOT=$(git rev-parse --show-toplevel)
SHA=$(git -C "$ROOT" rev-parse --verify "$COMMIT^{commit}")
DIR="$HOME/.nectar/deploy/artifacts"; mkdir -p "$DIR"; chmod 700 "$HOME/.nectar/deploy" "$DIR"
NAME="src-$SHA.tar.gz"; FILE="$DIR/$NAME"
TOKEN_FILE="$HOME/.nectar/deploy/artifact-token"

call() { # call <json-body> → response body on stdout
  : "${ARTIFACT_URL:?set ARTIFACT_URL to the artifacts function origin}"
  local hdr; hdr=$(mktemp); chmod 600 "$hdr"
  printf 'Authorization: Bearer %s\n' "$(cat "$TOKEN_FILE")" > "$hdr"
  curl -fsS --retry 2 -X POST -H @"$hdr" -H 'content-type: application/json' -d "$1" "$ARTIFACT_URL/presign"
  local rc=$?; rm -f "$hdr"; return $rc
}

case "$CMD" in
  make)
    WT=$(mktemp -d "${TMPDIR:-/tmp}/nectar-artifact-XXXXXX")
    cleanup() { git -C "$ROOT" worktree remove --force "$WT/tree" >/dev/null 2>&1 || true; rm -rf "$WT"; }
    trap cleanup EXIT
    git -C "$ROOT" worktree add --detach "$WT/tree" "$SHA" >/dev/null
    (cd "$WT/tree/apps/web" && node scripts/build-changelog.mjs) >&2
    git -C "$ROOT" archive --format=tar.gz \
      --prefix=apps/web/lib/generated/ --add-file="$WT/tree/apps/web/lib/generated/changelog.json" --prefix= \
      -o "$FILE" "$SHA" -- . \
      ':(exclude)evidence' ':(exclude)contracts' ':(exclude)evm' ':(exclude)solana' ':(exclude)quoter' ':(exclude)landing' ':(exclude).claude'
    chmod 600 "$FILE"
    echo "$NAME $(shasum -a 256 "$FILE" | awk '{print $1}')"
    ;;
  upload)
    [ -f "$FILE" ] || { echo "no $FILE; run make first" >&2; exit 2; }
    put=$(mktemp); chmod 600 "$put"
    call "{\"op\":\"put\",\"key\":\"$NAME\"}" > "$put"
    curl -fsS --retry 2 -X PUT -H 'content-type: application/gzip' --upload-file "$FILE" "$(cat "$put")"
    rm -f "$put"
    echo "uploaded $NAME ($(wc -c < "$FILE" | tr -d ' ') bytes)"
    ;;
  url)
    call "{\"op\":\"get\",\"key\":\"$NAME\",\"expires\":${3:?expires_s}}"
    ;;
  verify)
    get=$(mktemp); chmod 600 "$get"
    call "{\"op\":\"get\",\"key\":\"$NAME\",\"expires\":300}" > "$get"
    remote=$(curl -fsS --retry 2 "$(cat "$get")" | shasum -a 256 | awk '{print $1}')
    rm -f "$get"
    local_sum=$(shasum -a 256 "$FILE" | awk '{print $1}')
    [ "$remote" = "$local_sum" ] && echo "verify ok $NAME $remote" || { echo "verify FAILED $NAME remote=$remote local=$local_sum" >&2; exit 4; }
    ;;
  *) echo "unknown command $CMD" >&2; exit 2 ;;
esac
