#!/bin/bash
D=$1; L=$D/evidence/G11/rerun-d027; mkdir -p $L
export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
export PATH=$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH
cd $D/evm && find . -name '._*' -delete; forge test > $L/forge-test.log 2>&1; echo "EXIT=$?" >> $L/forge-test.log
cd $D/solana && pnpm install --ignore-workspace > $L/solana-install.log 2>&1; echo "EXIT=$?" >> $L/solana-install.log
pnpm run test:unit > $L/solana-test-unit.log 2>&1; echo "EXIT=$?" >> $L/solana-test-unit.log
pnpm run test:anchor > $L/solana-test-anchor.log 2>&1; echo "EXIT=$?" >> $L/solana-test-anchor.log
echo DONE > $L/SOLEVM_DONE
