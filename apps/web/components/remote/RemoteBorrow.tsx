"use client";
// /borrow, Solana path: reserve on NEAR → deposit with Phantom → attested confirmation → Open (WO-31).
import { useEffect, useState } from "react";
import { Banner, Button, Card, FeeStackList, Field, Kv } from "@nectar/ui";
import { MIN_REMOTE_BORROW_USD_E6, SOLANA_DOMAIN_ID, bpsToPct, borrowReasonText, feeStack, formatUsdE6, largestFittingQuoteUsdE6, parseUnits, remotePath, remoteRefusalText, txRemote, type BorrowPreview, type PositionView, type QuoteView } from "@nectar/sdk";
import { useChain, useSign, useView, useWallet } from "@/components/AppProvider";
import { LoadingBlock, RpcErrorBanner } from "@/components/states";
import { RemoteDeposit, RemoteOpenCard, RemoteSteps, ReservationCard, SolanaWalletBlock, isRemote, stepOf, useInterval } from "./RemoteFlow";
import { useSolanaWallet } from "./useSolanaWallet";

const tryParse = (s: string, d: number): bigint | null => {
  try {
    return s.trim() ? parseUnits(s, d) : null;
  } catch {
    return null;
  }
};

function decodeU64Return(b64: string | null): string | null {
  if (!b64) return null;
  try {
    const v: unknown = JSON.parse(atob(b64));
    return typeof v === "string" || typeof v === "number" ? String(v) : null;
  } catch {
    return null;
  }
}

/** The reservation tracker (step 2–4) for one position id. */
export function RemoteTracker({ id }: { id: string }) {
  const p = useView<PositionView | null>((v) => v.getPosition(id), [id]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (p.data !== undefined) setLoadedAt(Date.now());
  }, [p.data]);
  const pos = p.data;
  // Until on_authority stores the key, re-read every 3 s.
  useInterval(p.reload, 3000, Boolean(pos && isRemote(pos) && !pos.remote.authority));
  if (p.error) return <RpcErrorBanner error={p.error} onRetry={p.reload} />;
  if (pos === undefined) return <LoadingBlock />;
  if (!pos || !isRemote(pos)) return <Banner tone="warn" title={`No Solana reservation #${id}`}>nectar-core has no remote position with this id.</Banner>;
  return (
    <div className="stack" data-testid="remote-tracker">
      <RemoteSteps current={stepOf(pos.remote, seen)} />
      <div className="grid-2">
        <ReservationCard pos={pos} />
        {pos.remote.status === "AwaitingDeposit" || pos.remote.status === "Expired" ? (
          <RemoteDeposit pos={pos} onChanged={p.reload} loadedAt={loadedAt} onSeen={setSeen} />
        ) : pos.remote.status === "Open" ? (
          <RemoteOpenCard pos={pos} />
        ) : (
          <Card label="Position">
            <p className="small">
              This position is {pos.remote.status}. <a className="link" href={`/position/${pos.id}`}>Open position #{pos.id}</a>.
            </p>
          </Card>
        )}
      </div>
      <p className="small">
        <a className="link" href={`/position/${pos.id}`}>Position #{pos.id}</a> shows the same status and, after repay, the release.
      </p>
    </div>
  );
}

