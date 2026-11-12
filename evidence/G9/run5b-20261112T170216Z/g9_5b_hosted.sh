#!/bin/bash
# G9 run 5b step 3: hosted URL probe + git facts. Read-only.
D=/tmp/verify-G9-5b-20261112T170216Z
cd "$D" || exit 1
echo "UTC $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "HEAD $(git rev-parse HEAD)"
echo "diff-stat 5f011bb..88b99b3 apps packages services contracts: [$(git diff --stat 5f011bb 88b99b3 -- apps packages services contracts)]"
echo "services/feed diff 3974b5b..88b99b3: [$(git diff --stat 3974b5b 88b99b3 -- services/feed)]"
echo "5f011bb subject: $(git log -1 --format=%s 5f011bb)"
echo "5f011bb touches STATE: $(git show --name-only --format= 5f011bb | tr '\n' ' ')"
for u in \
  https://nectarlabs.vercel.app/ \
  https://nectarlabs.vercel.app/borrow \
  https://nectarlabs-app.vercel.app/ \
  https://nectarlabs-app.vercel.app/feed \
  https://nectarlabs-app.vercel.app/borrow \
  https://nectarlabs-app.vercel.app/docs \
  https://nectarlabs-app.vercel.app/docs/integrate/feed-rest \
  https://feed-production-2f2776c9.up.railway.app/health ; do
  r=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$u")
  echo "$u -> $r"
done
echo "--- Feed /health body:"
curl -s --max-time 20 https://feed-production-2f2776c9.up.railway.app/health | head -c 1500; echo
echo "--- APP /api/health body:"
curl -s --max-time 20 https://nectarlabs-app.vercel.app/api/health | head -c 800; echo
echo "--- Feed hrefs on hosted docs feed-rest:"
curl -s --max-time 20 https://nectarlabs-app.vercel.app/docs/integrate/feed-rest | /usr/bin/grep -o 'href="https://feed-production[^"]*"' | sort | uniq -c
echo "--- x-robots-tag count on APP /docs:"
curl -sI --max-time 20 https://nectarlabs-app.vercel.app/docs | /usr/bin/grep -ci '^x-robots-tag'
