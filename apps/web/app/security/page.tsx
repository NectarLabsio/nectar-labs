import Link from "next/link";

export const metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <div className="page wrap">
      <div className="prose">
        <span className="label">Security</span>
        <h1>Security model</h1>
        <p>Nectar Labs is unaudited software running on NEAR testnet with mock collateral (mock NVDAx, mock USDC). No audit has been performed.</p>
        <h2>What the contract enforces</h2>
        <ul>
          <li>Tokens are credited only when the predecessor is the configured token contract; unknown messages are refunded in full.</li>
          <li>Borrowing requires a fresh oracle; stale reads are rejected. On testnet the oracle is owner-operated and labelled as such.</li>
          <li>The keeper key can call settlement methods only, with no deposit; it cannot set prices.</li>
          <li>Pause stops every money path; views and completed withdrawals stay available.</li>
        </ul>
        <h2>What the web app does</h2>
        <ul>
          <li>Every write shows the exact <code>msg</code> JSON, gas and deposit before the wallet opens.</li>
          <li>No full-access key is ever requested. Analytics load only after consent.</li>
        </ul>
        <p>Report issues: <Link className="link" href="/talk">Talk to us</Link>.</p>
      </div>
    </div>
  );
}
