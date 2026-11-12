#!/bin/bash
# G3b run 8b: copy evidence from the clone's ev dir into the worktree, then hygiene checks on what was copied.
set -u
EV=/tmp/verify-G3b-r8b-20261112T2132Z.ev
D=/tmp/verify-G3b-r8b-20261112T2132Z
SP=/private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad
OUT=/Volumes/T7/nectar-labs/.claude/worktrees/agent-a58a3572ceb2b824f/evidence/G3b/verifier-rerun8b-20261112T2132Z
mkdir -p "$OUT/crawl" "$OUT/crawl-fast"
cp "$EV"/run.txt "$EV"/clone.log "$EV"/diff-stat-*.txt "$EV"/k-*.log "$EV"/k-wo62b-log.txt "$EV"/crawl-hosts-test.log "$EV"/build-docs.log "$EV"/build-hosted.log \
   "$EV"/health-hosted.json "$EV"/hydration-*.json "$EV"/hydration-*.log "$EV"/crawl.log "$EV"/crawl-fast.log "$EV"/clone-status.txt "$EV"/install.log "$OUT/"
cp "$EV"/crawl/crawl.json "$EV"/crawl/crawl.md "$OUT/crawl/"
cp "$EV"/crawl-fast/crawl.json "$EV"/crawl-fast/crawl.md "$OUT/crawl-fast/"
cp "$SP"/r8b.sh "$SP"/hydration-probe.mjs "$SP"/analyze.cjs "$SP"/analyze.out "$SP"/r8b-copy.sh "$OUT/"
cp "$SP"/r8b-master.log "$OUT/run-master.log"
find "$OUT" -name '._*' -delete
echo "== files: $(find "$OUT" -type f | wc -l | tr -d ' '), size $(du -sh "$OUT" | cut -f1)"
echo "== strict home-path hits in copied evidence: $(/usr/bin/grep -rlE '/Users/[A-Za-z]' "$OUT" | wc -l | tr -d ' ')"
/usr/bin/grep -rnE '/Users/[A-Za-z]' "$OUT" | cut -c1-200 | head -5
echo "== secret-ish patterns: $(/usr/bin/grep -rlE 'ed25519:[1-9A-HJ-NP-Za-km-z]{40,}|PRIVATE KEY|secret_key' "$OUT" | wc -l | tr -d ' ')"
echo "== docs/ui diff"; cd "$D" && git diff 31809b1 c95cd0c -- docs/ui | /usr/bin/grep -E '^[-+][^-+]' | cut -c1-220
echo "== non-wasm /Users/ lines (loose)"; cut -c1-160 "$EV/k-git-grep-nonwasm-lines.log"
echo "== k-git-grep-l"; cat "$EV/k-git-grep-l.log"
echo "== fast-crawl extra app page"; node -e 'const a=require(process.argv[1]),b=require(process.argv[2]);const s=j=>new Set(j.routes.filter(r=>r.host).map(r=>r.url));const A=s(a),B=s(b);console.log("only fast:",[...B].filter(u=>!A.has(u)),"only polite:",[...A].filter(u=>!B.has(u)))' "$EV/crawl/crawl.json" "$EV/crawl-fast/crawl.json"
echo "== soft externals by host"; node -e 'const j=require(process.argv[1]);const m={};for(const e of j.externals){const h=new URL(e.href).host;const k=h+" "+e.status;m[k]=(m[k]||0)+1}console.log(JSON.stringify(m))' "$EV/crawl/crawl.json"
echo "== crawl.md head"; head -12 "$EV/crawl/crawl.md" | cut -c1-300
