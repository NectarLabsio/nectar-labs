import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { findConfigPath } from "@nectar/sdk/config-node";
import { guardContent } from "@/lib/config.server";

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
  return { title, html: marked.parse(src, { async: false }) };
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
