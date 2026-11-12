import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { findConfigPath } from "@nectar/sdk/config-node";
import { guardContent } from "@/lib/config.server";
import { hostHref } from "@/lib/env";

const SLUGS = ["privacy", "cookies", "terms", "disclaimers"] as const;
type Slug = (typeof SLUGS)[number];

export const dynamicParams = false;
export function generateStaticParams() {
  return SLUGS.map((slug) => ({ slug }));
}

/** Legal text is shared with the docs site (apps/docs-site/docs/legal/*.md), rendered at build time. */
function load(slug: Slug): { title: string; html: string } | null {
  const repo = join(findConfigPath(process.cwd()), "..", "..", "..");
  const p = join(repo, "apps", "docs-site", "docs", "legal", `${slug}.md`);
  if (!existsSync(p)) return null;
  const src = readFileSync(p, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "");
  guardContent(`/legal/${slug}`, src);
  const title = /^#\s+(.+)$/m.exec(src)?.[1] ?? slug;
  // Wide tables (the privacy page's data inventory) scroll in a focusable region, as on /security (axe scrollable-region-focusable).
  const html = marked
    .parse(src, { async: false })
    .replace(/<pre>/g, "<pre tabindex=\"0\">")
    .replace(/<table>/g, "<div class=\"table-wrap\" tabindex=\"0\" role=\"region\" aria-label=\"Table\"><table class=\"t\">")
    .replace(/<\/table>/g, "</table></div>")
    // The shared Markdown links docs pages as /docs/<slug> (docs-site paths). WO-62b: docs live at the DOCS_URL root, so point
    // them there directly (prefix dropped); local mode keeps /docs/<slug> (in-app explainer rewrite, next.config.ts).
    .replace(/href="(\/docs(?:\/[^"]*)?)"/g, (_m, href: string) => `href="${hostHref(href)}"`);
  return { title, html };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: slug.charAt(0).toUpperCase() + slug.slice(1) };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(SLUGS as readonly string[]).includes(slug)) notFound();
  const doc = load(slug as Slug);
  return (
    <div className="page wrap">
      <span className="label">Legal</span>
      {doc ? (
        <article className="prose" dangerouslySetInnerHTML={{ __html: doc.html }} />
      ) : (
        <div className="prose"><h1>{slug}</h1><p>This document is being written. Testnet software, mock collateral, no real funds.</p></div>
      )}
    </div>
  );
}
