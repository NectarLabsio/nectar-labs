#!/usr/bin/env bash
# Build the submission JSON from docs/SUBMISSION.md + config.yaml. Default is --dry-run (print only).
# A real send requires HUMAN_CONFIRMED=1 in Kunal's own shell AND an interactive yes. Agents never run it without --dry-run.
source "$(dirname "$0")/_lib.sh"
DRY=1; [ "${1:-}" = "--send" ] && DRY=0
PAYLOAD=$(node "$ROOT/scripts/build-submission.mjs")   # reads docs/SUBMISSION.md table + README sections
echo "$PAYLOAD" | jq .
grep -q 'TODO-H' <<<"$PAYLOAD" && { echo "payload still has TODO-H placeholders — not sendable" >&2; [ $DRY = 1 ] || exit 2; }
[ $DRY = 1 ] && { echo "(dry run — nothing sent)"; exit 0; }
[ "${HUMAN_CONFIRMED:-0}" = "1" ] || { echo "HUMAN_CONFIRMED=1 required (Kunal only)" >&2; exit 3; }
read -r -p "Send to the NEAR Hackathon submission API now? type yes: " a; [ "$a" = "yes" ] || exit 1
ENDPOINT=$(grep -m1 -Eo 'https://[^ ]*nearhackathon[^ ]*/api[^ )]*' "$ROOT/docs/HACKATHON.md" || true)
[ -n "$ENDPOINT" ] || { echo "submission endpoint not found in docs/HACKATHON.md — re-read rules (F-001)" >&2; exit 2; }
curl -sS -X POST "$ENDPOINT" -H 'content-type: application/json' --data "$PAYLOAD" | tee "$ROOT/evidence/submission-response.json"
