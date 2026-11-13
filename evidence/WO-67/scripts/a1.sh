#!/usr/bin/env bash
# A1: exact command already recorded (exit 126, git mode 100644). This run uses an unmodified byte-copy of scripts/deploy with +x in /tmp.
cd /tmp/verify-wo67-20261113T0205Z/repo
COPY=/tmp/verify-wo67-20261113T0205Z/deploy-x
rm -rf "$COPY"; cp -R scripts/deploy "$COPY"; chmod +x "$COPY"/*.sh
OUT=/Volumes/T7/nectar-labs/.claude/worktrees/agent-a120e7a0baaef2f5d/evidence/WO-67/A/prod-smoke-$(date -u +%Y%m%dT%H%M%SZ).log
{
echo "# WO-67 A1 verifier re-run, $(date -u +%FT%TZ), clone $(git rev-parse --short HEAD)"
echo "# exact cmd scripts/deploy/smoke-prod.sh in the fresh clone: exit 126 Permission denied (git mode 100644; see prod-smoke-20261113T020556Z.log)"
echo "# this run: byte-identical copy with +x: $(cd "$COPY" && shasum -a 256 smoke-prod.sh smoke-web.sh smoke-docs.sh | tr '\n' ' ')"
echo "# cmd: <copy>/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io <5 legacy pairs as full origins>"
"$COPY"/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io \
  https://nectarlabs.vercel.app=https://nectarlabs.io \
  https://nectarlabs-app.vercel.app=https://testnet.nectarlabs.io \
  https://nectar-labs-web.vercel.app=https://testnet.nectarlabs.io \
  https://nectarlabs-docs.vercel.app=https://docs.nectarlabs.io \
  https://nectar-labs-docs.vercel.app=https://docs.nectarlabs.io
echo "exit=$?"
} > "$OUT" 2>&1
echo "$OUT"
shasum -a 256 scripts/deploy/smoke-prod.sh scripts/deploy/smoke-web.sh scripts/deploy/smoke-docs.sh
tail -n 50 "$OUT"
echo "ok-lines: $(grep -c '^ok' "$OUT")  FAIL-lines: $(grep -c 'FAIL' "$OUT")"
grep -n 'pages\|assets\|failures' "$OUT" | head
