#!/usr/bin/env node
// Build nectar-core v2 `set_session_calendar` args from packages/config/nyse-calendar.json (WO-18, dates read from nyse.com).
// Windows are [open_ns, close_ns) in UTC for every NYSE trading day from --from (default today, UTC) to the last year in the JSON.
// DST comes from the runtime's IANA tz data (America/New_York); nothing is typed by hand. Prints JSON args on stdout.
// Usage: node scripts/22-session-calendar.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD]      (interface-v7 §A2: sorted, ≤ 600 windows)
// Send (owner, testnet) is done by scripts/21-deploy-v2.sh, which pipes this output into `set_session_calendar`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const cal = JSON.parse(readFileSync(arg('--calendar') ?? join(root, 'packages/config/nyse-calendar.json'), 'utf8'));
const tz = cal.timezone ?? 'America/New_York';
if (tz !== 'America/New_York') throw new Error(`unexpected timezone ${tz}`);
const holidays = new Set(cal.holidays);
const early = new Map((cal.early_closes ?? []).map((e) => [e.date, e.close]));
const years = [...cal.holidays, ...(cal.early_closes ?? []).map((e) => e.date)].map((d) => Number(d.slice(0, 4)));
const from = arg('--from') ?? new Date().toISOString().slice(0, 10);
const to = arg('--to') ?? `${Math.max(...years)}-12-31`;

// UTC offset (minutes) of America/New_York at a given UTC instant.
const offsetMin = (utcMs) => {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(utcMs)).find((p) => p.type === 'timeZoneName').value; // "GMT-5" | "GMT-4"
  const m = name.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!m) throw new Error(`cannot parse tz offset ${name}`);
  return Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] ?? 0);
};
// New York wall-clock (date, "HH:MM") → UTC ms. Two passes so DST-boundary days resolve correctly.
const nyToUtc = (date, hhmm) => {
  const [y, mo, d] = date.split('-').map(Number); const [h, mi] = hhmm.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let t = naive - offsetMin(naive) * 60000;
  t = naive - offsetMin(t) * 60000;
  return t;
};

const windows = [];
for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) {
  const date = new Date(t).toISOString().slice(0, 10);
  const dow = new Date(t).getUTCDay();
  if (dow === 0 || dow === 6 || holidays.has(date)) continue;
  const open = nyToUtc(date, cal.regular.open);
  const close = nyToUtc(date, early.get(date) ?? cal.regular.close);
  windows.push([String(BigInt(open) * 1000000n), String(BigInt(close) * 1000000n)]);
}
if (windows.length > 600) throw new Error(`${windows.length} windows > 600 (interface-v7 §A2); pass --to`);
process.stderr.write(`session windows: ${windows.length} (${from} … ${to}), source ${cal.source} retrieved ${cal.retrieved}\n`);
process.stdout.write(JSON.stringify({ windows }) + '\n');
