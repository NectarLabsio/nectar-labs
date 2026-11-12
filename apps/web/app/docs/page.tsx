import { HostLink as Link } from "@/components/HostLink";

export const metadata = { title: "Docs" };

// Local mode (or hosted without DOCS_URL) only. Hosted with DOCS_URL (WO-62b): proxy.ts 308s /docs and /docs/* to the DOCS_URL root first.
export default function DocsPage() {
  return (
    <div className="page wrap">
      <div className="prose">
        <span className="label">Docs</span>
        <h1>Documentation</h1>
        <p>The documentation site lives in <code>apps/docs-site</code>. Its hosted address is not set yet. Run it locally with <code>pnpm --filter docs-site start</code>.</p>
        <p>In this app: <Link className="link" href="/security">Security</Link> · <Link className="link" href="/legal/privacy">Privacy</Link> · <Link className="link" href="/legal/terms">Terms</Link> · <Link className="link" href="/legal/disclaimers">Disclaimers</Link>.</p>
      </div>
    </div>
  );
}
