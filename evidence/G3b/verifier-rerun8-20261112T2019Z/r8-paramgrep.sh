#!/bin/bash
# G3b run 8 (m): no 85% / 4% / 12% parameter figure in apps/web, packages/ui, docs/ui, landing/index.html. Raw hit list for review.
D=/tmp/verify-G3b-r8-20261112T2019Z
cd "$D" || exit 1
mkdir -p ev/m
ls -d apps/web packages/ui docs/ui landing/index.html 2>&1
git grep -n -I -E '(^|[^0-9.])(85|4|12)(\.0+)?%' -- apps/web packages/ui docs/ui landing/index.html > ev/m/param-grep-raw.txt
echo "raw hits: $(wc -l < ev/m/param-grep-raw.txt) lines in $(cut -d: -f1 ev/m/param-grep-raw.txt | sort -u | wc -l) files"
cut -d: -f1 ev/m/param-grep-raw.txt | sort | uniq -c | sort -rn | head -40
git grep -n -I -E '(haircut|ltv|LTV|discount|weekend|bps)[^\n]{0,60}\b(85|4|12)(\.0+)?%|\b(85|4|12)(\.0+)?%[^\n]{0,60}(haircut|LTV|ltv|discount|weekend|cap)' -- apps/web packages/ui docs/ui landing/index.html > ev/m/param-grep-context.txt
echo "context hits (parameter words within 60 chars): $(wc -l < ev/m/param-grep-context.txt)"
cut -c1-260 ev/m/param-grep-context.txt
git grep -n -I -E '\b(8500|1200)\b' -- apps/web packages/ui docs/ui landing/index.html ':!*.json' ':!*.svg' > ev/m/param-grep-bps.txt
echo "8500/1200 bps-style hits: $(wc -l < ev/m/param-grep-bps.txt)"
cut -c1-220 ev/m/param-grep-bps.txt | head -30
