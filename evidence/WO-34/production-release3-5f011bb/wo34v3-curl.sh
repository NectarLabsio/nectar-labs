#!/bin/bash
# WO-34v3 item 3 (spot regression, curl only, read-only) + release-3 Feed-link check.
SITE=https://nectarlabs.vercel.app
APP=https://nectarlabs-app.vercel.app
DOCO=https://nectarlabs-docs.vercel.app
FEED=https://feed-production-2f2776c9.up.railway.app
OUT=/tmp/wo34v3-ev
mkdir -p $OUT/pages
echo "captured $(date -u +%FT%TZ)"

echo "== 3a x-robots-tag (count of header lines; 0 = indexable) =="
for u in "$SITE/" "$APP/feed" "$APP/docs" "$APP/docs/start/quick-start" "$APP/docs/integrate/feed-rest" "$APP/docs/operate/monitoring" "$APP/docs/integrate/feed-mcp"; do
  h=$(curl -s -D - -o /dev/null -w 'CODE %{http_code}' "$u")
  echo "$u -> $(echo "$h" | grep -o 'CODE [0-9]*') x-robots-tag lines: $(echo "$h" | grep -ci '^x-robots-tag') $(echo "$h" | grep -i '^x-robots-tag' | tr -d '\r')"
done

echo "== 3b docs origin XFO + frame-ancestors =="
for u in "$DOCO/" "$DOCO/docs/" "$DOCO/docs/start/quick-start" "$DOCO/docs/integrate/feed-rest"; do
  echo "-- $u"
  curl -sI "$u" | grep -iE '^(HTTP|location|x-robots|x-frame|strict-transport)' | tr -d '\r'
  echo "   csp frame-ancestors: $(curl -sI "$u" | grep -i '^content-security-policy' | grep -oE "frame-ancestors[^;]*" | tr -d '\r')"
done

echo "== 3c Feed /health =="
curl -s $FEED/health > $OUT/feed-health.json
python3 -I -c "import json,sys;d=json.load(open('$OUT/feed-health.json'));print({k:d.get(k) for k in ['ok','source','history','chain_head_source','chain_head','last_indexed_block']});print('rpc:',json.dumps(d.get('rpc'))[:400])"

echo "== 3d CORS =="
for o in "$SITE" "$APP" "https://evil.example.com"; do
  echo "-- Origin $o GET /health ACAO: [$(curl -s -D - -o /dev/null -H "Origin: $o" $FEED/health | grep -i '^access-control-allow-origin' | tr -d '\r')]"
  echo "   preflight /mcp: $(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H "Origin: $o" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' $FEED/mcp) [$(curl -s -D - -o /dev/null -X OPTIONS -H "Origin: $o" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' $FEED/mcp | grep -i '^access-control-allow-origin' | tr -d '\r')]"
done

echo "== release 3: Feed hrefs in hosted docs pages =="
for p in /docs/integrate/feed-rest /docs/operate/monitoring; do
  code=$(curl -s -o $OUT/pages/$(echo $p | tr / _).html -w '%{http_code}' "$APP$p")
  echo "APP$p -> $code; feed hrefs: $(grep -oE 'href="https://feed-production[^"]*"' $OUT/pages/$(echo $p | tr / _).html | sort | uniq -c | tr '\n' ' ')"
done
echo "FEED /health -> $(curl -s -o /dev/null -w '%{http_code}' $FEED/health); FEED / (control) -> $(curl -s -o /dev/null -w '%{http_code}' $FEED/)"
echo "done $(date -u +%FT%TZ)"
