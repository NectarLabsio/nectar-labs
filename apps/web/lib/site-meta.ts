// Canonical URLs per host (WO-34a §5). Server only: reads SITE_URL / APP_URL. Local mode returns {} (metadata exactly as before).
import type { Metadata } from "next";
import { readHosts } from "./hosts";

/** Root layout: app routes are canonical on APP_URL; `./` resolves against each request's pathname. */
export function appMetadata(): Pick<Metadata, "metadataBase" | "alternates"> {
  const h = readHosts();
  return h ? { metadataBase: new URL(h.app), alternates: { canonical: "./" } } : {};
}

/** Landing-only routes (/, /about, /legal/*, /security, /status, /changelog, /brand, /talk): canonical on SITE_URL. */
export function landingMetadata(): Pick<Metadata, "metadataBase" | "alternates"> {
  const h = readHosts();
  return h ? { metadataBase: new URL(h.site), alternates: { canonical: "./" } } : {};
}
