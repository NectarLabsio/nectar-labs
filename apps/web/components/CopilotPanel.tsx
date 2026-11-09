"use client";
import { useEffect, useState } from "react";
import { Badge, Banner, Button, Card } from "@nectar/ui";
import { verifyBundle, type CopilotBundle, type Verification } from "@/lib/copilot/verify";

type Status = { configured: boolean; model: string } | { error: string } | null;
interface Result { verification: Verification; source: "live" | "fixture"; note?: string }

const newNonce = (): string => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * NEAR AI copilot (WO-17). The server relays the raw exchange; this component recomputes hashes, recovers the
 * EIP-191 signer, checks report_data against its own nonce, and shows the answer only if every required check passed.
 */
export function CopilotPanel() {
  const [status, setStatus] = useState<Status>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fetch("/api/copilot")
      .then((r) => r.json() as Promise<{ configured: boolean; model: string }>)
      .then(setStatus)
      .catch((e: unknown) => setStatus({ error: e instanceof Error ? e.message : String(e) }));
  }, []);

  async function run(fixture: boolean) {
    setBusy(true);
    setError(null);
    setResult(null);
    const nonce = newNonce();
    try {
      const r = await fetch("/api/copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fixture ? { fixture: true } : { nonce, notes }) });
      const j = (await r.json()) as { status: string; error?: string; nonce?: string; bundle?: CopilotBundle; provenance?: { why: string } };
      if (j.status === "key_missing") throw new Error("NEAR AI key missing on this server (NEAR_AI_API_KEY not set).");
      if (!r.ok || !j.bundle) throw new Error(j.error ?? `HTTP ${r.status}`);
      // Live: the nonce we generated. Fixture: the recorded nonce the fixture quote was built with (labelled below).
      const useNonce = fixture ? (j.nonce ?? "") : nonce;
      setResult({ verification: verifyBundle(j.bundle, useNonce), source: j.bundle.source, note: fixture ? j.provenance?.why : undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const configured = status !== null && "configured" in status && status.configured;
  return (
    <Card label="Risk copilot" title="Risk context from your notes" className="copilot">
      <div className="stack">
        <p className="small dim">
          Paste corporate-action or risk notes. The model summarises them without prices or amounts. Answers come from NEAR AI Cloud and are shown only if every
          required check passes. In your browser: EIP-191 signature recovery, request/response hashes, and the report_data/nonce binding. On this server: the Intel
          TDX quote (DCAP, via dcap-qvl) and, in live mode, NVIDIA GPU attestation (NRAS). Testnet, mock collateral.
        </p>
        {status === null ? <p className="small dim" role="status">Checking copilot configuration…</p> : null}
        {status && "error" in status ? <Banner tone="danger" title="Copilot unavailable">{status.error}</Banner> : null}
        {status && "configured" in status && !status.configured ? (
          <Banner tone="warn" title="Key missing">The NEAR AI key is not configured on this server, so live answers are off. You can still run the verifier on the recorded fixture.</Banner>
        ) : null}
        <label className="stack-sm">
          <span className="label">Notes</span>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} placeholder="e.g. split announced, trading halt, thin liquidity outside US hours" disabled={!configured} />
        </label>
        <div className="row">
          <Button variant="primary" disabled={!configured || busy || !notes.trim()} onClick={() => run(false)}>Ask copilot</Button>
          <Button disabled={busy} onClick={() => run(true)}>Run verifier on recorded fixture</Button>
        </div>
        {busy ? <p className="small dim" role="status">Verifying…</p> : null}
        {error ? <Banner tone="danger" title="Copilot error">{error}</Banner> : null}
        {result ? <VerifiedPanel r={result} /> : null}
      </div>
    </Card>
  );
}

function VerifiedPanel({ r }: { r: Result }) {
  const { verification: v } = r;
  return (
    <div className="stack-sm" aria-live="polite">
      <div className="row">
        {v.verified ? <Badge kind="verified">verified in TEE</Badge> : <Badge kind="unverified">unverified — hidden</Badge>}
        {r.source === "fixture" ? <Badge kind="mock">recorded fixture</Badge> : <Badge kind="live">live</Badge>}
      </div>
      {r.note ? <p className="small dim">Fixture: {r.note}. Chat signature made with a throwaway stand-in key; the Intel quote is a public sample with report_data patched, so DCAP must fail.</p> : null}
      <h3 className="small">Verification checks</h3>
      <ul className="checklist" aria-label="Verification checks">
        {v.checks.map((c) => (
          <li key={c.id} className="small">
            <span className={c.status === "passed" ? "pass-text" : c.status === "failed" ? "danger-text" : "dim"}>{c.status}</span>
            {" · "}
            {c.label}
            {c.required ? "" : " (optional)"}
            <span className="dim mono"> — {c.detail}</span>
          </li>
        ))}
      </ul>
      {v.verified && v.answer ? (
        <div className="codeblock copilot-answer">{v.answer}</div>
      ) : (
        <p className="small">Answer hidden: {v.checks.filter((c) => c.required && c.status !== "passed").map((c) => c.label).join("; ")}.</p>
      )}
    </div>
  );
}
