#!/usr/bin/env bash
OUT=/Volumes/T7/nectar-labs/.claude/worktrees/agent-a120e7a0baaef2f5d/evidence/WO-67/A/a2-commit-$(date -u +%Y%m%dT%H%M%SZ).log
FEED=https://feed-production-2f2776c9.up.railway.app
{
echo "# WO-67 A2 deployed commit, $(date -u +%FT%TZ). Expected c95cd0cf9d3f56f570ba3847a9c8aed370e688e0"
echo "== APP /api/health"; curl -s https://testnet.nectarlabs.io/api/health; echo
echo "== SITE /api/health"; curl -s https://nectarlabs.io/api/health | head -c 1500; echo
echo "== STATUS /api/health"; curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://status.nectarlabs.io/api/health
echo "== APP buildId (__NEXT_DATA__ / build manifest refs)"; curl -s https://testnet.nectarlabs.io/feed | grep -o '"buildId":"[^"]*"\|/_next/static/[A-Za-z0-9_-]\{8,\}/_buildManifest.js\|c95cd0c[0-9a-f]*' | sort -u | head
echo "== SITE / refs to commit"; curl -s https://nectarlabs.io/ | grep -o 'c95cd0c[0-9a-f]*\|data-commit="[^"]*"\|"commit":"[^"]*"' | sort -u | head
echo "== DOCS / refs to commit"; curl -s https://docs.nectarlabs.io/ | grep -o 'c95cd0c[0-9a-f]*\|commit[^<]\{0,80\}' | sort -u | head
echo "== DOCS sitemap/other pages refs"; for p in /project/evidence /operations/monitoring /start/quick-start; do printf '%s: ' "$p"; curl -s "https://docs.nectarlabs.io$p" | grep -o 'c95cd0c[0-9a-f]*' | sort -u | tr '\n' ' '; echo; done
echo "== DOCS headers /"; curl -sI https://docs.nectarlabs.io/ | tr -d '\r' | grep -i 'x-vercel-id\|x-commit\|etag\|age:\|server\|x-frame\|content-security' | cut -c1-200
echo "== FEED /health"; curl -s $FEED/health; echo
} > "$OUT" 2>&1
echo "$OUT"; cat "$OUT" | cut -c1-600
