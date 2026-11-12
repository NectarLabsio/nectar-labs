"use client";
// WO-33b: Borrow artboard (/borrow, /shield). Composer + live outcome, review drawer with "what your wallet signs", then the
// existing sign modal (exact msg JSON, gas, deposit) before the wallet opens, pending, confirmed with a toast and next step.
// The contract is authoritative: limit, static limit, fees and refusals come from preview_borrow; health is derived from them.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import tokC from "@nectar/ui/3d/tokC.webp";
import { AmountBox, Banner, Coin, Drawer, FeeStackList, Gauge, HEALTH_WORD, Kvr, Notice, NxBadge, Opt, Panel, Seg, SelectField, SignJson, SignTxRows, Slider, Steps, StressBars, Switch, TextField, Tip, healthTone, type FeeLine } from "@nectar/ui";
import {
  E18,
  MAX_SHIELD_OPENS_PER_DAY,
  PAY_TO_MEMO_MAX,
  SHIELD_MIN_BORROW_USD_E6,
  borrowReasonText,
  bpsToPct,
  describeTransferAmount,
  feeStack,
  flagPriceUsdE6,
  formatNewYork,
  formatUnits,
  formatUnitsTrim,
  formatUsdE6,
  formatWindowCountdown,
  health,
  intentHash,
  isAccountId,
  parseUnits,
  shieldOpensLeft,
  shieldReasonText,
  tokenTable,
  tx,
  valueUsdE6WithMultiplier,
  type BorrowPreview,
  type CollateralView,
  type ExitCapacity,
  type FeeStack,
  type FeeStackView,
  type SessionWindow,
  type TxIntent,
} from "@nectar/sdk";
import { useChain, useFeature, useSign, useView, useWallet } from "@/components/AppProvider";
import { FaucetLink, Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { useBalance } from "@/components/useBalance";
import { CorporateActionBanner, MultiplierLine, SessionBadge } from "@/components/Session";
import { RemoteBorrow } from "@/components/remote/RemoteBorrow";
import { shieldWindowFor, useNowS } from "@/components/Shields";
import { TestAssets } from "@/components/TestAssets";

export type Protection = "standard" | "weekend" | "event";
type ChainPick = "near" | "solana" | "base";

const tryParse = (s: string, d: number): bigint | null => {
  try {
    return s.trim() ? parseUnits(s, d) : null;
  } catch {
    return null;
  }
};
/** The parser's own reason ("1,5" → use a dot for decimals), so the field says why, not just "invalid" (R2-06). */
const parseErr = (s: string, d: number): string => {
  try {
    parseUnits(s, d);
    return "Enter a positive number";
  } catch (e) {
    return e instanceof Error ? e.message : "Enter a positive number";
  }
};
const big = (v: string | number | bigint | null | undefined) => BigInt(v ?? 0);

/** Fee lines shared by the outcome panel and the sign modal (labels kept from WO-20: limit premium, origination, referrer share). */
function standardLines(f: FeeStack, premiumBps: number, referrer: string | null, v2: boolean): FeeLine[] {
  const lines: FeeLine[] = [
    { label: `Limit premium (${premiumBps} bps above the static limit)`, value: formatUsdE6(f.premium_usd_e6) },
    { label: v2 ? `Origination (${f.origination_bps} bps of the borrow)` : "Origination (the v1 contract charges none)", value: formatUsdE6(f.origination_usd_e6) },
  ];
  if (v2 && referrer) lines.push({ label: `of which to referrer ${referrer}`, value: formatUsdE6(f.referrer_share_usd_e6), sub: true });
  return lines;
}

interface ShieldData { coll: CollateralView | null; calendar: SessionWindow[]; fees: FeeStackView }

export function BorrowComposer({ initialProtection = "standard", title, lede, crumb }: { initialProtection?: Protection; title: string; lede?: string; crumb: string }) {
  const { config, generation, views } = useChain();
  const { accountId, connect } = useWallet();
  const sign = useSign();
  const payToOn = useFeature("pay_to");
  const refOn = useFeature("referrals");
  const solanaOn = useFeature("solana_remote");
  const baseOn = useFeature("base");
  const shieldsOn = useFeature("shields");
  const v2 = generation === "v2";
  const [chain, setChain] = useState<ChainPick>("near");
  const [key, setKey] = useState(config.collaterals[0]?.key ?? "");
  const col = config.collaterals.find((c) => c.key === key) ?? config.collaterals[0];
  const [unitsIn, setUnitsIn] = useState("");
  const [borrowIn, setBorrowIn] = useState("");
  const [prot, setProt] = useState<Protection>(initialProtection);
  const [preLiq, setPreLiq] = useState(col ? Math.round((col.pre_liq_min_bps + col.pre_liq_max_bps) / 2) : 7500);
  const [payOn, setPayOn] = useState(false);
  const [payToId, setPayToId] = useState("");
  const [payToMemo, setPayToMemo] = useState("");
  const [refParam, setRefParam] = useState<string | null>(null);
  const [stage, setStage] = useState<null | "review" | "signing" | "done">(null);
  const [raw, setRaw] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [newId, setNewId] = useState<string | null>(null);
  // R2-07: fingerprint of the call captured when the review opened; any change closes the review and asks for a new one.
  const [reviewed, setReviewed] = useState<string | null>(null);
  const [staleReview, setStaleReview] = useState(false);
  const nowS = useNowS(1000);

  // `?c=<symbol>` picks the collateral (Markets links); `?ref=` becomes the referrer (v2 + features.referrals); `?chain=solana`.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get("c");
    const hit = c ? config.collaterals.find((x) => x.symbol === c || x.key === c) : undefined;
    if (hit) setKey(hit.key);
    const r = q.get("ref");
    if (r) setRefParam(r.trim().toLowerCase());
    if (q.get("chain") === "solana" || q.get("remote")) setChain("solana");
    const p = q.get("protection");
    if (p === "weekend" || p === "event" || p === "standard") setProt(p);
  }, [config.collaterals]);

  const shield = shieldsOn && prot !== "standard";
  const units = col ? tryParse(unitsIn, col.decimals) : null;
  const borrow = tryParse(borrowIn, 6);
  const refBad = refParam !== null && !isAccountId(refParam);
  const refSelf = refParam !== null && accountId !== null && refParam === accountId;
  const referrer = refOn && !shield && refParam && !refBad && !refSelf ? refParam : null;
  const payTo = payToOn && payOn && !shield && payToId.trim() ? { receiver_id: payToId.trim(), memo: payToMemo.trim() || null } : null;
  const payToErr = payTo && !isAccountId(payTo.receiver_id) ? "Enter a NEAR account id (e.g. shop.testnet)" : payTo && payTo.receiver_id === accountId ? "Leave empty to receive the USDC yourself" : null;
  const memoErr = payToMemo.length > PAY_TO_MEMO_MAX ? `At most ${PAY_TO_MEMO_MAX} characters` : null;

  const cap = useView<ExitCapacity>(col ? (v) => v.getExitCapacity(col.symbol) : null, [col?.symbol]);
  const sd = useView<ShieldData>(
    shieldsOn && col ? async (v) => {
      const [coll, calendar, fees] = await Promise.all([v.getCollateral(col.symbol), v.getFullSessionCalendar(), v.getFeeStack(col.symbol)]);
      return { coll, calendar, fees };
    } : null,
    [shieldsOn, col?.symbol],
  );
  const opens = useView<number>(shieldsOn && accountId ? (v) => v.getShieldOpensToday(accountId) : null, [shieldsOn, accountId]);
  const bal = useBalance(col?.token ?? null);
  const wk = shieldsOn ? shieldWindowFor("Weekend", sd.data?.calendar, undefined, nowS) : null;
  const ev = shieldsOn ? shieldWindowFor("Event", undefined, sd.data?.coll?.shield?.event_window_end_ns, nowS) : null;
  const win = prot === "weekend" ? wk : prot === "event" ? ev : null;
  const shieldInput = shield && win?.ok ? win.input : null;
  // The limit does not depend on the amount: before one is entered, preview with the $5 Shield minimum as a probe.
  const probe = borrow ?? SHIELD_MIN_BORROW_USD_E6;
  const preview = useView<BorrowPreview>(
    col && units && (!shield || shieldInput) ? (v) => v.previewBorrow(col.symbol, units.toString(), probe.toString(), v2 ? referrer : null, shieldInput, shieldInput ? accountId : null) : null,
    [col?.symbol, units?.toString(), probe.toString(), v2, referrer, shieldInput?.kind, shieldInput?.window_end_ns, accountId],
  );
  const pv = preview.data;
  const real = borrow !== null && pv ? pv : null;

  const price = useMemo(() => {
    if (!cap.data) return null;
    const rawP = big(cap.data.oracle_price_usd_e6);
    const m = cap.data.multiplier_e18 && cap.data.price_kind !== "TokenIncludesMultiplier" ? big(cap.data.multiplier_e18) : E18;
    return (rawP * m) / E18;
  }, [cap.data]);
  const value = col && units && cap.data ? valueUsdE6WithMultiplier(units, big(cap.data.oracle_price_usd_e6), col.decimals, cap.data.multiplier_e18 ? big(cap.data.multiplier_e18) : E18, cap.data.price_kind) : null;
  const limit = pv ? big(pv.b_c_usd_e6) : null;
  const staticLim = pv ? big(pv.static_limit_usd_e6) : null;
  const over = borrow !== null && limit !== null && borrow > limit;
  const ltvBps = value && borrow && value > 0n ? Number((borrow * 10_000n) / value) : 0;
  const h = units && borrow && price && col ? health(units, price, col.decimals, borrow, preLiq) : null;
  const hf = h ? h.health_e4 / 10_000 : 0;
  const flag = price && ltvBps ? flagPriceUsdE6(price, ltvBps, preLiq) : null;

  // Fees: standard = contract fee stack; Shield = flat Shield fee + origination, from the same preview.
  const feeBps = sd.data ? (prot === "weekend" ? sd.data.fees.shield_weekend_fee_bps : sd.data.fees.shield_event_fee_bps) : null;
  let lines: FeeLine[] | null = null;
  let total: bigint | null = null;
  let net: bigint | null = null;
  if (real && borrow && col) {
    if (shield) {
      const sf = big(real.shield_fee_usd_e6 ?? real.premium_usd_e6);
      const orig = real.origination_fee_usd_e6 != null ? big(real.origination_fee_usd_e6) : 0n;
      total = real.total_fees_usd_e6 != null ? big(real.total_fees_usd_e6) : sf + orig;
      net = real.net_proceeds_usd_e6 != null ? big(real.net_proceeds_usd_e6) : borrow - total;
      lines = [
        { label: `${prot === "weekend" ? "Weekend" : "Event"} Shield fee (${feeBps ?? "?"} bps of the borrow, replaces the limit premium)`, value: formatUsdE6(sf) },
        { label: `Origination (${sd.data?.fees.origination_fee_bps ?? config.v7.origination_fee_bps} bps of the borrow)`, value: formatUsdE6(orig) },
      ];
    } else {
      const f = feeStack(borrow, real, { generation, originationFeeBps: config.v7.origination_fee_bps, referrer });
      lines = standardLines(f, col.limit_premium_bps, referrer, v2);
      total = f.total_usd_e6;
      net = f.net_usd_e6;
    }
  }
  const receiver = payTo && !payToErr ? payTo.receiver_id : null;
  const receiveNote = net !== null ? `Deducted from proceeds: ${receiver ? `${receiver} receives` : "you receive"} ${formatUsdE6(net)}${payTo?.memo && receiver ? ` (memo "${payTo.memo}")` : ""}.` : null;
  const reason = real && !real.ok ? (shield ? shieldReasonText(real.reason) ?? borrowReasonText(real.reason) : borrowReasonText(real.reason)) ?? "Borrow exceeds the limit or the pool." : null;

  const unitsErr = unitsIn && !units ? (col ? parseErr(unitsIn, col.decimals) : "Enter a positive number") : units && bal.data !== undefined && units > bal.data ? "More than your balance" : null;
  const shieldMinErr = shield && borrow !== null && borrow < SHIELD_MIN_BORROW_USD_E6 ? "Shields start at $5 on testnet" : null;
  const borrowErr = borrowIn && !borrow ? parseErr(borrowIn, 6) : over && limit !== null ? `Above your limit by ${formatUsdE6(borrow! - limit)}. Shared exit capacity is the cap.` : shieldMinErr;
  const opensLeft = opens.data === undefined ? null : shieldOpensLeft(opens.data);
  const preLiqErr = col && (preLiq < col.pre_liq_min_bps || preLiq > col.pre_liq_max_bps) ? `Between ${bpsToPct(col.pre_liq_min_bps)} and ${bpsToPct(col.pre_liq_max_bps)}` : null;
  const ready = Boolean(col?.token && config.core && units && borrow && real?.ok && !unitsErr && !borrowErr && !preLiqErr && !payToErr && !memoErr && bal.data !== undefined && (!shield || (shieldInput && v2 && opensLeft !== 0)));
  const canReview = Boolean(accountId && ready);

  const intent: TxIntent | null =
    col?.token && config.core && units && borrow
      ? tx.borrow(col.token, config.core, units.toString(), {
          collateral: col.symbol,
          borrow_usd_e6: borrow.toString(),
          pre_liq_ltv_bps: preLiq,
          // v2-only keys are omitted entirely unless their feature is on (the v1 msg stays byte-identical).
          ...(payTo ? { pay_to: payTo } : {}),
          ...(referrer ? { referrer } : {}),
          ...(shieldInput ? { shield: shieldInput } : {}),
        })
      : null;
  const intentKey = intentHash(intent);
  const reviewFresh = reviewed !== null && intentKey === reviewed;

  useEffect(() => {
    if (stage === "review" && reviewed !== null && intentKey !== reviewed) {
      setStage(null);
      setReviewed(null);
      setStaleReview(true);
    }
  }, [stage, reviewed, intentKey]);

  const openReview = () => {
    setRaw(false);
    setFailure(null);
    setStaleReview(false);
    setReviewed(intentKey);
    setStage("review");
  };

  const confirm = async () => {
    if (!intent || !ready || !reviewFresh) return;
    setFailure(null);
    setStage("signing");
    const before = views && accountId ? await views.listPositions(0, 200).catch(() => null) : null;
    const out = await sign(intent, {
      success: shieldInput ? `${prot === "weekend" ? "Weekend" : "Event"} Shield opened` : payTo ? "Position opened, merchant paid" : "Position opened",
      next: <Link className="link" href="/feed">Next: see it under Your account</Link>,
      fees: lines && total !== null ? { lines, total: formatUsdE6(total), note: receiveNote } : undefined,
      summary: (
        <div className="kvs">
          <div className="kv"><span>{receiver ? `${receiver} receives` : "You receive"}</span><b>{net !== null ? formatUsdE6(net) : "—"}</b></div>
          {shieldInput ? <div className="kv"><span>Inside the window</span><b>only committed buyers can settle it</b></div> : null}
        </div>
      ),
    });
    if (!out) return setStage("review");
    if (!out.ok) {
      setFailure(out.failure ?? "The transaction failed.");
      return setStage("review");
    }
    setStage("done");
    bal.reload();
    opens.reload();
    const after = views && accountId ? await views.listPositions(0, 200).catch(() => null) : null;
    const known = new Set((before ?? []).map((p) => p.id));
    const fresh = (after ?? []).filter((p) => p.borrower === accountId && !known.has(p.id)).map((p) => p.id);
    setNewId(fresh.length ? fresh[fresh.length - 1]! : null);
  };

  const quick = bal.data !== undefined && bal.data > 0n && col
    ? [
        { label: "25%", onClick: () => setUnitsIn(formatUnits(bal.data! / 4n, col.decimals, col.decimals).replace(/\.?0+$/, "")) },
        { label: "50%", onClick: () => setUnitsIn(formatUnits(bal.data! / 2n, col.decimals, col.decimals).replace(/\.?0+$/, "")) },
        { label: "Max", onClick: () => setUnitsIn(formatUnits(bal.data!, col.decimals, col.decimals).replace(/\.?0+$/, "")) },
      ]
    : undefined;
  const limitNum = limit !== null ? Number(limit / 10_000n) / 100 : 0;
  const borrowNum = borrow !== null ? Number(borrow / 10_000n) / 100 : 0;
  const msgText = borrowErr ?? (borrow === null || staticLim === null ? "Enter an amount; the limit comes from the contract." : borrow <= staticLim ? `Within the ${bpsToPct(col?.base_ltv_bps ?? 0)} a static lender would give` : `${formatUsdE6(borrow - staticLim)} above the static limit, made possible by committed buyers`);
  const tone = healthTone(hf);
  const protLabel = prot === "weekend" ? "Weekend Shield" : prot === "event" ? "Event Shield" : "Standard";

  const chainSel = solanaOn || baseOn ? (
    <div data-testid="chain-selector">
      <Seg<ChainPick>
        label="Collateral held on"
        value={chain}
        onChange={setChain}
        options={[
          { value: "near", label: "NEAR" },
          ...(solanaOn ? [{ value: "solana" as const, label: "Solana devnet", badge: "live on testnet" }] : []),
          { value: "base" as const, label: "Base", badge: "local fork, not live", disabled: !baseOn },
        ]}
      />
    </div>
  ) : null;

  return (
    <div className="nx-page">
      <div className="nx-head-row">
        <div className="nx-stack" style={{ gap: 10 }}>
          <nav className="nx-crumb" aria-label="Breadcrumb"><Link href="/feed">Markets</Link><span aria-hidden="true">/</span><span className="nx-head" aria-current="page">{crumb}</span></nav>
          <h1 className="nx-title">{title}</h1>
          {lede ? <p className="nx-lede">{lede}</p> : null}
        </div>
        {cap.data && col ? <SessionBadge cap={cap.data} compact /> : null}
      </div>
      <Gate wallet action="borrow" blockOnPause>
        <TestAssets />
        {cap.data && col ? <CorporateActionBanner cap={cap.data} symbol={col.symbol} /> : null}
        {chain === "solana" && solanaOn ? (
          <div className="nx-stack" style={{ gap: 20 }}>
            {chainSel}
            <RemoteBorrow />
          </div>
        ) : (
          <div className="nx-split">
            <Panel as="section" aria-label="Loan" style={{ gap: 20 }}>
              {chainSel}
              {chain === "base" ? <Notice tone="info" title="Base runs on a local fork, not live">Nothing here signs on Base. Use NEAR testnet to borrow.</Notice> : null}
              {config.collaterals.length > 1 ? <SelectField label="Collateral" value={key} onChange={setKey} options={config.collaterals.map((c) => ({ value: c.key, label: `${c.symbol} (mock)` }))} /> : null}
              <AmountBox
                label="You lock"
                note={bal.data !== undefined && col ? `Balance ${formatUnits(bal.data, col.decimals)} ${col.symbol}` : `mock ${col?.symbol ?? ""}`}
                token={<><img src={tokC.src} alt="" width={30} height={30} />{col?.symbol}</>}
                input={{ value: unitsIn, onChange: (e) => setUnitsIn(e.target.value), placeholder: "0" }}
                error={unitsErr}
                helper={value !== null ? <span className="num">{formatUsdE6(value)}</span> : "Collateral value appears here"}
                quick={quick}
                testId="amt-units"
              />
              {cap.data && col ? <MultiplierLine cap={cap.data} symbol={col.symbol} /> : null}
              <AmountBox
                label="You borrow"
                note={<>Limit <b className="nx-head num" data-testid="borrow-limit">{limit !== null ? formatUsdE6(limit, 0) : "—"}</b></>}
                token={<><Coin />USDC</>}
                input={{ value: borrowIn, onChange: (e) => setBorrowIn(e.target.value), placeholder: "0" }}
                error={borrowErr}
                helper={<>{msgText}{ltvBps ? <span className="num"> · {bpsToPct(ltvBps)} LTV</span> : null}</>}
                testId="amt-borrow"
              >
                <Slider label="Borrow amount" hideLabel value={Math.min(borrowNum, limitNum)} min={0} max={Math.max(limitNum, 1)} step={limitNum > 1000 ? 100 : 1} tone={over ? "neg" : "pos"} disabled={limit === null} valueText={`${formatUsdE6(borrow ?? 0n, 0)} of ${limit !== null ? formatUsdE6(limit, 0) : "unknown"}`} onChange={(v) => setBorrowIn(String(v))} />
              </AmountBox>
              <div className="nx-stack" style={{ gap: 12 }}>
                <div className="nx-ph"><h2 className="nx-h2" style={{ fontSize: 15 }}>Protection<Tip label="About Shields">A Shield opens your loan at the closed-market limit for a fixed window, so the limit cannot be cut halfway through. Committed buyers stay behind it.</Tip></h2></div>
                <div className="nx-opts">
                  {shieldsOn ? (
                    <Opt testId="protection-weekend" on={prot === "weekend"} onClick={() => setProt("weekend")} disabled={wk ? !wk.ok : true} flag={wk?.ok && wk.ends_in_s < 4 * 86_400 ? `Ends in ${formatWindowCountdown(wk.ends_in_s)}` : undefined}
                      title="Weekend Shield" detail={wk?.ok ? `Limit fixed until ${formatNewYork(wk.input.window_end_ns)}` : wk?.reason ?? "Reading the session calendar"} price={feeBps !== null || sd.data ? `${sd.data?.fees.shield_weekend_fee_bps ?? "?"} bps${borrow ? `, ${formatUsdE6((borrow * BigInt(sd.data?.fees.shield_weekend_fee_bps ?? 0)) / 10_000n)}` : ""}` : undefined} />
                  ) : null}
                  <Opt testId="protection-standard" on={!shield} onClick={() => setProt("standard")} title="Standard" detail="Limit follows the market session" price={col ? `${bpsToPct(col.limit_premium_bps)} above static` : undefined} />
                  {shieldsOn ? (
                    <Opt testId="protection-event" on={prot === "event"} onClick={() => setProt("event")} disabled={ev ? !ev.ok : true} title="Event Shield" detail={ev?.ok ? `Window ends ${formatNewYork(ev.input.window_end_ns)}` : `No event window set for ${col?.symbol ?? "this asset"}`} price={sd.data ? `${sd.data.fees.shield_event_fee_bps} bps` : undefined} />
                  ) : null}
                </div>
                {shield ? <p className="nx-k" data-testid="shield-opens">{opensLeft !== null ? `${opensLeft} of ${MAX_SHIELD_OPENS_PER_DAY} Shield opens left today (UTC).` : `${MAX_SHIELD_OPENS_PER_DAY} Shield opens per account per day on testnet.`} Inside the window only committed buyers can settle it.</p> : null}
              </div>
              <Slider label={`Flag line (pre-liquidation LTV): ${bpsToPct(preLiq)}`} value={preLiq} min={col?.pre_liq_min_bps ?? 5000} max={col?.pre_liq_max_bps ?? 9000} step={25} valueText={bpsToPct(preLiq)} onChange={setPreLiq} />
              {payToOn ? (
                <fieldset className="nx-stack" data-testid="pay-to" style={{ gap: 12, border: 0, padding: "16px 0 0", margin: 0, borderTop: "1px solid var(--line)" }}>
                  <legend className="sr-only">Pay a merchant</legend>
                  <div className="nx-row" style={{ justifyContent: "space-between" }}>
                    <span className="nx-stack"><span className="nx-strong">Pay a merchant directly</span><span className="nx-k">{shield ? "Shield loans pay you; switch to Standard to pay a merchant." : "The USDC goes to their account in the same transaction. If the transfer fails, it waits for you as claimable USDC."}</span></span>
                    <Switch checked={payOn && !shield} onChange={setPayOn} label="Pay a merchant directly" />
                  </div>
                  {payOn && !shield ? (
                    <div className="nx-grid2" style={{ gap: 10 }}>
                      <TextField label="Merchant account" value={payToId} onChange={(e) => setPayToId(e.target.value)} placeholder="shop.testnet" autoComplete="off" spellCheck={false} error={payToErr} />
                      <TextField label="Memo" value={payToMemo} onChange={(e) => setPayToMemo(e.target.value)} placeholder="order 42" autoComplete="off" error={memoErr} hint="Sent with the USDC transfer." />
                    </div>
                  ) : null}
                </fieldset>
              ) : null}
              {refOn && refParam ? (
                <div data-testid="referrer">
                  {referrer ? (
                    <div className="nx-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                      <span className="nx-k">Referred by <b className="nx-head">{referrer}</b>. They receive a share of the origination fee.</span>
                      <button type="button" className="nx-btn quiet sm" onClick={() => setRefParam(null)}>Remove</button>
                    </div>
                  ) : shield ? (
                    <p className="nx-k">Referral applies to Standard loans.</p>
                  ) : (
                    <Banner tone="warn" title="Referral link ignored">{refSelf ? "The referrer cannot be the borrower." : `"${refParam}" is not a NEAR account id.`}</Banner>
                  )}
                </div>
              ) : null}
              {accountId && bal.data === 0n && col ? <FaucetLink token={`${col.symbol} (mock)`} /> : null}
            </Panel>

            <Panel as="section" aria-label="Outcome" style={{ gap: 22 }} data-testid="borrow-outcome">
              {cap.error ? <RpcErrorBanner error={cap.error} onRetry={cap.reload} /> : cap.loading && !cap.data ? <LoadingBlock lines={2} /> : null}
              {preview.error ? <RpcErrorBanner error={preview.error} onRetry={preview.reload} /> : null}
              <div className="nx-stack" style={{ gap: 6 }} aria-live="polite">
                <span className="nx-k">{receiver ? `${receiver} receives` : "You receive"}</span>
                <span className="nx-hero" data-testid="receive">{net !== null ? formatUsdE6(net) : "$0.00"}</span>
                <span className="nx-k">{total !== null ? `after ${formatUsdE6(total)} in fees` : "Enter units and an amount to see the limit, fees and health."}</span>
              </div>
              {reason ? <Banner tone="danger" title="The contract would refuse this">{reason} {pv ? <>Limit B<sub>c</sub> = {formatUsdE6(pv.b_c_usd_e6)}.</> : null}</Banner> : null}
              <div className="nx-row" style={{ gap: 20, flexWrap: "wrap" }}>
                <Gauge value={hf} flag={1} label="health after" />
                <div className="nx-stack" style={{ gap: 6, flex: 1, minWidth: 160 }}>
                  <NxBadge tone={hf ? tone : "plain"} >{hf ? HEALTH_WORD[tone] : "No borrow yet"}</NxBadge>
                  <span className="nx-k">{flag !== null && price ? <>Flagged if {col?.symbol} falls below <b className="nx-head num">{formatUsdE6(flag)}</b>, {(100 - Number((flag * 10_000n) / price) / 100).toFixed(1)}% from here.</> : "Health is your flag line divided by the loan-to-value."}</span>
                </div>
              </div>
              <StressBars health={hf} caption={`If ${col?.symbol ?? "the price"} falls`} />
              <div>
                <Kvr k="Your limit (contract B_c)" v={limit !== null ? `${formatUsdE6(limit, 0)}${value ? ` (${bpsToPct(Number((limit * 10_000n) / (value || 1n)))})` : ""}` : "—"} />
                {pv ? <Kvr k="Static limit" v={formatUsdE6(pv.static_limit_usd_e6)} /> : null}
                {pv?.aggregate_headroom_usd_e6 != null ? <Kvr k="Aggregate headroom" v={formatUsdE6(pv.aggregate_headroom_usd_e6)} /> : null}
                <Kvr k="Protection" v={protLabel} />
              </div>
              {lines && total !== null ? <FeeStackList lines={lines} total={formatUsdE6(total)} note={receiveNote} testId="preview-fees" /> : null}
              {staleReview ? (
                <Notice tone="warn" title="Review again" testId="review-stale" live>
                  The loan changed while the review was open (an amount, the protection or its window). Nothing was signed. Review it again before you sign.
                </Notice>
              ) : null}
              <button type="button" className="nx-btn lg" disabled={accountId ? !canReview : false} onClick={() => (accountId ? openReview() : connect())} data-testid="review-borrow">
                {!accountId ? "Connect a wallet to borrow" : over ? "Lower the amount to continue" : "Review borrow"}
              </button>
            </Panel>
          </div>
        )}
      </Gate>
      <Drawer
        open={stage === "review" || stage === "done"}
        title={stage === "done" ? "Loan opened" : "Review borrow"}
        onClose={() => setStage(null)}
        footer={
          stage === "done" ? (
            <>
              <Link className="nx-btn lg" href={newId ? `/position/${newId}` : "/feed"} data-testid="view-loan">{newId ? `View loan #${newId}` : "See your account"}</Link>
              <button type="button" className="nx-btn line" onClick={() => { setStage(null); setBorrowIn(""); }}>Borrow more</button>
            </>
          ) : (
            <>
              <button type="button" className="nx-btn lg" onClick={confirm} data-testid="confirm-in-wallet" disabled={!intent || !ready || !reviewFresh}>Confirm in wallet</button>
              {!ready ? <span className="nx-k" data-testid="confirm-blocked">The contract preview no longer allows this loan. Close and review again.</span> : null}
            </>
          )
        }
      >
        <div className="nx-row" style={{ gap: 14 }}>
          <img src={tokC.src} alt="" width={44} height={44} />
          <span aria-hidden="true" className="nx-dim">→</span>
          <Coin size={40} />
          <span className="nx-stack"><span className="nx-k">You borrow</span><span className="nx-big">{formatUsdE6(borrow ?? 0n)}</span></span>
        </div>
        <div>
          <Kvr k="Collateral locked" v={<span className="num" data-testid="review-units">{units !== null && col ? `${formatUnitsTrim(units, col.decimals)} ${col.symbol}` : "—"}</span>} />
          <Kvr k="Protection" v={shieldInput ? `${protLabel} to ${formatNewYork(shieldInput.window_end_ns)}` : protLabel} />
          <Kvr k="Fees" v={total !== null ? formatUsdE6(total) : "—"} />
          <Kvr k={receiver ? `${receiver} receives` : "You receive"} v={<span className="nx-pos">{net !== null ? formatUsdE6(net) : "—"}</span>} />
          <Kvr k="Health after" v={hf ? hf.toFixed(2) : "n/a"} />
        </div>
        {failure ? <Banner tone="danger" title="The transaction failed">{failure}</Banner> : null}
        {intent && stage === "review" ? (
          <div className="nx-stack" style={{ gap: 8 }}>
            <button type="button" className="nx-link" style={{ alignSelf: "flex-start" }} aria-expanded={raw} onClick={() => setRaw(!raw)} data-testid="show-wallet-payload">{raw ? "Hide what your wallet signs" : "Show what your wallet signs"}</button>
            {raw ? (
              <div className="nx-stack" style={{ gap: 10 }} data-testid="wallet-payload">
                <SignTxRows preview={intent} signer={accountId} network="NEAR testnet" amount={describeTransferAmount(intent, tokenTable(config))} testIdPrefix="review" />
                <SignJson preview={intent} testIdPrefix="review" />
              </div>
            ) : null}
          </div>
        ) : null}
        <div style={{ paddingTop: 6, borderTop: "1px solid var(--line)" }}>
          <Steps
            steps={[
              { title: "Sign in your wallet", detail: "The next screen shows the exact call, gas and the 1 yoctoNEAR deposit before your wallet opens.", state: stage === "done" ? "done" : "now" },
              { title: "Confirmed on NEAR testnet", detail: stage === "done" ? "Confirmed. The explorer link is in the notification." : "Usually a couple of seconds", state: stage === "done" ? "done" : "todo" },
            ]}
          />
        </div>
      </Drawer>
    </div>
  );
}
