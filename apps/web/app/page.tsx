import Link from "next/link";
import type { ReactNode } from "react";
import type { FeatureName, Features } from "@nectar/sdk";
import { LandingStats, LiveLimitCard } from "@/components/LandingLive";
import { CramerFormula } from "@/components/Formula";
import { ShieldFeeBps } from "@/components/Shields";
import { docsHref } from "@/lib/env";
import { getPublicConfig } from "@/lib/config.server";

// Landing v7 (addendum §10; the bundle's landing/index.html v7 is not in the repo, D-017).
// Module sections carry data-feature="<name>" and render only when config.yaml `features.<name>` is true; the orchestrator
// flips a flag when that module's gate passes. With every flag off the page reads complete: hero, live card, how it works, FAQ, footer.
// Copy rules: never "insurance", never "without liquidations"; testnet and mock collateral disclosed.

function Module({ name, features, children, className = "sec", id }: { name: FeatureName; features: Features; children: ReactNode; className?: string; id?: string }) {
  if (!features[name]) return null;
  return (
    <section className={className} id={id} data-feature={name}>
      {children}
    </section>
  );
}

function On({ name, features, children }: { name: FeatureName; features: Features; children: ReactNode }) {
  return features[name] ? <div data-feature={name}>{children}</div> : null;
}

/** Position Note preview: the layout of the contract-rendered SVG (WO-22), drawn here in theme tokens and labelled as a preview. */
function NotePreview() {
  const t = { bg: { fill: "var(--bg)" }, line: { stroke: "var(--border-strong)", fill: "none" }, acc: { fill: "var(--accent)" }, head: { fill: "var(--heading)" }, dim: { fill: "var(--dim)" }, track: { fill: "var(--surface-2)" } };
  const metrics: Array<[string, string]> = [["LTV", "48 %"], ["HEALTH", "1.35"], ["DEBT", "$4,800"], ["BACKING", "Q + R"]];
  return (
    <svg className="note-preview" viewBox="0 0 600 360" role="img" aria-label="Position Note preview: a loan note showing LTV, health, debt and backing">
      <rect x="0.5" y="0.5" width="599" height="359" rx="14" style={{ ...t.bg, stroke: "var(--border-strong)" }} />
      <text x="32" y="52" style={{ ...t.acc, font: "600 14px var(--font-mono)", letterSpacing: ".12em" }}>LOAN NOTE · PREVIEW</text>
      <text x="32" y="96" style={{ ...t.head, font: "700 34px var(--font-display)" }}>NVDAx #42</text>
      {metrics.map(([k, v], i) => (
        <g key={k} transform={`translate(${32 + i * 138} 150)`}>
          <text y="0" style={{ ...t.dim, font: "12px var(--font-mono)", letterSpacing: ".1em" }}>{k}</text>
          <text y="30" style={{ ...t.head, font: "600 22px var(--font-mono)" }}>{v}</text>
        </g>
      ))}
      <rect x="32" y="230" width="536" height="10" rx="5" style={t.track} />
      <rect x="32" y="230" width="257" height="10" rx="5" style={t.acc} />
      <line x1="32" y1="282" x2="568" y2="282" style={t.line} />
      <text x="32" y="318" style={{ ...t.dim, font: "12px var(--font-mono)" }}>STATUS OPEN · nectar-core · testnet · mock collateral</text>
    </svg>
  );
}

