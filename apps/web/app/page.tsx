import { Landing } from "@/components/landing/Landing";
import { getSiteConfig } from "@/lib/config.server";
import { getEvidenceRows } from "@/lib/evidence.server";
import { landingMetadata } from "@/lib/site-meta";

export const metadata = landingMetadata();

// Home: landing v2 (landing/index.html, WO-33a). Module sections follow config.yaml `features.*` (components/FeatureGate).
export default function Home() {
  // Remote chains say "Not live yet" unless EVIDENCE shows their gate PASS (WO-34b §8); Base stays "local fork".
  const solanaLive = getEvidenceRows().find((r) => r.label === "Solana settlement")?.state === "pass";
  return <Landing contact={getSiteConfig().contact} solanaLive={solanaLive} />;
}
