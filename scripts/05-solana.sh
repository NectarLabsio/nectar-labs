#!/usr/bin/env bash
# Devnet keypairs + airdrops + mock mint. P2 only.
source "$(dirname "$0")/_lib.sh"
[ "${SOLANA_CLUSTER:-devnet}" = "devnet" ] || { echo "mainnet is HUMAN-only" >&2; exit 3; }
mkdir -p ~/.nectar/solana && chmod 700 ~/.nectar/solana
[ -f ~/.nectar/solana/deployer.json ] || solana-keygen new --no-bip39-passphrase --outfile ~/.nectar/solana/deployer.json
[ -f ~/.nectar/solana/keeper-fee-payer.json ] || solana-keygen new --no-bip39-passphrase --outfile ~/.nectar/solana/keeper-fee-payer.json
chmod 600 ~/.nectar/solana/*.json
solana config set --url https://api.devnet.solana.com --keypair ~/.nectar/solana/deployer.json
DELAY=30 retry solana airdrop 2 || echo "AIRDROP FAILED → H-SOL-AIRDROP: $(solana-keygen pubkey ~/.nectar/solana/deployer.json)" >&2
DELAY=30 retry solana airdrop 1 "$(solana-keygen pubkey ~/.nectar/solana/keeper-fee-payer.json)" || echo "AIRDROP FAILED → H-SOL-AIRDROP" >&2
log "mock NVDAx mint (6 dp)"; spl-token create-token --decimals 6 | tee -a "$ROOT/evidence/solana-mint.log"
