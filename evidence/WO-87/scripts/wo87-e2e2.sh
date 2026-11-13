#!/usr/bin/env bash
# WO-87 A item 5b re-run (coordinator): config's own webServer (`next start -p 3100`), no PORT, system Chrome.
L=/tmp/verify-wo87-20261113T170125Z/logs
cd /tmp/verify-wo87-20261113T170125Z/repo/apps/web
{ echo "# $(date -u +%FT%TZ) (apps/web @ $(git rev-parse --short HEAD)) PW_CHANNEL=chrome npx playwright test e2e/claims.spec.ts e2e/test-assets.spec.ts"
  echo "3100 listeners before: $(lsof -iTCP:3100 -sTCP:LISTEN -t | wc -l | tr -d ' ')"
  echo "chrome: $("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version 2>/dev/null)"
  s=$(date +%s); PW_CHANNEL=chrome npx playwright test e2e/claims.spec.ts e2e/test-assets.spec.ts; echo "# exit=$? seconds=$(( $(date +%s) - s ))"
  echo "3100 listeners after: $(lsof -iTCP:3100 -sTCP:LISTEN -t | wc -l | tr -d ' ')"; } > $L/e2e-chrome-3100.log 2>&1
tail -7 $L/e2e-chrome-3100.log
echo "ticks: $(/usr/bin/grep -c '✓' $L/e2e-chrome-3100.log)"; /usr/bin/grep -E '✘|flaky' $L/e2e-chrome-3100.log | head -5
