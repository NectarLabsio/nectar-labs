#!/usr/bin/env node
// /changelog source (WO-34b §3). Runs before `next build`; writes lib/generated/changelog.json (gitignored, apps/web/.gitignore).
// Tags + conventional commits (feat / fix / perf / docs; chore, test, merge and anything else skipped), grouped by tag, newest first.
// Subjects that would break the no-branding rule (CLAUDE.md §1) are dropped, so the generated file passes check-no-branding-all.mjs.
// Outside a git checkout (or with git missing) it writes { git: false } and the page says "Built without git history".
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const here = resolve(import.meta.dirname, "..");
const outDir = join(here, "lib", "generated");
const TYPES = new Set(["feat", "fix", "perf", "docs"]);
// Same pattern as scripts/check-no-branding-all.mjs, plus event words that only make sense in that context.
const BRANDING = /hackathon|judg(e|ing)|submission/i;

const git = (args) => execFileSync("git", args, { cwd: here, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

function parse(line) {
  const [hash, date, ...rest] = line.split("\t");
  const subject = rest.join("\t");
  const m = /^(\w+)(?:\(([^)]{1,40})\))?!?:\s+(.+)$/.exec(subject);
  if (!m || !TYPES.has(m[1]) || BRANDING.test(subject)) return null;
  return { hash, date, type: m[1], scope: m[2] ?? null, subject: m[3] };
}

function build() {
  try {
    if (git(["rev-parse", "--is-inside-work-tree"]) !== "true") return { git: false };
  } catch {
    return { git: false };
  }
  const log = (range) => {
    const out = git(["log", "--no-merges", "--format=%h%x09%cs%x09%s", ...range]);
    return out ? out.split("\n").map(parse).filter(Boolean) : [];
  };
  // Tags reachable from HEAD, newest first.
  const tags = git(["tag", "--merged", "HEAD", "--sort=-creatordate"]).split("\n").filter(Boolean);
  const groups = [];
  let upper = "HEAD";
  for (const tag of tags) {
    const commits = log([`${tag}..${upper}`]);
    if (upper === "HEAD") {
      if (commits.length) groups.push({ tag: null, date: commits[0].date, commits });
    } else groups.push({ tag: upper, date: git(["log", "-1", "--format=%cs", upper]), commits });
    upper = tag;
  }
  groups.push({ tag: upper === "HEAD" ? null : upper, date: git(["log", "-1", "--format=%cs", upper]), commits: log([upper]) });
  return { git: true, built: new Date().toISOString().slice(0, 10), head: git(["rev-parse", "--short", "HEAD"]), groups: groups.filter((g) => g.commits.length) };
}

const data = build();
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "changelog.json"), `${JSON.stringify(data, null, 1)}\n`);
console.log(data.git ? `changelog: ${data.groups.reduce((n, g) => n + g.commits.length, 0)} commits in ${data.groups.length} groups` : "changelog: built without git history");
