#!/usr/bin/env python3
"""gas-rows.csv -> labels-max.txt: '<label> <max Tgas>' over label-only / tx-total / receipt rows (attached excluded)."""
import csv, sys
best = {}
for r in csv.DictReader(open(sys.argv[1])):
    if r['category'].startswith('attached'):
        continue
    g = int(r['gas']) / 1e12
    best[r['label']] = max(best.get(r['label'], 0.0), g)
with open(sys.argv[2], 'w') as f:
    for l in sorted(best):
        f.write(f'{l} {best[l]:.2f}\n')
print(len(best), 'labels')
