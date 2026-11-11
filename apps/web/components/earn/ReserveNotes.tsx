"use client";
// A Reserve Note and its exit actions, shared by Earn ("Your commitments") and Portfolio (Deposits).
import Link from "next/link";
import { Kvr, NxBadge, Panel } from "@nectar/ui";
import { NOTE_PAGE, bpsToPct, formatUnits, formatUsdE6, formatWindowCountdown, noteHref, nsToUtc, parseNoteId, reserveExitState, txNotes, type NectarViews, type ReserveNoteView } from "@nectar/sdk";
import { useChain, useSign, useView } from "@/components/AppProvider";
import { LoadingBlock, RpcErrorBanner } from "@/components/states";
import { useNowS } from "@/components/Shields";

const MAX_NOTE_PAGES = 5;

export const reserveSymbol = (id: string): string | null => {
  const r = parseNoteId(id);
  return r?.kind === "RESERVE" ? r.collateral : null;
};

/** The account's Reserve Note ids, at most 5 pages of Notes. */
export async function reserveNoteIds(v: NectarViews, accountId: string): Promise<string[]> {
  const out: string[] = [];
  for (let p = 0; p < MAX_NOTE_PAGES; p++) {
    const page = await v.nftTokensForOwner(accountId, p * NOTE_PAGE, NOTE_PAGE);
    for (const t of page) if (parseNoteId(t.token_id)?.kind === "RESERVE") out.push(t.token_id);
    if (page.length < NOTE_PAGE) break;
  }
  return out;
}

export function ReserveNoteRow({ id, decimals, share, onChanged, layout = "well" }: { id: string; decimals: number; /** Share of the pool, bps. */ share?: number; onChanged: () => void; layout?: "well" | "holding" }) {
  const { config } = useChain();
  const sign = useSign();
  const nowS = useNowS();
  const n = useView<ReserveNoteView | null>((v) => v.getReserveNote(id), [id]);
  const d = n.data;
  const symbol = reserveSymbol(id) ?? "";
  if (n.error) return <RpcErrorBanner error={n.error} onRetry={n.reload} />;
  if (!d) return n.loading ? <LoadingBlock lines={1} /> : <p className="nx-k">Reserve Note {id} not found.</p>;
  const unlock = d.note.unlock_ns;
  const state = reserveExitState(d, BigInt(nowS) * 1_000_000_000n);
  const stateText = state.kind === "none" ? "active" : state.kind === "notice" ? `notice ends in ${formatWindowCountdown(state.seconds_left)}` : state.kind === "ready" ? "notice over: ready to exit" : "exited";
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
  const unitsText = `${formatUnits(d.claimable_units, decimals, decimals).replace(/\.?0+$/, "")} ${symbol}`;
  const actions = (
    <div className="nx-row nx-gap6 nx-wrap">
      {state.kind === "none" ? <button type="button" className="nx-btn quiet sm" onClick={() => act("init")} data-testid={`reserve-note-${id}-notice`}>Give notice</button> : null}
      {state.kind === "ready" ? <button type="button" className="nx-btn sm" onClick={() => act("complete")} data-testid={`reserve-note-${id}-exit`}>Exit</button> : null}
    </div>
  );
  if (layout === "holding")
    return (
      <Panel as="article" className="nx-holding" aria-label={`Reserve Note ${id}`} data-testid={`reserve-note-${id}`}>
        <span className="nx-asset">
          <span className="nx-ghost-ic" aria-hidden="true">R</span>
          <span><b><Link className="nx-head" href={noteHref(id)}>Reserve {id}</Link></b><span className="sub">{symbol} Reserve</span></span>
        </span>
        <div className="nx-stack nx-gap4"><span className="nx-k">Deposited</span><span className="nx-v">{formatUsdE6(d.note.deposited_usd_e6)}</span></div>
        <div className="nx-stack nx-gap4"><span className="nx-k">Share of Reserve</span><span className="nx-v">{share !== undefined ? bpsToPct(share) : "—"}</span></div>
        <div className="nx-stack nx-gap4"><span className="nx-k">Fees to claim</span><span className="nx-v nx-pos">{formatUsdE6(d.claimable_fees_usd_e6)}</span><span className="nx-k" data-testid={`reserve-note-${id}-state`}>{stateText}</span></div>
        {actions}
      </Panel>
    );
  return (
    <div className="nx-well" data-testid={`reserve-note-${id}`}>
      <div className="nx-ph">
        <Link className="nx-link" href={noteHref(id)}>{id}</Link>
        <NxBadge tone={state.kind === "none" ? "pos" : state.kind === "ready" ? "info" : "warn"} data-testid={`reserve-note-${id}-state`}>{stateText}</NxBadge>
      </div>
      <div>
        <Kvr k="Deposited" v={formatUsdE6(d.note.deposited_usd_e6)} />
        <Kvr k={unlock ? "USDC value (frozen at notice)" : "USDC value"} v={formatUsdE6(d.value_usd_e6)} testId={`reserve-note-${id}-value`} />
        <Kvr k="Claimable units" v={unitsText} testId={`reserve-note-${id}-units`} />
        <Kvr k="Claimable fees" v={formatUsdE6(d.claimable_fees_usd_e6)} />
        {unlock ? <Kvr k="Unlocks" v={nsToUtc(unlock)} /> : null}
      </div>
      {d.transfer_locked ? <p className="nx-k" data-testid={`reserve-note-${id}-locked`}>A settlement that may reach this Reserve is pending; the Note cannot be transferred until it completes.</p> : null}
      {actions}
    </div>
  );
}
