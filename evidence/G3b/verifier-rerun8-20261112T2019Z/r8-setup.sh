#!/bin/bash
# G3b run 8 setup: fresh clone on the internal disk, checkout the release candidate 31809b1, install.
set -u
D=/tmp/verify-G3b-r8-20261112T2019Z
mkdir -p "$D.logs"
git clone /Volumes/T7/nectar-labs "$D" > "$D.logs/clone.log" 2>&1; echo "clone exit $?"
cd "$D" || exit 1
git checkout 31809b1 >> "$D.logs/clone.log" 2>&1; echo "checkout exit $?"
git rev-parse HEAD
mkdir -p ev
unset NECTAR_E2E_BORROWER_KEY NEXT_PUBLIC_E2E_KEY_ADAPTER SITE_URL APP_URL DOCS_URL STATUS_URL LEGACY_HOSTS FEED_URL
pnpm install --frozen-lockfile > ev/install.log 2>&1; echo "install exit $?"
tail -3 ev/install.log
