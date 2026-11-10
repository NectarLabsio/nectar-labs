"use client";
// /agents (PRD v7 §10.5 / §12.1, WO-26a): MCP install, an `open_protected_stock_loan` example (fixture), the x402 walkthrough,
// and referral stats on v2. No "live" claims: the paid flow has not run on testnet yet (gate pending).
import { Badge, Banner, Card, Kv, Table, Tabs } from "@nectar/ui";
import { formatUsdE6 } from "@nectar/sdk";
import { useChain } from "@/components/AppProvider";
import { Gate } from "@/components/states";
import { ReferralStats } from "@/components/ReferralStats";
import example from "@/lib/agents/open-loan-example.json";

const STDIO_RUN = `pnpm -s --filter feed mcp      # MCP over stdio`;
const STDIO = `{
  "mcpServers": {
    "nectar-feed": {
      "command": "pnpm",
      "args": ["-s", "--filter", "feed", "mcp"],
      "cwd": "/path/to/nectar-labs"
    }
  }
}`;
const HTTP_RUN = `pnpm --filter feed start     # Feed REST :8788, MCP :8789`;
const HTTP = `{
  "mcpServers": {
    "nectar-feed": { "url": "http://127.0.0.1:8789/mcp" }
  }
}`;

const TOOLS: Array<[string, string]> = [
  ["open_protected_stock_loan", "Unsigned ft_transfer_call that locks collateral and borrows, plus limits, every fee and health at −5/−10/−20%."],
  ["preview_borrow", "The contract's preview: Cramér limit, static limit, premium, pass or refuse."],
  ["explain_limit", "The limit formula with the contract's current numbers substituted."],
  ["quote_capacity", "Q, R, D, haircut, total debt and headroom for a collateral."],
  ["get_exit_capacity · list_quotes", "Exit capacity and the funded quotes behind it."],
  ["get_note · build_self_settle", "Answer not_available until Position Notes and Profit-Lock ship."],
];

type Health = (typeof example.output.preview.health)[number];

