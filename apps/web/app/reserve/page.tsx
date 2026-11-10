"use client";
import Link from "next/link";
import { useState } from "react";
import { Banner, Button, Card, Field, Kv, SelectField } from "@nectar/ui";
import {
  NOTE_PAGE,
  RESERVE_MIN_DEPOSIT_USD_E6,
  RESERVE_NOTICE_NS,
  formatRealisedApr,
  formatUnits,
  formatUsdE6,
  formatWindowCountdown,
  noteHref,
  parseNoteId,
  parseUnits,
  reserveExitState,
  txNotes,
  type ReserveNoteView,
  type ReserveView,
} from "@nectar/sdk";
import { useChain, useFeature, useSign, useView, useWallet } from "@/components/AppProvider";
import { ConnectPrompt, FaucetLink, Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { useBalance } from "@/components/useBalance";
import { useNowS } from "@/components/Shields";
import { NotesOff } from "@/components/Notes";

const tryUsd = (s: string): bigint | null => {
  try {
    return s.trim() ? parseUnits(s, 6) : null;
  } catch {
    return null;
  }
};
const MAX_NOTE_PAGES = 5;
const reserveSymbol = (id: string): string | null => {
  const r = parseNoteId(id);
  return r?.kind === "RESERVE" ? r.collateral : null;
};

/** /reserve (PRD §4.8, §12.1): the retail buyer pool behind every quote. v2 + features.reserve only. WO-23b views are mocked in E2E until it merges. */
export default function ReservePage() {
  const { config, generation } = useChain();
  const { accountId } = useWallet();
  const on = useFeature("reserve");
  const sign = useSign();
  const [key, setKey] = useState(config.collaterals[0]?.key ?? "");
  const col = config.collaterals.find((c) => c.key === key) ?? config.collaterals[0];
  const [amtIn, setAmtIn] = useState("");
  const amount = tryUsd(amtIn);
  const reserve = useView<ReserveView | null>(on && col ? (v) => v.getReserve(col.symbol) : null, [on, col?.symbol]);
  const notes = useView<string[]>(
    on && accountId
      ? async (v) => {
          const out: string[] = [];
          for (let p = 0; p < MAX_NOTE_PAGES; p++) {
            const page = await v.nftTokensForOwner(accountId, p * NOTE_PAGE, NOTE_PAGE);
            for (const t of page) if (parseNoteId(t.token_id)?.kind === "RESERVE") out.push(t.token_id);
            if (page.length < NOTE_PAGE) break;
          }
          return out;
        }
      : null,
    [on, accountId],
  );
  const bal = useBalance(on ? config.usdc : null);
  const r = reserve.data;
  const min = r?.min_deposit_usd_e6 ? BigInt(r.min_deposit_usd_e6) : RESERVE_MIN_DEPOSIT_USD_E6;
  const amtErr = !amtIn ? null : amount === null || amount <= 0n ? "Enter a positive number" : amount < min ? `The Reserve takes at least ${formatUsdE6(min)}` : bal.data !== undefined && amount > bal.data ? "More than your USDC balance" : null;
  const noticeDays = Number((r?.notice_ns ? BigInt(r.notice_ns) : RESERVE_NOTICE_NS) / 86_400_000_000_000n);

  const join = async () => {
    if (!config.usdc || !config.core || !col || !amount || amtErr) return;
    await sign(txNotes.joinReserve(config.usdc, config.core, amount.toString(), col.symbol), {
      success: "Joined the Nectar Reserve",
      summary: (
        <p className="small">
          Deposits {formatUsdE6(amount)} mock USDC into the {col.symbol} Reserve and mints a Reserve Note holding your shares. The Reserve buys collateral only after every committed quote, at the Reserve discount. Exits take {noticeDays} days of notice.
        </p>
      ),
    });
    setAmtIn("");
    reserve.reload();
    notes.reload();
    bal.reload();
  };

  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Nectar Reserve</span>
        <h1>Back every quote from $10</h1>
        <p className="lead">
          The Reserve is a pooled buyer of last resort: it earns a share of every limit premium in proportion to its size, and fills a settlement only after all committed quotes, at a deeper discount. Returns shown are realised, never promised. Testnet, mock collateral.
        </p>
      </div>
      <Gate>
        {!on ? (
          <NotesOff what="Reserve deposits" generation={generation} />
        ) : (
          <div className="stack">
            <div className="grid-2">
              <Card label={`${col?.symbol ?? ""} Reserve · mock`}>
                {config.collaterals.length > 1 ? <SelectField label="Collateral" value={key} onChange={setKey} options={config.collaterals.map((c) => ({ value: c.key, label: `${c.symbol} (mock)` }))} /> : null}
                {reserve.error ? (
                  <RpcErrorBanner error={reserve.error} onRetry={reserve.reload} />
                ) : reserve.loading && !r ? (
                  <LoadingBlock />
                ) : !r ? (
                  <p className="small" data-testid="reserve-none">No Reserve exists for {col?.symbol} yet; the first deposit opens it at one share per mock USDC.</p>
                ) : (
                  <div className="kvs">
                    <Kv k="R_c (counts toward limits)" v={<span data-testid="reserve-rc">{formatUsdE6(r.r_c_usd_e6)}</span>} />
                    <Kv k="In notice" v={r.in_notice_usd_e6 ? formatUsdE6(r.in_notice_usd_e6) : "—"} />
                    <Kv k="Total USDC" v={formatUsdE6(r.usdc_e6)} />
                    <Kv k="Collateral held" v={`${formatUnits(r.units, col?.decimals ?? 6)} ${col?.symbol ?? ""}`} />
                    <Kv k="Reserve discount" v={`${r.discount_bps} bps`} />
                    <Kv k="Return" v={<span data-testid="reserve-apr">{formatRealisedApr(r.apr_7d_bps)}</span>} />
                  </div>
                )}
              </Card>
              <Card label="Deposit">
                <div className="stack">
                  {!accountId ? (
                    <ConnectPrompt action="join the Reserve" />
                  ) : (
                    <>
                      <Field
                        label="Amount (USDC)"
                        inputMode="decimal"
                        value={amtIn}
                        onChange={(e) => setAmtIn(e.target.value)}
                        unit="USDC"
                        hint={bal.data !== undefined ? `Balance ${formatUsdE6(bal.data)} · minimum ${formatUsdE6(min)}` : `Minimum ${formatUsdE6(min)}`}
                        error={amtErr ?? undefined}
                      />
                      {bal.data === 0n ? <FaucetLink token="USDC (mock)" /> : null}
                      <Button variant="primary" disabled={!amount || Boolean(amtErr)} onClick={join} data-testid="reserve-join">
                        Join the Reserve
                      </Button>
                      <p className="caption">ft_transfer_call of mock USDC with <span className="mono">JoinNectarReserve</span>; you get a Reserve Note. Exits need {noticeDays} days of notice; shares in notice stop counting toward R_c at once.</p>
                    </>
                  )}
                </div>
              </Card>
            </div>
            <Card label="Your Reserve Notes">
              {!accountId ? (
                <p className="small">Connect a wallet to see your Reserve Notes.</p>
              ) : notes.error ? (
                <RpcErrorBanner error={notes.error} onRetry={notes.reload} />
              ) : notes.loading && !notes.data ? (
                <LoadingBlock lines={2} />
              ) : !notes.data?.length ? (
                <p className="small" data-testid="reserve-notes-empty">No Reserve Notes yet.</p>
              ) : (
                <div className="stack" data-testid="reserve-notes">
                  {notes.data.map((id) => (
                    <ReserveNoteRow key={id} id={id} decimals={config.collaterals.find((c) => c.symbol === reserveSymbol(id))?.decimals ?? col?.decimals ?? 6} onChanged={notes.reload} />
                  ))}
                </div>
              )}
            </Card>
            <Banner tone="info" title="How the Reserve fills">
              Committed quotes fill first, in order of discount. Only a shortfall after every quote reaches the Reserve, at its discount, and only for collateral held on NEAR. Late depositors get nothing from earlier fills.
            </Banner>
          </div>
        )}
      </Gate>
    </div>
  );
}

