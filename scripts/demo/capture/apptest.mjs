#!/usr/bin/env node
// Orchestrator check (WO-35): gapcheck on the pages the takes actually film (testnet app), not the WebGL landing.
// Throwaway profile, no wallet, read-only. Usage: [CAPTURE_HEADED=1] node apptest.mjs [url]
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CAPTURE_LAUNCH, startTake, stopTake, defaultTakeDir } from './recorder.mjs';
import * as human from './human.mjs';
import { gapcheck, printReport } from './gapcheck.mjs';

const { chromium } = createRequire('/Volumes/T7/nectar-labs/apps/web/package.json')('@playwright/test');
const url = process.argv[2] ?? 'https://testnet.nectarlabs.io/feed/NVDAx';
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
const dir = defaultTakeDir(`apptest-${stamp}`);
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'nx-apptest-')), { ...CAPTURE_LAUNCH });
try {
  await human.installCursor(ctx);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(url, { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Decline' }).click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await startTake(ctx, dir, { quality: Number(process.env.CAPTURE_QUALITY ?? 92), ...(process.env.CAPTURE_MAX ? { maxWidth: Number(process.env.CAPTURE_MAX.split("x")[0]), maxHeight: Number(process.env.CAPTURE_MAX.split("x")[1]) } : {}) });
  human.section(1, 'Market', '');
  const exit = page.locator('[data-testid="market-exit"]').first();
  await human.moveTo(page, exit);
  await human.box(page, 'exit capacity', exit);
  await human.hold(1200, 'read exit capacity');
  const ladder = page.locator('[data-testid="market-ladder"] tbody tr').first();
  await human.moveTo(page, ladder);
  await human.box(page, 'ladder row', ladder);
  await human.hold(1500, 'read quote');
  await human.moveTo(page, page.locator('[data-testid="market-ladder"] tbody tr').nth(1));
  await human.hold(800, 'next row');
  human.zoomOut();
  await human.moveTo(page, page.getByRole('link', { name: 'Borrow' }).first());
  await human.hold(600, 'hover nav');
  human.sectionEnd(1);
} finally {
  await stopTake();
  await ctx.close();
}
const r = await gapcheck(dir, { limitMs: 100 });
printReport(r);
process.exitCode = r.ok ? 0 : 1;
