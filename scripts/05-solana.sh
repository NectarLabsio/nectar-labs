#!/usr/bin/env bash
# Devnet keypairs + airdrops + mock mint. P2 only.
source "$(dirname "$0")/_lib.sh"
[ "${SOLANA_CLUSTER:-devnet}" = "devnet" ] || { echo "mainnet is HUMAN-only" >&2; exit 3; }
mkdir -p ~/.nectar/solana && chmod 700 ~/.nectar/solana
# solana-cli 2.3.0's spl-token links Homebrew openssl@3 (absent here); the Anza stable release's spl-token does not (C-201: call it by full path).
SPL_TOKEN=spl-token; spl-token --version >/dev/null 2>&1 || SPL_TOKEN=$(ls -d "$HOME"/.local/share/solana/install/releases/stable-*/solana-release/bin/spl-token 2>/dev/null | tail -1)
[ -f ~/.nectar/solana/deployer.json ] || solana-keygen new --no-bip39-passphrase --outfile ~/.nectar/solana/deployer.json
[ -f ~/.nectar/solana/keeper-fee-payer.json ] || solana-keygen new --no-bip39-passphrase --outfile ~/.nectar/solana/keeper-fee-payer.json
chmod 600 ~/.nectar/solana/*.json
solana config set --url https://api.devnet.solana.com --keypair ~/.nectar/solana/deployer.json
# The vault deploy needs >= 4.1 SOL (program rent 2.02 + same-size buffer, solana/deploy.md): airdrop until >= 4.5 SOL.
DEP=$(solana-keygen pubkey ~/.nectar/solana/deployer.json)
bal() { solana balance "$1" --url devnet 2>/dev/null | awk '{print int($1*100)}'; }
n=0; while [ "$(bal "$DEP")" -lt 450 ] && [ $n -lt 6 ]; do solana airdrop 2 "$DEP" --url devnet || sleep 30; n=$((n+1)); done
[ "$(bal "$DEP")" -ge 450 ] || echo "AIRDROP SHORT ($(solana balance "$DEP" --url devnet)) → H-SOL-AIRDROP: $DEP" >&2
DELAY=30 retry solana airdrop 1 "$(solana-keygen pubkey ~/.nectar/solana/keeper-fee-payer.json)" || echo "AIRDROP FAILED → H-SOL-AIRDROP" >&2
if [ ! -f ~/.nectar/solana/mint.txt ]; then log "mock NVDAx mint (6 dp)"; "$SPL_TOKEN" create-token --decimals 6 --url devnet --fee-payer ~/.nectar/solana/deployer.json | tee -a "$ROOT/evidence/solana-mint.log" | awk '/Address:/{print $2}' > ~/.nectar/solana/mint.txt; fi
echo "mint: $(cat ~/.nectar/solana/mint.txt)"
