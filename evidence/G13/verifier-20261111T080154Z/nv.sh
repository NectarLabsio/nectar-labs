#!/bin/bash
# usage: nv.sh <account> <method> <json-args>
RPC=${RPC:-https://test.rpc.fastnear.com}
A=$(printf '%s' "$3" | base64 | tr -d '\n')
curl -s -X POST $RPC -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$A\"}}" | jq -r 'if .result.result then (.result.result|implode) else (.error // .result.error | tostring) end'
