#!/usr/bin/env node
// WO-34p: run after `next build`. Every dynamic route below reads repo files at request time (loadConfig walks up from
// process.cwd() to packages/config/config.yaml). On Vercel a function holds only its traced files, so each route's
// .next/server/**/*.nft.json must list those files (next.config.ts outputFileTracingIncludes). Exit 1 otherwise.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(app, "..", "..");
const server = join(app, ".next", "server");

/** Route → trace file under .next/server (app router: `<entry>.js.nft.json`). */
const ROUTES = {
  "/api/health": "app/api/health/route.js.nft.json",
  "/api/feed": "app/api/feed/route.js.nft.json",
  "/feed/[symbol]": "app/feed/[symbol]/page.js.nft.json",
  "/position/[id]": "app/position/[id]/page.js.nft.json",
  "/note/[id]": "app/note/[id]/page.js.nft.json",
  "/quote/[id]": "app/quote/[id]/page.js.nft.json",
};
/** Repo files those routes read at runtime (keep in step with next.config.ts RUNTIME_REPO_FILES). */
const REQUIRED = ["packages/config/config.yaml"];

if (!existsSync(server)) {
  console.error(`check-trace: ${relative(repo, server)} missing; run \`pnpm --filter web build\` first.`);
  process.exit(1);
}
for (const f of REQUIRED) {
  if (!existsSync(join(repo, f))) {
    console.error(`check-trace: ${f} missing from the checkout.`);
    process.exit(1);
  }
}

let failed = 0;
for (const [route, rel] of Object.entries(ROUTES)) {
  const nft = join(server, rel);
  if (!existsSync(nft)) {
    console.error(`FAIL ${route}: no trace (${relative(app, nft)}); route missing or not a server route`);
    failed++;
    continue;
  }
  /** @type {{ files?: string[] }} */
  const trace = JSON.parse(readFileSync(nft, "utf8"));
  const files = new Set((trace.files ?? []).map((f) => relative(repo, resolve(dirname(nft), f)).split("\\").join("/")));
  const missing = REQUIRED.filter((f) => !files.has(f));
  if (missing.length) {
    console.error(`FAIL ${route}: trace lacks ${missing.join(", ")} (${files.size} files traced)`);
    failed++;
  } else {
    console.log(`ok   ${route}: ${REQUIRED.join(", ")} traced (${files.size} files)`);
  }
}
if (failed) {
  console.error(`check-trace: ${failed}/${Object.keys(ROUTES).length} routes would 500 in a serverless bundle.`);
  process.exit(1);
}
console.log(`check-trace: ${Object.keys(ROUTES).length}/${Object.keys(ROUTES).length} routes carry ${REQUIRED.join(", ")}.`);
