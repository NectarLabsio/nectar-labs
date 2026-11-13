#!/usr/bin/env bash
# G9 run 10 part A (WO-97): repo shape (WO-92 step 3 items), then the README quick start + gates.md G9 commands, timed.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
C=/tmp/g9-run10-20261113T215226Z
L=$C.logs
cd $C
lsof -iTCP:3000 -iTCP:3100 -iTCP:18788 -iTCP:18789 -iTCP:8788 -iTCP:8789 -sTCP:LISTEN > $L/ports-before.txt 2>&1; echo "(lsof exit $?; empty = nothing listening)" >> $L/ports-before.txt
{
echo "## $(date -u +%FT%TZ) repo shape (before pnpm i)"
echo "\$ git rev-parse HEAD"; git rev-parse HEAD
echo "\$ git status --porcelain | wc -l"; git status --porcelain | wc -l
echo "\$ git rev-list --count HEAD"; git rev-list --count HEAD
echo "\$ product diff: git diff --stat 54bdd32 d55ba25 -- apps packages services contracts"; git diff --stat 54bdd32 d55ba25 -- apps packages services contracts; echo "(exit $?; empty above = no product change)"
echo "\$ git cat-file -t 54bdd32"; git cat-file -t 54bdd32
echo "\$ tracked files > 5 MB (git ls-files -z | xargs stat)"
git ls-files -z | xargs -0 stat -f '%z %N' | awk '$1>5242880' ; echo "(end >5MB list)"
echo "\$ tracked files > 1 MB"; git ls-files -z | xargs -0 stat -f '%z %N' | awk '$1>1048576' | sort -rn | head -20
echo "\$ git grep -l -a -E '[/]Users[/][A-Za-z]' (all tracked, incl. wasm) | wc -l"; git grep -l -a -E '[/]Users[/][A-Za-z]' | wc -l
git grep -n -a -E '[/]Users[/][A-Za-z]' | cut -c1-220 | head -20
echo "\$ git grep -l -a -E '[/]home[/][a-z]+[/]' | wc -l"; git grep -l -a -E '[/]home[/][a-z]+[/]' | wc -l
git grep -n -a -E '[/]home[/][a-z]+[/]' | cut -c1-200 | head -10
echo "\$ top-level tree: git ls-tree --name-only HEAD"; git ls-tree HEAD | awk '{print $2, $4}'
echo "\$ .claude tracked files"; git ls-files .claude
echo "\$ tracked .env* files"; git ls-files | grep -E '(^|/)\.env'
echo "\$ tracked ._* / .DS_Store"; git ls-files | grep -E '(^|/)(\._|\.DS_Store)'; echo "(end)"
echo "\$ LICENSE first 3 lines"; head -3 LICENSE
echo "\$ key-material grep excl. lockfile + forge-std"
git grep -n -I -E 'ed25519:[1-9A-HJ-NP-Za-km-z]{80,}|BEGIN [A-Z ]*PRIVATE KEY|"secret_key" *: *"[^"]|"private_key" *: *"[^"]{20,}' -- ':!pnpm-lock.yaml' ':!**/forge-std/**' | grep -v -i 'signature' | cut -c1-200; echo "(end)"
} > $L/repo-shape.txt 2>&1
run() { local name=$1; shift; local s=$(date +%s)
  echo "# $(date -u +%FT%TZ) \$ $*" > "$L/$name.log"
  "$@" >> "$L/$name.log" 2>&1; local rc=$?
  echo "# exit=$rc seconds=$(( $(date +%s) - s ))" >> "$L/$name.log"
  echo "$name exit=$rc seconds=$(( $(date +%s) - s ))" >> "$L/summary.txt"; }
echo "# G9 run 10 commands, local clone $(git rev-parse HEAD), start $(date -u +%FT%TZ)" > "$L/summary.txt"
run pnpm-i pnpm i
run demo-testnet pnpm demo:testnet
run verify pnpm verify
run docs-build pnpm --filter docs-site build
run gitleaks gitleaks detect --log-opts=--all
echo "# end $(date -u +%FT%TZ)" >> "$L/summary.txt"
git status --porcelain > "$L/clone-status-after-a.txt"
cat "$L/summary.txt"
