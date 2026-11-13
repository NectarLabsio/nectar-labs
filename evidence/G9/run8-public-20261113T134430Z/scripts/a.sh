#!/usr/bin/env bash
# G9 run 8 part A (public URL clone): repo-shape checks before install, then pnpm i, demo:testnet, verify, docs build, gitleaks
B=/tmp/verify-G9-r8-20261113T134430Z
cd $B/repo
L=$B/logs
{
echo "## $(date -u +%FT%TZ) public-repo shape (before pnpm i)"
echo "\$ git remote -v"; git remote -v
echo "\$ git rev-parse HEAD"; git rev-parse HEAD
echo "\$ git rev-list --count HEAD"; git rev-list --count HEAD
echo "\$ git count-objects -vH"; git count-objects -vH
echo "\$ find . -path ./.git -prune -o -type f -size +50M -print   (working tree files > 50 MB)"; find . -path ./.git -prune -o -type f -size +50M -print
echo "\$ largest 5 tracked files"; git ls-files -z | xargs -0 stat -f '%z %N' | sort -n | tail -5
echo "\$ history blobs > 50 MB (all refs)"; git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | awk '$1=="blob" && $3>52428800' | head
echo "\$ largest 3 history blobs"; git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | awk '$1=="blob"' | sort -k3 -n | tail -3
echo "\$ tracked .env* files"; git ls-files | grep -E '(^|/)\.env'
echo "\$ .env* files ever added in history"; git log --all --diff-filter=A --name-only --format= | grep -E '(^|/)\.env' | sort -u
echo "\$ non-comment, non-empty lines in tracked .env* files"; for f in $(git ls-files | grep -E '(^|/)\.env'); do grep -n -v -E '^\s*(#|$)' "$f" | sed "s|^|$f:|"; done
echo "\$ tracked files under a .nectar dir"; git ls-files | grep -E '(^|/)\.nectar(/|$)'
echo "\$ expanded home paths ([/]Users[/][A-Za-z] or [/]home[/]x[/], excl. wasm): file count + list"
git grep -l -a -E '[/]Users[/][A-Za-z]|[/]home[/][a-z]+[/]' -- ':!*.wasm' | wc -l
git grep -l -a -E '[/]Users[/][A-Za-z]|[/]home[/][a-z]+[/]' -- ':!*.wasm' | head
echo "\$ '~/.nectar' mentions: files / lines"; git grep -l -I -F '~/.nectar' | wc -l; git grep -n -I -F '~/.nectar' | wc -l
echo "\$ '~/.nectar' mentions outside docs/, evidence/, *.md"; git grep -n -I -F '~/.nectar' -- ':!docs' ':!evidence' ':!*.md' | cut -c1-200
echo "\$ key-material grep (ed25519 secret >=80 b58, PEM private, secret_key/private_key with a value) excl. lockfile + forge-std"
git grep -n -I -E 'ed25519:[1-9A-HJ-NP-Za-km-z]{80,}|BEGIN [A-Z ]*PRIVATE KEY|"secret_key" *: *"[^"]|"private_key" *: *"[^"]{20,}' -- ':!pnpm-lock.yaml' ':!**/forge-std/**' | cut -c1-200
echo "\$ files with 0x + 64 hex outside lockfile/evidence/docs (hashes or public anvil test keys; classify)"
git grep -c -I -E '0x[0-9a-fA-F]{64}' -- ':!pnpm-lock.yaml' ':!evidence' ':!docs' ':!**/forge-std/**' | head -20
} > $L/repo-shape.txt 2>&1
run() { local name=$1; shift; local s=$(date +%s)
  echo "# $(date -u +%FT%TZ) \$ $*" > "$L/$name.log"
  "$@" >> "$L/$name.log" 2>&1; local rc=$?
  echo "# exit=$rc seconds=$(( $(date +%s) - s ))" >> "$L/$name.log"
  echo "$name exit=$rc seconds=$(( $(date +%s) - s ))" >> "$L/summary.txt"; }
echo "# G9 run 8 commands, public clone $(git rev-parse HEAD), start $(date -u +%FT%TZ)" > "$L/summary.txt"
run pnpm-i pnpm i
run demo-testnet pnpm demo:testnet
run verify pnpm verify
run docs-build pnpm --filter docs-site build
run gitleaks gitleaks detect --log-opts=--all
echo "# end $(date -u +%FT%TZ)" >> "$L/summary.txt"
git status --porcelain | head -20 > "$L/clone-status-after.txt"
cat "$L/summary.txt"
