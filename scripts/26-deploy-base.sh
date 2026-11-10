#!/usr/bin/env bash
# P2b (WO-27 scripts): deploy PolicyRegistryMock + MockB20, then NectarVaultBase, to chain 84532 at BASE_RPC_URL (default: the local fork, D-026).
# Signer = Foundry keystore account "deployer" (--account + --password-file); never --private-key. Writes addresses to packages/config/config.yaml `base.*`.
# On the local fork the B20 factory precompile is not executable (anvil), so MockB20 is used (disclosed); on Base Sepolia CreateB20.s.sol is the alternative.
source "$(dirname "$0")/_lib.sh"; guard_mainnet
RPC="${BASE_RPC_URL:-http://127.0.0.1:8545}"; D="$HOME/.nectar/evm"; PW="$D/password"
CID=$(cast chain-id --rpc-url "$RPC"); [ "$CID" = "84532" ] || { echo "chain id $CID is not 84532 (Base mainnet 8453 is HUMAN-only)" >&2; exit 3; }
DEP=$(cast wallet address --keystore "$D/deployer" --password-file "$PW")
BR=$(cast wallet address --keystore "$D/borrower1" --password-file "$PW"); B1=$(cast wallet address --keystore "$D/buyer1" --password-file "$PW")
cd "$ROOT/evm"; find . -name '._*' -delete
fs() { forge script "$1" --rpc-url "$RPC" --keystore "$D/deployer" --password-file "$PW" --sender "$DEP" --broadcast 2>&1; }
log "DeployMock (PolicyRegistryMock + MockB20)"
OUT=$(DEMO_ACCOUNTS="$BR,$B1" fs script/DeployMock.s.sol:DeployMock); echo "$OUT" | grep -iE 'registry|token|0x[0-9a-fA-F]{40}' | head -8 || true
REG=$(echo "$OUT" | grep -oiE 'registry[^0]*0x[0-9a-fA-F]{40}' | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
TOK=$(echo "$OUT" | grep -oiE 'MockB20[^0]*0x[0-9a-fA-F]{40}' | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
[ -n "$REG" ] && [ -n "$TOK" ] || { echo "could not parse registry/token addresses; see output above" >&2; exit 2; }
log "DeployVault"
OUT2=$(TOKEN="$TOK" POLICY_REGISTRY="$REG" REGISTRY_IS_MOCK=true fs script/DeployVault.s.sol:DeployVault); echo "$OUT2" | grep -iE 'vault|0x[0-9a-fA-F]{40}' | head -5 || true
VAULT=$(echo "$OUT2" | grep -oiE 'vault[^0]*0x[0-9a-fA-F]{40}' | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
[ -n "$VAULT" ] || { echo "could not parse vault address" >&2; exit 2; }
cd "$ROOT"
yq -i ".base.rpc_url = \"$RPC\" | .base.vault = \"$VAULT\" | .base.collateral = \"$TOK\" | .base.policy_registry = \"$REG\" | .base.network = \"$( [ "$RPC" = http://127.0.0.1:8545 ] && echo local-fork-of-base-sepolia || echo base-sepolia)\"" "$CFG"
echo "registry=$REG collateral=$TOK vault=$VAULT rpc=$RPC"
