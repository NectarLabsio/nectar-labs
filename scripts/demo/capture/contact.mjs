#!/usr/bin/env node
// contact.mjs <mp4|png dir> <out.jpg> [--every 5] [--cols 4] [--fps 30]   (WO-35b)
// One frame every N seconds (default 5, from t = 0), 480x270 thumbnails tiled with m:ss timecodes, for frame-by-frame review.
import fs from 'node:fs';
import path from 'node:path';
import { decodeFrames, expandHome, isMain, listPngs, loadSharp, log, probeVideo } from './encode.mjs';

const sharp = loadSharp();
const TW = 480, TH = 270, GAP = 8, M = 16;

const tc = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

async function thumb(input, label) {
  const img = await sharp(input.data ?? input, input.raw ? { raw: input.raw } : undefined)
    .resize(TW, TH, { kernel: 'lanczos3', fit: 'contain', background: '#0d0f12' }).removeAlpha().raw().toBuffer();
  const tag = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}">` +
    `<rect x="8" y="${TH - 44}" width="${label.length * 13 + 20}" height="36" rx="6" fill="#0d0f12" fill-opacity=".82"/>` +
    `<text x="18" y="${TH - 19}" font-family="Menlo, monospace" font-size="22" fill="#e6e9ef">${label}</text></svg>`);
  return sharp(img, { raw: { width: TW, height: TH, channels: 3 } }).composite([{ input: tag }]).png().toBuffer();
}

async function main() {
  const argv = process.argv.slice(2), pos = [], fl = {};
  for (let i = 0; i < argv.length; i++) argv[i].startsWith('--') ? (fl[argv[i].slice(2)] = argv[++i]) : pos.push(argv[i]);
  if (pos.length < 2) {
    console.error('usage: node contact.mjs <mp4|png dir> <out.jpg> [--every 5] [--cols 4] [--fps 30]');
    process.exit(2);
  }
  const src = path.resolve(expandHome(pos[0])), out = path.resolve(expandHome(pos[1]));
  const every = Number(fl.every || 5), cols = Number(fl.cols || 4);
  const thumbs = [];
  if (fs.statSync(src).isDirectory()) {
    const fps = Number(fl.fps || 30), files = listPngs(src), step = Math.round(every * fps);
    for (let i = 0; i < files.length; i += step) thumbs.push(await thumb(path.join(src, files[i]), tc(i / fps)));
  } else {
    const info = await probeVideo(src), fps = info.fps, step = Math.max(1, Math.round(every * fps));
    for await (const f of decodeFrames(src, { every: step })) {
      thumbs.push(await thumb({ data: f.data, raw: { width: f.width, height: f.height, channels: 4 } }, tc(f.index / fps)));
    }
  }
  const rows = Math.ceil(thumbs.length / cols);
  const width = M * 2 + cols * TW + (cols - 1) * GAP, height = M * 2 + rows * TH + (rows - 1) * GAP;
  await sharp({ create: { width, height, channels: 3, background: '#0d0f12' } })
    .composite(thumbs.map((t, i) => ({ input: t, left: M + (i % cols) * (TW + GAP), top: M + Math.floor(i / cols) * (TH + GAP) })))
    .jpeg({ quality: 85 }).toFile(out);
  log(`contact sheet: ${thumbs.length} frames (1 every ${every} s), ${width}x${height} → ${out}`);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(String(e.stack || e)); process.exit(1); });
