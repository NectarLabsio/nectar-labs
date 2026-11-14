#!/usr/bin/env bash
# Devnet deploy of solana/nectar_vault (WO-14) per solana/deploy.md: mint, program keypair (outside the repo), keys sync, build, deploy,
# init_vault("NVDAx"), config update. Devnet only (guard + this check). Idempotent: skips steps already done.
source "$(dirname "$0")/_lib.sh"
[ "${SOLANA_CLUSTER:-devnet}" = "devnet" ] || { echo "devnet only (mainnet is HUMAN-only)" >&2; exit 3; }
export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
K=~/.nectar/solana; DEP=$K/deployer.json; URL=https://api.devnet.solana.com
SPL_TOKEN=spl-token; spl-token --version >/dev/null 2>&1 || SPL_TOKEN=$(ls -d "$HOME"/.local/share/solana/install/releases/stable-*/solana-release/bin/spl-token | tail -1)
[ -f "$DEP" ] || { echo "run scripts/05-solana.sh first" >&2; exit 2; }
log "balances"; solana balance "$(solana-keygen pubkey $DEP)" --url $URL
FEE=$(solana-keygen pubkey $K/keeper-fee-payer.json)
if [ "$(solana balance "$FEE" --url $URL | awk '{print int($1*100)}')" -lt 20 ]; then
  log "fund keeper fee payer 0.3 SOL from deployer"; solana transfer "$FEE" 0.3 --allow-unfunded-recipient --keypair $DEP --url $URL
fi
if [ ! -s $K/mint.txt ]; then
  log "mock NVDAx mint (6 dp, authority = deployer)"
  "$SPL_TOKEN" create-token --decimals 6 --url $URL --fee-payer $DEP --mint-authority "$(solana-keygen pubkey $DEP)" 2>&1 | tee -a "$ROOT/evidence/solana-mint.log" | awk '/Address:/{print $2}' > $K/mint.txt
fi
MINT=$(cat $K/mint.txt); [ -n "$MINT" ] || { echo "mint creation failed" >&2; exit 2; }; echo "mint=$MINT"
log "program keypair (outside the repo) + keys sync"
[ -f $K/nectar_vault-keypair.json ] || solana-keygen new --no-bip39-passphrase --silent -o $K/nectar_vault-keypair.json
chmod 600 $K/*.json
cd "$ROOT/solana"; mkdir -p target/deploy; cp $K/nectar_vault-keypair.json target/deploy/nectar_vault-keypair.json
anchor keys sync
log "build"; anchor build 2>&1 | tail -n 5
PROG=$(solana-keygen pubkey target/deploy/nectar_vault-keypair.json); echo "program=$PROG"
if ! solana program show "$PROG" --url $URL >/dev/null 2>&1; then
  log "deploy (devnet)"; anchor deploy --provider.cluster devnet --provider.wallet $DEP 2>&1 | tail -n 8
fi
solana program show "$PROG" --url $URL | head -8
cd "$ROOT"
log "init_vault(NVDAx)"; node scripts/57-vault-init.mjs "$PROG" "$MINT" "$DEP"
log "config"; yq -i ".solana.program_id = \"$PROG\" | .solana.vault_program = \"$PROG\" | .solana.mint = \"$MINT\"" packages/config/config.yaml
echo "explorer: https://explorer.solana.com/address/$PROG?cluster=devnet"
