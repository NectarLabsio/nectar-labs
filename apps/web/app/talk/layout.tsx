import type { ReactNode } from "react";
import { landingMetadata } from "@/lib/site-meta";

// The page is a client component; its landing-host canonical lives here (WO-34a).
export const metadata = landingMetadata();

export default function TalkLayout({ children }: { children: ReactNode }) {
  return children;
}
