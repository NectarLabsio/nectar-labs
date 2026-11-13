#!/usr/bin/env bash
# G9 run 7 part C: hosted Feed /health, scripts/demo secret/home-path grep, seed-phrase readers, intear-setup redact path, diffs.
B=/tmp/verify-G9-r7-20261113T123302Z
cd $B/repo
L=$B/logs
{
echo "## $(date -u +%FT%TZ) product diff"
echo "\$ git diff --stat c95cd0c d92a199 -- apps contracts"; git diff --stat c95cd0c d92a199 -- apps contracts; echo "(exit $?)"
echo "\$ git diff --stat c95cd0c d92a199 -- packages services | tail -n 3"; git diff --stat c95cd0c d92a199 -- packages services | tail -n 3
echo "\$ git log --oneline -1 37dfec9"; git log --oneline -1 37dfec9
echo "\$ git merge-base --is-ancestor 37dfec9 d92a199"; git merge-base --is-ancestor 37dfec9 d92a199; echo "(exit $?)"
echo "\$ git diff --stat 37dfec9 d92a199 -- services/feed"; git diff --stat 37dfec9 d92a199 -- services/feed; echo "(exit $?)"
} > $L/diffs.txt 2>&1

{
echo "## $(date -u +%FT%TZ) hosted Feed"
for i in 1 2 3; do
  echo "\$ curl -s https://feed-production-2f2776c9.up.railway.app/health   ($(date -u +%T)Z)"
  curl -s -m 20 https://feed-production-2f2776c9.up.railway.app/health; echo
  sleep 4
done
echo "\$ curl -s -o /dev/null -w '%{http_code}' .../events?limit=5"
curl -s -m 20 "https://feed-production-2f2776c9.up.railway.app/events?limit=5" | cut -c1-900; echo
} > $L/hosted-feed.txt 2>&1

{
echo "## $(date -u +%FT%TZ) scripts/demo checks"
echo "\$ git ls-files scripts/demo"; git ls-files scripts/demo
echo "\$ git grep -n -I -i -E 'ed25519:[1-9A-HJ-NP-Za-km-z]{40,}|secret_key|private_key|privateKey|seed_phrase|mnemonic|BEGIN .*PRIVATE|0x[0-9a-fA-F]{64}' -- scripts/demo"
git grep -n -I -i -E 'ed25519:[1-9A-HJ-NP-Za-km-z]{40,}|secret_key|private_key|privateKey|seed_phrase|mnemonic|BEGIN .*PRIVATE|0x[0-9a-fA-F]{64}' -- scripts/demo | cut -c1-220
echo "\$ git grep -n -I -E '[/]Users[/]|[/]home[/][a-z]|[/]Volumes[/]|~[/][.]nectar' -- scripts/demo"
git grep -n -I -E '[/]Users[/]|[/]home[/][a-z]|[/]Volumes[/]|~[/][.]nectar' -- scripts/demo | cut -c1-220
echo "\$ git grep -n -I -i -E 'seed|phrase' -- scripts/demo"
git grep -n -I -i -E 'seed|phrase' -- scripts/demo | cut -c1-220
echo "\$ git grep -l -I -i -E 'seed[-_ ]?phrase|mnemonic' -- ':!docs' ':!evidence' ':!*.md'   (committed code that names a seed phrase)"
git grep -l -I -i -E 'seed[-_ ]?phrase|mnemonic' -- ':!docs' ':!evidence' ':!*.md'
echo "\$ gitleaks dir scripts/demo"
gitleaks dir scripts/demo 2>&1 | tail -n 3
} > $L/demo-scripts.txt 2>&1
cp scripts/demo/intear-setup.mjs $L/intear-setup.mjs.txt

{
echo "## $(date -u +%FT%TZ) feed v2 fixtures"
echo "\$ git ls-files services/feed/test"; git ls-files services/feed/test
echo "\$ head of services/feed/test/v2-events.test.ts imports/fixture refs"; grep -n -E "fixture|readFile|import|describe|it\(|test\(" services/feed/test/v2-events.test.ts | head -30
echo "\$ grep -c '\"version\"' fixture; versions:"; grep -o '\\"version\\":\\"[0-9.]*\\"\|"version": *"[0-9.]*"' services/feed/test/fixtures/nectar-core-v2-events.json | sort | uniq -c
grep -o '"event\\*":\\*"[a-z_]*' services/feed/test/fixtures/nectar-core-v2-events.json | sort | uniq -c | head
grep -o -E '"(tx_hash|block_height|receipt_id)"[^,]{0,70}' services/feed/test/fixtures/nectar-core-v2-events.json | head -8
} > $L/feed-fixtures.txt 2>&1

cat $L/diffs.txt; echo; cut -c1-1200 $L/hosted-feed.txt; echo; cat $L/demo-scripts.txt; echo; cat $L/feed-fixtures.txt
