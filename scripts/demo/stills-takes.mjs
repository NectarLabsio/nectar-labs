#!/usr/bin/env node
// WO-35 stills from an after-close take (orchestrator, 2026-11-13 ~21:20Z). Raw take frames carry no cursor (the cursor is drawn in post).
// Usage: node scripts/demo/stills-takes.mjs <take dir>   (default /Volumes/T7/nectar-demo-media/raw/take-a)
// Outputs docs/media/screens/<name>.png (1920×1080 palette PNG, ≤ 400 KB) and, for the X set, nectar-demo-media/x/<name>-1600x900.jpg.
// Still 06 (agent 402 → 200) is not re-cut here: the README cites the 19:41Z run that docs/media/screens/06-agent-402-200.png shows.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const sharp = createRequire('/Volumes/T7/nectar-labs/package.json')('/Volumes/T7/nectar-labs/node_modules/.pnpm/sharp@0.35.5_@types+node@22.20.5/node_modules/sharp');
const TAKE = process.argv[2] ?? '/Volumes/T7/nectar-demo-media/raw/take-a';
const SCREENS = '/Volumes/T7/nectar-labs/docs/media/screens';
const XDIR = '/Volumes/T7/nectar-demo-media/x';
mkdirSync(SCREENS, { recursive: true }); mkdirSync(XDIR, { recursive: true });

// [name, section dir, page, time in ms within the section, also an X JPG]
const PICKS = [
  ['01-landing', 's0', 'p0', 2600, false],          // end of 'landing hero (screenshot 1)' hold
  ['02-market', 's1', 'p0', 8300, false],           // 'exit capacity' hold, before the ladder row
  ['03-borrow-weekend', 's3', 'p0', 11800, true],   // end of 'fees' hold: Weekend Shield selected, fees listed, before Review
  ['04-position', 's4', 'p0', 3600, false],         // early in the 'health' hold, at the oracle price (the simulator drag starts inside the hold)
  ['05-explorer', 's4', 'p1', 11900, false],        // end of 'tx on explorer' hold (testnet.near.rocks)
];

for (const [name, sec, pg, t, x] of PICKS) {
  const dir = join(TAKE, sec);
  const frames = readFileSync(join(dir, 'frames.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((f) => f.page === pg && f.t <= t);
  const f = frames.at(-1);
  if (!f) throw new Error(`${name}: no ${pg} frame at or before ${t} ms in ${dir}`);
  const buf = readFileSync(join(dir, f.file));
  const png = join(SCREENS, `${name}.png`);
  let q = 90;
  for (;;) {
    await sharp(buf).resize(1920, 1080, { kernel: 'lanczos3' }).png({ palette: true, quality: q, effort: 9 }).toFile(png);
    if (statSync(png).size <= 400 * 1024 || q <= 50) break;
    q -= 10;
  }
  let line = `${name}: ${sec}/${f.file} t=${f.t} ms ${f.w}x${f.h} → png ${(statSync(png).size / 1024).toFixed(0)} KB (q${q})`;
  if (x) {
    const jpg = join(XDIR, `${name}-1600x900.jpg`);
    await sharp(buf).resize(1600, 900, { kernel: 'lanczos3' }).jpeg({ quality: 88, mozjpeg: true }).toFile(jpg);
    line += ` · jpg ${(statSync(jpg).size / 1024).toFixed(0)} KB`;
  }
  console.log(line);
}
