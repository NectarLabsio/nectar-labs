#!/usr/bin/env bash
# A3+A4 probe, A5 inventory wallet pass, A6 Lighthouse. Read-only against production.
cd /tmp/verify-wo67-20261113T0205Z/repo/apps/web
EV=/Volumes/T7/nectar-labs/.claude/worktrees/agent-a120e7a0baaef2f5d/evidence/WO-67/A
mkdir -p $EV/probe $EV/wallets $EV/lighthouse
cp wo67-probe.mjs $EV/probe/
{ echo "# $(date -u +%FT%TZ) node wo67-probe.mjs (PW channel chrome)"; node wo67-probe.mjs $EV/probe; echo "exit=$?"; } > $EV/probe/probe.log 2>&1
echo "--- probe"; cat $EV/probe/probe.log | cut -c1-400
{ echo "# $(date -u +%FT%TZ) E2E_INVENTORY=1 INV_SITE=https://nectarlabs.io INV_APP=https://testnet.nectarlabs.io E2E_BASE_URL=https://testnet.nectarlabs.io PW_CHANNEL=chrome npx playwright test --project=inventory --grep 'every wallet|zero CSP' --reporter=list"
  E2E_INVENTORY=1 INV_SITE=https://nectarlabs.io INV_APP=https://testnet.nectarlabs.io E2E_BASE_URL=https://testnet.nectarlabs.io PW_CHANNEL=chrome \
   npx playwright test --project=inventory --grep 'every wallet|zero CSP' --reporter=list; echo "exit=$?"; } > $EV/wallets/inventory-wallets.log 2>&1
cp content/data-inventory.json $EV/wallets/ 2>/dev/null; cp content/data-inventory.md $EV/wallets/ 2>/dev/null
echo "--- wallets"; tail -n 25 $EV/wallets/inventory-wallets.log | cut -c1-300
for t in "https://nectarlabs.io /" "https://testnet.nectarlabs.io /borrow"; do set -- $t
  n=$(echo "$1" | sed 's|https://||; s|\.|-|g')
  { echo "# $(date -u +%FT%TZ) LH_BASE_URL=$1 LH_ROUTES=$2 node scripts/lighthouse.mjs"; LH_BASE_URL=$1 LH_ROUTES=$2 node scripts/lighthouse.mjs; echo "exit=$?"; } > $EV/lighthouse/$n.log 2>&1
  echo "--- LH $1$2"; tail -n 8 $EV/lighthouse/$n.log | cut -c1-200
done
git -C /tmp/verify-wo67-20261113T0205Z/repo status --porcelain | head
