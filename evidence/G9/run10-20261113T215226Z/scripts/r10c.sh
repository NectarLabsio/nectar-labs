#!/usr/bin/env bash
# G9 run 10 part C: production (smoke-prod 4 custom hosts, dpl ids, /borrow copilot notice via system Chrome CAPTURE_LAUNCH), live re-reads of
# README figures (public RPC, spaced >= 2 s), README tx ids vs EVIDENCE, gitleaks tail, handoffs, then copy logs + scripts to the worktree evidence dir.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
C=/tmp/g9-run10-20261113T215226Z
L=$C.logs
D=/Volumes/T7/nectar-labs/.claude/worktrees/agent-ae919febae059425d/evidence/G9/run10-20261113T215226Z
cd $C
s=$(date +%s); echo "# $(date -u +%FT%TZ) \$ scripts/deploy/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io" > $L/prod-smoke.log
scripts/deploy/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io >> $L/prod-smoke.log 2>&1
echo "# exit=$? seconds=$(( $(date +%s) - s ))" >> $L/prod-smoke.log
{
echo "## $(date -u +%FT%TZ) production dpl ids (expected web dpl_C82s82HaQiU4KLGwvCfhv9Fe91dN, docs dpl_DiUxyPb5KcfYaF2Ai8CaFpyfWogw)"
echo "APP /borrow: $(curl -s -m 30 https://testnet.nectarlabs.io/borrow | grep -o -E 'dpl_[A-Za-z0-9]+' | sort -u | tr '\n' ' ')"
echo "SITE /: $(curl -s -m 30 https://nectarlabs.io/ | grep -o -E 'dpl_[A-Za-z0-9]+' | sort -u | tr '\n' ' ')"
echo "DOCS /: $(curl -s -m 30 https://docs.nectarlabs.io/ | grep -o -E 'dpl_[A-Za-z0-9]+' | sort -u | tr '\n' ' ') headers: $(curl -sI -m 20 https://docs.nectarlabs.io/ | grep -i -E '^(x-vercel-id|etag|age):' | tr -d '\r' | tr '\n' ' ')"
echo "## /borrow copilot notice (system Chrome headless via CAPTURE_LAUNCH)"
} > $L/prod-release.txt 2>&1
mkdir -p $D
node $L/borrow-copilot.mjs $C $D/borrow-copilot.png >> $L/prod-release.txt 2>&1; echo "exit=$?" >> $L/prod-release.txt
R=https://rpc.testnet.near.org; A=https://archival-rpc.testnet.near.org
view() { local b64=$(printf '%s' "$3" | base64); curl -s -m 30 $R -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$b64\"}}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(r.error||r.result?.error){console.log("ERR",JSON.stringify(r.error??r.result.error).slice(0,200));return}console.log("block",r.result.block_height,Buffer.from(r.result.result).toString().slice(0,600))})'; sleep 2.5; }
{
echo "## $(date -u +%FT%TZ) live re-reads ($R, spaced 2.5 s)"
echo "-- contract_version"; view nectar-core-v2.nectar.testnet contract_version '{}'
echo "-- get_exit_capacity NVDAx (README 20:13Z: Q 16,119.22, capacity 14,516.30 open; screenshot closed 12,096)"; view nectar-core-v2.nectar.testnet get_exit_capacity '{"symbol":"NVDAx"}'
echo "-- nft_total_supply (README: 27 Notes at 20:14Z)"; view nectar-core-v2.nectar.testnet nft_total_supply '{}'
echo "-- get_position 22 (README: Open, $100, Weekend Shield to 2026-11-16 14:30 UTC)"; view nectar-core-v2.nectar.testnet get_position '{"position_id":22}'
echo "-- view_access_key_list nectar.testnet: update_owner_price key"
curl -s -m 30 $R -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"nectar.testnet"}}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);for(const k of r.result.keys){const p=k.access_key.permission;if(p.FunctionCall)console.log("FunctionCall",p.FunctionCall.receiver_id,JSON.stringify(p.FunctionCall.method_names),"allowance",p.FunctionCall.allowance)}})'
sleep 2.5
for t in "9uwAk6Vyun9s2bi2wu1a7H5er3pRLpuVN3HYgYvsEfni demo.nectar.testnet" "475VLHwE9Nvkgq2kc15NWVQJLDyLmvcyD2Y2fNAURF1W demo.nectar.testnet" "6karZo8LKP4UbkDP9hx34459egCTcbEcRoZbNTph6sk5 x402-relayer.nectar.testnet"; do
  set -- $t; echo "-- EXPERIMENTAL_tx_status $1 ($2) via archival"
  curl -s -m 30 $A -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"EXPERIMENTAL_tx_status\",\"params\":{\"tx_hash\":\"$1\",\"sender_account_id\":\"$2\",\"wait_until\":\"NONE\"}}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(r.error){console.log("ERR",JSON.stringify(r.error).slice(0,200));return}const x=r.result;console.log("status",JSON.stringify(x.status).slice(0,60),"signer",x.transaction.signer_id,"receiver",x.transaction.receiver_id);for(const o of x.receipts_outcome)for(const l of o.outcome.logs)if(/shield_opened|position_opened|ft_transfer/.test(l))console.log("  log",l.slice(0,220))})'
  sleep 2.5
