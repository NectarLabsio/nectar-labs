import { getSiteConfig, guardContent } from "@/lib/config.server";
import { landingMetadata } from "@/lib/site-meta";

export const metadata = { title: "About", ...landingMetadata() };

// WO-34b §1: what Nectar Labs is (consistent with README's first screen) and who runs it (config.yaml `site.operator`, `site.country`).
const WHAT =
  "Nectar Labs is testnet software for borrowing against thin-exit collateral. Market makers escrow USDC behind time-committed quotes on NEAR. " +
  "Borrowers get a higher limit for a premium that pays those buyers, and if a loan goes bad, the collateral is sold to a committed buyer at a bounded " +
  "discount instead of on a DEX. The collateral is a mock token (mock NVDAx) standing in for tokenized equities. It runs on NEAR testnet only: no mainnet, " +
  "no real funds, and the code is not audited.";

export default function AboutPage() {
  const site = getSiteConfig();
  guardContent("/about", WHAT);
  return (
    <div className="page wrap">
      <div className="prose">
        <span className="label">About</span>
        <h1>About Nectar Labs</h1>
        <p>{WHAT}</p>
        <h2>Who runs it</h2>
        {site.operator ? (
          <p data-testid="operator">
            Operated by {site.operator}
            {site.country ? `, ${site.country}` : ""}.
          </p>
        ) : (
          <p data-testid="operator-missing">Operator not configured in this build.</p>
        )}
      </div>
    </div>
  );
}
