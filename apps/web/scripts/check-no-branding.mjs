// CLAUDE.md §1: no hackathon banner, badge or copy in the product UI. Fails on any match in web/ui sources.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const dirs = ["apps/web/app", "apps/web/components", "apps/web/lib", "packages/ui/src"];
const bad = [];
const walk = (p) => {
  const st = statSync(p, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isDirectory()) return readdirSync(p).filter((f) => !f.startsWith("._")).forEach((f) => walk(join(p, f)));
  if (!/\.(tsx?|css|md)$/.test(p)) return;
  readFileSync(p, "utf8").split("\n").forEach((l, i) => /hackathon/i.test(l) && bad.push(`${p}:${i + 1}`));
};
dirs.forEach((d) => walk(join(root, d)));
if (bad.length) {
  console.error("Hackathon wording in product UI:\n" + bad.join("\n"));
  process.exit(1);
}
console.log("no hackathon branding in UI sources");
