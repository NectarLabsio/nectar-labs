#!/usr/bin/env bash
# WO-87 A item 5b: web build on c9fd56b + claims.spec + test-assets.spec with system Chrome, own port 3387.
B=/tmp/verify-wo87-20261113T170125Z
R=$B/repo
L=$B/logs; mkdir -p $L
cd $R/apps/web
{ echo "# $(date -u +%FT%TZ) (apps/web) pnpm build @ $(git rev-parse --short HEAD)"; s=$(date +%s); pnpm build; echo "exit=$? seconds=$(( $(date +%s) - s ))"; } > $L/web-build.log 2>&1
{ echo "# $(date -u +%FT%TZ) (apps/web) PORT=3387 PW_CHANNEL=chrome npx playwright test e2e/test-assets.spec.ts e2e/claims.spec.ts"
  echo "port 3387 listeners before: $(lsof -iTCP:3387 -sTCP:LISTEN -t 2>/dev/null | wc -l | tr -d ' ')"
  echo "chrome: $("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version 2>/dev/null)"
  s=$(date +%s); PORT=3387 PW_CHANNEL=chrome npx playwright test e2e/test-assets.spec.ts e2e/claims.spec.ts; echo "# exit=$? seconds=$(( $(date +%s) - s ))"; } > $L/e2e-chrome.log 2>&1
echo "port 3387 listeners after: $(lsof -iTCP:3387 -sTCP:LISTEN -t 2>/dev/null | wc -l | tr -d ' ')" >> $L/e2e-chrome.log
tail -3 $L/web-build.log; tail -5 $L/e2e-chrome.log
echo "E2E DONE"
