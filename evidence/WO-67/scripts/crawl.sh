#!/usr/bin/env bash
cd /tmp/verify-wo67-20261113T0205Z/repo
OUT=/Volumes/T7/nectar-labs/.claude/worktrees/agent-a120e7a0baaef2f5d/evidence/WO-67/A/crawl
mkdir -p "$OUT"
{
echo "# WO-67 A6 crawl --polite over 4 hosts, start $(date -u +%FT%TZ), clone $(git rev-parse --short HEAD), PW_CHANNEL=chrome"
echo "# cmd: node apps/web/scripts/crawl.mjs --site https://nectarlabs.io --app https://testnet.nectarlabs.io --docs https://docs.nectarlabs.io --status https://status.nectarlabs.io --legacy <5 hosts> --out <evidence>/crawl --polite"
PW_CHANNEL=chrome node apps/web/scripts/crawl.mjs \
  --site https://nectarlabs.io --app https://testnet.nectarlabs.io --docs https://docs.nectarlabs.io --status https://status.nectarlabs.io \
  --legacy nectarlabs.vercel.app=site,nectarlabs-app.vercel.app=app,nectar-labs-web.vercel.app=app,nectarlabs-docs.vercel.app=docs,nectar-labs-docs.vercel.app=docs \
  --out "$OUT" --polite
echo "exit=$? end $(date -u +%FT%TZ)"
} > "$OUT/crawl.log" 2>&1
tail -n 30 "$OUT/crawl.log"
