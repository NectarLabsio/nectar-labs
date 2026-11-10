#!/usr/bin/env node
// Build the NEAR Hackathon submission JSON from docs/SUBMISSION.md ("Payload fields" table + "### idea" fenced block).
// Prints the JSON on stdout. Never sends anything. `--send-mode` (passed only by the send path, Kunal's shell) generates requestId once
// and stores it in ~/.nectar/submission-request-id (0600, outside the repo). Exit 2 on: missing field, `website` key, body > 12,000 B,
// idea length outside 20–2000, or (send mode only) any TODO-H placeholder.
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const md = readFileSync(join(root, 'docs/SUBMISSION.md'), 'utf8');
const sendMode = process.argv.includes('--send-mode');
const FIELDS = ['requestId', 'projectName', 'leadName', 'email', 'size', 'tracks', 'nearAddress', 'projectUrl', 'demoUrl', 'idea', 'consent'];
const fail = (m) => { console.error(`build-submission: ${m}`); process.exit(2); };

const table = md.split('## Payload fields')[1]?.split('\n## ')[0] ?? fail('no "## Payload fields" section');
const rows = {};
for (const line of table.split('\n')) {
  const m = line.match(/^\|\s*`([A-Za-z]+)`\s*\|\s*(.*?)\s*\|/);
  if (m) rows[m[1]] = m[2];
}
if ('website' in rows) fail('`website` must never be sent (spam trap, F-007)');
const unwrap = (v) => { const m = v.match(/^`(.*)`$/); return m ? m[1] : v; };

const ideaMatch = md.match(/### idea\s*\n```[a-z]*\n([\s\S]*?)\n```/);
const idea = ideaMatch?.[1].trim() ?? fail('no fenced block under "### idea"');
if (idea.length < 20 || idea.length > 2000) fail(`idea length ${idea.length} outside 20–2000`);

const out = {};
for (const f of FIELDS) {
  if (f === 'idea') { out.idea = idea; continue; }
  if (!(f in rows)) fail(`field ${f} missing from the table`);
  let v = unwrap(rows[f]);
  if (f === 'tracks') { try { v = JSON.parse(v); } catch { fail('tracks is not a JSON array'); } }
  else if (f === 'consent') { v = v === 'true' ? true : v; }
  else if (f === 'requestId' && v === 'GENERATE-ONCE') {
    const p = join(homedir(), '.nectar', 'submission-request-id');
    if (existsSync(p)) v = readFileSync(p, 'utf8').trim();
    else if (sendMode) v = '__NEW_REQUEST_ID__';   // minted below, only after every other check passes
  }
  out[f] = v;
}
const body = JSON.stringify(out);
if (Buffer.byteLength(body) > 12000) fail(`body ${Buffer.byteLength(body)} B > 12,000 B`);
if (sendMode && /TODO-H|GENERATE-ONCE/.test(body)) fail('placeholders remain (TODO-H… / GENERATE-ONCE) — not sendable');
if (out.requestId === '__NEW_REQUEST_ID__') {
  const p = join(homedir(), '.nectar', 'submission-request-id');
  mkdirSync(dirname(p), { recursive: true }); out.requestId = randomUUID(); writeFileSync(p, out.requestId); chmodSync(p, 0o600);
}
process.stdout.write(JSON.stringify(out) + '\n');
