#!/usr/bin/env node
// Local stand-in for the docs deployment (WO-34c, WO-34t, WO-62b). The build output is flat (no baseUrl folder, F-393, F-459):
// pages at the root, which is what DOCS_URL points at since WO-62b (APP/SITE /docs/<rest> 308 to DOCS_URL/<rest>). Old
// `/docs`, `/docs/` and `/docs/<path>` requests are still answered from the root (index.html / <path>), like the docs host's
// own /docs/:path* redirect (F-459), so links with the old prefix keep resolving locally.
// `docusaurus serve` is not used: it redirects non-asset URLs to the trailing-slash form, unlike the deployment (cleanUrls).
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
  const raw = new URL(req.url ?? "/", "http://x").pathname;
  // The deployment's rewrites: /docs and /docs/ → /, /docs/<path> → /<path>.
  const path = raw === "/docs" || raw.startsWith("/docs/") ? raw.slice("/docs".length) || "/" : raw;
  const file = pick(path);
  const status = file ? 200 : 404;
  const f = file ?? join(dir, "404.html");
  res.writeHead(status, { "content-type": types[extname(f)] ?? "application/octet-stream" });
  createReadStream(f).pipe(res);
}).listen(port, () => console.log(`docs build ${dir} on http://localhost:${port}`));