function ReserveNoteRow({ id, decimals, onChanged }: { id: string; decimals: number; onChanged: () => void }) {
  const { config } = useChain();
  const sign = useSign();
  const nowS = useNowS();
  const n = useView<ReserveNoteView | null>((v) => v.getReserveNote(id), [id]);
  const d = n.data;
  const symbol = reserveSymbol(id) ?? "";
  if (n.error) return <RpcErrorBanner error={n.error} onRetry={n.reload} />;
  if (!d) return n.loading ? <LoadingBlock lines={1} /> : <p className="small">Reserve Note {id} not found.</p>;
  const state = reserveExitState(d, BigInt(nowS) * 1_000_000_000n);
  const act = async (kind: "init" | "complete") => {
    if (!config.core) return;
    const intent = kind === "init" ? txNotes.initiateReserveExit(config.core, id) : txNotes.completeReserveExit(config.core, id);
    await sign(intent, {
      success: kind === "init" ? "Reserve notice given" : "Reserve exit complete",
      summary:
        kind === "init" ? (
          <p className="small">Starts the notice period for <span className="mono">{id}</span>. Its shares leave R_c at once; you can complete the exit when the notice ends.</p>
        ) : (
          <p className="small">Pays the USDC value of <span className="mono">{id}</span>, its claimable {symbol} and fees.</p>
        ),
    });
    n.reload();
    onChanged();
  };
  return (
    <div className="note-card" data-testid={`reserve-note-${id}`}>
      <div className="note-meta">
        <Link className="link mono" href={noteHref(id)}>{id}</Link>
        <span className="caption" data-testid={`reserve-note-${id}-state`}>
          {state.kind === "none" ? "active" : state.kind === "notice" ? `notice ends in ${formatWindowCountdown(state.seconds_left)}` : "notice over: ready to exit"}
        </span>
      </div>
      <div className="kvs">
        <Kv k="USDC value" v={formatUsdE6(d.usdc_value_e6)} />
        <Kv k="Claimable units" v={<span data-testid={`reserve-note-${id}-units`}>{`${formatUnits(d.claimable_units, decimals, decimals).replace(/\.?0+$/, "")} ${symbol}`}</span>} />
        <Kv k="Claimable fees" v={formatUsdE6(d.claimable_fees_usd_e6)} />
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {state.kind === "none" ? <Button size="sm" onClick={() => act("init")} data-testid={`reserve-note-${id}-notice`}>Give notice</Button> : null}
        {state.kind === "ready" ? <Button size="sm" variant="primary" onClick={() => act("complete")} data-testid={`reserve-note-${id}-exit`}>Exit</Button> : null}
      </div>
    </div>
  );
}
