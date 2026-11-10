// Fails if a color literal appears outside packages/ui/tokens.css (DESIGN_SYSTEM.md: tokens.css is the only place colors live).
// Scans packages/ui and apps/web sources. Brand bitmaps and the static favicon SVG are assets, not components, and are skipped.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const dirs = ["packages/ui/src", "packages/ui/components.css", "packages/ui/app.css", "apps/web/app", "apps/web/components", "apps/web/lib"];
const allow = new Set(["packages/ui/tokens.css"]);
const pattern = /#[0-9a-fA-F]{3,8}\b(?![\w-])|\brgba?\(|\bhsla?\(/;
const bad = [];

function walk(p) {
  let st;
  try {
    st = statSync(p);
  } catch {
    return;
  }
  if (st.isDirectory()) {
    for (const f of readdirSync(p)) if (!f.startsWith("._") && f !== "node_modules" && f !== ".next") walk(join(p, f));
    return;
  }
  if (!/\.(tsx?|css|mjs)$/.test(p)) return;
  const rel = relative(root, p);
  if (allow.has(rel)) return;
  readFileSync(p, "utf8")
    .split("\n")
    .forEach((line, i) => {
      // ignore hex inside JS identifiers/urls like "#top" anchors: require a color-ish context
      const m = line.match(pattern);
      if (m && !/href=|#[a-z-]+["']|#(main|how|roles|settle|faq|evidence|top)\b/.test(line)) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
}
for (const d of dirs) walk(join(root, d));
if (bad.length) {
  console.error("Literal colors found (use tokens from packages/ui/tokens.css):\n" + bad.join("\n"));
  process.exit(1);
}
console.log("no literal colors outside tokens.css");
