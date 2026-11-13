"use client";
// WO-62c "Get test assets": one wallet request with a faucet_mint per mock token (WO-61 interface). Testnet app only (APP host or local
// mode, never SITE). The contract decides (faucet_status.can_claim); every refusal is said plainly. Mock assets, no value.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NxBadge, Notice } from "@nectar/ui";
import {
  faucetDecision,
  faucetMint,
  faucetNearNeeded,
  formatDuration,
  formatUnitsTrim,
  formatYocto,
  isMethodNotFound,
  rpcTransport,
  spendableYocto,
  tokenTable,
  walletErrorKind,
  type FaucetBlock,
  type FaucetConfigView,
  type TxIntent,
} from "@nectar/sdk";
import { APP_URL, RPC_URL, SITE_URL, txUrl } from "@/lib/env";
import { testAssetsAllowed } from "@/lib/test-assets";
import { useChain, useSignBatch, useWallet } from "./AppProvider";

interface Line { symbol: string; text: string; hash?: string | null; ok: boolean }
type Phase = { kind: "idle" } | { kind: "busy" } | { kind: "done"; lines: Line[] } | { kind: "error"; title: string; body: string; gas?: boolean };

function blockText(b: FaucetBlock, symbol: string, amt: (v: string) => string): string {
  switch (b.kind) {
    case "disabled":
      return `${symbol}: the faucet is switched off on this token.`;
    case "cap":
      return `${symbol}: account cap reached (${amt(b.claimed)} of ${amt(b.cap)} claimed).`;
    case "cooldown":
      return `${symbol}: next claim in ${formatDuration(b.waitS)}.`;
    default:
      return `${symbol}: the token contract refuses a claim right now (can_claim is false).`;
  }
}

