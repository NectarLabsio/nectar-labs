import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Badge } from "@nectar/ui";
import { repoHref } from "@/lib/env";
import { landingMetadata } from "@/lib/site-meta";

export const metadata = { title: "Changelog", ...landingMetadata() };

interface Commit { hash: string; date: string; type: string; scope: string | null; subject: string }
interface Group { tag: string | null; date: string; commits: Commit[] }
type Log = { git: false } | { git: true; built: string; head: string; groups: Group[] };

/** lib/generated/changelog.json from scripts/build-changelog.mjs (run by `pnpm --filter web build`). Missing file = no git history. */
function load(): Log {
  const p = join(process.cwd(), "lib", "generated", "changelog.json");
  if (!existsSync(p)) return { git: false };
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Log;
  } catch {
    return { git: false };
  }
}

const TYPE: Record<string, string> = { feat: "Feature", fix: "Fix", perf: "Performance", docs: "Docs" };

export default function ChangelogPage() {
  const log = load();
  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Changelog</span>
        <h1>Changelog</h1>
        <p className="lead">Features, fixes and docs changes from the commit history, grouped by release tag, newest first. Testnet software, mock collateral.</p>
      </div>
      {!log.git ? (
        <p data-testid="changelog-nogit">Built without git history.</p>
      ) : (
        <div className="stack-lg" data-testid="changelog">
          <p className="caption">Generated at build from commit {log.head} on {log.built}. Chores, tests and merges are left out.</p>
          {log.groups.map((g) => (
            <section key={g.tag ?? "unreleased"} aria-labelledby={`tag-${g.tag ?? "unreleased"}`} className="stack-sm">
              <h2 id={`tag-${g.tag ?? "unreleased"}`}>
                {g.tag ?? "Since the last tag"} <span className="caption">{g.date}</span>
              </h2>
              <ul className="log-list">
                {g.commits.map((c) => {
                  const href = repoHref(`commit/${c.hash}`);
                  return (
                    <li key={c.hash}>
                      <Badge kind={c.type === "fix" ? "info" : "neutral"}>{TYPE[c.type] ?? c.type}</Badge>
                      <span>
                        {c.scope ? <strong>{c.scope}: </strong> : null}
                        {c.subject}
                      </span>
                      <span className="caption">
                        {c.date} · {href ? <a className="link" href={href} rel="noreferrer noopener">{c.hash}</a> : <code>{c.hash}</code>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
