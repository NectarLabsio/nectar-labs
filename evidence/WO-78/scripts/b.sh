#!/usr/bin/env bash
# WO-78 part B: hydrated Chrome probe (item 3) + Lighthouse a11y APP /borrow both themes (item 4).
B=/tmp/verify-wo78-20261113T142142Z
R=$B/nectar-labs
L=$B/logs; mkdir -p $L/probe
cd $R/apps/web
{ echo "# $(date -u +%FT%TZ) node wo78-probe.mjs $L/probe"; node wo78-probe.mjs $L/probe; echo "exit=$?"; } > $L/probe/probe.log 2>&1
{ echo "# $(date -u +%FT%TZ) LH_BASE_URL=https://testnet.nectarlabs.io LH_ROUTES=/borrow node scripts/lighthouse.mjs"; LH_BASE_URL=https://testnet.nectarlabs.io LH_ROUTES=/borrow node scripts/lighthouse.mjs; echo "exit=$?"; } > $L/lighthouse-app-borrow.log 2>&1
ls $R/evidence/G3/lighthouse/ 2>/dev/null
for f in $R/evidence/G3/lighthouse/*borrow*.json; do python3 -I -c "import json,sys; d=json.load(open(sys.argv[1])); print(sys.argv[1].split('/')[-1], d.get('finalDisplayedUrl') or d.get('finalUrl'), d['fetchTime'], 'a11y', round(d['categories']['accessibility']['score']*100), 'failing a11y audits:', [k for k,a in d['audits'].items() if a.get('score') is not None and a.get('score')<1 and a.get('scoreDisplayMode')=='binary'][:8])" "$f"; done > $L/lighthouse-summary.txt 2>&1
cat $L/probe/probe.log; cat $L/lighthouse-app-borrow.log; cat $L/lighthouse-summary.txt
