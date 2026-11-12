#!/bin/bash
# WO-34v2 items 1, 2 (headers/feed/CORS), 5 — curl only, read-only.
SITE=https://nectarlabs.vercel.app
APP=https://nectarlabs-app.vercel.app
DOCO=https://nectarlabs-docs.vercel.app
FEED=https://feed-production-2f2776c9.up.railway.app
OUT=/tmp/verify-wo34v2-20261112/ev
mkdir -p $OUT/pages
echo "captured $(date -u +%FT%TZ)"

echo "== 1a sitemap + noindex on every APP /docs page =="
curl -s $APP/docs/sitemap.xml -o $OUT/sitemap.xml
grep -o '<loc>[^<]*</loc>' $OUT/sitemap.xml | sed 's/<loc>//;s/<\/loc>//' > $OUT/sitemap-locs.txt
echo "sitemap locs: $(wc -l < $OUT/sitemap-locs.txt)"; head -2 $OUT/sitemap-locs.txt
# map each loc onto the APP /docs path
sed -E 's#^https?://[^/]+##' $OUT/sitemap-locs.txt | sed -E 's#^/docs##' | sed -E 's#^#/docs#' | sed -E 's#\.html$##' | sort -u > $OUT/docs-paths.txt
echo "docs paths: $(wc -l < $OUT/docs-paths.txt)"
: > $OUT/docs-noindex.txt
n=0; ni=0; non200=0
while read -r p; do
  n=$((n+1))
  f=$OUT/pages/$(echo "$p" | tr '/' '_').html
  code=$(curl -s -L -D $f.h -o $f -w '%{http_code}' "$APP$p")
  [ "$code" != 200 ] && non200=$((non200+1)) && echo "NON200 $code $p" >> $OUT/docs-noindex.txt
  if grep -qi '^x-robots-tag' $f.h; then ni=$((ni+1)); echo "NOINDEX $p $(grep -i '^x-robots-tag' $f.h | tr -d '\r')" >> $OUT/docs-noindex.txt; fi
done < $OUT/docs-paths.txt
echo "pages fetched $n, non-200 $non200, with x-robots-tag $ni"
cat $OUT/docs-noindex.txt | head -10
for p in /docs /docs/start/quick-start; do echo "-- APP $p"; curl -sI "$APP$p" | grep -iE '^(HTTP|x-robots|content-security|x-frame|strict-transport)' | cut -c1-140; done
for u in "$SITE/" "$APP/feed"; do echo "-- $u x-robots: $(curl -sI $u | grep -ci '^x-robots-tag')"; done

echo "== 1b docs origin headers =="
for u in "$DOCO/" "$DOCO/docs/" "$DOCO/docs/start/quick-start"; do echo "-- $u"; curl -sI "$u" | grep -iE '^(HTTP|location|x-robots|content-security|x-frame|strict-transport)' | sed -E 's/(content-security-policy: .{0,60}).*(frame-ancestors[^;]*).*/\1 … \2/I' | tr -d '\r'; done

echo "== 1c localhost/127.0.0.1 hrefs in APP /docs pages =="
grep -lE "href=\"https?://(127\.0\.0\.1|localhost)" $OUT/pages/*.html | wc -l
grep -oE "href=\"https?://(127\.0\.0\.1|localhost)[^\"]*\"" $OUT/pages/*.html | head -5
echo "any 127.0.0.1/localhost text at all:"; grep -oE "(127\.0\.0\.1|localhost)[:0-9/]*" $OUT/pages/*.html | sort | uniq -c | head -10
echo "feed-rest Feed link:"; grep -oE 'href="[^"]*(railway|feed)[^"]*"' $OUT/pages/_docs_integrate_feed-rest.html | sort -u | head -5

echo "== 2 headers SITE/APP =="
for u in "$SITE/" "$SITE/legal/privacy" "$APP/feed" "$APP/borrow"; do echo "-- $u"; curl -sI "$u" | grep -iE '^(HTTP|x-robots|x-frame|strict-transport|x-content-type|referrer-policy)' | tr -d '\r'; curl -sI "$u" | grep -i '^content-security-policy' | grep -oE "frame-ancestors[^;]*|connect-src[^;]*" | cut -c1-260; done
echo "== redirects =="
for u in "$SITE/borrow?asset=NVDAx" "$APP/about" "$APP/"; do echo "$u -> $(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$u")"; done

echo "== 2 Feed =="
curl -s $FEED/health | tee $OUT/feed-health.json | head -c 1500; echo
for o in "$SITE" "$APP" "https://evil.example.com"; do echo "-- Origin $o GET: $(curl -s -D - -o /dev/null -H "Origin: $o" $FEED/health | grep -i '^access-control-allow-origin' | tr -d '\r')"; echo "   preflight: $(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H "Origin: $o" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' $FEED/mcp) $(curl -s -D - -o /dev/null -X OPTIONS -H "Origin: $o" -H 'Access-Control-Request-Method: POST' $FEED/mcp | grep -i '^access-control-allow-origin' | tr -d '\r')"; done

echo "== 5 nectar-labs-web.vercel.app (info) =="
for u in https://nectar-labs-web.vercel.app/ https://nectar-labs-web.vercel.app/feed https://nectar-labs-web.vercel.app/docs; do echo "-- $u"; curl -sI "$u" | grep -iE '^(HTTP|location|x-robots|x-frame|x-vercel-id)' | tr -d '\r'; done
curl -s https://nectar-labs-web.vercel.app/ | grep -o '<title>[^<]*</title>' | head -1
