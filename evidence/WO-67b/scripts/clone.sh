set -u
TS=$(date -u +%Y%m%dT%H%M%SZ)
D=/tmp/verify-G9-$TS
mkdir -p $D
cd $D
git clone -q /Volumes/T7/nectar-labs repo
cd repo
git checkout -q 8a54b4c
git log --oneline -1
echo "CLONE=$D/repo"
echo "$D/repo" > /private/tmp/claude-501/-Volumes-T7-nectar-labs/287a71ca-7606-413d-ba02-4ab86f1493b2/scratchpad/clonepath
echo "== step1 diff c95cd0c..8a54b4c product dirs"
git diff --stat c95cd0c 8a54b4c -- apps packages services contracts | tail -n 40
echo "== (end diff; lines=$(git diff --stat c95cd0c 8a54b4c -- apps packages services contracts | wc -l))"
echo "== commits since c95cd0c"
git log --oneline c95cd0c..8a54b4c | tail -n 40
echo "== GATE_FAIL_WO67"
cat docs/GATE_FAIL_WO67.md