export default function Home() {
  const { features } = getPublicConfig();
  const hub = features.solana_remote || features.base;
  return (
    <>
      <header className="hero" id="top">
        <div className="wrap">
          <div className="copy">
            <span className="label rise">Committed buyers behind every loan</span>
            <h1 className="rise">Borrow against stocks without fire-sales</h1>
            <p className="lead rise">
              Lock tokenized stock and borrow USDC at a limit backed by market makers who escrowed their bids in advance. If a loan has to unwind, the collateral goes to
              a committed buyer at a discount they set, not into a thin order book on a Saturday night.
            </p>
            <div className="cta rise">
              <Link className="btn primary" href="/borrow">Preview a borrow</Link>
              <Link className="btn" href="/feed">Explore the Feed</Link>
              <Link className="btn" href="/quote/new">Post a quote</Link>
            </div>
            <p className="fine">NEAR testnet · mock collateral (NVDAx) · every transaction previewed as its exact msg, gas and fees · unaudited</p>
          </div>
          <LiveLimitCard />
        </div>
      </header>

      <LandingStats />

      <section className="sec" id="how">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">How it works</span>
            <h2>Lenders price the exit, not the asset.</h2>
            <p className="lead">
              A tokenized stock can trade at fair value all week and have no buyer when its market is shut. Lenders answer with low limits because the liquidity they would
              sell into can leave at any moment. Nectar Labs replaces that revocable depth with escrowed quotes that cannot leave without notice, and lets the limit follow
              the commitment.
            </p>
          </div>
          <div className="steps">
            <div className="card step"><span className="k">01 · COMMIT</span><h3>Buyers escrow quotes</h3><p className="small">A market maker escrows USDC for an asset with a worst-case discount and a notice period of at least 7 days.</p><span className="who">Pappus quote · nectar-core</span></div>
            <div className="card step"><span className="k">02 · LIMIT</span><h3>The limit follows the commitment</h3><p className="small">Committed quotes, the Nectar Reserve and verified DEX depth set one capacity shared by every loan in the asset.</p><span className="who">Cramér limit</span></div>
            <div className="card step"><span className="k">03 · WEEKEND</span><h3>Weekend parameters</h3><p className="small">Outside the market session, DEX depth counts for nothing and the weekend haircut applies. The badge on every asset says which set is in force and why.</p><span className="who">session guard</span></div>
            <div className="card step"><span className="k">04 · SETTLE</span><h3>A buyer, not a DEX</h3><p className="small">If health falls, any keeper passes a position id. The contract repays the debt from escrow and the buyer takes collateral at no worse than their ceiling.</p><span className="who">pre-liquidation · NEP-297 events</span></div>
          </div>
          <div className="grid-2" style={{ marginTop: 20 }}>
            <div className="card tint">
              <span className="label">Cramér limit</span>
              <div className="eq" style={{ marginTop: 10 }}><CramerFormula /></div>
              <p className="small" style={{ marginTop: 12 }}>
                Q<sub>c</sub> committed quotes, R<sub>c</sub> Nectar Reserve, D<sub>c</sub> verified DEX depth, h<sub>c</sub> haircut. Q<sub>c</sub> drops the moment a
                buyer gives notice, so new loans never lean on exiting liquidity while open loans stay backed through the notice window.
              </p>
            </div>
            <div className="card">
              <span className="label">Fees, before you sign</span>
              <ul className="small" style={{ margin: "10px 0 0", paddingLeft: 16, display: "grid", gap: 6 }}>
                <li>Limit premium on the amount above the static limit, 70 % of it to the buyers behind the loan.</li>
                <li>The sign preview lists every fee and the total, then the exact <code>msg</code>, gas and deposit. Nothing is sent silently.</li>
                <li>Repay any time. Health under −5 / −10 / −20 % shocks is shown before you sign.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <Module name="shields" features={features} className="sec alt" id="shields">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">Shields</span>
            <h2>A weekend-safe limit with committed buyers behind it</h2>
            <p className="lead">A Shield is a normal loan sized at the weekend limit for a fixed window, so the limit cannot be cut halfway through. Inside the window only committed buyers can settle it.</p>
          </div>
          <div className="module-grid">
            <div className="card role"><span className="label">Weekend Shield</span><div className="big num"><ShieldFeeBps kind="Weekend" /></div><p className="small">Friday close to Monday 09:30 New York time. Sized at the weekend limit even while the market is open. From $5 on testnet.</p></div>
            <div className="card role"><span className="label">Event Shield</span><div className="big num"><ShieldFeeBps kind="Event" /></div><p className="small">A curator-set window around an event such as earnings, at most 72 h, at weekend parameters from the start.</p></div>
            <div className="card role"><span className="label">Zap and borrow</span><div className="big num">dry quote</div><p className="small">Testnet: get demo NVDAx from the faucet, next to the dry 1Click quote mainnet would run. Then borrow.</p></div>
          </div>
          <p style={{ marginTop: 16 }}><Link className="link" href="/shield">Open a Shield</Link></p>
        </div>
      </Module>

      <Module name="reserve" features={features} id="reserve">
        <div className="wrap">
          <div className="card tint row between">
            <div className="stack-sm">
              <span className="label">Nectar Reserve</span>
              <h3>Be a buyer from $10</h3>
              <p className="small">One pooled buyer per asset that fills after every quote. Earn a share of premiums; the page shows realised trailing APR and never promises a rate. 7-day notice to exit.</p>
            </div>
            <Link className="btn primary" href="/reserve">Deposit to the Reserve</Link>
          </div>
        </div>
      </Module>

      {features.pay_to || features.profit_lock ? (
        <section className="sec" id="spend">
          <div className="wrap">
            <div className="grid-2">
              <On name="pay_to" features={features}>
                <div className="card stack-sm">
                  <span className="label">Spend without selling</span>
                  <h3>Pay a merchant from a stock-backed loan</h3>
                  <p className="small">Name a merchant account and memo when you borrow; the net proceeds go straight to them. A failed transfer waits for you as claimable USDC.</p>
                  <Link className="btn sm" href="/borrow">Borrow and pay</Link>
                </div>
              </On>
              <On name="profit_lock" features={features}>
                <div className="card stack-sm">
                  <span className="label">Profit-Lock</span>
                  <h3>Close a loan by selling just enough</h3>
                  <p className="small">A healthy borrower sells only the units needed to repay to committed buyers who opted in, at a named discount, and keeps the rest debt-free. 50 bps.</p>
                </div>
              </On>
            </div>
          </div>
        </section>
      ) : null}

      <Module name="notes" features={features} className="sec alt" id="notes">
        <div className="wrap grid-2">
          <div className="sec-head">
            <span className="label">Position Notes</span>
            <h2>Every loan, quote and Reserve share is a note</h2>
            <p className="lead">The contract renders each note as an SVG from numbers only: LTV, health, debt and backing for a loan. Share it with a link you click yourself.</p>
            <p><Link className="link" href="/notes">See the notes</Link></p>
          </div>
          <NotePreview />
        </div>
      </Module>

      {hub ? (
        <section className="sec" id="hub" data-feature={features.solana_remote ? "solana_remote" : "base"}>
          <div className="wrap">
            <div className="sec-head">
              <span className="label">One hub, remote collateral</span>
              <h2>NEAR keeps the books; the collateral can stay home</h2>
              <p className="lead">A remote loan pays out only after an attested read proves the collateral sits in the vault under the key NEAR derives for that position.</p>
            </div>
            <div className="hub">
              <div className="card node"><span className="label">Hub</span><h3>NEAR testnet</h3><p className="small">Limits, quotes, fees, settlement decisions and Chain Signatures.</p></div>
              <span className="label" aria-hidden="true">⬡ ⬡ ⬡</span>
              <div className="spokes">
                <On name="solana_remote" features={features}><div className="card node"><span className="label">Spoke</span><h3>Solana devnet</h3><p className="small">Vault program; Ed25519-signed settle and release.</p></div></On>
                <On name="base" features={features}><div className="card node"><span className="label">Spoke</span><h3>Base Sepolia</h3><p className="small">Vault contract; secp256k1-signed settle and release.</p></div></On>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <Module name="agent_skill" features={features} className="sec alt" id="agents">
        <div className="wrap grid-2">
          <div className="sec-head">
            <span className="label">Agent channel</span>
            <h2>One MCP call opens a protected loan</h2>
            <p className="lead">
              <code>open_protected_stock_loan</code> returns the unsigned call and a preview of both limits and every fee. The agent signs with its own key; the MCP server
              never holds one. Registered referrers earn half the origination fee.
            </p>
            <p><Link className="link" href="/agents">Agent quick start</Link></p>
          </div>
          <div className="stack">
            <pre className="codeblock">{`open_protected_stock_loan({
  account_id, collateral: "NVDAx",
  units, borrow_usd, pay_to?, referrer?
})`}</pre>
            <On name="x402" features={features}>
              <div className="card small">Paid data with stock-backed credit: the Feed export is an x402 route priced in mock USDC on testnet.</div>
            </On>
          </div>
        </div>
      </Module>

      <section className="sec alt" id="evidence">
        <div className="wrap">
          <div className="sec-head"><span className="label">Security and privacy</span><h2>What you do not have to trust</h2></div>
          <div className="trust">
            <div className="card"><h3>The keeper</h3><p className="small" style={{ marginTop: 8 }}>Holds a function-call key limited to settlement methods. Cannot attach deposits, cannot choose prices.</p></div>
            <div className="card"><h3>The price</h3><p className="small" style={{ marginTop: 8 }}>Stale oracle reads are rejected and a stale price puts the asset on weekend parameters. The UI shows the source and age; owner oracle on testnet, disclosed.</p></div>
            <div className="card"><h3>Your data</h3><p className="small" style={{ marginTop: 8 }}>Analytics load only after consent; wallet addresses are never joined to IPs.</p></div>
          </div>
          <p className="small dim" style={{ marginTop: 20 }}>
            Unaudited testnet software; mock collateral. Commands, outputs and explorer links are recorded on the <a className="link" href={docsHref("project/evidence")}>Evidence</a> page.
          </p>
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap">
          <div className="sec-head"><span className="label">FAQ</span><h2>Questions borrowers and market makers ask</h2></div>
          <div className="faq">
            <details><summary>What is a fire-sale, and how does this avoid one?</summary><p>A fire-sale is collateral dumped into whatever liquidity is left when a loan fails. Here a failing loan is pre-liquidated to a buyer who escrowed USDC in advance and set the worst discount they will take. Loans can still be pre-liquidated; the sale just has a committed buyer.</p></details>
            <details><summary>What changes on weekends?</summary><p>Outside the market session the asset runs on weekend parameters: verified DEX depth counts 0 and the weekend haircut applies. Every asset shows &quot;In session&quot; or &quot;Weekend parameters&quot; with the reason.</p></details>
            <details><summary>Is any of this on mainnet?</summary><p>No. NEAR testnet only, with mock USDC and mock NVDAx. Mainnet needs an audit, a DAO owner with a timelock and real tokenized-equity routes.</p></details>
            <details><summary>Why mock collateral?</summary><p>No tokenized equity exists on NEAR testnet. The mock token has the same interface (NEP-141, 6 decimals), and every page says &quot;mock&quot; where you would first meet it.</p></details>
            <details><summary>What do I pay?</summary><p>A limit premium on the amount above the static limit. The sign preview lists every fee and the total before your wallet opens.</p></details>
            <details><summary>Can the keeper steal anything?</summary><p>No. It cannot attach deposits or pass prices; the contract re-checks the trigger condition against its own oracle state.</p></details>
            <details><summary>Where is the code?</summary><p>Open source, MIT. <code>pnpm demo:testnet</code> reads the testnet contract without any keys.</p></details>
          </div>
        </div>
      </section>
    </>
  );
}
