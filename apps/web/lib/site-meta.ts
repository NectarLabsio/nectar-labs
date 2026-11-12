// Canonical URLs per host (WO-34a §5, WO-62b). Server only: reads SITE_URL / APP_URL / STATUS_URL. Local mode: only the shared
// OG/Twitter text and image (relative image, no canonical, no metadataBase — metadata exactly as before WO-62b plus twitter).
// F-460: metadataBase in each route's metadata; a relative `./` canonical / og:url resolves against the route's pathname
// (next/dist/lib/metadata/resolvers/resolve-url.js resolveRelativeUrl). A page's `openGraph` replaces its layout's whole object, so
// every helper returns the full OG and Twitter blocks.
import type { Metadata } from "next";
import { readHosts } from "./hosts";

type HostMeta = Pick<Metadata, "metadataBase" | "alternates" | "openGraph" | "twitter">;

const TITLE = "Nectar Labs";
const OG_DESCRIPTION = "Committed buyers. Higher limits. NEAR testnet, mock collateral.";
// Favicon and OG image: packages/ui/logo artwork already copied to public/brand (no new artwork).
const IMAGE = "/brand/mark-256.png";

function meta(base: string | null, canonical: string): HostMeta {
  const openGraph = { title: TITLE, description: OG_DESCRIPTION, siteName: TITLE, images: [IMAGE], ...(base ? { url: canonical } : {}) };
  const twitter = { card: "summary" as const, title: TITLE, description: OG_DESCRIPTION, images: [IMAGE] };
  if (!base) return { openGraph, twitter };
  return { metadataBase: new URL(base), alternates: { canonical }, openGraph, twitter };
}

/** Root layout: app routes are canonical on APP_URL; `./` resolves against each request's pathname. */
export function appMetadata(): HostMeta {
  return meta(readHosts()?.app ?? null, "./");
}

/** Landing-only routes (/, /about, /legal/*, /security, /changelog, /brand, /talk): canonical on SITE_URL. */
export function landingMetadata(): HostMeta {
  return meta(readHosts()?.site ?? null, "./");
}

/** /status: canonical on the STATUS_URL root when set (served there through the proxy rewrite), else a landing route on SITE_URL. */
export function statusMetadata(): HostMeta {
  const h = readHosts();
  if (h?.status) return meta(h.status, "/");
  return landingMetadata();
}
