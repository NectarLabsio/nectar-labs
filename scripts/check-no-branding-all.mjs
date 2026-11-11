#!/usr/bin/env node
// CLAUDE.md §1: no hackathon banner, badge or copy in the product UI — landing, web app, docs site (pages + navigation).
// Hackathon context is allowed only in README.md, docs/EVIDENCE.md, docs/SUBMISSION.md (not scanned). Repo-wide twin of
// apps/web/scripts/check-no-branding.mjs, added after G9 FAIL (docs-site copy the web-only check could not see). Part of `pnpm verify:quick`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const targets = [
  "landing",
  "apps/web/app", "apps/web/components", "apps/web/lib", "apps/web/public",
  "packages/ui",
  "apps/docs-site/docs", "apps/docs-site/blog", "apps/docs-site/src", "apps/docs-site/static",
  "apps/docs-site/sidebars.ts", "apps/docs-site/docusaurus.config.ts",
];
const skipDir = new Set(["node_modules", "build", ".next", ".docusaurus", "dist"]);
const textExt = /\.(tsx?|jsx?|mjs|cjs|css|md|mdx|html|json|ya?ml|svg|txt)$/;
const bad = [];
const walk = (p) => {
  const st = statSync(p, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isDirectory()) {
    for (const f of readdirSync(p)) if (!f.startsWith("._") && !skipDir.has(f)) walk(join(p, f));
    return;
  }
  if (!textExt.test(p)) return;
  readFileSync(p, "utf8").split("\n").forEach((l, i) => /hackathon/i.test(l) && bad.push(`${p.slice(root.length + 1)}:${i + 1}`));
};
targets.forEach((t) => walk(join(root, t)));
if (bad.length) {
  console.error("Hackathon wording in the product UI (landing / web / docs site):\n" + bad.join("\n"));
  process.exit(1);
}
console.log("no hackathon branding in landing, web app or docs site");
