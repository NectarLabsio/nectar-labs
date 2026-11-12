import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Badge, type BadgeKind } from "@nectar/ui";
import { parseGateTable, type GateRow } from "@nectar/sdk";
import { StatusLive } from "@/components/StatusLive";
import { getPublicConfig, keeperHosted } from "@/lib/config.server";
import { SITE_URL, repoHref } from "@/lib/env";
import { statusMetadata } from "@/lib/site-meta";

export const metadata = { title: "Status", ...statusMetadata() };

/** docs/EVIDENCE.md summary table, parsed when this page is prerendered (build time). Missing file: empty table, labelled. */
function gates(): GateRow[] | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const p = join(dir, "docs/EVIDENCE.md");
    if (existsSync(p)) return parseGateTable(readFileSync(p, "utf8"));
    dir = dirname(dir);
  }
  return null;
}

const KIND: Record<GateRow["status"], BadgeKind> = { PASS: "good", FAIL: "danger", FALLBACK: "fallback", PARTIAL: "warn", RECORDED: "info", OTHER: "neutral" };

export default function StatusPage() {
  const c = getPublicConfig();
  const rows = gates();
  const hostedKeeper = keeperHosted();
  const local = !SITE_URL;
  const ids: Array<[string, string | null]> = [
    ["Core contract", c.core],
    ["Keeper account", c.keeper],
    ["Owner", c.owner],
    ["Mock USDC", c.usdc],
    ...c.collaterals.map((x): [string, string | null] => [`Mock ${x.symbol}`, x.token]),
    ...(c.solana.vaultProgram ? [["Solana devnet vault program", c.solana.vaultProgram] as [string, string]] : []),
  ];
  const hosted = ["Web app", "Docs", "Feed indexer", ...(hostedKeeper ? ["Keeper settlement"] : [])];
  const operator = [...(hostedKeeper ? [] : ["Keeper settlement"]), "x402 paid route", "Base local fork"];
  const evidenceHref = repoHref("docs/EVIDENCE.md");
  return (
    <div className="page wrap stack-lg">
      <div className="page-head">
        <span className="label">Status</span>
        <h1>Status</h1>
        <p className="lead">What answers right now, where each part runs, and which gates have passed. NEAR testnet, mock collateral.</p>
      </div>

      <section aria-labelledby="st-live" className="stack">
        <h2 id="st-live">Live checks</h2>
        <StatusLive />
      </section>

      <section aria-labelledby="st-where" className="prose">
        <h2 id="st-where">Where it runs</h2>
        {local ? <p data-testid="status-local">This is a local build: every part below runs on this machine. On the hosted deployment the split is:</p> : null}
        <p><strong>Hosted:</strong> {hosted.join(", ")}.</p>
        <p><strong>On the operator&apos;s machine:</strong> {operator.join(", ")}.</p>
        <p data-testid="settlement-when">
          {hostedKeeper
            ? "Settlement (pre-liquidation triggers and remote-chain relays) runs while the hosted keeper is online."
            : "Settlement (pre-liquidation triggers and remote-chain relays) runs while the operator's keeper is online. When it is offline, settlement waits until it is back."}
        </p>
      </section>

      <section aria-labelledby="st-ids" className="stack-sm">
        <h2 id="st-ids">Contract ids</h2>
        <p className="caption">Source: packages/config/config.yaml.</p>
        <dl className="kv" data-testid="status-ids">
          {ids.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v ? <code>{v}</code> : "Not set"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="st-gates" className="stack-sm">
        <h2 id="st-gates">Gates</h2>
        <p className="caption">
          Source: {evidenceHref ? <a className="link" href={evidenceHref} rel="noreferrer noopener">docs/EVIDENCE.md</a> : "docs/EVIDENCE.md"} summary table, read when this
          page was built. Rows keep the file&apos;s order, superseded runs included.
        </p>
        {!rows || rows.length === 0 ? (
          <p data-testid="gates-missing">docs/EVIDENCE.md was not found when this page was built.</p>
        ) : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Gate results">
            <table className="t" data-testid="status-gates">
              <thead>
                <tr><th scope="col">Gate</th><th scope="col">Result</th><th scope="col">Date (UTC)</th><th scope="col">Evidence</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.gate}-${i}`}>
                    <td>{r.gate}</td>
                    <td><Badge kind={KIND[r.status]}>{r.status === "OTHER" ? "See row" : r.status}</Badge>{r.notes.length ? <span className="caption"> {r.notes.join(", ")}</span> : null}</td>
                    <td>{r.date ?? "n/a"}</td>
                    <td>{r.evidence ? <code>{r.evidence}</code> : "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
