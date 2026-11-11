#!/usr/bin/env node
// Local stand-in for the docs deployment (WO-34c). Serves apps/docs-site/build at the ROOT, the way the hosted docs project
// serves its flat output (F-393), so APP `/docs/:path*` → DOCS_ORIGIN `/:path*` resolves locally. `docusaurus serve` cannot
// play this role: it redirects every path outside baseUrl (/docs/) back to /docs/, which breaks the prefix-stripping rewrite.
// Usage: node apps/web/scripts/serve-docs.mjs --port 3742 [--dir apps/docs-site/build]
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const port = Number(arg("port", "3742"));
const dir = resolve(arg("dir", join(import.meta.dirname, "../../docs-site/build")));
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain", ".xml": "application/xml",
};

function pick(path) {
  const p = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, "");
  for (const c of [p, `${p}.html`, join(p, "index.html")]) {
    const f = join(dir, c);
    if (f.startsWith(dir) && existsSync(f) && statSync(f).isFile()) return f;
  }
  return null;
}

createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  const file = pick(path);
  const status = file ? 200 : 404;
  const f = file ?? join(dir, "404.html");
  res.writeHead(status, { "content-type": types[extname(f)] ?? "application/octet-stream" });
  createReadStream(f).pipe(res);
}).listen(port, () => console.log(`docs build ${dir} on http://localhost:${port}`));
