import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isProductionEnv } from "@nectar/sdk";
import { readHosts } from "@/lib/hosts";

// Per-host robots.txt (WO-34a §5). Non-production deployments (previews, local) disallow everything; they also send
// X-Robots-Tag: noindex (next.config.ts). APP robots also points crawlers at the docs sitemap served under /docs.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0]!.trim().toLowerCase();
  const hosts = readHosts();
  const prod = isProductionEnv(process.env);
  const rules: MetadataRoute.Robots["rules"] = prod ? { userAgent: "*", allow: "/", disallow: "/api/" } : { userAgent: "*", disallow: "/" };
  if (!hosts) return { rules, sitemap: `${h.get("x-forwarded-proto") ?? "http"}://${host}/sitemap.xml` };
  if (host === hosts.appHost) return { rules, sitemap: [`${hosts.app}/sitemap.xml`, `${hosts.app}/docs/sitemap.xml`], host: hosts.app };
  return { rules, sitemap: `${hosts.site}/sitemap.xml`, host: hosts.site };
}