export function RemoteBorrow() {
  const { config, generation } = useChain();
  const { accountId } = useWallet();
  const sign = useSign();
  const sol = useSolanaWallet();
  const col = config.collaterals[0];
  const [unitsIn, setUnitsIn] = useState("");
  const [borrowIn, setBorrowIn] = useState("");
  const [preLiq, setPreLiq] = useState(col ? Math.round((col.pre_liq_min_bps + col.pre_liq_max_bps) / 2) : 7500);
  const [id, setId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("remote");
    if (r && /^\d+$/.test(r)) setId(r);
  }, []);

  const units = tryParse(unitsIn, config.solana.decimals);
  const borrow = tryParse(borrowIn, 6);
  const preview = useView<BorrowPreview>(col && units && borrow ? (v) => v.previewBorrow(col.symbol, units.toString(), borrow.toString()) : null, [col?.symbol, units?.toString(), borrow?.toString()]);
  const fees = borrow && preview.data ? feeStack(borrow, preview.data, { generation, originationFeeBps: config.v7.origination_fee_bps }) : null;
  const preLiqErr = col && (preLiq < col.pre_liq_min_bps || preLiq > col.pre_liq_max_bps) ? `Between ${bpsToPct(col.pre_liq_min_bps)} and ${bpsToPct(col.pre_liq_max_bps)}` : null;
  // SR-5: a remote loan settles in one leg, so one quote with a recipient on this chain must cover it. nectar-core re-checks this.
  const quotes = useView<QuoteView[]>(col ? (v) => v.listQuotes(col.symbol) : null, [col?.symbol]);
  const largest = quotes.data ? largestFittingQuoteUsdE6(quotes.data, SOLANA_DOMAIN_ID) : null;
  const overCap = borrow !== null && largest !== null && borrow > largest;
  const belowMin = borrow !== null && borrow < MIN_REMOTE_BORROW_USD_E6;
  const depositor = sol.devnet ? sol.address : null;
  const canReserve = Boolean(accountId && config.core && col && units && borrow && preview.data?.ok && !preLiqErr && depositor && !overCap && !belowMin);

  const reserve = async () => {
    if (!config.core || !col || !units || !borrow || !depositor) return;
    setErr(null);
    const out = await sign(txRemote.reserve(config.core, { collateral: col.symbol, units: units.toString(), borrow_usd_e6: borrow.toString(), pre_liq_ltv_bps: preLiq, depositor }), {
      success: "Reserved. Deposit on Solana next",
      summary: (
        <div className="stack-sm">
          <p className="small">
            No collateral moves on NEAR. nectar-core derives a Solana key for this position (path <span className="mono">{remotePath("<id>", config.v7.remote_path_prefix)}</span>) and holds the reservation for 30 minutes. About 0.0057 NEAR of the 0.05 NEAR deposit pays for the record's storage; the rest is refunded when the reservation confirms, is refused or expires. USDC is paid only after the deposit is
            confirmed by an attested read of the vault.
          </p>
          <p className="small">Only a deposit from <span className="addr">{depositor}</span> can confirm this reservation.</p>
          {fees ? <div className="kvs"><Kv k="You receive at confirmation (estimate)" v={formatUsdE6(fees.net_usd_e6)} /></div> : null}
        </div>
      ),
      fees: fees ? { lines: [{ label: "Limit premium", value: formatUsdE6(fees.premium_usd_e6) }, { label: `Origination (${fees.origination_bps} bps)`, value: formatUsdE6(fees.origination_usd_e6) }], total: formatUsdE6(fees.total_usd_e6), note: "Charged at confirmation, from proceeds." } : undefined,
    });
    if (!out) return;
    const newId = out.ok ? decodeU64Return(out.successValue) : null;
    if (!newId) {
      setErr(out.ok ? "The contract did not return a position id." : (remoteRefusalText(out.failure) ?? out.failure ?? "Reservation failed."));
      return;
    }
    setId(newId);
    const u = new URL(window.location.href);
    u.searchParams.set("chain", "solana");
    u.searchParams.set("remote", newId);
    window.history.replaceState(null, "", u.toString());
  };

  if (id) return <RemoteTracker id={id} />;
  return (
    <div className="stack">
      <RemoteSteps current="reserve" />
      <div className="grid-2">
        <Card label="Reserve a Solana-collateral position">
          <div className="stack">
            <p className="small">Your collateral stays on Solana devnet in the nectar_vault program, locked to a key nectar-core derives for this position. Reserve here, then deposit with Phantom within 30 minutes.</p>
            <Field label={`Collateral units on Solana (${col?.symbol ?? ""})`} inputMode="decimal" value={unitsIn} onChange={(e) => setUnitsIn(e.target.value)} unit={col?.symbol} error={unitsIn && !units ? "Enter a positive number" : undefined} hint="Mock tokens on Solana devnet." />
            <Field label="Borrow" inputMode="decimal" value={borrowIn} onChange={(e) => setBorrowIn(e.target.value)} unit="USDC" error={borrowIn && !borrow ? "Enter a positive number" : belowMin ? `The minimum loan is ${formatUsdE6(MIN_REMOTE_BORROW_USD_E6, 0)}` : undefined} />
            <Field label="Pre-liquidation LTV" type="number" value={preLiq} onChange={(e) => setPreLiq(Number(e.target.value))} unit="bps" error={preLiqErr ?? undefined} />
            <SolanaWalletBlock sol={sol} need="commit it as the depositor">
              <div className="kvs"><Kv k="Depositor wallet" v={<span className="addr" data-testid="depositor-wallet">{sol.address}</span>} /></div>
              <p className="caption">nectar-core records this wallet with the reservation. Only a deposit from it can confirm the loan, so deposit from this wallet.</p>
            </SolanaWalletBlock>
            {err ? <Banner tone="danger" title="Reservation failed"><span data-testid="reserve-error">{err}</span></Banner> : null}
            <Button variant="primary" disabled={!canReserve} onClick={reserve}>Reserve on NEAR</Button>
          </div>
        </Card>
        <Card label="Preview" live={Boolean(preview.data)}>
          {!units || !borrow ? <p className="dim">Enter units and an amount to see the limit and fees.</p> : null}
          {preview.error ? <RpcErrorBanner error={preview.error} onRetry={preview.reload} /> : preview.loading ? <LoadingBlock /> : null}
          {preview.data && !preview.data.ok ? <Banner tone="danger" title="Over the limit">{borrowReasonText(preview.data.reason) ?? "Borrow exceeds B_c or the pool."}</Banner> : null}
          {overCap ? <Banner tone="danger" title="Above the largest single quote"><span data-testid="remote-cap-refused">{remoteRefusalText("remote_settle_capacity")}</span></Banner> : null}
          {preview.data ? (
            <div className="kvs" aria-live="polite">
              <Kv k="Limit B_c (contract)" v={formatUsdE6(preview.data.b_c_usd_e6)} />
              {largest !== null ? <Kv k="Largest single quote on Solana" v={<span data-testid="remote-cap">{formatUsdE6(largest)}</span>} /> : null}
              <Kv k="Limits re-checked" v="at confirmation, with a fresh price" />
            </div>
          ) : null}
          {fees ? (
            <div style={{ marginTop: 14 }}>
              <FeeStackList lines={[{ label: "Limit premium", value: formatUsdE6(fees.premium_usd_e6) }, { label: `Origination (${fees.origination_bps} bps of the borrow)`, value: formatUsdE6(fees.origination_usd_e6) }]} total={formatUsdE6(fees.total_usd_e6)} note={`You receive ${formatUsdE6(fees.net_usd_e6)} at confirmation.`} testId="remote-fees" />
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
