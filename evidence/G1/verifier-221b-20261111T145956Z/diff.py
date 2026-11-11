#!/usr/bin/env python3
"""Method-vs-GAS-label diff. argv: methods.txt labels-max.txt"""
import sys, re
methods = []
for line in open(sys.argv[1]):
    loc, name, _, priv, _ = line.rstrip('\n').split('\t')
    methods.append((name, loc, priv == 'private=True'))
methods.append(('new', 'lib.rs:1167 (#[init], -> Self)', False))
labels = {}
for line in open(sys.argv[2]):
    l, g = line.rstrip('\n').rsplit(' ', 1)
    labels[l] = float(g)
# Labels that measure a method under another name (entry point reached through a cross-contract call).
alias = {
    'ft_on_transfer': lambda l: l.startswith('ft_transfer_call') or l.startswith(('LockCollateralAndBorrow', 'FundPappusQuote', 'Repay(', 'borrow', 'shield_open')),
    'trigger_preliquidation': lambda l: l.startswith(('trigger_preliquidation', 'trigger+')),
}
def hits(name):
    f = alias.get(name)
    out = []
    for l in labels:
        if l.startswith('mock-ft:'):
            continue
        if (f and f(l)) or l == name or re.match(re.escape(name) + r'[(+]', l):
            out.append(l)
    return out
missing = []
print('method\tlocation\tprivate\tn_labels\tmax_Tgas\tmax_label')
for name, loc, priv in methods:
    h = hits(name)
    if h:
        top = max(h, key=lambda l: labels[l])
        print(f'{name}\t{loc}\t{priv}\t{len(h)}\t{labels[top]:.2f}\t{top}')
    else:
        print(f'{name}\t{loc}\t{priv}\t0\t-\t-')
        if not priv:
            missing.append(name)
pub = [m for m in methods if not m[2]]
print(f'# methods: {len(methods)} ({len(pub)} non-private incl. new, {len(methods) - len(pub)} #[private] callbacks)')
print(f'# non-private methods without a GAS row: {len(missing)} {missing}')
over = [m for m in pub if hits(m[0]) and max(labels[l] for l in hits(m[0])) >= 100]
print(f'# non-private methods with a row >= 100 Tgas: {len(over)}')
