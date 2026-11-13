#!/bin/bash
# WO-83 A verifier run: fresh clone, smoke-prod, docs name/redirect/header/branding probes. Public reads only.
set -u
TS=$(date -u +%Y%m%dT%H%M%SZ)
EV=/Volumes/T7/nectar-labs/.claude/worktrees/agent-a860fb2bbcad86129/evidence/WO-83
mkdir -p "$EV"
ROOT=/tmp/verify-wo83-$TS
mkdir -p "$ROOT"
echo "start $(date -u +%FT%TZ) root $ROOT" | tee "$EV/run.txt"
git clone -q /Volumes/T7/nectar-labs "$ROOT/nectar-labs" 2>&1 | tail -2
cd "$ROOT/nectar-labs" || exit 1
{ echo "clone HEAD $(git rev-parse HEAD)"; echo "963ab62 ancestor: $(git merge-base --is-ancestor 963ab62 HEAD && echo yes || echo no)";
  echo "diff 963ab62..HEAD apps/docs-site: $(git diff --stat 963ab62 HEAD -- apps/docs-site | tail -1)"; } | tee -a "$EV/run.txt"

SITE=https://nectarlabs.io APP=https://testnet.nectarlabs.io DOCS=https://docs.nectarlabs.io STATUS=https://status.nectarlabs.io
T0=$(date +%s)
scripts/deploy/smoke-prod.sh $SITE $APP $DOCS $STATUS \
  https://nectarlabs.vercel.app=https://nectarlabs.io https://nectarlabs-app.vercel.app=https://testnet.nectarlabs.io \
  https://nectar-labs-web.vercel.app=https://testnet.nectarlabs.io https://nectarlabs-docs.vercel.app=https://docs.nectarlabs.io \
  https://nectar-labs-docs.vercel.app=https://docs.nectarlabs.io > "$EV/prod-smoke-$TS.log" 2>&1
RC=$?
echo "smoke-prod exit=$RC ($(( $(date +%s) - T0 )) s), ok lines $(/usr/bin/grep -c -i '^ *ok\|: ok\| ok ' "$EV/prod-smoke-$TS.log"), last:" | tee -a "$EV/run.txt"
tail -n 4 "$EV/prod-smoke-$TS.log" | tee -a "$EV/run.txt"

P=$EV/probe-$TS.txt
: > "$P"
echo "== DOCS root headers $(date -u +%FT%TZ)" >> "$P"
curl -sSI "$DOCS/" | /usr/bin/grep -i -E '^(HTTP|content-security-policy|strict-transport-security|last-modified|age|x-vercel-cache|x-vercel-id|etag)' >> "$P"
for path in /project/team /project/prior-work; do
  curl -sS -D "$EV/hdr${path//\//_}.txt" -o "$EV/body${path//\//_}.html" "$DOCS$path"
  echo "== $path: $(head -1 "$EV/hdr${path//\//_}.txt" | tr -d '\r'), Kunal=$(/usr/bin/grep -o 'Kunal' "$EV/body${path//\//_}.html" | wc -l | tr -d ' '), drall(i)=$(/usr/bin/grep -o -i 'drall' "$EV/body${path//\//_}.html" | wc -l | tr -d ' '), hackathon(i)=$(/usr/bin/grep -o -i 'hackathon' "$EV/body${path//\//_}.html" | wc -l | tr -d ' ')" >> "$P"
  /usr/bin/grep -i -E '^(content-security-policy|strict-transport-security)' "$EV/hdr${path//\//_}.txt" | cut -c1-140 >> "$P"
  python3 -I -c 'import re,sys,html;t=open(sys.argv[1]).read();t=re.sub(r"<script.*?</script>|<style.*?</style>","",t,flags=re.S);t=html.unescape(re.sub(r"<[^>]+>"," ",t));[print("   ctx:",re.sub(r"\s+"," ",t[max(0,m.start()-70):m.end()+70])) for m in re.finditer(r"(?i)kunal|drall",t)]' "$EV/body${path//\//_}.html" >> "$P"
done
echo "== /docs/<path> redirects" >> "$P"
for path in /project/team /project/prior-work /quick-start /operations/monitoring; do
  echo "/docs$path -> $(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' "$DOCS/docs$path")" >> "$P"
done
echo "== sitemap branding sweep" >> "$P"
curl -sS "$DOCS/sitemap.xml" -o "$EV/sitemap.xml"
N=0; HITS=0; BAD=0
for u in $(/usr/bin/grep -o '<loc>[^<]*</loc>' "$EV/sitemap.xml" | sed 's/<[^>]*>//g'); do
  u2="$DOCS${u#https://*/}"; case "$u" in https://docs.nectarlabs.io*) u2=$u;; *) u2="$DOCS/${u#https://*/}";; esac
  out=$(curl -sS -w '\n%{http_code}' "$u2"); code=$(echo "$out" | tail -1)
  h=$(echo "$out" | /usr/bin/grep -o -i 'hackathon' | wc -l | tr -d ' ')
  N=$((N+1)); HITS=$((HITS+h)); [ "$code" = 200 ] || BAD=$((BAD+1))
  [ "$h" != 0 ] && echo "  HIT $h $u2" >> "$P"
done
echo "sitemap pages $N, non-200 $BAD, total hackathon(i) $HITS (first loc: $(/usr/bin/grep -o '<loc>[^<]*</loc>' "$EV/sitemap.xml" | head -1))" >> "$P"
cat "$P"
echo "end $(date -u +%FT%TZ)" | tee -a "$EV/run.txt"
git status --porcelain | head
