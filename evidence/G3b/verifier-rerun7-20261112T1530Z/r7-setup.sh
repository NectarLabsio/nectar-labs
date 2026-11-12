#!/bin/bash
# G3b run 7 setup: fresh clone on the internal disk, checkout release 2, install.
set -u
D=/tmp/verify-G3b-20261112T1530Z
mkdir -p "$D.logs"
git clone /Volumes/T7/nectar-labs "$D" > "$D.logs/clone.log" 2>&1; echo "clone exit $?"
cd "$D" || exit 1
git checkout 4c2a0bba01296f932d26bda131163adbb3c8bae6 >> "$D.logs/clone.log" 2>&1; echo "checkout exit $?"
git rev-parse HEAD
mkdir -p ev
unset NECTAR_E2E_BORROWER_KEY NEXT_PUBLIC_E2E_KEY_ADAPTER SITE_URL APP_URL FEED_URL
pnpm install --frozen-lockfile > ev/install.log 2>&1; echo "install exit $?"
tail -3 ev/install.log
