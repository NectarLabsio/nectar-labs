#!/usr/bin/env bash
# P2b disclosed fallback (D-026): a LOCAL fork of Base Sepolia (chain id 84532) on 127.0.0.1:8545, used because no Base Sepolia faucet works without a
# login (F-362–F-368, H15). Funds the keystore accounts with fork-only `anvil_setBalance` (no real ETH anywhere). Everything run here is labelled
# "local fork, not Base Sepolia" in EVIDENCE/README. Usage: scripts/27-base-fork.sh start | fund | stop
source "$(dirname "$0")/_lib.sh"; guard_mainnet
RPC=http://127.0.0.1:8545; D="$HOME/.nectar/evm"; PW="$D/password"
case "${1:-}" in
start)
  if cast chain-id --rpc-url $RPC >/dev/null 2>&1; then echo "fork already running (chain $(cast chain-id --rpc-url $RPC))"; exit 0; fi
  mkdir -p "$ROOT/evidence/G12"
  nohup anvil --fork-url "${BASE_FORK_URL:-https://sepolia.base.org}" --chain-id 84532 --port 8545 --silent \
    > "$ROOT/evidence/G12/anvil-$(date -u +%Y%m%dT%H%M%SZ).log" 2>&1 &
  echo $! > "$HOME/.nectar/evm/anvil.pid"
  for i in $(seq 1 30); do cast chain-id --rpc-url $RPC >/dev/null 2>&1 && break; sleep 1; done
  echo "fork up: chain $(cast chain-id --rpc-url $RPC), block $(cast block-number --rpc-url $RPC) (forked from Base Sepolia)" ;;
fund)
  [ "$(cast chain-id --rpc-url $RPC)" = "84532" ] || { echo "not the local fork" >&2; exit 3; }
  for name in deployer keeper borrower1 buyer1; do
    A=$(cast wallet address --keystore "$D/$name" --password-file "$PW")
    cast rpc anvil_setBalance "$A" 0x8AC7230489E80000 --rpc-url $RPC >/dev/null   # 10 ETH on the fork only
    echo "$name $A $(cast balance "$A" --rpc-url $RPC --ether) ETH (fork)"
  done ;;
stop)
  [ -f "$HOME/.nectar/evm/anvil.pid" ] && kill "$(cat "$HOME/.nectar/evm/anvil.pid")" 2>/dev/null; rm -f "$HOME/.nectar/evm/anvil.pid"; echo stopped ;;
*) echo "usage: $0 start|fund|stop" >&2; exit 2 ;;
esac
