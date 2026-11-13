#!/usr/bin/env bash
# G9 run 9 part D: verify counts, gitleaks count, home-path hit, docs delta, release pointer (README:11 vs production), WO-74 evidence key hygiene, handoffs.
B=/tmp/verify-G9-r9-20261113T141500Z
cd $B/repo
L=$B/logs
{
echo "## verify per-package counts"
grep -E "test: (# |ℹ )(tests|pass|fail|skipped) [0-9]+" $L/verify.log | sed -E 's/ +/ /g'
grep -E "check-no-branding|ok 28 - real nectar-core-v2" $L/verify.log | head -3 | cut -c1-160
echo "## demo-testnet"; grep -E "oracle|pool|Open" $L/demo-testnet.log | cut -c1-120 | head -8
echo "## gitleaks"; tail -n 4 $L/gitleaks.log; echo "commits all / non-merge: $(git rev-list --count --all) / $(git rev-list --count --no-merges --all)"
echo "## docs build"; grep -E "Generated static|SUCCESS|error" $L/docs-build.log | head -3
echo "## home-path hit lines (pattern from repo-shape)"; git grep -n -a -E '[/]Users[/][A-Za-z]|[/]home[/][a-z]+[/]' -- ':!*.wasm' | cut -c1-220
echo "## docs changed since b6d6f41 (README / HUMAN_HANDOFF / SUBMISSION / DEMO_SCRIPT / STATE)"
git diff --stat b6d6f41 HEAD -- README.md docs/HUMAN_HANDOFF.md docs/SUBMISSION.md docs/DEMO_SCRIPT.md docs/STATE.md
echo "## README production-release lines"; grep -n -E "release 4|c95cd0c|dpl_|Production runs|redeployed" README.md | cut -c1-260
echo "## README WO-74 / onClaimed / balance refresh mentions"; grep -n -i -E "WO-74|onClaimed|refresh|4ExxeLH" README.md docs/SUBMISSION.md docs/DEMO_SCRIPT.md | cut -c1-220
echo "## STATE lines on WO-74 / deploy"; grep -n -E "WO-74|4ExxeLH|release 5|CLI deploy|vercel deploy" docs/STATE.md | cut -c1-300 | head -12
echo "## HUMAN_HANDOFF lines on WO-74 deploy"; grep -n -E "WO-74|4ExxeLH" docs/HUMAN_HANDOFF.md | cut -c1-260
echo "## EVIDENCE §WO-34 production blocks"; grep -n -E "^### WO-34 production" docs/EVIDENCE.md | cut -c1-200
echo "## WO-74 evidence logs + qa-account-create: key material? (ed25519 >=80, PEM, 64-hex, seed words)"
for f in evidence/WO-74/*.log evidence/ops/qa-account-create-20261113T135439Z.log evidence/WO-34/deploy-web-cli-20261113T135102Z.log; do
  echo "$f: long-ed25519-not-signature=$(grep -E 'ed25519:[1-9A-HJ-NP-Za-km-z]{80,}' $f | grep -v -i -c -E 'signature')  PEM=$(grep -c 'PRIVATE KEY' $f)  privkey-lines=$(grep -i -c -E 'priv|seed|mnemonic' $f)"
done
grep -h -i -E 'priv|seed|mnemonic' evidence/WO-74/*.log evidence/ops/qa-account-create-20261113T135439Z.log | sort | uniq -c | cut -c1-200
gitleaks dir evidence/WO-74 2>&1 | tail -n 1; gitleaks dir scripts/demo 2>&1 | tail -n 1
echo "## intear-setup.mjs delta since b6d6f41 + console calls"
git diff b6d6f41 HEAD -- scripts/demo/intear-setup.mjs | grep -E '^[+-]' | cut -c1-200
grep -n -E 'console\.(log|error|warn)' scripts/demo/intear-setup.mjs | cut -c1-160
echo "## qa-account-create log (public data only?)"; cut -c1-200 evidence/ops/qa-account-create-20261113T135439Z.log | head -34
echo "## HUMAN_HANDOFF entries + status column"
grep -c -E '^## H' docs/HUMAN_HANDOFF.md
grep -n -E '^## H' docs/HUMAN_HANDOFF.md | sed -E 's/ {2,}/ /g' | cut -c1-150
echo "## README TODO-H"; grep -n 'TODO-H' README.md | cut -c1-160
} > $L/checks-d.txt 2>&1
cat $L/checks-d.txt
