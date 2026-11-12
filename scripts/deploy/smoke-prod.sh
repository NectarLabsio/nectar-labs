#!/usr/bin/env bash
# Public production smoke (WO-34x step 6). No token: production is public (ssoProtection `preview`, F-440).
# Usage: scripts/deploy/smoke-prod.sh <SITE origin> <APP origin> <docs project origin>
set -uo pipefail
SITE="${1:?SITE}"; APP="${2:?APP}"; DOCS_ORIGIN="${3:?docs origin}"
HERE="$(cd "$(dirname "$0")" && pwd)"; fail=0
code() { curl -s -o /dev/null -w '%{http_code}' "$1"; }
loc() { curl -s -o /dev/null -w '%{redirect_url}' "$1"; }
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "ok   $1 ($3)"; else echo "FAIL $1: expected $2, got $3"; fail=$((fail+1)); fi
}
echo "== APP routes"; "$HERE/smoke-web.sh" "$APP" || fail=$((fail+1))
echo "== docs under APP /docs (proxied, prefix kept)"; "$HERE/smoke-docs.sh" "$APP" || fail=$((fail+1))
echo "== host split (WO-34a)"
check "SITE / answers" 200 "$(code "$SITE/")"
check "SITE /about answers" 200 "$(code "$SITE/about")"
check "SITE /borrow → APP (308)" 308 "$(code "$SITE/borrow")"
check "SITE /borrow location" "$APP/borrow" "$(loc "$SITE/borrow")"
check "APP / → /feed" 307 "$(code "$APP/")"
check "APP /about → SITE (308)" 308 "$(code "$APP/about")"
check "APP /about location" "$SITE/about" "$(loc "$APP/about")"
echo "== docs origin"
check "docs origin / → /docs/ (307)" 307 "$(code "$DOCS_ORIGIN/")"
check "docs origin /docs/ answers" 200 "$(code "$DOCS_ORIGIN/docs/")"
echo "== headers (APP /feed, SITE /)"
for u in "$APP/feed" "$SITE/"; do
  h="$(curl -s -D - -o /dev/null "$u" | tr -d '\r')"
  printf %s "$h" | grep -qi '^strict-transport-security:' && echo "ok   HSTS $u" || { echo "FAIL HSTS missing $u"; fail=$((fail+1)); }
  printf %s "$h" | grep -qi '^content-security-policy:' && echo "ok   CSP $u" || { echo "FAIL CSP missing $u"; fail=$((fail+1)); }
  if printf %s "$h" | grep -qi '^x-robots-tag:.*noindex'; then echo "FAIL noindex on production $u"; fail=$((fail+1)); else echo "ok   no noindex $u"; fi
done
echo "production smoke: failures $fail"
[ "$fail" = 0 ]
