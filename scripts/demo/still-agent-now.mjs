#!/usr/bin/env node
// Kunal 2026-11-13 ~19:05Z: still 06 (agent 402 → 200) with NO cursor, from a real run: the WO-35a terminal page runs
// `pnpm -s --filter x402 demo:testnet` (DEMO_SKIP_BORROW=1: only the paid download; agent1 pays 0.01 mock USDC), headless, no cursor injected.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { CAPTURE_LAUNCH } from './capture/recorder.mjs';

const { chromium } = createRequire('/Volumes/T7/nectar-labs/apps/web/package.json')('@playwright/test');
const sharp = createRequire('/Volumes/T7/nectar-labs/package.json')('/Volumes/T7/nectar-labs/node_modules/.pnpm/sharp@0.35.5_@types+node@22.20.5/node_modules/sharp');
const HOME = homedir();
const CMD = 'pnpm -s --filter x402 demo:testnet';
const env = readFileSync(join(HOME, '.nectar/demo-x402.env'), 'utf8') + 'DEMO_SKIP_BORROW=1\n';
const envFile = join(tmpdir(), `nx-still-env-${process.pid}`);
writeFileSync(envFile, env, { mode: 0o600 }); chmodSync(envFile, 0o600);
const term = spawn(process.execPath, ['/Volumes/T7/nectar-labs/scripts/demo/capture/terminal/server.mjs', '--port', '0', '--cmd', CMD, '--env-file', envFile],
  { cwd: '/Volumes/T7/nectar-labs', stdio: ['ignore', 'pipe', 'inherit'] });
const url = await new Promise((ok, bad) => { term.stdout.on('data', (d) => { const m = /http:\/\/127\.0\.0\.1:\d+\//.exec(String(d)); if (m) ok(m[0]); }); term.on('exit', (c) => bad(new Error(`terminal exited ${c}`))); });
const ctx = await chromium.launchPersistentContext(join(tmpdir(), `nx-still-prof-${process.pid}`), { ...CAPTURE_LAUNCH, headless: true });
try {
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('#term').click();
  await page.locator('#in').focus();
  await page.waitForTimeout(300);
  await page.keyboard.type(CMD, { delay: 30 });
  const typed = await page.locator('#in').inputValue();
  if (typed !== CMD) throw new Error(`typed text mismatch: ${JSON.stringify(typed)}`);
  await page.keyboard.press('Enter');
  await page.locator('.out', { hasText: 'paid_fetch' }).first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1200);
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const m = /"rows":(\d+),"transaction":"([A-Za-z0-9]+)"/.exec(text);
  console.log(`06 run: ${m ? `rows ${m[1]} tx ${m[2]}` : 'no paid_fetch line parsed'} at ${new Date().toISOString()}`);
  const shot = await page.screenshot({ type: 'png' });
  mkdirSync('/Volumes/T7/nectar-labs/docs/media/screens', { recursive: true }); mkdirSync('/Volumes/T7/nectar-demo-media/x', { recursive: true });
  const png = '/Volumes/T7/nectar-labs/docs/media/screens/06-agent-402-200.png';
  await sharp(shot).resize(1920, 1080, { kernel: 'lanczos3' }).png({ palette: true, quality: 90, effort: 9 }).toFile(png);
  const jpg = '/Volumes/T7/nectar-demo-media/x/06-agent-402-200-1600x900.jpg';
  await sharp(shot).resize(1600, 900, { kernel: 'lanczos3' }).jpeg({ quality: 88, mozjpeg: true }).toFile(jpg);
  console.log(`06: png ${(statSync(png).size / 1024).toFixed(0)} KB · jpg ${(statSync(jpg).size / 1024).toFixed(0)} KB`);
} finally { await ctx.close(); term.kill(); }