export default function AgentsPage() {
  const { config } = useChain();
  const x402Run = config.features.x402;
  const out = example.output;
  const fees = out.preview.fees;
  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Agent channel</span>
        <h1>Let an agent open the loan</h1>
        <p className="lead">The Nectar Feed MCP server reads public contract views and returns unsigned calls. The agent signs with its own key; the server never holds one. Testnet, mock collateral.</p>
      </div>

      <div className="stack-lg">
        <Card label="Install the MCP server" className="stack" data-testid="agents-install">
          <Tabs
            tabs={[
              { id: "stdio", label: "stdio", content: <div className="stack-sm"><p className="small dim">From a clone of the repository. <code>-s</code> keeps pnpm's banner off stdout, which carries the protocol.</p><pre tabIndex={0} className="codeblock mono" data-testid="mcp-stdio-cmd">{STDIO_RUN}</pre><pre tabIndex={0} className="codeblock mono" data-testid="mcp-stdio">{STDIO}</pre></div> },
              { id: "http", label: "HTTP", content: <div className="stack-sm"><pre tabIndex={0} className="codeblock mono">{HTTP_RUN}</pre><pre tabIndex={0} className="codeblock mono" data-testid="mcp-http">{HTTP}</pre></div> },
            ]}
          />
          <div className="stack-sm">
            <h2 className="small">Tools</h2>
            <ul className="checklist small">
              {TOOLS.map(([n, d]) => (
                <li key={n}>
                  <span className="mono heading-text">{n}</span> <span className="dim">· {d}</span>
                </li>
              ))}
            </ul>
            <p className="small dim">All tools are read-only. Contract reads use <code>CORE_ACCOUNT_ID</code> (default from config) and a testnet RPC.</p>
          </div>
        </Card>

        <Card label="open_protected_stock_loan" actions={<Badge kind="mock">example</Badge>} className="stack" data-testid="agents-example">
          <p className="small dim">Example, not a call made on testnet: the tool's code run against recorded v2 view answers. On testnet the numbers come from the contract at call time.</p>
          <div className="grid-2">
            <div className="stack-sm">
              <h2 className="small">Input</h2>
              <pre tabIndex={0} className="codeblock mono" data-testid="example-input">{JSON.stringify(example.input, null, 2)}</pre>
            </div>
            <div className="stack-sm">
              <h2 className="small">Returned unsigned call</h2>
              <pre tabIndex={0} className="codeblock mono" data-testid="example-call">{JSON.stringify(out.call, null, 2)}</pre>
            </div>
          </div>
          <div className="grid-2">
            <div className="kvs feestack">
              <Kv k="Static limit" v={formatUsdE6(out.preview.limits.static_limit_usd_e6)} />
              <Kv k="Cramér limit" v={formatUsdE6(out.preview.limits.cramer_limit_usd_e6)} />
              <Kv k="Limit premium" v={formatUsdE6(fees.limit_premium_usd_e6)} />
              <Kv k="Origination fee" v={formatUsdE6(fees.origination_fee_usd_e6)} />
              <div className="kv total"><span>Total fees</span><b>{formatUsdE6(fees.total_fees_usd_e6)}</b></div>
              <Kv k="Net proceeds" v={formatUsdE6(fees.net_proceeds_usd_e6)} />
            </div>
            <Table<Health>
              caption="Health after the borrow under price shocks (display only)"
              rows={out.preview.health}
              rowKey={(r) => String(r.shock_bps)}
              columns={[
                { key: "shock", header: "Price move", cell: (r) => (r.shock_bps === 0 ? "now" : `${r.shock_bps / 100}%`) },
                { key: "value", header: "Collateral value", cell: (r) => formatUsdE6(r.value_usd_e6), align: "right" },
                { key: "ltv", header: "LTV", cell: (r) => `${Number(r.ltv_bps) / 100}%`, align: "right" },
                { key: "trig", header: "Pre-liquidation", cell: (r) => (r.triggerable ? "yes" : "no") },
              ]}
            />
          </div>
          <p className="small dim">The agent signs <span className="mono">call</span> from <span className="mono">{out.signer_id}</span> with near-api-js. The contract decides; the preview is advice.</p>
        </Card>

        <Card label="Pay for data with the loan · x402" actions={<Badge kind={x402Run ? "info" : "warn"}>{x402Run ? "testnet" : "not run on testnet yet"}</Badge>} className="stack" data-testid="agents-x402">
          <p className="small dim">The Feed's CSV export is priced at 0.01 mock USDC on <span className="mono">near:testnet</span>. An agent that borrowed above pays the challenge from its own key.</p>
          <ol className="grid-3 checklist" aria-label="x402 steps">
            <li className="card stack-sm">
              <span className="label">1 · 402</span>
              <span className="small"><span className="mono">GET /api/feed/export.csv</span> answers 402 with a <span className="mono">PAYMENT-REQUIRED</span> header: scheme exact, network near:testnet, amount 10000 (0.01 mock USDC), asset <span className="mono">{config.usdc ?? "usdc-mock"}</span>.</span>
            </li>
            <li className="card stack-sm">
              <span className="label">2 · pay 0.01 mock USDC</span>
              <span className="small">The agent signs a NEP-366 delegate action for the USDC transfer. Our facilitator relays it; the relayer can only relay what the payer signed.</span>
            </li>
            <li className="card stack-sm">
              <span className="label">3 · 200</span>
              <span className="small">The server fetches the CSV first, settles the payment, then answers 200 with the file and a <span className="mono">PAYMENT-RESPONSE</span> header naming the transaction. A Feed outage never charges the payer.</span>
            </li>
          </ol>
          {!x402Run ? (
            <Banner tone="info" title="Not run on testnet yet" role="status">
              The paid route and the demo agent are built and tested against mocks. The relayer and agent accounts are not funded yet, so no payment has settled on testnet.
            </Banner>
          ) : null}
        </Card>

        <Gate>
          <ReferralStats />
        </Gate>
      </div>
    </div>
  );
}
