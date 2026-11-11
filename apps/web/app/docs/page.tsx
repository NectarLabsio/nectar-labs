import { HostLink as Link } from "@/components/HostLink";

export const metadata = { title: "Docs" };

// Local mode only. Hosted (WO-34a): APP /docs and /docs/* are rewritten to DOCS_ORIGIN (next.config.ts) before this page is reached.
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
