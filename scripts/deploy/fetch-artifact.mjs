#!/usr/bin/env node
// WO-34m: Vercel installCommand for the connector deploy path (docs/work/wo-34m-mcp-deploy.md). Node only: the Vercel build image documents tar but
// not curl or sha256sum (F-425). Install and build commands run in rootDirectory (F-424); this script resolves the repo root from its own path.
// The deployment carries only stub files (root package.json, pnpm-workspace.yaml, the app's package.json, this script) and `.nectar-artifact`:
//   line 1: src-<40-hex sha>.tar.gz <sha256>
//   line 2: presigned GET URL (short-lived, one object; never printed)
// It downloads the tarball, checks the sha256, extracts it over the stubs (identical files at that commit), then installs with the lockfile.
// Usage (installCommand): node ../../scripts/deploy/fetch-artifact.mjs <pnpm filter, e.g. web or docs-site>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const fail = (m) => {
  console.error(`fetch-artifact: ${m}`);
  process.exit(3);
};
const filter = process.argv[2];
if (!filter) fail("usage: fetch-artifact.mjs <pnpm filter>");
const root = resolve(import.meta.dirname, "..", "..");
const [line1 = "", url = ""] = readFileSync(join(root, ".nectar-artifact"), "utf8").trim().split("\n");
const [name = "", sum = ""] = line1.trim().split(/\s+/);
if (!/^src-[0-9a-f]{40}\.tar\.gz$/.test(name)) fail("bad name");
if (!/^[0-9a-f]{64}$/.test(sum)) fail("bad sha256");

let buf;
for (let i = 1; ; i++) {
  try {
    const r = await fetch(url.trim());
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    buf = Buffer.from(await r.arrayBuffer());
    break;
  } catch (e) {
    if (i >= 3) fail(`download failed: ${e instanceof Error ? e.message : String(e)}`);
    await new Promise((ok) => setTimeout(ok, 2000 * i));
  }
}
if (createHash("sha256").update(buf).digest("hex") !== sum) fail(`sha256 mismatch for ${name}`);
const tmp = join(mkdtempSync(join(tmpdir(), "nectar-")), name);
writeFileSync(tmp, buf);
execFileSync("tar", ["-xzf", tmp, "-C", root], { stdio: "inherit" });
rmSync(tmp);
rmSync(join(root, ".nectar-artifact"));
console.log(`fetch-artifact: ${name} sha256 ok, commit ${name.slice(4, 44)}, ${buf.length} bytes`);
execFileSync("npx", ["-y", "pnpm@10.34.9", "install", "--frozen-lockfile", "--filter", `${filter}...`], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, CI: "1" },
});
