#!/usr/bin/env bash
# G9 run 9 part A (WO-77): local fresh clone of d863f55; repo shape, then pnpm i, demo:testnet, verify, docs build, gitleaks (same as run 8 a.sh).
B=/tmp/verify-G9-r9-20261113T141500Z
cd $B/repo
L=$B/logs
{
echo "## $(date -u +%FT%TZ) repo shape (before pnpm i)"
echo "\$ git remote -v"; git remote -v
echo "\$ git rev-parse HEAD"; git rev-parse HEAD
echo "\$ git rev-list --count HEAD"; git rev-list --count HEAD
echo "\$ find . -path ./.git -prune -o -type f -size +50M -print"; find . -path ./.git -prune -o -type f -size +50M -print
echo "\$ tracked .env* files"; git ls-files | grep -E '(^|/)\.env'
echo "\$ expanded home paths ([/]Users[/][A-Za-z] or [/]home[/]x[/], excl. wasm): file count + list"
git grep -l -a -E '[/]Users[/][A-Za-z]|[/]home[/][a-z]+[/]' -- ':!*.wasm' | wc -l
git grep -l -a -E '[/]Users[/][A-Za-z]|[/]home[/][a-z]+[/]' -- ':!*.wasm' | head
echo "\$ key-material grep excl. lockfile + forge-std"
git grep -n -I -E 'ed25519:[1-9A-HJ-NP-Za-km-z]{80,}|BEGIN [A-Z ]*PRIVATE KEY|"secret_key" *: *"[^"]|"private_key" *: *"[^"]{20,}' -- ':!pnpm-lock.yaml' ':!**/forge-std/**' | grep -v -E '"(signature|public_key|signer_public_key)"' | grep -v -i 'signature' | cut -c1-200
echo "\$ files added since b6d6f41"; git diff --name-status b6d6f41 HEAD | grep -v '^M' | cut -c1-160
} > $L/repo-shape.txt 2>&1
run() { local name=$1; shift; local s=$(date +%s)
  echo "# $(date -u +%FT%TZ) \$ $*" > "$L/$name.log"
  "$@" >> "$L/$name.log" 2>&1; local rc=$?
  echo "# exit=$rc seconds=$(( $(date +%s) - s ))" >> "$L/$name.log"
  echo "$name exit=$rc seconds=$(( $(date +%s) - s ))" >> "$L/summary.txt"; }
echo "# G9 run 9 commands, local clone $(git rev-parse HEAD), start $(date -u +%FT%TZ)" > "$L/summary.txt"
run pnpm-i pnpm i
run demo-testnet pnpm demo:testnet
run verify pnpm verify
run docs-build pnpm --filter docs-site build
run gitleaks gitleaks detect --log-opts=--all
echo "# end $(date -u +%FT%TZ)" >> "$L/summary.txt"
git status --porcelain | head -20 > "$L/clone-status-after.txt"
cat "$L/summary.txt"
