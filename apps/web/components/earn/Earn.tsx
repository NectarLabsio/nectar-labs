"use client";
// WO-33c: Earn artboard (/quote, /quote/new, /reserve). Live ladder placement, fee share, Reserve waterfall, premium split.
// The ladder, shares and last week's fees come from get_exit_capacity, list_quotes and get_reserve; every write goes through the sign modal.
import Link from "next/link";
import { useState } from "react";
import { AmountBox, Banner, Coin, FallStep, Kvr, Legend, Meter, Panel, PlacementLadder, Seg, SelectField, Slider, Stat, Stats, Switch, TabBar, Tip, tabPanelProps, type PlacementItem } from "@nectar/ui";
import {
  QUOTE_CEILING_STEP_BPS,
  REALISED_APR_LABEL,
  RESERVE_MIN_DEPOSIT_USD_E6,
  RESERVE_NOTICE_NS,
  bpsToPct,
  buyerFeeShareBps,
  buysAtUsdE6,
  formatDuration,
  formatNoticePeriod,
  formatRealisedApr,
  formatUnits,
  formatUsdE6,
  parseUnits,
  placementLadder,
  quoteCeilingMaxBps,
  secondsToNs,
  tx,
  txNotes,
  unitsAtCeiling,
  weeklyFeesAtShareUsdE6,
  type ExitCapacity,
  type QuoteView,
  type ReserveView,
} from "@nectar/sdk";
import { useChain, useFeature, useSign, useView, useWallet } from "@/components/AppProvider";
import { FaucetLink, Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { useBalance } from "@/components/useBalance";
import { NotesOff } from "@/components/Notes";
import { ReserveNoteRow, reserveNoteIds, reserveSymbol } from "./ReserveNotes";

type Mode = "quote" | "reserve";
const big = (v: string | number | bigint | null | undefined) => BigInt(v ?? 0);
const tryUsd = (s: string): bigint | null => {
  try {
    return s.trim() ? parseUnits(s, 6) : null;
  } catch {
    return null;
  }
};
const pct2 = (bps: number) => `${(bps / 100).toFixed(2)}%`;

export function Earn({ initial }: { initial: Mode }) {
  const { config } = useChain();
  const [mode, setMode] = useState<Mode>(initial);
  const [key, setKey] = useState(config.collaterals[0]?.key ?? "");
  const col = config.collaterals.find((c) => c.key === key) ?? config.collaterals[0];
  const change = (m: Mode) => {
    setMode(m);
    // Keeps the address shareable without remounting the form.
    window.history.replaceState(null, "", m === "reserve" ? "/reserve" : "/quote");
  };
  const buyers = config.feeSplit.buyers_bps;
  return (
    <div className="nx-page">
      <div className="nx-head-row">
        <div className="nx-stack nx-gap12">
          <h1 className="nx-title">Earn</h1>
          <p className="nx-lede">Stand behind {col?.symbol ?? "collateral"} loans. Borrowers pay a premium for the limit you make possible, and {buyers / 100}% of it goes to quotes and the Reserve. Testnet, mock collateral.</p>
        </div>
        <TabBar<Mode> label="Ways to earn" idBase="earn" variant="seg" className="nx-chain-seg" value={mode} onChange={change} tabs={[{ id: "quote", label: "Commit a quote" }, { id: "reserve", label: "Join the Reserve" }]} />
      </div>
      {/* The panel sits outside the Gate: the selected tab's aria-controls must resolve while the chain is still loading. */}
      <div {...tabPanelProps("earn", mode)} className="nx-tabpanel">
        <Gate>
          <div className="nx-stack" style={{ gap: 24 }}>
          {config.collaterals.length > 1 ? <SelectField label="Collateral" value={key} onChange={setKey} options={config.collaterals.map((c) => ({ value: c.key, label: `${c.symbol} (mock)` }))} /> : null}
          {col ? mode === "quote" ? <QuoteComposer symbol={col.symbol} decimals={col.decimals} /> : <ReserveComposer symbol={col.symbol} decimals={col.decimals} /> : null}
          <div className="nx-grid2">
            <PremiumSplit />
            {col ? <Commitments symbol={col.symbol} /> : null}
          </div>
          </div>
        </Gate>
      </div>
    </div>
  );
}

function QuoteComposer({ symbol, decimals }: { symbol: string; decimals: number }) {
  const { config, paused } = useChain();
  const { accountId, connect } = useWallet();
  const sign = useSign();
  const profitLockOn = useFeature("profit_lock");
  const reserveOn = useFeature("reserve");
  const presets = config.quotes.notice_presets_s.filter((s) => s >= config.quotes.min_notice_period_s);
  const [amountIn, setAmountIn] = useState("");
  const [cap, setCap] = useState(config.quotes.default_max_discount_bps);
  const [notice, setNotice] = useState(String(presets[0] ?? config.quotes.min_notice_period_s));
  // Off by default; the key is sent only when switched on (WO-26b).
  const [voluntary, setVoluntary] = useState(false);
  const amount = tryUsd(amountIn);
  const bal = useBalance(config.usdc);
  const data = useView<{ c: ExitCapacity; quotes: QuoteView[]; r: ReserveView | null }>(
    async (v) => {
      const [c, quotes, r] = await Promise.all([v.getExitCapacity(symbol), v.listQuotes(symbol, 0, config.limits.max_quotes_per_asset), reserveOn ? v.getReserve(symbol) : Promise.resolve(null)]);
      return { c, quotes, r };
    },
    [symbol, reserveOn],
  );
  const d = data.data;
  const min = BigInt(config.quotes.min_quote_usd_e6);
  const reserveBps = d?.r?.discount_bps ?? 0;
  const maxCap = quoteCeilingMaxBps(reserveBps);
  const capOk = cap >= QUOTE_CEILING_STEP_BPS && (reserveBps === 0 || cap < reserveBps);
  const capReached = (d?.quotes.length ?? 0) >= config.limits.max_quotes_per_asset;
  const amountErr = amountIn && !amount ? "Enter a positive number" : amount !== null && amount < min ? `Minimum ${formatUsdE6(min, 0)}` : amount !== null && bal.data !== undefined && amount > bal.data ? "More than your USDC balance" : null;
  const ok = Boolean(accountId && config.usdc && config.core && amount && !amountErr && capOk && !capReached && !paused);
  const price = big(d?.c.oracle_price_usd_e6);
  const q = big(d?.c.q_usd_e6);
  const r = big(d?.c.r_usd_e6);
  const size = amount && !amountErr ? amount : 0n;
  const rows = d ? placementLadder(d.quotes, d.r ? { usd_e6: big(d.r.r_usd_e6), discount_bps: d.r.discount_bps } : null, size > 0n ? { usd_e6: size, discount_bps: cap } : null, price) : [];
  const items: PlacementItem[] = rows.map((l) => ({
    key: l.key,
    kind: l.kind === "mine" ? "me" : l.kind === "reserve" ? "r" : "q",
    who: l.kind === "mine" ? "Your quote" : l.kind === "reserve" ? "Nectar Reserve" : `q-${l.quote!.id}, ${l.quote!.buyer}`,
    at: `buys at ≥ ${formatUsdE6(l.buys_at_usd_e6)}`,
    size: Number(l.size_usd_e6) / 1e6,
    sizeText: formatUsdE6(l.size_usd_e6, 0),
    cap: pct2(l.discount_bps),
  }));
  const weekly = d?.r ? weeklyFeesAtShareUsdE6(big(d.r.fees_7d_usd_e6), q, r, size) : null;

  const submit = async () => {
    if (!config.usdc || !config.core || !amount) return;
    const out = await sign(tx.fundQuote(config.usdc, config.core, amount.toString(), { collateral: symbol, max_discount_bps: cap, notice_period_ns: secondsToNs(Number(notice)), buyer_remote_recipient: null, ...(profitLockOn && voluntary ? { accepts_voluntary_fills: true } : {}) }), {
      success: "Quote funded",
      next: <Link className="link" href="/notes?tab=deposits">Next: see it in Portfolio</Link>,
    });
    if (out?.ok) setAmountIn("");
    bal.reload();
    data.reload();
  };

  return (
    <div className="nx-split">
      <Panel as="section" aria-label="Your quote" style={{ gap: 20 }}>
        <AmountBox
          label="You commit"
          note={bal.data !== undefined ? `Balance ${formatUsdE6(bal.data)}` : accountId ? "Reading balance" : "Connect to see your balance"}
          token={<><Coin />USDC</>}
          input={{ value: amountIn, onChange: (e) => setAmountIn(e.target.value), placeholder: "0" }}
          error={amountErr}
          helper={`Escrowed in nectar-core. Minimum ${formatUsdE6(min, 0)}.`}
          quick={[{ label: "$10k", onClick: () => setAmountIn("10000") }, { label: "$25k", onClick: () => setAmountIn("25000") }, { label: "$50k", onClick: () => setAmountIn("50000") }]}
          testId="amt-quote"
        />
        {accountId && bal.data === 0n ? <FaucetLink token="USDC (mock)" /> : null}
        <div className="nx-stack nx-gap6">
          <div className="nx-ph">
            <span className="nx-strong">
              Discount ceiling
              <Tip label="About the ceiling">The most you will take off the oracle price when a loan settles to you. A TEE may clear you cheaper, never higher.{reserveBps ? ` It must stay below the Reserve's ${pct2(reserveBps)}.` : ""}</Tip>
            </span>
            <span className="nx-mid nx-num" data-testid="quote-ceiling">{pct2(cap)}</span>
          </div>
          <Slider label="Discount ceiling" hideLabel value={Math.min(cap, maxCap)} min={QUOTE_CEILING_STEP_BPS} max={maxCap} step={QUOTE_CEILING_STEP_BPS} onChange={setCap} valueText={`${pct2(cap)}, buys at or above ${formatUsdE6(buysAtUsdE6(price, cap))}`} />
          <div className="nx-ticks"><span>{pct2(QUOTE_CEILING_STEP_BPS)}</span><span>you buy at or above <b className="nx-head">{d ? formatUsdE6(buysAtUsdE6(price, cap)) : "—"}</b></span><span>{pct2(maxCap)}</span></div>
        </div>
        <div className="nx-stack nx-gap6">
          <span className="nx-strong">Notice to exit</span>
          <Seg label="Notice period" value={notice} onChange={setNotice} options={presets.map((s) => ({ value: String(s), label: formatDuration(s) }))} />
          <span className="nx-k">Starting an exit removes your quote from new borrowing at once. Loans already backed by it stay backed until it unlocks.</span>
        </div>
        {profitLockOn ? (
          <div className="nx-ph nx-ruled" data-testid="voluntary-fills">
            <span className="nx-stack nx-grow">
              <span className="nx-strong">Accept voluntary fills</span>
              <span className="nx-k">Healthy borrowers can sell to you through Profit-Lock, under the asset&apos;s daily cap, at your ceiling. Each fill uses part of this quote.</span>
            </span>
            <Switch label="Accept voluntary fills" checked={voluntary} onChange={setVoluntary} />
          </div>
        ) : null}
      </Panel>

      <Panel as="section" aria-label="Where you stand" style={{ gap: 20 }}>
        <div className="nx-ph"><h2 className="nx-h2">Where you&apos;d stand</h2><span className="nx-k">settlement fills from the top</span></div>
        {data.error ? (
          <RpcErrorBanner error={data.error} onRetry={data.reload} />
        ) : !d ? (
          <LoadingBlock />
        ) : items.length === 0 ? (
          <p className="nx-k" data-testid="ladder-empty">No committed buyers yet. Enter an amount to be the first.</p>
        ) : (
          <div data-testid="placement-ladder"><PlacementLadder rows={items} label="Buy side in settlement order" /></div>
        )}
        <Stats label="Outcome" className="nx-hero-stats">
          <Stat label="Share of buyer fees" size="mid" value={<span data-testid="fee-share">{pct2(buyerFeeShareBps(size, q, r))}</span>} />
          <Stat label="From the last 7 days" size="mid" tone="pos" value={<span data-testid="fee-week">{weekly === null ? "n/a" : formatUsdE6(weekly)}</span>} />
          <Stat label="You could receive" size="mid" value={<span data-testid="units-max">{`${formatUnits(unitsAtCeiling(size, price, cap, decimals), decimals, 1)} ${symbol}`}</span>} />
        </Stats>
        <span className="nx-k">{d?.r ? `Measured from ${formatUsdE6(d.r.fees_7d_usd_e6)} the Reserve earned on ${formatUsdE6(d.r.r_usd_e6)} in the last 7 days. Past fees, not a rate.` : "Last week's figure needs the Reserve, which is the only fee history the contract keeps."}</span>
        {capReached ? <Banner tone="warn" title="Quote cap reached">{config.limits.max_quotes_per_asset} live quotes on this asset. Funding now would be refunded in full.</Banner> : null}
        {!capOk ? <Banner tone="warn" title="Ceiling too high">The contract refuses a ceiling at or above the Reserve discount of {pct2(reserveBps)}.</Banner> : null}
        {!accountId ? (
          <button type="button" className="nx-btn lg" onClick={connect} data-testid="quote-connect">Connect wallet</button>
        ) : (
          <button type="button" className="nx-btn lg" disabled={!ok} onClick={submit} data-testid="quote-submit">{paused ? "Protocol paused" : amount ? `Commit ${formatUsdE6(amount, 0)}` : "Enter an amount"}</button>
        )}
        <span className="nx-k">The next screen shows the exact msg JSON, gas and deposit before your wallet opens.</span>
      </Panel>
    </div>
  );
}

function ReserveComposer({ symbol, decimals }: { symbol: string; decimals: number }) {
  const { config, generation, paused } = useChain();
  const { accountId, connect } = useWallet();
  const on = useFeature("reserve");
  const sign = useSign();
  const [amtIn, setAmtIn] = useState("");
  const amount = tryUsd(amtIn);
  const data = useView<{ r: ReserveView; c: ExitCapacity }>(on ? async (v) => {
    const [r, c] = await Promise.all([v.getReserve(symbol), v.getExitCapacity(symbol)]);
    return { r, c };
  } : null, [on, symbol]);
  const bal = useBalance(on ? config.usdc : null);
  if (!on) return <NotesOff what="Reserve deposits" generation={generation} />;
  const r = data.data?.r;
  const q = big(data.data?.c.q_usd_e6);
  const min = r ? BigInt(r.min_deposit_usd_e6) : RESERVE_MIN_DEPOSIT_USD_E6;
  // discount_bps 0: the owner has not enabled this Reserve; the contract refuses JoinNectarReserve (`reserve_disabled`).
  const disabled = r?.discount_bps === 0;
  const empty = r ? BigInt(r.shares) === 0n && BigInt(r.usdc_e6) === 0n : false;
  const amtErr = !amtIn ? null : amount === null || amount <= 0n ? "Enter a positive number" : amount < min ? `The Reserve takes at least ${formatUsdE6(min)}` : bal.data !== undefined && amount > bal.data ? "More than your USDC balance" : null;
  const notice = formatNoticePeriod(r?.notice_period_ns ?? RESERVE_NOTICE_NS);
  const size = amount && !amtErr ? amount : 0n;
  const rc = big(r?.r_usd_e6);
  const share = rc + size > 0n ? Number((size * 10_000n) / (rc + size)) : 0;

  const join = async () => {
    if (!config.usdc || !config.core || !amount || amtErr || disabled) return;
    const out = await sign(txNotes.joinReserve(config.usdc, config.core, amount.toString(), symbol), {
      success: "Joined the Nectar Reserve",
      next: <Link className="link" href="/notes?tab=deposits">Next: see it in Portfolio</Link>,
      summary: (
        <p className="small">
          Deposits {formatUsdE6(amount)} mock USDC into the {symbol} Reserve and mints a Reserve Note holding your shares. The Reserve buys collateral only after every committed quote, at the Reserve discount. Exits take {notice} of notice.
        </p>
      ),
    });
    if (out?.ok) setAmtIn("");
    data.reload();
    bal.reload();
  };

  return (
    <div className="nx-split">
      <Panel as="section" aria-label="Reserve deposit" style={{ gap: 20 }}>
        {data.error ? (
          <RpcErrorBanner error={data.error} onRetry={data.reload} />
        ) : !r ? (
          <LoadingBlock />
        ) : (
          <>
            {disabled ? (
              <div data-testid="reserve-disabled">
                <Banner tone="warn" title="Reserve not enabled" role="status">The owner has not set a Reserve discount for {r.symbol} yet, so the contract refuses deposits. Nothing is sent from this page until it is enabled.</Banner>
              </div>
            ) : null}
            {empty ? <p className="nx-k" data-testid="reserve-none">No deposits in the {r.symbol} Reserve yet; the first deposit opens it at one share per mock USDC.</p> : null}
            <AmountBox
              label="You deposit"
              note={bal.data !== undefined ? `Balance ${formatUsdE6(bal.data)}` : accountId ? "Reading balance" : "Connect to see your balance"}
              token={<><Coin />USDC</>}
              input={{ value: amtIn, onChange: (e) => setAmtIn(e.target.value), placeholder: "0" }}
              error={amtErr}
              helper={`Mints a Reserve Note holding your shares. Minimum ${formatUsdE6(min)}.`}
              quick={[{ label: "$10", onClick: () => setAmtIn("10") }, { label: "$100", onClick: () => setAmtIn("100") }, { label: "$1,000", onClick: () => setAmtIn("1000") }]}
              testId="amt-reserve"
            />
            {accountId && bal.data === 0n ? <FaucetLink token="USDC (mock)" /> : null}
            <Stats label="Outcome">
              <Stat label={REALISED_APR_LABEL} size="mid" value={<span data-testid="reserve-apr">{formatRealisedApr(r.realised_apr_7d_bps, r.r_usd_e6)}</span>} />
              <Stat label="Your share" size="mid" value={<span data-testid="reserve-share">{pct2(share)}</span>} />
              <Stat label="Notice to exit" size="mid" value={<span data-testid="reserve-notice-period">{notice}</span>} />
            </Stats>
            <span className="nx-k">{formatUsdE6(r.fees_7d_usd_e6)} earned on {formatUsdE6(r.r_usd_e6)} in the last 7 days, fees only. A historical figure: the Reserve never promises a rate.</span>
            <div>
              <Kvr k="R_c (counts toward limits)" v={formatUsdE6(r.r_usd_e6)} testId="reserve-rc" />
              <Kvr k="In notice" v={formatUsdE6(r.notice_usdc_e6)} testId="reserve-in-notice" />
              <Kvr k="Share price" v={`${formatUsdE6(r.share_price_e6)} per share`} />
              <Kvr k="Collateral held" v={`${formatUnits(r.units, decimals)} ${symbol}`} />
            </div>
            {!accountId ? (
              <button type="button" className="nx-btn lg" onClick={connect} data-testid="reserve-connect">Connect wallet</button>
            ) : (
              <button type="button" className="nx-btn lg" disabled={!amount || Boolean(amtErr) || disabled || paused} onClick={join} data-testid="reserve-join">{paused ? "Protocol paused" : amount && !amtErr ? `Deposit ${formatUsdE6(amount)}` : `Enter at least ${formatUsdE6(min)}`}</button>
            )}
          </>
        )}
      </Panel>
      <Panel as="section" aria-label="Settlement order" style={{ gap: 14 }}>
        <div className="nx-ph"><h2 className="nx-h2">When a loan settles</h2></div>
        <FallStep tone="q" title="1. Committed quotes, lowest ceiling first" detail={`${formatUsdE6(q, 0)} committed on ${symbol}`} />
        <FallStep tone="r" on title={r && r.discount_bps > 0 ? `2. The Reserve, at ${pct2(r.discount_bps)}` : "2. The Reserve"} detail={<span data-testid="reserve-after">{formatUsdE6(rc + size, 0)} after your deposit. Seized {symbol} is shared by Reserve Notes in proportion to their shares.</span>} />
        <FallStep tone="off" title="3. The loan stays settling" detail="The curator handles what's left. Never the order book." />
        <span className="nx-k nx-ruled">On testnet the Reserve fills NEAR-side collateral only. Late depositors get nothing from earlier fills.</span>
      </Panel>
    </div>
  );
}

function PremiumSplit() {
  const { config, core } = useChain();
  const f = core?.fee_split ?? config.feeSplit;
  const pct = (b: number) => bpsToPct(b).replace(" %", "%");
  return (
    <Panel as="section" aria-label="Where premiums go" style={{ gap: 16 }}>
      <div className="nx-ph"><h2 className="nx-h2">Where every premium goes</h2></div>
      <Meter lg label={`${pct(f.buyers_bps)} buyers and Reserve, ${pct(f.lenders_bps)} lenders, ${pct(f.treasury_bps)} treasury`} segments={[{ tone: "q", value: f.buyers_bps }, { tone: "d", value: f.lenders_bps }, { tone: "v", value: f.treasury_bps }]} />
      <Legend items={[{ tone: "q", label: "Quotes and Reserve", value: pct(f.buyers_bps) }, { tone: "d", label: "Lenders", value: pct(f.lenders_bps) }, { tone: "v", label: "Treasury", value: pct(f.treasury_bps) }]} />
      <span className="nx-k">Split between quotes and the Reserve in proportion to their size, then pro rata within each.</span>
    </Panel>
  );
}

function Commitments({ symbol }: { symbol: string }) {
  const { config } = useChain();
  const { accountId } = useWallet();
  const reserveOn = useFeature("reserve");
  const data = useView<{ quotes: QuoteView[]; notes: string[]; pool: ReserveView | null }>(
    accountId
      ? async (v) => {
          const [all, notes, pool] = await Promise.all([v.listQuotes(symbol, 0, config.limits.max_quotes_per_asset), reserveOn ? reserveNoteIds(v, accountId) : Promise.resolve([] as string[]), reserveOn ? v.getReserve(symbol) : Promise.resolve(null)]);
          return { quotes: all.filter((q) => q.buyer === accountId), notes, pool };
        }
      : null,
    [accountId, symbol, reserveOn],
  );
  const d = data.data;
  return (
    <Panel as="section" aria-label="Your commitments" style={{ gap: 12 }}>
      <div className="nx-ph"><h2 className="nx-h2">Your commitments</h2><Link className="nx-link" href="/notes?tab=deposits">Portfolio</Link></div>
      {!accountId ? (
        <p className="nx-k">Connect a wallet to see your quotes and Reserve Notes.</p>
      ) : data.error ? (
        <RpcErrorBanner error={data.error} onRetry={data.reload} />
      ) : !d ? (
        <LoadingBlock lines={2} />
      ) : (
        <>
          {d.quotes.length === 0 ? (
            <div className="nx-actrow"><span className="nx-row nx-gap12"><span className="nx-ghost-ic" aria-hidden="true">Q</span><span className="nx-stack"><span className="nx-dim">No quotes yet</span><span className="nx-k">Your first quote mints a Note you can hold or transfer</span></span></span></div>
          ) : (
            d.quotes.map((q) => (
              <Link key={q.id} className="nx-actrow" href={`/quote/${q.id}`} data-testid={`commitment-q-${q.id}`}>
                <span className="nx-row nx-gap12"><span className="nx-ghost-ic" aria-hidden="true">Q</span><span className="nx-stack"><span className="nx-head">Quote #{q.id}, {q.collateral}</span><span className="nx-k">ceiling {pct2(q.max_discount_bps)}, fees {formatUsdE6(q.claimable_fees_usd_e6 ?? "0")}</span></span></span>
                <b>{formatUsdE6(q.remaining_usd_e6)}</b>
              </Link>
            ))
          )}
          {reserveOn ? (
            d.notes.length === 0 ? (
              <p className="nx-k" data-testid="reserve-notes-empty">No Reserve Notes yet.</p>
            ) : (
              <div className="nx-stack nx-gap12" data-testid="reserve-notes">
                {d.notes.map((id) => (
                  <ReserveNoteRow key={id} id={id} decimals={config.collaterals.find((c) => c.symbol === reserveSymbol(id))?.decimals ?? 6} onChanged={data.reload} />
                ))}
              </div>
            )
          ) : null}
        </>
      )}
    </Panel>
  );
}
