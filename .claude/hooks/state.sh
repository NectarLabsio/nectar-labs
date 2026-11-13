#!/usr/bin/env bash
# Stop hook: refresh the "last activity" line in docs/process/state.md so a returning human sees when the
# session last worked and on which commit. Never fails the stop.
set -u
root="${CLAUDE_PROJECT_DIR:-.}"
f="$root/docs/process/state.md"
[ -f "$f" ] || exit 0
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
sha="$(git -C "$root" rev-parse --short HEAD 2>/dev/null || echo none)"
if grep -q '^Last activity:' "$f"; then
  sed -i.bak "s|^Last activity:.*|Last activity: $now · commit $sha|" "$f" && rm -f "$f.bak"
else
  printf '\nLast activity: %s · commit %s\n' "$now" "$sha" >> "$f"
fi
exit 0
