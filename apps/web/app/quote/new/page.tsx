"use client";
import { useState } from "react";
import { Banner, Button, Card, Field, Kv, Segmented, SelectField } from "@nectar/ui";
import { formatDuration, formatUsdE6, parseUnits, secondsToNs, tx, type QuoteView } from "@nectar/sdk";
import { useChain, useSign, useView, useWallet } from "@/components/AppProvider";
import { FaucetLink, Gate } from "@/components/states";
import { useBalance } from "@/components/useBalance";

export default function NewQuotePage() {
  const { config } = useChain();
  const { accountId } = useWallet();
  const sign = useSign();
  const [key, setKey] = useState(config.collaterals[0]?.key ?? "");
  const col = config.collaterals.find((c) => c.key === key) ?? config.collaterals[0];
  const [amountIn, setAmountIn] = useState("");
  const [disc, setDisc] = useState(config.quotes.default_max_discount_bps);
  const presets = config.quotes.notice_presets_s.filter((s) => s >= config.quotes.min_notice_period_s);
  const [notice, setNotice] = useState(String(presets[0] ?? config.quotes.min_notice_period_s));
  let amount: bigint | null = null;
  try {
    amount = amountIn.trim() ? parseUnits(amountIn, 6) : null;
  } catch {
    amount = null;
  }
  const bal = useBalance(config.usdc);
  const quotes = useView<QuoteView[]>(col ? (v) => v.listQuotes(col.symbol, 0, config.limits.max_quotes_per_asset) : null, [col?.symbol]);
  const capReached = (quotes.data?.length ?? 0) >= config.limits.max_quotes_per_asset;
  const min = BigInt(config.quotes.min_quote_usd_e6);
  const amountErr = amountIn && !amount ? "Enter a positive number" : amount !== null && amount < min ? `Minimum ${formatUsdE6(min, 0)}` : amount !== null && bal.data !== undefined && amount > bal.data ? "More than your USDC balance" : null;
  const discErr = disc < 0 || disc > 10_000 ? "0–10000 bps" : null;
  const ok = Boolean(accountId && config.usdc && config.core && col && amount && !amountErr && !discErr && !capReached);

  const submit = async () => {
    if (!config.usdc || !config.core || !col || !amount) return;
    await sign(tx.fundQuote(config.usdc, config.core, amount.toString(), { collateral: col.symbol, max_discount_bps: disc, notice_period_ns: secondsToNs(Number(notice)), buyer_remote_recipient: null }), { success: "Quote funded" });
    bal.reload();
    quotes.reload();
  };

  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Pappus quote</span>
        <h1>Post a funded quote</h1>
        <p className="lead">Escrow mock USDC behind a bid on a collateral, at no worse than your discount ceiling. Leaving takes a notice period; while funded, you earn {config.feeSplit.buyers_bps / 100} % of borrower premiums.</p>
      </div>
      <Gate wallet action="fund a quote" blockOnPause>
        <div className="grid-2">
          <Card label="Quote">
            <div className="stack">
              <SelectField label="Collateral" value={key} onChange={setKey} options={config.collaterals.map((c) => ({ value: c.key, label: `${c.symbol} (mock)` }))} />
              <Field label="Amount" inputMode="decimal" value={amountIn} onChange={(e) => setAmountIn(e.target.value)} unit="USDC" error={amountErr ?? undefined}
                hint={bal.data !== undefined ? `Balance ${formatUsdE6(bal.data)} · minimum ${formatUsdE6(min, 0)}` : `Minimum ${formatUsdE6(min, 0)}`} />
              <Field label="Max discount" type="number" value={disc} onChange={(e) => setDisc(Number(e.target.value))} unit="bps" error={discErr ?? undefined} hint="Worst price you accept below the oracle at settlement." />
              <Segmented label="Notice period" value={notice} onChange={setNotice} options={presets.map((s) => ({ value: String(s), label: formatDuration(s) }))} />
              {accountId && bal.data === 0n ? <FaucetLink token="USDC (mock)" /> : null}
              {capReached ? <Banner tone="warn" title="Quote cap reached">{config.limits.max_quotes_per_asset} live quotes on this asset. Funding now would be refunded in full.</Banner> : null}
              <Button variant="primary" disabled={!ok} onClick={submit}>Fund quote</Button>
            </div>
          </Card>
          <Card label="What you sign">
            <div className="kvs">
              <Kv k="Token" v={config.usdc ?? "—"} />
              <Kv k="Call" v="ft_transfer_call → nectar-core" />
              <Kv k="Deposit" v="1 yoctoNEAR" />
              <Kv k="Live quotes on asset" v={quotes.data ? `${quotes.data.length} / ${config.limits.max_quotes_per_asset}` : "—"} />
            </div>
            <p className="caption" style={{ marginTop: 12 }}>The next screen shows the exact msg JSON, gas and deposit before your wallet opens.</p>
          </Card>
        </div>
      </Gate>
    </div>
  );
}
