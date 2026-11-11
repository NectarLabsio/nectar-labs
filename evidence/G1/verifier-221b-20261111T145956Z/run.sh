#!/bin/bash
D=/tmp/verify-g1g14-20261111T145956Z; L=$D/ev/g1; cd $D
export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
date -u +%FT%TZ > $L/start.txt
cargo test -p nectar-core --no-fail-fast -- --nocapture > $L/cargo-test-nectar-core.log 2>&1; echo "EXIT=$?" >> $L/cargo-test-nectar-core.log
date -u +%FT%TZ > $L/end.txt; echo DONE > $L/DONE
