// G9 run 10 (WO-97) markdown relative-link checker. Usage: node linkcheck.mjs <repo root>
// Checks README.md and every docs/**/*.md: inline links [t](p), images ![a](p), reference defs [x]: p,
// HTML src="p" / href="p" / srcset="p". Skips http(s)/mailto/tel/data and pure #anchors for existence;
// fenced code blocks and inline code are ignored. Anchor fragments to .md files are checked separately (GitHub slugs).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const files = ['README.md'];
const walk = (d) => {
  for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
    const rel = path.join(d, e.name);
    if (e.isDirectory()) walk(rel);
    else if (e.name.endsWith('.md')) files.push(rel);
  }
};
walk('docs');

const slug = (h) => h.trim().toLowerCase().replace(/<[^>]+>/g, '').replace(/[`*_~]/g, '')
  .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
const anchorCache = new Map();
const anchorsOf = (abs) => {
  if (anchorCache.has(abs)) return anchorCache.get(abs);
  const set = new Set(); const seen = new Map(); let fence = false;
  for (const line of fs.readFileSync(abs, 'utf8').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) { let s = slug(m[1]); const n = seen.get(s) ?? 0; seen.set(s, n + 1); if (n) s = `${s}-${n}`; set.add(s); }
    for (const a of line.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) set.add(a[1]);
  }
  anchorCache.set(abs, set); return set;
};

let checked = 0; const broken = []; const badAnchors = [];
for (const f of files) {
  const abs = path.join(root, f);
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  let fence = false;
  lines.forEach((raw, i) => {
    if (/^\s*(```|~~~)/.test(raw)) { fence = !fence; return; }
    if (fence) return;
    const line = raw.replace(/`[^`]*`/g, '``');
    const targets = [];
    for (const m of line.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) targets.push(m[1]);
    const ref = /^\s*\[[^\]]+\]:\s*<?(\S+?)>?(\s|$)/.exec(line); if (ref) targets.push(ref[1]);
    for (const m of line.matchAll(/\b(?:src|href)="([^"]+)"/g)) targets.push(m[1]);
    for (const m of line.matchAll(/\bsrcset="([^"]+)"/g)) for (const part of m[1].split(',')) targets.push(part.trim().split(/\s+/)[0]);
    for (const t of targets) {
      if (/^(https?:|mailto:|tel:|data:|\/\/)/i.test(t)) continue;
      const [p0, frag] = t.split('#');
      const p = decodeURIComponent(p0.split('?')[0]);
      if (!p) { // same-file anchor
        if (frag && f.endsWith('.md') && !anchorsOf(abs).has(frag)) badAnchors.push(`${f}:${i + 1} #${frag}`);
        continue;
      }
      checked++;
      const target = p.startsWith('/') ? path.join(root, p) : path.resolve(path.dirname(abs), p);
      if (!target.startsWith(root)) { broken.push(`${f}:${i + 1} ${t} (outside repo)`); continue; }
      if (!fs.existsSync(target)) { broken.push(`${f}:${i + 1} ${t}`); continue; }
      if (frag && target.endsWith('.md') && !anchorsOf(target).has(frag)) badAnchors.push(`${f}:${i + 1} ${t}`);
    }
  });
}
console.log(`files scanned: ${files.length}`);
console.log(`relative link targets checked: ${checked}`);
console.log(`broken relative links: ${broken.length}`);
for (const b of broken) console.log(`  BROKEN ${b}`);
console.log(`anchor fragments not found (informational): ${badAnchors.length}`);
for (const b of badAnchors) console.log(`  ANCHOR ${b}`);
process.exit(broken.length ? 1 : 0);
