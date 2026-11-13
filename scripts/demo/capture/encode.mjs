#!/usr/bin/env node
// encode.mjs <png dir> <out.mp4> [--no-720] [--fps 30] [--bitrate 16000000] [--bitrate-720 8000000]   (WO-35b)
// Encodes compose.mjs PNG frames (000000.png …) to an H.264 High MP4 at exact 30 fps CFR, plus <out>-720p.mp4 for X.
// FFMPEG set → libx264 CRF 18 as briefed. Otherwise encode.swift (AVAssetWriter, bitrate mode) and a printed deviation.
// Also the shared helpers for compose.mjs / contact.mjs: loadSharp, loadPlaywright, tilde, probeVideo, decodeFrames.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../../..');
const MAIN_CHECKOUT = '/Volumes/T7/nectar-labs'; // worktrees have no node_modules (disk rule); fall back to the main checkout
const SHARP_FALLBACK = `${MAIN_CHECKOUT}/node_modules/.pnpm/sharp@0.35.5_@types+node@22.20.5/node_modules/sharp`;

export const isMain = (metaUrl) => process.argv[1] && metaUrl === pathToFileURL(path.resolve(process.argv[1])).href;

/** Replace the home directory with ~ (no home paths in logs or committed output). */
export function tilde(p) {
  const h = os.homedir();
  return typeof p === 'string' && h && p.startsWith(h) ? '~' + p.slice(h.length) : p;
}
export const expandHome = (p) => (typeof p === 'string' && p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);
export const log = (...a) => console.log(...a.map((x) => (typeof x === 'string' ? tilde(x) : x)));

