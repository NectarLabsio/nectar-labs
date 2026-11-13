// G9 run 10b link check (independent): README.md + every git-tracked docs/**/*.md.
// Skips fenced blocks (``` / ~~~) and inline code spans. Checks relative link targets exist (file or dir);
// for same-file "#anchor" links, checks a heading with that GitHub slug exists. Usage: node linkcheck.mjs <repo>
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
const repo = resolve(process.argv[2] ?? '.');
const files = ['README.md', ...execFileSync('git', ['-C', repo, 'ls-files', 'docs'], { encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.md'))];
const slug = (h) => h.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
let checked = 0; const broken = [];
for (const f of files) {
  const lines = readFileSync(join(repo, f), 'utf8').split('\n');
  const headings = new Set(); let fence = null;
  const body = [];
  lines.forEach((raw, i) => {
    const m = raw.match(/^\s*(```|~~~)/);
    if (m) { fence = fence === null ? m[1] : (fence === m[1] ? null : fence); return; }
    if (fence) return;
    const hm = raw.match(/^#{1,6}\s+(.*)$/); if (hm) headings.add(slug(hm[1].replace(/`/g, '')));
    body.push([i + 1, raw.replace(/`[^`]*`/g, '')]);
  });
  for (const [ln, line] of body) {
    const targets = [...line.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)].map((x) => x[1]);
    const ref = line.match(/^\s*\[[^\]]+\]:\s*(\S+)/); if (ref) targets.push(ref[1]);
    for (const t of targets) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(t)) continue; // http:, https:, mailto:, etc.
      checked++;
      if (t.startsWith('#')) { if (f === 'README.md' && !headings.has(t.slice(1).toLowerCase())) broken.push(`${f}:${ln} ${t} (anchor)`); continue; }
      const p = decodeURIComponent(t.split('#')[0].split('?')[0]);
      const abs = p.startsWith('/') ? join(repo, p) : join(repo, dirname(f), p);
      if (!existsSync(abs)) broken.push(`${f}:${ln} ${t}`);
    }
  }
}
console.log(`files ${files.length}  relative links checked ${checked}  broken ${broken.length}`);
for (const b of broken) console.log('BROKEN ' + b);
process.exit(broken.length ? 1 : 0);
