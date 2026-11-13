#!/usr/bin/env node
// srt.mjs <edit-timeline.json> <out.srt>   (WO-35b) — one cue per section caption, timed as compose.mjs burns it in.
import fs from 'node:fs';
import path from 'node:path';
import { expandHome, isMain, log } from './encode.mjs';

const ts = (s) => {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};

export function toSrt(timeline) {
  const cues = timeline.sections.filter((s) => s.caption && s.caption_end_s > s.caption_start_s);
  return cues.map((s, i) => `${i + 1}\n${ts(s.caption_start_s)} --> ${ts(s.caption_end_s)}\n${s.caption}\n`).join('\n');
}

if (isMain(import.meta.url)) {
  const [inp, out] = process.argv.slice(2);
  if (!inp || !out) {
    console.error('usage: node srt.mjs <edit-timeline.json> <out.srt>');
    process.exit(2);
  }
  const tl = JSON.parse(fs.readFileSync(path.resolve(expandHome(inp)), 'utf8'));
  const srt = toSrt(tl);
  fs.writeFileSync(path.resolve(expandHome(out)), srt);
  log(`srt: ${srt ? srt.split('\n\n').length : 0} cue(s) → ${path.resolve(expandHome(out))}`);
}
