#!/usr/bin/env node
// Lighthouse accessibility audit for the six G3 routes, dark and light.
// Expects the production server to be running already (`pnpm --filter web build && pnpm --filter web start`, port 3100),
// unless LH_START=1, in which case it starts `next start -p 3100` itself and stops it at the end.
// Base URL override: LH_BASE_URL. Chrome path override: CHROME_PATH (chrome-launcher default discovery otherwise).
// Writes JSON reports to evidence/G3/lighthouse/ (gitignored), prints a score table, exits 1 if any score < 90.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const outDir = resolve(root, "evidence/G3/lighthouse");
const BASE = process.env.LH_BASE_URL ?? "http://localhost:3100";
const MIN = 90;
const ROUTES = process.env.LH_ROUTES ? process.env.LH_ROUTES.split(",") : ["/", "/feed", "/feed/NVDAx", "/borrow", "/shield", "/position/0", "/quote", "/quote/new", "/quote/0", "/reserve", "/notes", "/console", "/agents", "/keepers", "/about", "/status", "/changelog", "/brand", "/talk", "/security"];
// Blink preferredColorScheme enum: 0 = dark, 1 = light.
const THEMES = {
  dark: ["--force-dark-mode", "--blink-settings=preferredColorScheme=0"],
  light: ["--blink-settings=preferredColorScheme=1"],
};

async function waitFor(url, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server not reachable at ${url}`);
}

let server;
if (process.env.LH_START === "1") {
  server = spawn("pnpm", ["exec", "next", "start", "-p", "3100"], { cwd: resolve(here, ".."), stdio: "ignore" });
}
await waitFor(BASE + "/").catch((e) => {
  console.error(`${e.message}. Start it with \`pnpm --filter web start\` or set LH_START=1.`);
  server?.kill();
  process.exit(2);
});

mkdirSync(outDir, { recursive: true });
const rows = [];
let failed = false;
try {
  for (const [theme, flags] of Object.entries(THEMES)) {
    const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-first-run", ...flags] });
    try {
      for (const route of ROUTES) {
        const res = await lighthouse(BASE + route, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["accessibility"] });
        const score = Math.round((res?.lhr.categories.accessibility.score ?? 0) * 100);
        const name = `${route === "/" ? "home" : route.slice(1).replace(/\//g, "_")}-${theme}.json`;
        writeFileSync(resolve(outDir, name), res.report);
        if (score < MIN) failed = true;
        rows.push({ route, theme, score });
      }
    } finally {
      await chrome.kill();
    }
  }
} finally {
  server?.kill();
}

console.log(`\n| route | dark | light |\n| --- | --- | --- |`);
for (const route of ROUTES) {
  const s = (t) => rows.find((r) => r.route === route && r.theme === t)?.score ?? "-";
  console.log(`| ${route} | ${s("dark")} | ${s("light")} |`);
}
console.log(`\nreports: ${outDir}`);
if (failed) {
  console.error(`FAIL: accessibility score below ${MIN}`);
  process.exit(1);
}
