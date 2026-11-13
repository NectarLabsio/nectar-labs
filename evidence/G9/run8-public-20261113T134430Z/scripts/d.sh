#!/usr/bin/env bash
# G9 run 8 part D: classify the long ed25519 strings and 0x64-hex hits from repo-shape.txt; scripts/demo delta checks; handoff census.
B=/tmp/verify-G9-r8-20261113T134430Z
cd $B/repo
L=$B/logs
{
echo "## $(date -u +%FT%TZ) long ed25519 strings in RPC JSON: which JSON key holds them"
for f in $(git grep -l -I -E 'ed25519:[1-9A-HJ-NP-Za-km-z]{80,}' -- '*.json'); do
  echo "$(grep -o -E '"[a-z_]+": ?"ed25519:[1-9A-HJ-NP-Za-km-z]{80,}' $f | cut -d'"' -f2 | sort | uniq -c | tr '\n' ' ') $f"
done
echo "## long ed25519 strings in non-JSON files on a line without 'Signature'"
git grep -n -I -E 'ed25519:[1-9A-HJ-NP-Za-km-z]{80,}' -- ':!*.json' | grep -v -i signature | cut -c1-200
echo "## 0x+64-hex assigned to a key-like name in code"
git grep -n -I -i -E '(priv|secret|pk|key)[A-Za-z_]* *[:=(,]+ *"?0x[0-9a-fA-F]{64}' -- apps contracts evm quoter services packages | cut -c1-200 | head
echo "## anvil default key 0 (public test key) occurrences"
git grep -l -I -i 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
echo "## seed/mnemonic readers in committed code (outside docs/evidence/md)"
git grep -l -I -i -E 'seed[-_ ]?phrase|mnemonic' -- ':!docs' ':!evidence' ':!*.md'
echo "## scripts/demo: home paths / key material"
git grep -n -I -E '[/]Users[/]|[/]home[/][a-z]' -- scripts/demo | cut -c1-200
git grep -n -I -E 'ed25519:[1-9A-HJ-NP-Za-km-z]{80,}|BEGIN .*PRIVATE' -- scripts/demo | cut -c1-200
echo "## intear-setup.mjs console calls (must all go through redact)"
grep -n -E 'console\.(log|error|warn)|redact' scripts/demo/intear-setup.mjs | cut -c1-200
echo "## gitleaks dir scripts/demo"; gitleaks dir scripts/demo 2>&1 | tail -n 2
echo "## HUMAN_HANDOFF entries"
grep -c -E '^## H' docs/HUMAN_HANDOFF.md
grep -n -E '^## H' docs/HUMAN_HANDOFF.md | cut -c1-120
echo "## docs changed since d92a199 (README / HUMAN_HANDOFF / SUBMISSION / DEMO_SCRIPT)"
git diff --stat d92a199 HEAD -- README.md docs/HUMAN_HANDOFF.md docs/SUBMISSION.md docs/DEMO_SCRIPT.md; echo "(exit $?)"
echo "## README TODO-H2"; grep -n 'TODO-H2' README.md | cut -c1-160
} > $L/checks-d.txt 2>&1
cat $L/checks-d.txt
