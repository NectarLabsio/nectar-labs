import type { ReactNode } from "react";
import { landingMetadata } from "@/lib/site-meta";

// /legal/* is a landing-host route (WO-34a): canonical on SITE_URL.
export const metadata = landingMetadata();

export default function LegalLayout({ children }: { children: ReactNode }) {
  return children;
}