/** `onClaimed` (WO-74): called once after a claim batch returns with at least one minted token, so the page can re-read the balances it shows. */
export function TestAssets({ onClaimed }: { onClaimed?: () => void } = {}) {
  const { config, views } = useChain();
  const { accountId, network } = useWallet();
  const signBatch = useSignBatch();
  const pathname = usePathname() ?? "/";
  const [allowed, setAllowed] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  useEffect(() => setAllowed(testAssetsAllowed({ SITE_URL, APP_URL }, window.location.host, pathname)), [pathname]);
  if (!allowed || config.faucet.tokens.length === 0) return null;
  const gasFaucet = config.faucet.gas_faucet;
  const tokens = tokenTable(config);
  const fmt = (token: string, symbol: string) => (v: string) => {
    const d = tokens[token]?.decimals;
    return d === undefined ? `${v} base units` : `${formatUnitsTrim(v, d)} ${symbol}`;
  };

  if (!accountId)
    return (
      <div className="nx-row" style={{ flexWrap: "wrap" }} data-testid="test-assets">
        <span className="nx-k" data-testid="test-assets-connect">Get test assets: connect a wallet first.</span>
        <NxBadge>Mock assets, no value</NxBadge>
      </div>
    );

  async function run() {
    if (!accountId) return;
    setPhase({ kind: "busy" });
    const t = views?.t ?? rpcTransport(RPC_URL);
    views?.invalidate();
    let reads: Array<{ symbol: string; token: string; cfg: FaucetConfigView; d: ReturnType<typeof faucetDecision> }>;
    let spendable: bigint | null = null;
    try {
      reads = await Promise.all(
        config.faucet.tokens.map(async (x) => {
          const [cfg, st] = await Promise.all([t.call<FaucetConfigView>(x.token, "faucet_config", {}), t.call<Parameters<typeof faucetDecision>[1]>(x.token, "faucet_status", { account_id: accountId })]);
          return { symbol: x.symbol, token: x.token, cfg, d: faucetDecision(cfg, st, Date.now()) };
        }),
      );
      const acct = t.viewAccount ? await t.viewAccount(accountId) : undefined;
      spendable = acct === undefined ? null : acct === null ? 0n : spendableYocto(acct);
    } catch (e) {
      const notYet = isMethodNotFound(e);
      setPhase({ kind: "error", title: notYet ? "Faucet not available yet" : "Testnet RPC error", body: notYet ? "The mock token contracts do not answer faucet_status yet. Nothing was sent." : `Could not read the faucet status. Nothing was sent. ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}` });
      return;
    }
    const blocked: Line[] = [];
    const intents: TxIntent[] = [];
    const plan: Array<{ symbol: string; token: string; cfg: FaucetConfigView }> = [];
    for (const r of reads) {
      if (r.d.ok) {
        intents.push(faucetMint(r.token, r.d.deposit, r.symbol));
        plan.push(r);
      } else blocked.push({ symbol: r.symbol, ok: false, text: blockText(r.d.block, r.symbol, fmt(r.token, r.symbol)) });
    }
    if (intents.length === 0) return setPhase({ kind: "done", lines: blocked });
    const need = faucetNearNeeded(intents.map((i) => i.deposit));
    if (spendable !== null && spendable < need)
      return setPhase({ kind: "error", gas: true, title: "Not enough NEAR for storage and gas", body: `You have ${formatYocto(spendable, 4)} to spend; this needs about ${formatYocto(need, 4)} (storage deposits plus gas headroom). Nothing was sent.` });
    const res = await signBatch(intents, {
      title: "Get test assets",
      summary: (
        <p className="small" data-testid="test-assets-summary">
          Mints {plan.map((p) => fmt(p.token, p.symbol)(p.cfg.amount_per_claim)).join(" and ")} to {accountId}. Mock assets, no value.
          {blocked.length ? ` Skipped: ${blocked.map((b) => b.text).join(" ")}` : ""}
        </p>
      ),
    });
    if (res.status === "cancelled") return setPhase({ kind: "idle" });
    if (res.status === "error") {
      const k = walletErrorKind(res.message);
      if (k === "rejected") return setPhase({ kind: "error", title: "Wallet rejected the request", body: "Nothing was sent." });
      if (k === "low-balance") return setPhase({ kind: "error", gas: true, title: "Not enough NEAR for storage and gas", body: "The chain refused the transactions. Nothing was sent." });
      return setPhase({ kind: "error", title: "Wallet error", body: `${res.message.slice(0, 240)} Nothing was sent.` });
    }
    const lines: Line[] = plan.map((p, i) => {
      const o = res.outcomes[i];
      if (o?.ok) return { symbol: p.symbol, ok: true, hash: o.hash, text: `Received ${fmt(p.token, p.symbol)(p.cfg.amount_per_claim)}.` };
      const f = o?.failure ?? "no outcome returned";
      return { symbol: p.symbol, ok: false, hash: o?.hash, text: `${p.symbol} failed${walletErrorKind(f) === "low-balance" ? " (not enough NEAR for storage and gas)" : ""}: ${f.slice(0, 200)}` };
    });
    views?.invalidate();
    setPhase({ kind: "done", lines: [...lines, ...blocked] });
    if (lines.some((l) => l.ok)) onClaimed?.();
  }

  return (
    <div className="nx-stack" style={{ gap: 10 }} data-testid="test-assets">
      <div className="nx-row" style={{ flexWrap: "wrap" }}>
        <button type="button" className="nx-btn quiet sm" onClick={run} disabled={phase.kind === "busy" || network !== "testnet"} aria-busy={phase.kind === "busy" || undefined} data-testid="test-assets-button">
          {phase.kind === "busy" ? "Checking faucet…" : "Get test assets"}
        </button>
        <NxBadge>Mock assets, no value</NxBadge>
      </div>
      <div aria-live="polite">
        {phase.kind === "done" ? (
          <Notice tone={phase.lines.some((l) => l.ok) ? "pos" : "warn"} title={phase.lines.some((l) => l.ok) ? "Test assets sent" : "Nothing to claim right now"} testId="test-assets-result">
            {phase.lines.map((l) => {
              const link = l.hash ? txUrl(l.hash) : null;
              return (
                <span key={l.symbol} style={{ display: "block" }} data-testid={`test-assets-${l.symbol}`}>
                  {l.text}{" "}
                  {l.hash ? link ? <a className="link" href={link} target="_blank" rel="noreferrer noopener">View transaction {l.hash.slice(0, 10)}…</a> : <span className="mono">tx {l.hash}</span> : null}
                </span>
              );
            })}
          </Notice>
        ) : phase.kind === "error" ? (
          <Notice tone="neg" title={phase.title} testId="test-assets-error">
            {phase.body}{" "}
            {phase.gas && gasFaucet ? (
              <a className="link" href={gasFaucet} target="_blank" rel="noreferrer noopener" data-testid="test-assets-gas-faucet">
                Get testnet NEAR from the official faucet
              </a>
            ) : null}
          </Notice>
        ) : null}
      </div>
    </div>
  );
}
