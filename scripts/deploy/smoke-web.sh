#!/usr/bin/env bash
# Web deployment smoke test (WO-34m/WO-34p, G3b (h)): every route below answers 2xx/3xx and /api/health says ok:true.
# Usage: scripts/deploy/smoke-web.sh <deployment-origin> [share-token]
#   The share token (Vercel connector get_access_to_vercel_url) is read from $2 or $VERCEL_SHARE; it is never printed or logged.
#   A public origin (production) needs no token.
set -euo pipefail
BASE="${1:?deployment origin}"; BASE="${BASE%/}"
SHARE="${2:-${VERCEL_SHARE:-}}"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
J="$W/jar"; : > "$J"; chmod 600 "$J"
if [ -n "$SHARE" ]; then curl -s -L -o /dev/null -c "$J" -b "$J" "$BASE/?_vercel_share=$SHARE"; fi
ROUTES="/ /feed /borrow /quote /notes /reserve /shield /console /about /status /security /changelog /brand /talk
/legal/privacy /legal/terms /legal/cookies /legal/disclaimers /docs /robots.txt /sitemap.xml
/api/health /api/feed /api/indexer/health /feed/NVDAX /position/1 /note/1 /quote/1"
fail=0; n=0
for r in $ROUTES; do
  n=$((n+1)); c=$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "$BASE$r")
  case "$c" in 2??|3??) echo "$c $r" ;; *) echo "FAIL $c $r"; fail=$((fail+1)) ;; esac
done
h=$(curl -s -b "$J" "$BASE/api/health")
if printf %s "$h" | grep -q '"ok":true'; then echo "/api/health ok:true"; else echo "FAIL /api/health not ok"; fail=$((fail+1)); fi
echo "web smoke $BASE: routes $n, failures $fail"
[ "$fail" = 0 ]
