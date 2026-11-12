import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isProductionEnv } from "@nectar/sdk";
import { hostKind, readHosts } from "@/lib/hosts";

// Per-host robots.txt (WO-34a §5, WO-62b: SITE, APP, STATUS; F-460 robots.md). Non-production deployments (previews, local)
// disallow everything; they also send X-Robots-Tag: noindex (next.config.ts). The docs host serves its own robots/sitemap
// (Docusaurus deployment, F-459), so APP no longer points at a /docs sitemap. headers() makes this a request-time route.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0]!.trim().toLowerCase();
  const hosts = readHosts();
  const prod = isProductionEnv(process.env);
  const rules: MetadataRoute.Robots["rules"] = prod ? { userAgent: "*", allow: "/", disallow: "/api/" } : { userAgent: "*", disallow: "/" };
  if (!hosts) return { rules, sitemap: `${h.get("x-forwarded-proto") ?? "http"}://${host}/sitemap.xml` };
  const kind = hostKind(hosts, host);
  const origin = kind === "status" ? hosts.status! : kind === "app" ? hosts.app : hosts.site;
  return { rules, sitemap: `${origin}/sitemap.xml`, host: origin };
}
