import { CopyContact } from "@/components/CopyContact";
import { getSiteConfig, guardContent } from "@/lib/config.server";

export const metadata = { title: "Talk to us" };

// WO-34b §5: no form that pretends to send. The contact comes from config.yaml `site.contact` (TODO-H-LEGAL); null = local-only text.
export default function TalkPage() {
  const site = getSiteConfig();
  const x = site.x_handle ? site.x_handle.replace(/^@/, "") : null;
  guardContent("/talk", `${site.contact ?? ""} ${site.x_handle ?? ""}`);
  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Talk to us</span>
        <h1>Talk to us</h1>
        <p className="lead">Market makers, curators and issuers of tokenized assets: write to us about what you would commit or list. Nectar Labs runs on NEAR testnet with mock collateral.</p>
      </div>
      <div className="prose">
        <h2>Email</h2>
        <CopyContact contact={site.contact} className="row" />
        {x ? (
          <>
            <h2>X</h2>
            <p>
              <a className="link" href={`https://x.com/${encodeURIComponent(x)}`} rel="noreferrer noopener" data-testid="x-handle">
                @{x}
              </a>
            </p>
          </>
        ) : null}
        <p className="caption">Nothing is collected on this page. To report a security issue, see <a className="link" href="/security">Security</a>.</p>
      </div>
    </div>
  );
}
