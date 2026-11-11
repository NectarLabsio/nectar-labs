#!/usr/bin/env python3
"""List public change methods (pub fn ...(&mut self ...) of contracts/nectar-core/src non-test files.
Tracks whether each sits inside a #[near] impl block and whether it carries #[private] / #[init]."""
import re, sys, pathlib
src = pathlib.Path(sys.argv[1])
rows = []
for f in sorted(src.glob('*.rs')):
    if f.name.startswith('tests'):
        continue
    text = f.read_text()
    lines = text.split('\n')
    in_near_impl = False
    depth = 0
    impl_depth = None
    pending_near = False
    attrs = []
    for i, line in enumerate(lines, 1):
        s = line.strip()
        if s.startswith('#[near') and impl_depth is None:
            pending_near = True
        if re.match(r'^(pub\s+)?impl\b', s) and impl_depth is None:
            impl_depth = depth
            in_near_impl = pending_near
            pending_near = False
        if s.startswith('#['):
            attrs.append(s)
        m = re.match(r'pub fn (\w+)\s*(<[^>]*>)?\s*\(\s*&mut self', s)
        if m is None and re.match(r'pub fn (\w+)', s) and i < len(lines):
            # signature split over lines
            j = i
            sig = s
            while ')' not in sig and j < len(lines):
                sig += ' ' + lines[j].strip(); j += 1
            m = re.match(r'pub fn (\w+)\s*(<[^>]*>)?\s*\(\s*&mut self', sig)
        if m and impl_depth is not None:
            rows.append((f.name, i, m.group(1), in_near_impl, any('private' in a for a in attrs), any('init' in a for a in attrs)))
        if s.startswith('pub fn') or s.startswith('fn ') or (s and not s.startswith('#[') and not s.startswith('//')):
            if not s.startswith('#['):
                attrs = [] if not s.startswith('///') else attrs
        depth += line.count('{') - line.count('}')
        if impl_depth is not None and depth <= impl_depth and '}' in line:
            impl_depth = None
            in_near_impl = False
for r in rows:
    print(f"{r[0]}:{r[1]}\t{r[2]}\tnear_impl={r[3]}\tprivate={r[4]}\tinit={r[5]}")