function requireFrom(candidates, id) {
  let last;
  for (const c of candidates) {
    try {
      return createRequire(c)(id);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

export function loadSharp() {
  try {
    return requireFrom([path.join(REPO_ROOT, 'package.json')], 'sharp');
  } catch {
    return createRequire(import.meta.url)(SHARP_FALLBACK);
  }
}

export function loadPlaywright() {
  return requireFrom(
    [path.join(REPO_ROOT, 'apps/web/package.json'), `${MAIN_CHECKOUT}/apps/web/package.json`],
    '@playwright/test',
  );
}

// ---------- ffmpeg (optional) ----------
const FFMPEG = process.env.FFMPEG || '';
function ffprobePath() {
  if (process.env.FFPROBE) return process.env.FFPROBE;
  if (!FFMPEG) return '';
  const p = path.join(path.dirname(FFMPEG), 'ffprobe');
  return fs.existsSync(p) ? p : '';
}

// ---------- Swift fallback (encode.swift) ----------
function sdkCandidates() {
  const out = [];
  const roots = ['/Library/Developer/CommandLineTools/SDKs'];
  const x = spawnSync('xcrun', ['--show-sdk-path'], { encoding: 'utf8' });
  if (x.status === 0 && x.stdout.trim()) roots.push(path.dirname(x.stdout.trim()));
  for (const r of new Set(roots)) {
    if (!fs.existsSync(r)) continue;
    for (const f of fs.readdirSync(r)) if (/^MacOSX\d[\d.]*\.sdk$/.test(f)) out.push(path.join(r, f));
  }
  const ver = (p) => path.basename(p).replace(/^MacOSX|\.sdk$/g, '').split('.').map(Number);
  return out.sort((a, b) => {
    const va = ver(a), vb = ver(b);
    for (let i = 0; i < 3; i++) if ((vb[i] || 0) !== (va[i] || 0)) return (vb[i] || 0) - (va[i] || 0);
    return 0;
  });
}

/** Compile encode.swift once per source hash (cached in the OS temp dir); returns the binary path. */
export function encoderBin() {
  if (process.env.NECTAR_ENCODE_BIN) return process.env.NECTAR_ENCODE_BIN;
  const src = path.join(HERE, 'encode.swift');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex').slice(0, 12);
  const dir = path.join(os.tmpdir(), 'nectar-demo-encode', hash);
  const bin = path.join(dir, 'nectar-encode');
  if (fs.existsSync(bin)) return bin;
  fs.mkdirSync(dir, { recursive: true });
  const base = ['-O', '-suppress-warnings', '-o', bin, src];
  // The default SDK can be newer than the installed swiftc (seen 2026-11-13: SDK 27.0 vs Swift 6.3.3); try older SDKs then.
  const attempts = [[]]; // default SDK (or $SDKROOT) first
  if (!process.env.SDKROOT) attempts.push(...sdkCandidates().map((s) => ['-sdk', s]));
  let lastErr = '';
  for (const extra of attempts) {
    log(`compiling encode.swift${extra.length ? ' with ' + path.basename(extra[1]) : ''} …`);
    const r = spawnSync('swiftc', [...extra, ...base], { encoding: 'utf8' });
    if (r.status === 0 && fs.existsSync(bin)) return bin;
    lastErr = (r.stderr || '').split('\n').filter((l) => /error/.test(l)).slice(-3).join('\n');
  }
  throw new Error(`swiftc failed for every SDK:\n${lastErr}`);
}

// ---------- probe / decode ----------
export async function probeVideo(file) {
  const fp = ffprobePath();
  if (fp) {
    const r = spawnSync(fp, ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries',
      'stream=width,height,avg_frame_rate,nb_read_packets,profile,pix_fmt:format=duration', '-of', 'json', file], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
    const j = JSON.parse(r.stdout), s = j.streams[0], [num, den] = s.avg_frame_rate.split('/').map(Number);
    return { width: s.width, height: s.height, fps: num / (den || 1), duration_s: Number(j.format.duration),
      frames: Number(s.nb_read_packets), profile: s.profile, pix_fmt: s.pix_fmt, via: 'ffprobe' };
  }
  const r = spawnSync(encoderBin(), ['probe', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`probe failed: ${r.stderr}`);
  const j = JSON.parse(r.stdout);
  return { ...j, profile: j.profile_idc === 100 ? 'High' : `profile_idc ${j.profile_idc}`,
    pix_fmt: j.full_range ? 'yuvj420p' : 'yuv420p (video range)', via: 'AVFoundation' };
}

/** Async generator of decoded RGBA frames: { index, data, width, height }. `every` keeps every Nth frame. */
export async function* decodeFrames(file, { every = 1 } = {}) {
  const info = await probeVideo(file);
  const { width, height } = info;
  const size = width * height * 4;
  const child = FFMPEG
    ? spawn(FFMPEG, ['-v', 'error', '-i', file, ...(every > 1 ? ['-vf', `select=not(mod(n\\,${every}))`, '-vsync', '0'] : []),
        '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { stdio: ['ignore', 'pipe', 'inherit'] })
    : spawn(encoderBin(), ['decode', '--every', String(every), file], { stdio: ['ignore', 'pipe', 'inherit'] });
  let cur = Buffer.allocUnsafe(size), fill = 0, n = 0;
  for await (const chunk of child.stdout) {
    let off = 0;
    while (off < chunk.length) {
      const take = Math.min(size - fill, chunk.length - off);
      chunk.copy(cur, fill, off, off + take);
      fill += take; off += take;
      if (fill === size) {
        yield { index: n * every, data: cur, width, height };
        n++; cur = Buffer.allocUnsafe(size); fill = 0;
      }
    }
  }
  const code = await new Promise((r) => (child.exitCode !== null ? r(child.exitCode) : child.on('close', r)));
  if (code !== 0) throw new Error(`decode exited ${code}`);
}

/** True if the top-level moov box precedes mdat (faststart). */
export function moovFirst(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size, h = Buffer.alloc(16);
    let off = 0;
    while (off + 8 <= size) {
      fs.readSync(fd, h, 0, 16, off);
      let len = h.readUInt32BE(0);
      const type = h.toString('latin1', 4, 8);
      if (type === 'moov') return true;
      if (type === 'mdat') return false;
      if (len === 1) len = Number(h.readBigUInt64BE(8));
      if (len < 8) return false;
      off += len;
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

// ---------- CLI ----------
export function listPngs(dir) {
  const files = fs.readdirSync(dir).filter((f) => /^\d+\.png$/.test(f)).sort((a, b) => Number(a.slice(0, -4)) - Number(b.slice(0, -4)));
  if (!files.length) throw new Error(`no NNNNNN.png frames in ${tilde(dir)}`);
  files.forEach((f, i) => {
    if (Number(f.slice(0, -4)) !== Number(files[0].slice(0, -4)) + i) throw new Error(`frame numbering gap at ${f}`);
  });
  return files;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'], ...opts });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.on('error', reject);
    c.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} exited ${code}`))));
  });
}

async function swiftEncode(dir, files, targets, fps) {
  const sharp = loadSharp();
  const bin = encoderBin();
  const procs = targets.map((t) => {
    const c = spawn(bin, ['encode', '--width', String(t.w), '--height', String(t.h), '--fps', String(fps), '--bitrate', String(t.bitrate), t.out],
      { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    const done = new Promise((res, rej) => c.on('close', (code) => (code === 0 ? res(out) : rej(new Error(`encoder exited ${code} for ${tilde(t.out)}`)))));
    c.stdin.on('error', () => {});
    done.catch(() => {}); // still awaited below; avoids an unhandled rejection while frames are being prepared
    return { ...t, c, done };
  });
  // A dead encoder never drains: race the drain against its exit so the error surfaces instead of hanging.
  const write = (p, buf) => (p.c.stdin.write(buf) ? Promise.resolve() : Promise.race([new Promise((r) => p.c.stdin.once('drain', r)), p.done]));
  const prepare = (f) => Promise.all(targets.map(async (t) => {
    let img = sharp(path.join(dir, f));
    const m = await img.metadata();
    if (m.width !== t.w || m.height !== t.h) img = img.resize(t.w, t.h, { kernel: 'lanczos3', fit: 'fill' });
    return img.ensureAlpha().raw().toBuffer();
  }));
  const ahead = 4, pending = [];
  const t0 = Date.now();
  for (let i = 0; i < files.length; i++) {
    while (pending.length < ahead && pending.length + i < files.length) pending.push(prepare(files[i + pending.length]));
    const bufs = await pending.shift();
    await Promise.all(procs.map((p, k) => write(p, bufs[k])));
    if (i % 300 === 299) log(`  encoded ${i + 1}/${files.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  procs.forEach((p) => p.c.stdin.end());
  await Promise.all(procs.map((p) => p.done));
}

async function ffmpegEncode(dir, files, targets, fps) {
  const start = String(Number(files[0].slice(0, -4)));
  for (const t of targets) {
    const scale = t.w === 1920 && t.h === 1080 ? [] : ['-vf', `scale=${t.w}:${t.h}:flags=lanczos`];
    await run(FFMPEG, ['-y', '-v', 'error', '-framerate', String(fps), '-start_number', start, '-i', path.join(dir, '%06d.png'), ...scale,
      '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', t.out]);
  }
}

async function main() {
  const argv = process.argv.slice(2), pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--no-720') flags.no720 = true;
    else if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
    else pos.push(argv[i]);
  }
  if (pos.length < 2) {
    console.error('usage: node encode.mjs <png dir> <out.mp4> [--no-720] [--fps 30] [--bitrate 16000000] [--bitrate-720 8000000]');
    process.exit(2);
  }
  const dir = path.resolve(expandHome(pos[0])), out = path.resolve(expandHome(pos[1]));
  const fps = Number(flags.fps || 30);
  const files = listPngs(dir);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const targets = [{ w: 1920, h: 1080, bitrate: Number(flags.bitrate || 16_000_000), out }];
  if (!flags.no720) targets.push({ w: 1280, h: 720, bitrate: Number(flags['bitrate-720'] || 8_000_000), out: out.replace(/(\.mp4)?$/i, '-720p.mp4') });
  const t0 = Date.now();
  log(`encode: ${files.length} frames from ${dir} → ${targets.map((t) => tilde(t.out)).join(', ')}`);
  if (FFMPEG) {
    log('encoder: ffmpeg libx264 high, yuv420p, CRF 18, +faststart');
    await ffmpegEncode(dir, files, targets, fps);
  } else {
    log('encoder: AVFoundation (encode.swift) H.264 High auto level, 420v video range, BT.709, ' +
      targets.map((t) => `${t.h}p ${t.bitrate / 1e6} Mbps`).join(', ') + ', shouldOptimizeForNetworkUse');
    await swiftEncode(dir, files, targets, fps);
    console.log('deviation: no x264 CRF 18 (AVFoundation bitrate mode)');
  }
  let bad = 0;
  for (const t of targets) {
    const p = await probeVideo(t.out);
    const fast = moovFirst(t.out), mb = fs.statSync(t.out).size / 1e6;
    const ok = p.width === t.w && p.height === t.h && Math.abs(p.fps - fps) < 0.01 && p.frames === files.length &&
      /high/i.test(String(p.profile)) && fast && (p.frame_delta_max_s === undefined || p.frame_delta_max_s - p.frame_delta_min_s < 1e-6);
    if (!ok) bad++;
    log(`${ok ? 'OK  ' : 'FAIL'} ${tilde(t.out)}: ${p.width}x${p.height}, ${p.fps.toFixed(3)} fps, ${p.duration_s.toFixed(3)} s, ` +
      `${p.frames} frames, ${p.profile}, ${p.pix_fmt}, ${fast ? 'moov first' : 'moov NOT first'}, ${mb.toFixed(1)} MB (probe: ${p.via})`);
  }
  log(`encode done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (bad) process.exit(1);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(tilde(String(e.stack || e))); process.exit(1); });
