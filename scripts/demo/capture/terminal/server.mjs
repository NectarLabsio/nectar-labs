#!/usr/bin/env node
// WO-35a: on-camera terminal. Serves a terminal-looking page on 127.0.0.1; when the line typed there equals one of the configured commands,
// runs that REAL command server side (env from this process / --env-file, never sent to the page) and streams sanitized output over SSE.
// The page can only trigger commands given here; any other typed line is refused (visibly, so a bad take is obvious).
//
// Usage: node scripts/demo/capture/terminal/server.mjs [--port 7681] [--cwd <dir>] [--env-file <file>] [--replace FROM=TO]...
//                                                      [--cmd "<command line>"]... [-- <argv...>]
//   --cmd "pnpm --filter x402 demo:testnet"   the exact text to type; run with /bin/sh -c "<text>" (repeat --cmd for several)
//   -- pnpm --filter x402 demo:testnet        same, from argv (joined with spaces; args with spaces are single-quoted)
//   --replace /Volumes/T7/nectar-labs=.       extra literal replacement in every streamed line (after $HOME → ~)
import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, hostname, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const FONTS = resolve(here, '../../../../packages/ui/fonts');

const args = process.argv.slice(2);
const opt = { port: 7681, cwd: process.cwd(), cmds: [], replace: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--') { const rest = args.slice(i + 1); if (rest.length) opt.cmds.push(rest.map((s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`)).join(' ')); break; }
  const v = args[++i];
  if (v === undefined) throw new Error(`missing value for ${a}`);
  if (a === '--port') opt.port = Number(v);
  else if (a === '--cwd') opt.cwd = resolve(v);
  else if (a === '--env-file') process.loadEnvFile(resolve(v));
  else if (a === '--cmd') opt.cmds.push(v);
  else if (a === '--replace') { const k = v.indexOf('='); if (k < 1) throw new Error('--replace FROM=TO'); opt.replace.push([v.slice(0, k), v.slice(k + 1)]); }
  else throw new Error(`unknown option ${a}`);
}
if (!opt.cmds.length) { console.error('terminal: no command configured (use --cmd "<command>" or -- <argv>)'); process.exit(2); }

// Sanitizer: ANSI/OSC codes dropped, carriage-return redraws collapsed, $HOME → ~, host and user names masked, then --replace pairs.
const home = homedir();
const homes = [...new Set([home, process.env.HOME, (() => { try { return realpathSync(home); } catch { return home; } })()].filter((h) => h && h.length > 1))]
  .sort((a, b) => b.length - a.length);
const host = hostname(), shortHost = host.split('.')[0], user = userInfo().username;
const masks = [[host, 'host'], [shortHost, 'host'], [user, 'user']].filter(([s]) => s && s.length >= 5);
const ANSI = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-Z\\-_]|[\x00-\x08\x0b-\x1f\x7f]/g;
function sanitize(raw) {
  let s = String(raw);
  if (s.includes('\r')) s = s.split('\r').filter((p) => p.length).pop() ?? '';
  s = s.replace(ANSI, '');
  for (const h of homes) s = s.split(h).join('~');
  for (const [from, to] of masks) s = s.split(from).join(to);
  for (const [from, to] of opt.replace) s = s.split(from).join(to);
  return s;
}

const page = readFileSync(join(here, 'index.html'));
const clients = new Set();
let child = null;
const send = (msg) => { const data = `data: ${JSON.stringify(msg)}\n\n`; for (const c of clients) c.write(data); };

function run(cmd) {
  send({ type: 'start' });
  child = spawn('/bin/sh', ['-c', cmd], {
    cwd: opt.cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', TERM: 'dumb' },
  });
  for (const [name, stream] of [['out', child.stdout], ['err', child.stderr]]) {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) send({ type: 'line', stream: name, text: sanitize(l) });
    });
    stream.on('end', () => { if (buf) send({ type: 'line', stream: name, text: sanitize(buf) }); buf = ''; });
  }
  child.on('close', (code) => { child = null; send({ type: 'exit', code }); console.log(`terminal: command exited ${code}`); });
}

const server = createServer((req, res) => {
  const origin = req.headers.origin;
  const self = `http://127.0.0.1:${server.address().port}`;
  if (origin && origin !== self) { res.writeHead(403).end(); return; }
  const url = new URL(req.url, self);
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(page);
  } else if (req.method === 'GET' && /^\/fonts\/[\w.-]+\.woff2$/.test(url.pathname)) {
    try { res.writeHead(200, { 'content-type': 'font/woff2' }).end(readFileSync(join(FONTS, url.pathname.slice(7)))); } catch { res.writeHead(404).end(); }
  } else if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(': hello\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
  } else if (req.method === 'POST' && url.pathname === '/run') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (d) => { body += d; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let line = null;
      try { line = String(JSON.parse(body).line); } catch { /* malformed */ }
      if (child) { res.writeHead(409, { 'content-type': 'application/json' }).end('{"error":"busy"}'); return; }
      if (line === null || !opt.cmds.includes(line)) {
        console.error('terminal: refused: typed line is not a configured command');
        res.writeHead(409, { 'content-type': 'application/json' }).end('{"error":"refused: typed text is not a configured command"}');
        return;
      }
      res.writeHead(202, { 'content-type': 'application/json' }).end('{"ok":true}');
      run(line);
    });
  } else {
    res.writeHead(404).end();
  }
});
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 15_000).unref();

const stop = () => { if (child) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ } } server.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.listen(opt.port, '127.0.0.1', () => {
  console.log(`terminal: http://127.0.0.1:${server.address().port}/ · ${opt.cmds.length} command(s) · cwd ${sanitize(opt.cwd)}`);
});
