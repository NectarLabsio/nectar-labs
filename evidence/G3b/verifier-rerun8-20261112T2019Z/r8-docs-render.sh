#!/bin/bash
# G3b run 8 (d) supplement runner: serve the docs build at the root on own port 3984, render every page in Chrome, stop the server.
set -u
D=/tmp/verify-G3b-r8-20261112T2019Z
SP=/private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad
EV=$D/ev
cd "$D" || exit 1
cp "$SP/g3b-docs-render.mjs" "$D/apps/web/"; cp "$SP/g3b-docs-render.mjs" "$SP/r8-docs-render.sh" "$EV/"
node apps/web/scripts/serve-docs.mjs --port 3984 > "$EV/server-docs-2.log" 2>&1 & DP=$!
for _ in $(seq 1 30); do curl -s -o /dev/null http://localhost:3984/ && break; sleep 1; done
echo "[$(date -u +%H:%M:%SZ)] docs :3984 up pid $DP"
(cd apps/web && node g3b-docs-render.mjs "$D/apps/docs-site/build/sitemap.xml" http://docs.localhost:3984 "$EV/docs-render.json" > "$EV/docs-render.log" 2>&1); echo "[$(date -u +%H:%M:%SZ)] docs render exit $?"
cat "$EV/docs-render.log"
kill $DP; sleep 1; echo "listeners on 3984 after kill: $(lsof -nP -iTCP:3984 -sTCP:LISTEN -t 2>/dev/null | wc -l | tr -d ' ')"
