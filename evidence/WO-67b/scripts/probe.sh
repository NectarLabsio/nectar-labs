G=/usr/bin/grep
F=https://feed-production-2f2776c9.up.railway.app
SITE=https://nectarlabs.io; APP=https://testnet.nectarlabs.io; DOCS=https://docs.nectarlabs.io; STATUS=https://status.nectarlabs.io
echo "# WO-67b claims probe, start $(date -u +%FT%TZ), read-only curl"
echo "== Feed /health $(date -u +%FT%TZ)"; curl -s -m 20 $F/health; echo
for o in $SITE $APP $STATUS https://evil.example.com $DOCS; do
  echo "== CORS GET /health Origin $o"; curl -s -m 20 -D - -o /dev/null -H "Origin: $o" $F/health | tr -d '\r' | $G -i '^HTTP\|^access-control-allow-origin\|^vary'
  echo "== CORS OPTIONS /mcp Origin $o"; curl -s -m 20 -D - -o /dev/null -X OPTIONS -H "Origin: $o" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type" $F/mcp | tr -d '\r' | $G -i '^HTTP\|^access-control-allow-origin'
done
echo "== STATUS / title + h1"
curl -s -m 20 $STATUS/ | python3 -I -c "import sys,re;h=sys.stdin.read();print(re.findall(r'<title>(.*?)</title>',h)[:1], [re.sub('<[^>]+>','',x) for x in re.findall(r'<h1[^>]*>(.*?)</h1>',h)][:2])"
echo "== redirects (code, location)"
for u in "$SITE/status" "$APP/status" "$SITE/status?x=1" "$DOCS/docs/start/quick-start?x=1" "$DOCS/docs/integrate/feed-rest" "$SITE/borrow" "$SITE/quotes" "$SITE/feed" "$SITE/notes" "$SITE/console" "$SITE/no-such-path-wo67b" "https://nectarlabs.vercel.app/about?q=1" "https://nectarlabs-docs.vercel.app/start/quick-start?q=1"; do
  echo "$u -> $(curl -s -m 20 -o /dev/null -w '%{http_code} %{redirect_url}' "$u")"
done
echo "== 200 checks"
for u in "$SITE/" "$SITE/about" "$SITE/security" "$SITE/changelog" "$SITE/legal/privacy" "$APP/borrow" "$APP/quotes" "$APP/feed" "$APP/notes" "$APP/console" "$DOCS/" "$DOCS/start/quick-start" "$STATUS/"; do
  echo "$u -> $(curl -s -m 20 -o /dev/null -w '%{http_code}' "$u")"
done
echo "== docs sitemap at root"
curl -s -m 20 $DOCS/sitemap.xml > /tmp/verify-G9-20261113T023332Z/sitemap.xml
python3 -I -c "import re;h=open('/tmp/verify-G9-20261113T023332Z/sitemap.xml').read();l=re.findall(r'<loc>([^<]*)</loc>',h);print('locs',len(l),'with /docs/ prefix',sum('/docs/' in x for x in l));print(l[:3])"
echo "== test-assets markers (raw HTML)"
for u in "$APP/borrow" "$SITE/" "$SITE/about" "$SITE/security" "$SITE/legal/privacy" "$STATUS/"; do
  curl -s -m 20 "$u" | python3 -I -c "import sys;h=sys.stdin.read();print('$u', 'testid=test-assets:',h.count('data-testid=\"test-assets\"'),'test-assets-connect:',h.count('test-assets-connect'),'Mock assets, no value:',h.count('Mock assets, no value'),'Get test assets:',h.count('Get test assets'))"
done
echo "== DNS (F-458)"; dig +short NS nectarlabs.io
echo "# end $(date -u +%FT%TZ)"
