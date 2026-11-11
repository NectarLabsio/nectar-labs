import re,sys,collections
m=collections.defaultdict(list)
for line in open(sys.argv[1]):
    f=line.split(':',1)[0]
    for n in re.findall(r'(?i)\bsr-?(\d+)(?=[_\s:\-,\)"\'`]|[A-Z])',line):
        m[int(n)].append(f)
for n in range(1,34):
    c=collections.Counter(m[n])
    print(f"SR-{n}: {len(m[n])} tests | "+", ".join(f"{k.split('/')[0]}/…/{k.split('/')[-1]}x{v}" for k,v in c.items()))
