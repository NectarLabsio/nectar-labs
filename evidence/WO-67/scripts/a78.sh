#!/usr/bin/env bash
EV=/Volumes/T7/nectar-labs/.claude/worktrees/agent-a120e7a0baaef2f5d/evidence/WO-67/A
FEED=https://feed-production-2f2776c9.up.railway.app
RPC=https://rpc.testnet.fastnear.com
OUT7=$EV/a7-feed-$(date -u +%Y%m%dT%H%M%SZ).log
{
echo "# WO-67 A7 Feed, $(date -u +%FT%TZ)"
echo "== GET /health"; curl -s -w '\nHTTP %{http_code}\n' $FEED/health
for o in https://nectarlabs.io https://testnet.nectarlabs.io https://status.nectarlabs.io https://docs.nectarlabs.io https://evil.example.com https://nectarlabs.vercel.app; do
  echo "== Origin $o"
  printf 'GET /health: '; curl -s -o /dev/null -D - -H "Origin: $o" $FEED/health | tr -d '\r' | grep -i '^HTTP\|^access-control-allow-origin\|^vary' | tr '\n' ' '; echo
  printf 'OPTIONS /mcp: '; curl -s -o /dev/null -D - -X OPTIONS -H "Origin: $o" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' $FEED/mcp | tr -d '\r' | grep -i '^HTTP\|^access-control-allow-origin\|^access-control-allow-methods' | tr '\n' ' '; echo
done
} > "$OUT7" 2>&1
echo "$OUT7"; cut -c1-400 "$OUT7"

OUT8=$EV/a8-oracle-$(date -u +%Y%m%dT%H%M%SZ).log
q() { # method args_json
  local a=$(printf %s "$2" | base64)
  curl -s $RPC -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"nectar-core-v2.nectar.testnet\",\"method_name\":\"$1\",\"args_base64\":\"$a\"}}" \
   | python3 -I -c 'import sys,json; r=json.load(sys.stdin); res=r.get("result",{}); print(bytes(res["result"]).decode() if "result" in res else json.dumps(r)[:600])'
}
{
echo "# WO-67 A8 oracle, $(date -u +%FT%TZ), RPC $RPC (final)"
echo "== get_exit_capacity {\"symbol\":\"NVDAx\"}"; q get_exit_capacity '{"symbol":"NVDAx"}'
echo "== block time (final)"; curl -s $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"block","params":{"finality":"final"}}' | python3 -I -c 'import sys,json; h=json.load(sys.stdin)["result"]["header"]; print(h["height"], h["timestamp_nanosec"])'
echo "== nectar.testnet access keys"
curl -s $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"nectar.testnet"}}' \
 | python3 -I -c 'import sys,json; ks=json.load(sys.stdin)["result"]["keys"]; print("keys:",len(ks)); [print(k["public_key"][:20]+"…", json.dumps(k["access_key"]["permission"])) for k in ks]'
} > "$OUT8" 2>&1
echo "$OUT8"; cut -c1-700 "$OUT8"
