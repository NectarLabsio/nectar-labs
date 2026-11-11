"use client";
// WO-33c: Agents artboard. A replayable run of the four calls (a labelled fixture: the tool's code against recorded view answers, no
// call made on testnet), connect config, tools, referrals. No claims about testnet runs beyond what the x402 flag states.
import { useEffect, useRef, useState } from "react";
import { Banner, NxBadge, Panel, RunStep, TabBar, tabPanelProps } from "@nectar/ui";
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
  ["get_exit_capacity", "Exit capacity for a collateral."],
  ["preview_borrow", "The contract's preview: limit, static limit, premium, pass or refuse."],
  ["list_quotes", "The funded quotes behind the capacity, without buyer identities."],
  ["explain_limit", "The limit formula with the contract's current numbers substituted."],
  ["open_protected_stock_loan", "Unsigned ft_transfer_call that locks collateral and borrows, plus limits, every fee and health under price shocks."],
  ["quote_capacity", "Q, R, D, haircut, total debt and headroom for a collateral."],
  ["get_note", "Answers not_available for now."],
  ["build_self_settle", "Answers not_available for now."],
];

type Transport = "http" | "stdio";
const STEP_MS = 1100;

export default function AgentsPage() {
  const { config } = useChain();
  const x402Run = config.features.x402;
  const out = example.output;
  const fees = out.preview.fees;
  const limits = out.preview.limits;
  const decimals = 6;
  const units = Number(example.input.units) / 10 ** decimals;
  const [progress, setProgress] = useState(4);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(1);
  const [tr, setTr] = useState<Transport>("http");
  const [copied, setCopied] = useState(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const replay = () => {
    timers.current.forEach(clearTimeout);
    setProgress(0);
    setRunning(true);
    setOpen(-1);
    timers.current = [1, 2, 3, 4].map((k) =>
      setTimeout(() => {
        setProgress(k);
        setOpen(k - 1);
        setRunning(k < 4);
      }, k * STEP_MS),
    );
  };
  const conn = tr === "http" ? HTTP : STDIO;
  const copy = () => {
    void navigator.clipboard?.writeText(conn).then(() => setCopied(true), () => undefined);
  };
  const health = out.preview.health
    .map((h) => `${h.shock_bps === 0 ? "now " : `${h.shock_bps / 100}%`.padEnd(4)}  value ${formatUsdE6(h.value_usd_e6)}, LTV ${Number(h.ltv_bps) / 100}%, flagged ${h.triggerable ? "yes" : "no"}`)
    .join("\n  ");
  const steps: Array<{ call: string; summary: string; body: React.ReactNode }> = [
    {
      call: "preview_borrow",
      summary: `Limit ${formatUsdE6(limits.cramer_limit_usd_e6)} for ${units} ${example.input.collateral}. Fits.`,
      body: <pre tabIndex={0} className="nx-code" data-testid="example-preview-borrow">{`preview_borrow({ symbol: "${example.input.collateral}", units: "${example.input.units}", borrow_usd_e6: "${out.preview.borrow_usd_e6}" })\n\n→ { b_c_usd_e6: "${limits.cramer_limit_usd_e6}", static_limit_usd_e6: "${limits.static_limit_usd_e6}",\n    premium_usd_e6: "${fees.limit_premium_usd_e6}", ok: ${out.preview.ok}, reason: ${out.preview.reason === null ? "null" : `"${out.preview.reason}"`} }`}</pre>,
    },
    {
      call: "open_protected_stock_loan",
      summary: "Unsigned ft_transfer_call plus a full preview",
      body: (
        <>
          <pre tabIndex={0} className="nx-code" data-testid="example-input">{JSON.stringify(example.input, null, 2)}</pre>
          <pre tabIndex={0} className="nx-code" data-testid="example-call">{JSON.stringify(out.call, null, 2)}</pre>
          <pre tabIndex={0} className="nx-code" data-testid="example-preview">{`fees:   premium ${formatUsdE6(fees.limit_premium_usd_e6)}, origination ${formatUsdE6(fees.origination_fee_usd_e6)}, total ${formatUsdE6(fees.total_fees_usd_e6)}\nnet:    ${formatUsdE6(fees.net_proceeds_usd_e6)}\nhealth: ${health}`}</pre>
        </>
      ),
    },
    {
      call: "sign with near-api-js",
      summary: "The agent signs with its own key. Loan opened.",
      body: <pre tabIndex={0} className="nx-code">{`// the agent, not the server, signs\naccount.signAndSendTransaction(call)\n\n→ signed from ${out.signer_id}\n  ${formatUsdE6(fees.net_proceeds_usd_e6)} USDC to ${out.signer_id}`}</pre>,
    },
    {
      call: "GET /api/feed/export.csv",
      summary: "402, paid 0.01 mock USDC, then 200",
      body: <pre tabIndex={0} className="nx-code">{`GET /api/feed/export.csv\n→ 402 Payment Required  (0.01 mock USDC, near:testnet)\n\n// pays with a NEP-366 SignedDelegate from its key\nGET /api/feed/export.csv  + signed payment\n→ 200 OK  text/csv`}</pre>,
    },
  ];
  return (
    <div className="nx-page">
      <div className="nx-head-row">
        <div className="nx-stack nx-gap12">
          <h1 className="nx-title">Agents</h1>
          <p className="nx-lede">Give an agent stock-backed credit. It reads limits, opens a protected loan with one call and pays for data with the proceeds. The Feed server never holds a key. Testnet, mock collateral.</p>
        </div>
        <button type="button" className="nx-btn" onClick={replay} disabled={running} data-testid="replay">{running ? "Running" : "Replay the run"}</button>
      </div>

      <div className="nx-split">
        <Panel as="section" aria-label="Example agent run" data-testid="agents-example" style={{ gap: 14 }}>
          <div className="nx-ph"><h2 className="nx-h2">One run, start to finish</h2><NxBadge tone="warn">example</NxBadge></div>
          <p className="nx-k" data-testid="run-label">Example, not a call made on testnet: the tool&apos;s code run against recorded view answers. On testnet the numbers come from the contract at call time. {units} {example.input.collateral}, {formatUsdE6(out.preview.borrow_usd_e6)}.</p>
          {steps.map((s, i) => {
            const state = i < progress ? "done" : running && i === progress ? "now" : "todo";
            return (
              <RunStep key={s.call} n={i + 1} call={s.call} summary={s.summary} state={state} open={open === i && state !== "todo"} onToggle={() => setOpen(open === i ? -1 : i)}>
                {s.body}
              </RunStep>
            );
          })}
          <p className="nx-k">The agent signs <span className="nx-head">call</span> from <span className="nx-head">{out.signer_id}</span>. The contract decides; the preview is advice.</p>
        </Panel>

        <aside className="nx-stack" style={{ gap: 24, minWidth: 0 }}>
          <Panel as="section" aria-label="Connect" data-testid="agents-install" style={{ gap: 14 }}>
            <div className="nx-ph"><h2 className="nx-h2">Connect</h2><NxBadge>Read-only, no keys</NxBadge></div>
            <TabBar<Transport> label="Transport" idBase="mcp" variant="seg" value={tr} onChange={(t) => { setTr(t); setCopied(false); }} tabs={[{ id: "http", label: "HTTP" }, { id: "stdio", label: "Local stdio" }]} />
            <div {...tabPanelProps("mcp", tr)} className="nx-tabpanel" style={{ gap: 10 }}>
              {tr === "http" ? (
                <>
                  <pre tabIndex={0} className="nx-code" data-testid="mcp-http-cmd">{HTTP_RUN}</pre>
                  <pre tabIndex={0} className="nx-code" data-testid="mcp-http">{HTTP}</pre>
                </>
              ) : (
                <>
                  <pre tabIndex={0} className="nx-code" data-testid="mcp-stdio-cmd">{STDIO_RUN}</pre>
                  <pre tabIndex={0} className="nx-code" data-testid="mcp-stdio">{STDIO}</pre>
                  <span className="nx-k">From a clone of the repository. <code>-s</code> keeps pnpm&apos;s banner off stdout, which carries the protocol.</span>
                </>
              )}
            </div>
            <div className="nx-ph"><span className="nx-k">All tools are read-only.</span><button type="button" className="nx-btn quiet sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button></div>
          </Panel>
          <Panel as="section" aria-label="Tools" style={{ gap: 12 }}>
            <h2 className="nx-h2">Tools</h2>
            <div className="nx-tags">
              {TOOLS.map(([n, d]) => (
                <span key={n} title={d}><NxBadge tone={n === "open_protected_stock_loan" ? "pos" : "plain"} className="nx-num">{n}</NxBadge></span>
              ))}
            </div>
            <span className="nx-k">Contract reads use <code>CORE_ACCOUNT_ID</code> (default from config) and a testnet RPC. Each tool returns data or an unsigned call; <code>get_note</code> and <code>build_self_settle</code> answer not_available for now.</span>
          </Panel>
          <Gate>
            <ReferralStats />
          </Gate>
        </aside>
      </div>

      <Panel as="section" aria-label="Pay for data with the loan" data-testid="agents-x402">
        <div className="nx-ph"><h2 className="nx-h2">Pay for data with the loan</h2><NxBadge tone={x402Run ? "info" : "warn"}>{x402Run ? "testnet" : "not run on testnet yet"}</NxBadge></div>
        <p className="nx-k">The Feed&apos;s CSV export is priced at 0.01 mock USDC on <span className="nx-head">near:testnet</span>. An agent that borrowed above pays the challenge from its own key.</p>
        <ol className="nx-grid3" aria-label="x402 steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <li className="nx-well"><b className="nx-strong">1 · 402</b><span className="nx-k"><span className="nx-head">GET /api/feed/export.csv</span> answers 402 with a <span className="nx-head">PAYMENT-REQUIRED</span> header: scheme exact, network near:testnet, amount 10000 (0.01 mock USDC), asset <span className="nx-head">{config.usdc ?? "usdc-mock"}</span>.</span></li>
          <li className="nx-well"><b className="nx-strong">2 · pay 0.01 mock USDC</b><span className="nx-k">The agent signs a NEP-366 delegate action for the USDC transfer. Our facilitator relays it; the relayer can only relay what the payer signed.</span></li>
          <li className="nx-well"><b className="nx-strong">3 · 200</b><span className="nx-k">The server fetches the CSV first, settles the payment, then answers 200 with the file and a <span className="nx-head">PAYMENT-RESPONSE</span> header naming the transaction. A Feed outage never charges the payer.</span></li>
        </ol>
        {!x402Run ? (
          <Banner tone="info" title="Not run on testnet yet" role="status">
            The paid route and the demo agent are built and tested against mocks. The relayer and agent accounts are not funded yet, so no payment has settled on testnet.
          </Banner>
        ) : null}
      </Panel>
    </div>
  );
}
