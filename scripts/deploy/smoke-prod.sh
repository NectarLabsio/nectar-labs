#!/usr/bin/env bash
# Public production smoke (WO-34x step 6; custom hosts WO-62b/WO-64). No token: production is public (ssoProtection `preview`, F-440).
# Usage: scripts/deploy/smoke-prod.sh <SITE> <APP> <DOCS> <STATUS> [legacy ...]
#   legacy = "<old origin>=<new origin>" pairs, e.g. https://old.example=https://testnet.example (path and query must be kept, 308).
set -uo pipefail
SITE="${1:?SITE}"; APP="${2:?APP}"; DOCS="${3:?DOCS}"; STATUS="${4:?STATUS}"; shift 4
HERE="$(cd "$(dirname "$0")" && pwd)"; fail=0
code() { curl -s -o /dev/null -w '%{http_code}' "$1"; }
loc() { curl -s -o /dev/null -w '%{redirect_url}' "$1"; }
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "ok   $1 ($3)"; else echo "FAIL $1: expected $2, got $3"; fail=$((fail+1)); fi
}
redir() { # name url status location
  check "$1 status" "$3" "$(code "$2")"; check "$1 location" "$4" "$(loc "$2")"
}
echo "== APP routes"; "$HERE/smoke-web.sh" "$APP" || fail=$((fail+1))
echo "== docs at the root of $DOCS"; "$HERE/smoke-docs.sh" "$DOCS" || fail=$((fail+1))
echo "== host split"
check "SITE / answers" 200 "$(code "$SITE/")"
check "SITE /about answers" 200 "$(code "$SITE/about")"
redir "SITE /borrow → APP" "$SITE/borrow" 308 "$APP/borrow"
redir "APP / → /feed" "$APP/" 307 "$APP/feed"
redir "APP /about → SITE" "$APP/about" 308 "$SITE/about"
redir "www → apex" "${SITE/https:\/\//https://www.}/" 308 "$SITE/"
echo "== status host"
check "STATUS / answers" 200 "$(code "$STATUS/")"
redir "SITE /status → STATUS" "$SITE/status" 308 "$STATUS/"
redir "APP /status → STATUS" "$APP/status" 308 "$STATUS/"
echo "== docs redirects"
redir "APP /docs → DOCS root" "$APP/docs" 308 "$DOCS/"
redir "APP /docs/start/quick-start → DOCS" "$APP/docs/start/quick-start?x=1" 308 "$DOCS/start/quick-start?x=1"
redir "DOCS /docs/start/quick-start → root path" "$DOCS/docs/start/quick-start" 308 "$DOCS/start/quick-start"
for pair in "$@"; do
  old="${pair%%=*}"; new="${pair#*=}"
  redir "legacy $old/feed?y=2" "$old/feed?y=2" 308 "$new/feed?y=2"
done
echo "== headers"
for u in "$APP/feed" "$SITE/" "$STATUS/" "$DOCS/"; do
  h="$(curl -s -D - -o /dev/null "$u" | tr -d '\r')"
  printf %s "$h" | grep -qi '^strict-transport-security:' && echo "ok   HSTS $u" || { echo "FAIL HSTS missing $u"; fail=$((fail+1)); }
  printf %s "$h" | grep -qi '^content-security-policy:' && echo "ok   CSP $u" || { echo "FAIL CSP missing $u"; fail=$((fail+1)); }
  if printf %s "$h" | grep -qi '^x-robots-tag:.*noindex'; then echo "FAIL noindex on production $u"; fail=$((fail+1)); else echo "ok   no noindex $u"; fi
done
echo "production smoke: failures $fail"
[ "$fail" = 0 ]
