import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";
import { findConfigPath } from "@nectar/sdk/config-node";
import { CopyContact } from "@/components/CopyContact";
import { getSiteConfig, guardContent } from "@/lib/config.server";
import { repoHref } from "@/lib/env";
import { landingMetadata } from "@/lib/site-meta";

export const metadata = { title: "Security", ...landingMetadata() };

/** Repo-root SECURITY.md, rendered at build time (same pattern as legal/[slug]). Relative repo links go through repoHref() or lose the link. */
function load(): { title: string; html: string } | null {
  const repo = join(findConfigPath(process.cwd()), "..", "..", "..");
  const p = join(repo, "SECURITY.md");
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, "utf8");
  guardContent("/security", raw);
  const title = /^#\s+(.+)$/m.exec(raw)?.[1] ?? "Security";
  const src = raw.replace(/^#\s+.+$/m, "");
  const renderer = new marked.Renderer();
  renderer.link = ({ href, text }) => {
    if (/^(https?:|mailto:|#)/.test(href)) return `<a href="${href}" rel="noreferrer noopener">${text}</a>`;
    const r = repoHref(href);
    return r ? `<a href="${r}" rel="noreferrer noopener">${text}</a>` : `<span>${text}</span>`;
  };
  // Wide tables and code blocks scroll inside their own box at 400 px; a scrollable box must be keyboard-focusable (axe scrollable-region-focusable).
  const html = marked
    .parse(src, { async: false, renderer })
    .replace(/<pre>/g, "<pre tabindex=\"0\">")
    .replace(/<table>/g, "<div class=\"table-wrap\" tabindex=\"0\" role=\"region\" aria-label=\"Table\"><table class=\"t\">")
    .replace(/<\/table>/g, "</table></div>");
  return { title, html };
}

export default function SecurityPage() {
  const site = getSiteConfig();
  const doc = load();
  return (
    <div className="page wrap">
      <span className="label">Security</span>
      <h1>{doc?.title ?? "Security"}</h1>
      <section className="prose" aria-labelledby="report">
        <h2 id="report">Report a security issue</h2>
        <p>Nectar Labs is unaudited software on NEAR testnet with mock collateral. Write to:</p>
        <CopyContact contact={site.contact} className="row" testId="security-contact" />
      </section>
      {doc ? (
        <article className="prose" data-testid="security-md" dangerouslySetInnerHTML={{ __html: doc.html }} />
      ) : (
        <p className="prose">SECURITY.md was not found when this build ran.</p>
      )}
    </div>
  );
}
