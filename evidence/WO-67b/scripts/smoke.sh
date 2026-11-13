cd /tmp/verify-G9-20261113T023332Z/repo
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT=/tmp/verify-G9-20261113T023332Z/out; mkdir -p $OUT
L=$OUT/prod-smoke-$TS.log
{
  echo "# WO-67b step 3: smoke-prod.sh run directly from the fresh clone (no copy, no chmod)"
  echo "# clone /tmp/verify-G9-20261113T023332Z/repo at $(git rev-parse HEAD)"
  echo "# git modes: $(git ls-files -s scripts/deploy/smoke-prod.sh scripts/deploy/smoke-web.sh scripts/deploy/smoke-docs.sh | awk '{print $1" "$4}' | tr '\n' ' ')"
  echo "# fs modes: $(ls -l scripts/deploy/smoke-prod.sh scripts/deploy/smoke-web.sh scripts/deploy/smoke-docs.sh | awk '{print $1" "$NF}' | tr '\n' ' ')"
  echo "# cmd: scripts/deploy/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io https://nectarlabs.vercel.app=https://nectarlabs.io https://nectarlabs-app.vercel.app=https://testnet.nectarlabs.io https://nectar-labs-web.vercel.app=https://testnet.nectarlabs.io https://nectarlabs-docs.vercel.app=https://docs.nectarlabs.io https://nectar-labs-docs.vercel.app=https://docs.nectarlabs.io"
  echo "# start $(date -u +%FT%TZ)"
} > $L
scripts/deploy/smoke-prod.sh https://nectarlabs.io https://testnet.nectarlabs.io https://docs.nectarlabs.io https://status.nectarlabs.io https://nectarlabs.vercel.app=https://nectarlabs.io https://nectarlabs-app.vercel.app=https://testnet.nectarlabs.io https://nectar-labs-web.vercel.app=https://testnet.nectarlabs.io https://nectarlabs-docs.vercel.app=https://docs.nectarlabs.io https://nectar-labs-docs.vercel.app=https://docs.nectarlabs.io >> $L 2>&1
rc=$?
echo "# exit $rc end $(date -u +%FT%TZ)" >> $L
echo "LOG=$L rc=$rc"
