#!/usr/bin/env bash
# Docs smoke test (WO-34s; WO-64: docs at the ROOT of the docs origin, baseUrl "/"). Checks pages AND the assets they reference: a page can
# answer 200 while its JS and CSS 404 (46c35ea preview: 55/55 pages 200, banner "Your Docusaurus site did not load properly").
# Usage: scripts/deploy/smoke-docs.sh <docs origin> [share-token]     e.g. https://docs.nectarlabs.io (or a preview deployment origin)
#   The share token (from the Vercel connector's get_access_to_vercel_url) is read from $2 or $VERCEL_SHARE; it is never printed or logged.
# Pages: every <loc> of <origin>/sitemap.xml, path kept, origin replaced. Exit 0 only if every page and every asset answers 200.
set -euo pipefail
BASE="${1:?docs origin, e.g. https://docs.nectarlabs.io}"; BASE="${BASE%/}"
SHARE="${2:-${VERCEL_SHARE:-}}"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
J="$W/jar"; : > "$J"; chmod 600 "$J"
if [ -n "$SHARE" ]; then curl -s -L -o /dev/null -c "$J" -b "$J" "$BASE/?_vercel_share=$SHARE"; fi
get() { curl -s -o "${2:-/dev/null}" -w '%{http_code}' -b "$J" "$BASE$1"; }

code=$(get /sitemap.xml "$W/sitemap.xml")
[ "$code" = 200 ] || { echo "FAIL sitemap /sitemap.xml → $code"; exit 1; }
grep -o '<loc>[^<]*</loc>' "$W/sitemap.xml" | sed -E 's#</?loc>##g; s#^https?://[^/]+##' | sort -u > "$W/pages"
if grep -q '^/docs/' "$W/pages"; then echo "FAIL sitemap still lists /docs/ paths"; exit 1; fi
: > "$W/assets"; fail=0; n=0
while read -r p; do
  n=$((n+1)); c=$(get "$p" "$W/page.html")
  if [ "$c" != 200 ]; then echo "FAIL page $p → $c"; fail=$((fail+1)); continue; fi
  grep -oE '(href|src)="/(assets|img)/[^"]+"' "$W/page.html" | sed -E 's/^(href|src)="//; s/"$//' >> "$W/assets" || true
done < "$W/pages"
sort -u "$W/assets" -o "$W/assets"; a=0
while read -r u; do
  a=$((a+1)); c=$(get "$u")
  if [ "$c" != 200 ]; then echo "FAIL asset $u → $c"; fail=$((fail+1)); fi
done < "$W/assets"
echo "docs smoke $BASE: pages $n, assets $a, failures $fail"
[ "$fail" = 0 ]
