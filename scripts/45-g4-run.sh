#!/usr/bin/env bash
# G4 testnet run (orchestrator; the verifier checks the result). Two triggers through the real keeper function-call key:
#   A) fallback: quoter pinned to a WRONG version_key → OutLayer returns null → `quoter_fallback`, settle at max_discount (position #2)
#   B) quoter:   correct pin → OutLayer executes the published wasm → `quoter_result` with clamped fills (position #0)
# Prices (owner oracle, disclosed demo control, each move inside the 1,500 bps band): 180 → 155 makes only #2 triggerable
# (600/775 = 7,742 > 7,500; #0 = 7,258); 155 → 140 makes #0 triggerable (8,036 > 7,500).
source "$(dirname "$0")/_lib.sh"; guard_mainnet
OWNER=$(cfg .accounts.owner); CORE=$(cfg .accounts.core); NVDAX=$(cfg .accounts.nvdax_mock); BR=$(cfg .accounts.demo.borrower1)
KEEPER=$(cfg .accounts.keeper); KEEPER_KEY="${KEEPER_KEY_PATH:-$HOME/.nectar/keys/keeper.function-call.json}"
[ "$(stat -f %Lp "$KEEPER_KEY")" = "600" ] || { echo "keeper key file must be 0600" >&2; exit 2; }
owner() { near contract call-function as-transaction "$CORE" "$1" json-args "$2" prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-keychain send </dev/null; }
trigger() { near contract call-function as-transaction "$CORE" trigger_preliquidation json-args "{\"position_id\":\"$1\"}" prepaid-gas '300 Tgas' \
  attached-deposit '0 NEAR' sign-as "$KEEPER" network-config testnet sign-with-access-key-file "$KEEPER_KEY" send </dev/null; }
health() { bash "$ROOT/scripts/50-verify.sh" 2>/dev/null | sed -n '/== positions ==/,/== explorer ==/p'; }

STEP="${1:-all}"
if [ "$STEP" = A ] || [ "$STEP" = all ]; then
  log "A0: borrower1 opens position #2 (5 NVDAx, \$600, pre-liq 7,500) at \$180"
  owner update_owner_price '{"symbol":"NVDAx","price_usd_e6":"180000000"}'
  # msg via --arg (bash 3.2 mis-parses \" inside a single-quoted jq program nested in "$(...)")
  MSG='{"LockCollateralAndBorrow":{"collateral":"NVDAx","borrow_usd_e6":"600000000","pre_liq_ltv_bps":7500}}'
  ARGS=$(jq -cn --arg r "$CORE" --arg m "$MSG" '{receiver_id:$r, amount:"5000000", msg:$m}')
  near contract call-function as-transaction "$NVDAX" ft_transfer_call json-args "$ARGS" \
    prepaid-gas '300 Tgas' attached-deposit '1 yoctoNEAR' sign-as "$BR" network-config testnet sign-with-keychain send </dev/null
  log "A1: pin a WRONG version_key"; PIN_VERSION_KEY=$(printf '0%.0s' $(seq 1 64)) bash "$ROOT/scripts/30-quoter-publish.sh" pin
  log "A2: price \$155"; owner update_owner_price '{"symbol":"NVDAx","price_usd_e6":"155000000"}'; health
  log "A3: keeper triggers #2 (expect quoter_fallback)"; trigger 2; sleep 20; health
fi
if [ "$STEP" = B ] || [ "$STEP" = all ]; then
  log "B1: pin the published quoter"; bash "$ROOT/scripts/30-quoter-publish.sh" pin
  log "B2: price \$140"; owner update_owner_price '{"symbol":"NVDAx","price_usd_e6":"140000000"}'; health
  log "B3: keeper triggers #0 (expect quoter_result)"; trigger 0; sleep 30; health
fi
