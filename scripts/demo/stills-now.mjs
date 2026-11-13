#!/usr/bin/env node
// Kunal 2026-11-13 ~19:00Z: post now with images (video later as a reply). Two stills from REAL production state, nothing signed:
//  03 borrow preview: production /borrow in the dedicated demo profile (read-only), 5 NVDAx + 100 USDC typed, preview settled.
//  06 agent 402 → 200: last terminal frame of rehearsal 1's real signed agent run (before the explorer tab opened).
// Outputs: docs/media/screens/{03-borrow-preview,06-agent-402-200}.png (1920×1080, ≤ 400 KB) + nectar-demo-media/x/*-1600x900.jpg.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CAPTURE_LAUNCH } from './capture/recorder.mjs';

const req = createRequire('/Volumes/T7/nectar-labs/apps/web/package.json');
const { chromium } = req('@playwright/test');
const sharp = createRequire('/Volumes/T7/nectar-labs/package.json')('/Volumes/T7/nectar-labs/node_modules/.pnpm/sharp@0.35.5_@types+node@22.20.5/node_modules/sharp');
const HOME = homedir();
const SCREENS = '/Volumes/T7/nectar-labs/docs/media/screens';
const XDIR = '/Volumes/T7/nectar-demo-media/x';
mkdirSync(SCREENS, { recursive: true }); mkdirSync(XDIR, { recursive: true });

async function emit(buf, name) {
  const png = join(SCREENS, `${name}.png`);
  let q = 90;
  for (;;) { // palette PNG, lowering quality until ≤ 400 KB
    await sharp(buf).resize(1920, 1080, { kernel: 'lanczos3' }).png({ palette: true, quality: q, effort: 9 }).toFile(png);
    if (statSync(png).size <= 400 * 1024 || q <= 50) break;
    q -= 10;
  }
  const jpg = join(XDIR, `${name}-1600x900.jpg`);
  await sharp(buf).resize(1600, 900, { kernel: 'lanczos3' }).jpeg({ quality: 88, mozjpeg: true }).toFile(jpg);
  console.log(`${name}: png ${(statSync(png).size / 1024).toFixed(0)} KB (q${q}) · jpg ${(statSync(jpg).size / 1024).toFixed(0)} KB`);
}

// 06: rehearsal-1 s5 terminal frame before the explorer tab (popup_open at 29488 ms; agent run ended 25136 ms).
{
  const dir = join(HOME, '.nectar/demo-capture/rehearsal-1/s5');
  const frames = readFileSync(join(dir, 'frames.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((f) => f.page === 'p0' && f.t > 25136 && f.t < 29400);
  const f = frames.at(-1);
  if (!f) throw new Error('no p0 frame in the window');
  console.log(`06 source: rehearsal-1 s5 frame t=${f.t} ms ${f.w}x${f.h}`);
  await emit(readFileSync(join(dir, f.file)), '06-agent-402-200');
}

// 03: production /borrow, read-only.
{
  const ctx = await chromium.launchPersistentContext(join(HOME, '.nectar/demo-chrome-profile'), { ...CAPTURE_LAUNCH, headless: true });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto('https://testnet.nectarlabs.io/borrow', { waitUntil: 'load' });
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.scrollTo(0, 0));
    const units = page.locator('[data-testid="amt-units"] input:not([type=range])').first();
    const borrow = page.locator('[data-testid="amt-borrow"] input:not([type=range])').first();
    await units.fill('5'); await page.waitForTimeout(1200);
    await borrow.fill('100'); await page.waitForTimeout(3500);
    const out = page.locator('[data-testid="borrow-outcome"]');
    const t = await out.innerText({ timeout: 10000 }).catch(() => '');
    console.log(`03 preview text: ${t.replace(/\s+/g, ' ').slice(0, 200)}`);
    const banner = await page.locator('text=/cookie/i').count();
    console.log(`03 cookie banner elements visible: ${banner}`);
    const shot = await page.screenshot({ type: 'png' });
    const meta = await sharp(shot).metadata();
    console.log(`03 source: production /borrow at ${new Date().toISOString()} ${meta.width}x${meta.height}`);
    await emit(shot, '03-borrow-preview');
  } finally { await ctx.close(); }
}
