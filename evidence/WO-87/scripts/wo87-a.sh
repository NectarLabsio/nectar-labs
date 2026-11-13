#!/usr/bin/env bash
# WO-87 A (verifier): clone state, pnpm i, smoke-prod (exact), served-HTML footer/copyright check, branding check on c9fd56b.
B=/tmp/verify-wo87-20261113T170125Z
R=$B/repo
L=$B/logs; mkdir -p $L/html
cd $R
git checkout -q c9fd56b
{ echo "# $(date -u +%FT%TZ) clone of /Volumes/T7/nectar-labs; main HEAD 345445a; checked out $(git rev-parse HEAD)"
  echo "\$ git diff --stat 963ab62 c9fd56b -- apps packages"; git diff --stat 963ab62 c9fd56b -- apps packages
  echo "\$ git diff --stat c9fd56b 345445a -- apps packages scripts"; git diff --stat c9fd56b 345445a -- apps packages scripts; echo "(empty above = same product)"
  echo "\$ git ls-files -s scripts/deploy/smoke-prod.sh"; git ls-files -s scripts/deploy/smoke-prod.sh
  echo "\$ git status --porcelain"; git status --porcelain; } > $L/clone.txt 2>&1
( s=$(date +%s); pnpm i --frozen-lockfile > $L/pnpm-i.log 2>&1; echo "pnpm i exit $? ($(( $(date +%s) - s )) s)" >> $L/pnpm-i.log ) &
TS=$(date -u +%Y%m%dT%H%M%SZ)
{
echo "# $(date -u +%FT%TZ)"
echo "\$ scripts/deploy/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io https://nectarlabs.vercel.app=https://nectarlabs.io https://nectarlabs-app.vercel.app=https://testnet.nectarlabs.io https://nectar-labs-web.vercel.app=https://testnet.nectarlabs.io https://nectarlabs-docs.vercel.app=https://docs.nectarlabs.io https://nectar-labs-docs.vercel.app=https://docs.nectarlabs.io"
s=$(date +%s)
scripts/deploy/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io \
  https://nectarlabs.vercel.app=https://nectarlabs.io https://nectarlabs-app.vercel.app=https://testnet.nectarlabs.io \
  https://nectar-labs-web.vercel.app=https://testnet.nectarlabs.io https://nectarlabs-docs.vercel.app=https://docs.nectarlabs.io \
  https://nectar-labs-docs.vercel.app=https://docs.nectarlabs.io
echo "exit=$? ($(( $(date +%s) - s )) s)"
} > $L/prod-smoke-$TS.log 2>&1 &

# served HTML (raw, no JS): footer strings present, old brand strings absent
{
echo "# $(date -u +%FT%TZ) served HTML check (curl -sL, raw bytes)"
printf '%-46s %5s %6s %-10s %-10s %-12s %-12s %-14s %s\n' url http bytes labsProd copyLabs netProduct 2026Net "NectarNetwork" headers
for u in https://nectarlabs.io/ https://testnet.nectarlabs.io/borrow https://testnet.nectarlabs.io/feed https://status.nectarlabs.io/ https://docs.nectarlabs.io/ https://docs.nectarlabs.io/project/team; do
  f=$L/html/$(echo "$u" | sed -E 's#https://##; s#[/.]#_#g').html
  h=$(curl -sL -m 30 -o "$f" -w '%{http_code}' "$u")
  hd=$(curl -sI -m 20 "$u" | tr -d '\r' | /usr/bin/grep -i -E '^(age|last-modified|x-vercel-cache|etag):' | tr '\n' ' ')
  c1=$(/usr/bin/grep -o 'A Nectar Labs product' "$f" | wc -l | tr -d ' ')
  c2=$(/usr/bin/grep -o '© 2026 Nectar Labs' "$f" | wc -l | tr -d ' ')
  c3=$(/usr/bin/grep -o -i 'Nectar Network product' "$f" | wc -l | tr -d ' ')
  c4=$(/usr/bin/grep -o -i '2026 Nectar Network' "$f" | wc -l | tr -d ' ')
  c5=$(/usr/bin/grep -o -i 'Nectar Network' "$f" | wc -l | tr -d ' ')
  printf '%-46s %5s %6s %-10s %-10s %-12s %-12s %-14s %s\n' "$u" "$h" "$(wc -c < "$f" | tr -d ' ')" "$c1" "$c2" "$c3" "$c4" "$c5" "$hd"
  [ "$c5" != 0 ] && /usr/bin/grep -o -i -E '.{0,60}Nectar Network.{0,40}' "$f" | head -3 | sed 's/^/    other "Nectar Network": /'
  /usr/bin/grep -o -E '.{0,30}© 2026 Nectar Labs.{0,60}' "$f" | head -1 | sed 's/^/    copyright: /'
done
} > $L/served-html.txt 2>&1

wait
{ echo "# $(date -u +%FT%TZ) \$ node scripts/check-no-branding-all.mjs (at $(git rev-parse --short HEAD))"; node scripts/check-no-branding-all.mjs; echo "exit=$?"; } > $L/branding.log 2>&1
tail -2 $L/pnpm-i.log; tail -4 $L/prod-smoke-*.log; cat $L/served-html.txt; cat $L/branding.log; cat $L/clone.txt
