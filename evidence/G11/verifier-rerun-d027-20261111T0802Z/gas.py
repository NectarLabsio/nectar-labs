import re,sys,collections
rows=collections.defaultdict(list); over=[]
for line in open(sys.argv[1],errors='replace'):
    m=re.search(r'GAS,(.*)$',line.rstrip())
    if not m: continue
    parts=m.group(1).split(',')
    try: n=int(parts[-1])
    except: continue
    k=parts[-2] if len(parts)>=3 else ''
    if k=='attached': cat='attached(prepaid,excluded)'
    elif k=='total': cat='tx-total'
    elif re.search(r'\.(test\.near|testnet|near)$|^dev-',k): cat='receipt'
    else: cat='label-only'
    label=','.join(parts[:-2] if cat in('tx-total','receipt','attached(prepaid,excluded)') else parts[:-1])
    rows[cat].append((n,label))
    if cat!='attached(prepaid,excluded)' and n>=100*10**12: over.append((cat,label,n))
with open(sys.argv[2],'w') as f:
    f.write('category,label,gas\n')
    for c,v in rows.items():
        for n,l in v: f.write(f'{c},"{l}",{n}\n')
for c,v in rows.items():
    v.sort(reverse=True); print(f'{c}: {len(v)} rows, {len(set(l for _,l in v))} labels, max {v[0][0]/1e12:.2f} Tgas ({v[0][1]}); next {v[1][0]/1e12:.2f} ({v[1][1]})' if len(v)>1 else f'{c}: {v}')
print('rows >= 100 Tgas (non-attached):',len(over)); [print(' ',o) for o in over[:8]]
