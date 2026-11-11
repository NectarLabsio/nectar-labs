import { Landing } from "@/components/landing/Landing";
import { landingMetadata } from "@/lib/site-meta";

export const metadata = landingMetadata();

// Home: landing v2 (landing/index.html, WO-33a). Module sections follow config.yaml `features.*` (components/FeatureGate).
export default function Home() {
  return <Landing />;
}