done
echo "-- hosted Feed /health ($(date -u +%T)Z)"; curl -s -m 20 https://feed-production-2f2776c9.up.railway.app/health | cut -c1-400; echo
} > $L/live-claims.txt 2>&1
{
echo "## README tx ids -> occurrences in docs/EVIDENCE.md"
for id in 9uwAk6Vy 475VLHwE 9ykovXkm E2suM2LC GcHF75nW De6aVqqN 6karZo8L 4vW2tPF5 BHopF1cu HrpQsuMW 6TKH53Xp 9s8HDeaq DTtVhTnS 3cdcQru2 15148 16453; do echo "$id $(grep -c "$id" docs/EVIDENCE.md)"; done
echo "## gitleaks"; tail -n 3 $L/gitleaks.log; echo "commits --all: $(git rev-list --count --all)"
echo "## verify-2 counts"; grep -E "test: (# |ℹ )(tests|pass|fail) [0-9]+" $L/verify-2.log | sed -E 's/ +/ /g'
echo "## HUMAN_HANDOFF headings"; grep -c -E '^## H' docs/process/human-handoff.md; grep -n -E '^## H' docs/process/human-handoff.md | cut -c1-140
echo "## TODO-H in README / payload"; grep -c 'TODO-H' README.md; grep -o 'TODO-H[0-9]*' $L/build-submission.log | sort | uniq -c
} > $L/checks-c.txt 2>&1
git status --porcelain > $L/clone-status-final.txt; echo "clone status lines: $(wc -l < $L/clone-status-final.txt)" >> $L/checks-c.txt
# copy logs (not sqlite) + scripts; home paths -> ~
for f in $(ls $L); do case $f in *.sqlite*|*-wal|*-shm) ;; host-grep.txt) gzip -c $L/$f > $D/host-grep.txt.gz;; *.png) ;; *) cp $L/$f $D/;; esac; done
mkdir -p $D/scripts; cp /private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad/r10{a,a2,b,c}.sh $D/scripts/; mv $D/linkcheck.mjs $D/borrow-copilot.mjs $D/scripts/ 2>/dev/null
for f in $(grep -l -r "$HOME" $D --exclude=*.gz --exclude=*.png); do sed -i '' "s#$HOME#~#g" $f; done
echo "home-path files after redaction: $(grep -l -r -E '[/]Users[/][A-Za-z]' $D --exclude=*.gz --exclude=*.png | wc -l)"
echo "=== smoke"; tail -n 6 $L/prod-smoke.log; grep -c '^FAIL' $L/prod-smoke.log
echo "=== release"; cut -c1-300 $L/prod-release.txt
echo "=== live"; cut -c1-420 $L/live-claims.txt
echo "=== checks"; cut -c1-160 $L/checks-c.txt
ls -la $D/borrow-copilot.png; du -sh $D
