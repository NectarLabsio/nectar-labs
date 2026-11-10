"use client";
import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Card, FeeStackList, Field, Kv, SelectField, type FeeLine } from "@nectar/ui";
import {
  E18,
  PAY_TO_MEMO_MAX,
  borrowReasonText,
  bpsToPct,
  computeLimit,
  feeStack,
  formatUnits,
  formatUsdE6,
  health,
  isAccountId,
  parseUnits,
  premiumUsdE6,
  shockPrice,
  tx,
  type BorrowPreview,
  type ExitCapacity,
  type FeeStack,
} from "@nectar/sdk";
import { useChain, useFeature, useSign, useView, useWallet } from "@/components/AppProvider";
import { FaucetLink, Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { useBalance } from "@/components/useBalance";
import { CopilotPanel } from "@/components/CopilotPanel";
import { CorporateActionBanner, MultiplierLine, SessionBadge } from "@/components/Session";

const tryParse = (s: string, d: number): bigint | null => {
  try {
    return s.trim() ? parseUnits(s, d) : null;
  } catch {
    return null;
  }
};

/** Fee stack lines (limit premium, origination, referrer share) shared by the preview card and the sign modal. */
function feeLines(f: FeeStack, premiumBps: number, referrer: string | null, v2: boolean): FeeLine[] {
  const lines: FeeLine[] = [
    { label: `Limit premium (${premiumBps} bps above the static limit)`, value: formatUsdE6(f.premium_usd_e6) },
    { label: v2 ? `Origination (${f.origination_bps} bps of the borrow)` : "Origination (the v1 contract charges none)", value: formatUsdE6(f.origination_usd_e6) },
  ];
  if (v2 && referrer) lines.push({ label: `of which to referrer ${referrer}`, value: formatUsdE6(f.referrer_share_usd_e6), sub: true });
  return lines;
}

export default function BorrowPage() {
  const { config, generation } = useChain();
  const { accountId } = useWallet();
  const sign = useSign();
  const payToOn = useFeature("pay_to");
  const refOn = useFeature("referrals");
  const v2 = generation === "v2";
  const [key, setKey] = useState(config.collaterals[0]?.key ?? "");
  const col = config.collaterals.find((c) => c.key === key) ?? config.collaterals[0];
  const [unitsIn, setUnitsIn] = useState("");
  const [borrowIn, setBorrowIn] = useState("");
  const [preLiq, setPreLiq] = useState(col ? Math.round((col.pre_liq_min_bps + col.pre_liq_max_bps) / 2) : 7500);
  const [payToId, setPayToId] = useState("");
  const [payToMemo, setPayToMemo] = useState("");
  const [refParam, setRefParam] = useState<string | null>(null);

  // `?c=<symbol>` picks the collateral (Feed links); `?ref=<account>` becomes the referrer (v2 + features.referrals).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get("c");
    const hit = c ? config.collaterals.find((x) => x.symbol === c || x.key === c) : undefined;
    if (hit) setKey(hit.key);
    const r = q.get("ref");
    if (r) setRefParam(r.trim().toLowerCase());
  }, [config.collaterals]);

  const units = col ? tryParse(unitsIn, col.decimals) : null;
  const borrow = tryParse(borrowIn, 6);
  const refBad = refParam !== null && !isAccountId(refParam);
  const refSelf = refParam !== null && accountId !== null && refParam === accountId;
  const referrer = refOn && refParam && !refBad && !refSelf ? refParam : null;
  const payTo = payToOn && payToId.trim() ? { receiver_id: payToId.trim(), memo: payToMemo.trim() || null } : null;
  const payToErr = payTo && !isAccountId(payTo.receiver_id) ? "Enter a NEAR account id (e.g. shop.testnet)" : payTo && payTo.receiver_id === accountId ? "Leave empty to receive the USDC yourself" : null;
  const memoErr = payToMemo.length > PAY_TO_MEMO_MAX ? `At most ${PAY_TO_MEMO_MAX} characters` : null;

  const cap = useView<ExitCapacity>(col ? (v) => v.getExitCapacity(col.symbol) : null, [col?.symbol]);
  const preview = useView<BorrowPreview>(
    col && units && borrow ? (v) => v.previewBorrow(col.symbol, units.toString(), borrow.toString(), v2 ? referrer : null) : null,
    [col?.symbol, units?.toString(), borrow?.toString(), v2, referrer],
  );
  const bal = useBalance(col?.token ?? null);

  const local = useMemo(() => {
    if (!col || !cap.data || !units) return null;
    const raw = BigInt(cap.data.oracle_price_usd_e6);
    // v2 Underlying: V = units · M · price; fold M into the price for the local preview (the contract stays authoritative).
    const m = cap.data.multiplier_e18 && cap.data.price_kind !== "TokenIncludesMultiplier" ? BigInt(cap.data.multiplier_e18) : E18;
    const price = (raw * m) / E18;
    const lim = computeLimit({ ...col, units, price_usd_e6: price, session_open: cap.data.session_open, q_usd_e6: BigInt(cap.data.q_usd_e6), r_usd_e6: BigInt(cap.data.r_usd_e6), d_usd_e6: BigInt(cap.data.d_usd_e6) });
    const prem = borrow ? premiumUsdE6(borrow, lim.static_limit_usd_e6, col.limit_premium_bps) : 0n;
    const shocks = [0, -500, -1000, -2000].map((s) => ({ s, h: borrow ? health(units, shockPrice(price, s), col.decimals, borrow, preLiq) : null }));
    return { lim, prem, shocks };
  }, [col, cap.data, units, borrow, preLiq]);

  const fees = borrow && preview.data ? feeStack(borrow, preview.data, { generation, originationFeeBps: config.v7.origination_fee_bps, referrer }) : null;
  const lines = fees && col ? feeLines(fees, col.limit_premium_bps, referrer, v2) : null;
  const receiver = payTo && !payToErr ? payTo.receiver_id : "you";
  const receiveNote = fees ? `Deducted from proceeds: ${receiver === "you" ? "you receive" : `${receiver} receives`} ${formatUsdE6(fees.net_usd_e6)}${payTo?.memo && receiver !== "you" ? ` (memo "${payTo.memo}")` : ""}.` : null;

  const preLiqErr = col && (preLiq < col.pre_liq_min_bps || preLiq > col.pre_liq_max_bps) ? `Between ${bpsToPct(col.pre_liq_min_bps)} and ${bpsToPct(col.pre_liq_max_bps)}` : null;
  const canSign = Boolean(accountId && col?.token && config.core && units && borrow && preview.data?.ok && !preLiqErr && !payToErr && !memoErr && bal.data !== undefined && units <= bal.data);

  const submit = async () => {
    if (!col?.token || !config.core || !units || !borrow) return;
    const intent = tx.borrow(col.token, config.core, units.toString(), {
      collateral: col.symbol,
      borrow_usd_e6: borrow.toString(),
      pre_liq_ltv_bps: preLiq,
      // v2-only keys are omitted entirely unless their feature is on (the v1 msg stays byte-identical).
      ...(payTo ? { pay_to: payTo } : {}),
      ...(referrer ? { referrer } : {}),
    });
    await sign(intent, {
      success: payTo ? "Position opened, merchant paid" : "Position opened",
      fees: fees && lines ? { lines, total: formatUsdE6(fees.total_usd_e6), note: receiveNote } : undefined,
      summary: fees ? (
        <div className="kvs">
          <Kv k={receiver === "you" ? "You receive" : `${receiver} receives`} v={formatUsdE6(fees.net_usd_e6)} />
        </div>
      ) : null,
    });
    bal.reload();
  };

  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Console · Borrow</span>
        <h1>Borrow against mock NVDAx</h1>
        <p className="lead">Lock collateral, borrow USDC up to the Cramér limit. Every fee is listed with its total before your wallet opens and is taken up front from proceeds.</p>
      </div>
      <Gate wallet action="borrow" blockOnPause>
        {cap.data && col ? <CorporateActionBanner cap={cap.data} symbol={col.symbol} /> : null}
        <div className="grid-2">
          <Card label="Position">
            <div className="stack">
              {config.collaterals.length > 1 ? <SelectField label="Collateral" value={key} onChange={setKey} options={config.collaterals.map((c) => ({ value: c.key, label: `${c.symbol} (mock)` }))} /> : null}
              {cap.data ? (
                <div className="row between">
                  <span className="small dim">{col?.symbol} session</span>
                  <SessionBadge cap={cap.data} />
                </div>
              ) : null}
              <Field label={`Collateral units (${col?.symbol ?? ""})`} inputMode="decimal" value={unitsIn} onChange={(e) => setUnitsIn(e.target.value)} unit={col?.symbol}
                hint={bal.data !== undefined && col ? `Balance ${formatUnits(bal.data, col.decimals)} ${col.symbol}` : undefined}
                error={unitsIn && !units ? "Enter a positive number" : units && bal.data !== undefined && units > bal.data ? "More than your balance" : undefined} />
              {cap.data && col ? <MultiplierLine cap={cap.data} symbol={col.symbol} /> : null}
              <Field label="Borrow" inputMode="decimal" value={borrowIn} onChange={(e) => setBorrowIn(e.target.value)} unit="USDC" error={borrowIn && !borrow ? "Enter a positive number" : undefined} />
              <Field label="Pre-liquidation LTV" type="number" value={preLiq} onChange={(e) => setPreLiq(Number(e.target.value))} unit="bps" error={preLiqErr ?? undefined}
                hint="Keepers may trigger settlement when debt / value rises above this." />
              {payToOn ? (
                <fieldset className="stack-sm" data-testid="pay-to" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="label">Pay a merchant (optional)</legend>
                  <Field label="Merchant account" value={payToId} onChange={(e) => setPayToId(e.target.value)} placeholder="shop.testnet" autoComplete="off" spellCheck={false}
                    hint="Net proceeds go to this account instead of your wallet. If the transfer fails, they wait for you as claimable USDC." error={payToErr ?? undefined} />
                  <Field label="Memo" value={payToMemo} onChange={(e) => setPayToMemo(e.target.value)} placeholder="order 42" autoComplete="off" error={memoErr ?? undefined} hint="Sent with the USDC transfer." />
                </fieldset>
              ) : null}
              {refOn && refParam ? (
                <div className="stack-sm" data-testid="referrer">
                  {referrer ? (
                    <div className="row between small">
                      <span>Referred by <span className="mono heading-text">{referrer}</span></span>
                      <Button size="sm" variant="ghost" onClick={() => setRefParam(null)}>Remove</Button>
                    </div>
                  ) : (
                    <Banner tone="warn" title="Referral link ignored">{refSelf ? "The referrer cannot be the borrower." : `"${refParam}" is not a NEAR account id.`}</Banner>
                  )}
                </div>
              ) : null}
              {accountId && bal.data === 0n && col ? <FaucetLink token={`${col.symbol} (mock)`} /> : null}
              <Button variant="primary" disabled={!canSign} onClick={submit}>{payTo ? "Lock collateral and pay merchant" : "Lock collateral and borrow"}</Button>
            </div>
          </Card>
          <Card label="Preview" live={Boolean(preview.data)}>
            {cap.error ? <RpcErrorBanner error={cap.error} onRetry={cap.reload} /> : cap.loading ? <LoadingBlock /> : null}
            {!units || !borrow ? <p className="dim">Enter units and an amount to see the limit, fees and health.</p> : null}
            {preview.error ? <RpcErrorBanner error={preview.error} onRetry={preview.reload} /> : null}
            {preview.data && !preview.data.ok ? (
              <Banner tone="danger" title="Over the limit">
                {borrowReasonText(preview.data.reason) ?? "Borrow exceeds B_c or the pool."} Limit B<sub>c</sub> = {formatUsdE6(preview.data.b_c_usd_e6)}.
              </Banner>
            ) : null}
            {preview.data ? (
              <div className="kvs" aria-live="polite">
                <Kv k="Limit B_c (contract)" v={formatUsdE6(preview.data.b_c_usd_e6)} />
                <Kv k="Static limit" v={formatUsdE6(preview.data.static_limit_usd_e6)} />
                {preview.data.aggregate_headroom_usd_e6 != null ? <Kv k="Aggregate headroom" v={formatUsdE6(preview.data.aggregate_headroom_usd_e6)} /> : null}
                {local ? <Kv k="Binding term" v={local.lim.binding === "ltv" ? "LTV ceiling" : "committed capacity"} /> : null}
              </div>
            ) : null}
            {fees && lines ? (
              <div style={{ marginTop: 14 }}>
                <FeeStackList lines={lines} total={formatUsdE6(fees.total_usd_e6)} note={receiveNote} testId="preview-fees" />
              </div>
            ) : null}
            {local?.shocks[0]?.h ? (
              <div className="stack-sm" style={{ marginTop: 14 }}>
                <span className="label">Health under price shocks</span>
                {local.shocks.map(({ s, h }) => (
                  <Kv key={s} k={s === 0 ? "Now" : `${s / 100} %`} v={h ? <span className={h.triggerable ? "danger-text" : undefined}>LTV {bpsToPct(h.ltv_bps)}{h.triggerable ? " · keeper may act" : ""}</span> : "—"} />
                ))}
              </div>
            ) : null}
          </Card>
        </div>
      </Gate>
      <CopilotPanel />
    </div>
  );
}
