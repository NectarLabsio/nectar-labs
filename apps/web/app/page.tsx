import Link from "next/link";
import { LandingStats } from "@/components/LandingLive";
import { CramerFormula } from "@/components/Formula";
import { docsHref } from "@/lib/env";

// Ported from landing/index.html. The hero card is an illustrative example and is labelled as such;
// every other number on the site comes from a view call.
export default function Home() {
  return (
    <>
      <header className="hero" id="top">
        <div className="wrap">
          <div className="copy">
            <span className="label rise">Committed exit liquidity for thin markets</span>
            <h1 className="rise">
              Committed buyers.
              <br />
              Higher limits.
            </h1>
            <p className="lead rise">
              Escrowed, time-committed market-maker quotes turn thin-exit collateral into borrowing power on NEAR. Borrowers pay a premium; the buyers who stand behind
              the loan earn it.
            </p>
            <div className="cta rise">
              <Link className="btn primary" href="/feed">Explore the Feed</Link>
              <Link className="btn" href="/borrow">Preview a borrow</Link>
              <Link className="btn" href="/quote/new">Post a quote</Link>
            </div>
            <p className="fine">Keeper holds no funds · every transaction previewed as its exact msg · NEAR testnet with mock collateral</p>
          </div>
          <div className="card limitcard" role="group" aria-label="Illustrative limit example for NVDAx">
            <div className="kv">
              <span className="label">NVDAx · mock · example</span>
              <span className="badge mock">illustrative values</span>
            </div>
            <div className="rowx">
              <div className="kv"><span>Static limit (base LTV)</span><b className="num">40 %</b></div>
              <div className="bar"><i style={{ width: "40%" }} /></div>
            </div>
            <div className="rowx">
              <div className="kv"><span>Nectar limit, session open</span><b className="num accent">62 %</b></div>
              <div className="bar nectar"><i style={{ width: "62%" }} /></div>
            </div>
            <div className="rowx">
              <div className="kv"><span>Nectar limit, weekend</span><b className="num">48.75 %</b></div>
              <div className="bar nectar"><i style={{ width: "48.75%" }} /></div>
            </div>
            <table className="num">
              <tbody>
                <tr><td>Collateral value V<sub>c</sub></td><td>$100,000</td></tr>
                <tr><td>Committed capacity Q<sub>c</sub></td><td>$65,000</td></tr>
                <tr><td>DEX depth D<sub>c</sub> (session only)</td><td>$3,900</td></tr>
                <tr><td>Haircut h<sub>c</sub></td><td>10 % open · 25 % weekend</td></tr>
                <tr><td>Borrower premium</td><td>300 bps above static · 70 % to buyers</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </header>

      <LandingStats />

      <section className="sec" id="how">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">Why limits are low, and what changes</span>
            <h2>Lenders price the exit, not the asset.</h2>
            <p className="lead">
              A tokenized stock may trade at fair value all week and have no buyer on Saturday night. Lending protocols respond with low LTV because the liquidity they
              would sell into can leave at any moment. Nectar Labs replaces that revocable depth with escrowed quotes that cannot leave without notice, and lets the
              limit follow the commitment.
            </p>
          </div>
          <div className="grid-2">
            <div className="card tint">
              <span className="label">Cramér limit</span>
              <div className="eq" style={{ marginTop: 10 }}><CramerFormula /></div>
              <p className="small" style={{ marginTop: 12 }}>
                Q<sub>c</sub> is the sum of live Pappus quote remainders for the asset. It drops the moment a buyer gives notice, so new loans never lean on exiting
                liquidity while open loans stay backed through the notice window. When the market session is closed, D<sub>c</sub> counts for nothing and the weekend
                haircut applies.
              </p>
            </div>
            <div className="card">
              <span className="label">Pappus quote</span>
              <ul className="small" style={{ margin: "10px 0 0", paddingLeft: 16, display: "grid", gap: 6 }}>
                <li>A buyer escrows USDC in the contract and names an asset and a worst-case discount (<code>max_discount_bps</code>).</li>
                <li>A notice period (7 days minimum) must pass between <code>initiate_quote_withdrawal</code> and <code>complete_quote_withdrawal</code>.</li>
                <li>Borrowers&apos; premiums accrue to the quote through an O(1) fee index; fees are claimable any time.</li>
                <li>When a position fails, the buyer takes collateral at no worse than the discount ceiling they set.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="sec alt" id="roles">
        <div className="wrap">
          <div className="sec-head"><span className="label">Three roles, one ledger</span><h2>Who uses it</h2></div>
          <div className="roles">
            <div className="card role">
              <span className="label">Buyers · market makers</span>
              <div className="big num">≤ 250 bps</div>
              <p className="small">Get paid to hold a bounded, time-limited bid at a discount ceiling you choose.</p>
              <ul><li>Escrowed USDC, notice period you choose (7 d minimum)</li><li>70 % of every borrower premium</li><li>Fees claimable any time</li></ul>
              <Link className="btn sm" href="/quote/new">Post a quote</Link>
            </div>
            <div className="card role">
              <span className="label">Borrowers</span>
              <div className="big num">−5 / −10 / −20 %</div>
              <p className="small">Lock tokenized stock, borrow USDC at the committed limit, and see your health under price shocks before you sign.</p>
              <ul><li>Every transaction previewed as the exact <code>msg</code></li><li>Pre-liquidation sells to a buyer, not a DEX</li><li>Repay any time</li></ul>
              <Link className="btn sm" href="/borrow">Preview a borrow</Link>
            </div>
            <div className="card role">
              <span className="label">Curators</span>
              <div className="big num">per asset</div>
              <p className="small">Base and max LTV, haircuts in and out of session, limit premium, pre-liquidation band, oracle source and notice minimum.</p>
              <ul><li>Owner-only, every change previewed</li><li>Pause and oracle override</li><li>DAO and timelock before any mainnet (roadmap)</li></ul>
              <Link className="btn sm" href="/console">Open the console</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" id="settle">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">Settlement</span>
            <h2>No trusted keeper</h2>
            <p className="lead">The keeper only passes a position id. The contract checks the oracle, picks quotes in order of discount ceiling and settles; nothing the keeper sends is priced or signed without the contract rebuilding it.</p>
          </div>
          <div className="steps">
            <div className="card step"><span className="k">01 · FLAG</span><h3>Health falls</h3><p className="small">Any keeper calls <code>trigger_preliquidation(position_id)</code> with a function-call key. No deposit, no price.</p><span className="who">nectar-core · NEAR testnet</span></div>
            <div className="card step"><span className="k">02 · PRICE</span><h3>Discount, bounded</h3><p className="small">Today each quote settles at its own <code>max_discount_bps</code>. A TEE-priced discount is on the roadmap and will be labelled when live.</p><span className="who">static ceiling · disclosed</span></div>
            <div className="card step"><span className="k">03 · SETTLE</span><h3>Buyer takes collateral</h3><p className="small">Up to 8 quotes, lowest ceiling first, then oldest. Escrow repays the debt; the buyer receives the units.</p><span className="who">nectar-core · NEAR testnet</span></div>
            <div className="card step"><span className="k">04 · RECORD</span><h3>Events on chain</h3><p className="small">Every step emits a NEP-297 event (<code>preliq_triggered</code>, <code>settled_near</code>) that the Feed reads.</p><span className="who">Nectar Feed</span></div>
          </div>
          <div className="built" style={{ marginTop: 24 }}>
            <span className="label">Built on</span>
            <span className="badge">NEAR</span><span className="badge">NEP-141</span><span className="badge">NEP-297</span><span className="badge">near-api-js</span>
          </div>
        </div>
      </section>

      <section className="sec alt" id="evidence">
        <div className="wrap">
          <div className="sec-head"><span className="label">Security and privacy</span><h2>What you do not have to trust</h2></div>
          <div className="trust">
            <div className="card"><h3>The keeper</h3><p className="small" style={{ marginTop: 8 }}>Holds a function-call key limited to settlement methods. Cannot attach deposits, cannot choose prices.</p></div>
            <div className="card"><h3>The price</h3><p className="small" style={{ marginTop: 8 }}>Stale oracle reads are rejected; the UI shows the source and age. Owner oracle on testnet, disclosed as such.</p></div>
            <div className="card"><h3>Your data</h3><p className="small" style={{ marginTop: 8 }}>Analytics load only after consent; wallet addresses are never joined to IPs.</p></div>
          </div>
          <p className="small dim" style={{ marginTop: 20 }}>
            Unaudited testnet software; mock collateral. Commands, outputs and explorer links are recorded on the <a className="link" href={docsHref("project/evidence")}>Evidence</a> page.
          </p>
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap">
          <div className="sec-head"><span className="label">FAQ</span><h2>Questions market makers and borrowers ask</h2></div>
          <div className="faq">
            <details><summary>Is any of this on mainnet?</summary><p>No. NEAR testnet only, with mock USDC and mock NVDAx. Mainnet needs an audit, a DAO owner with a timelock and real tokenized-equity routes.</p></details>
            <details><summary>Why mock collateral?</summary><p>No tokenized equity exists on NEAR testnet. The mock token has the same interface (NEP-141, 6 decimals), and every page says &quot;mock&quot; where you would first meet it.</p></details>
            <details><summary>Can the keeper steal anything?</summary><p>No. It cannot attach deposits or pass prices; the contract re-checks the trigger condition against its own oracle state.</p></details>
            <details><summary>Why would a market maker commit?</summary><p>Because a bounded, time-limited bid at a discount they chose is paid for by borrower premiums.</p></details>
            <details><summary>Where is the code?</summary><p>Open source, MIT. <code>pnpm demo:testnet</code> reads the live contract without any keys.</p></details>
          </div>
        </div>
      </section>
    </>
  );
}
