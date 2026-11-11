"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Kvr, NxBadge, Panel, Stat, Stats } from "@nectar/ui";
import { bpsToPct, formatDuration, formatUsdE6, nsToSeconds, quoteNoteId, tx, type QuoteView } from "@nectar/sdk";
import { useChain, useSign, useView, useWallet } from "@/components/AppProvider";
import { Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { NoteLink } from "@/components/Notes";

export default function QuotePage() {
  const { id } = useParams<{ id: string }>();
  const { config } = useChain();
  const { accountId } = useWallet();
  const sign = useSign();
  const q = useView<QuoteView | null>((v) => v.getQuote(id), [id]);
  const now = Math.floor(Date.now() / 1000);
  const d = q.data;
  const unlock = d?.unlock_ns ? nsToSeconds(d.unlock_ns) : null;
  const state = !d ? null : BigInt(d.remaining_usd_e6) === 0n ? "consumed or withdrawn" : unlock === null ? "committed" : unlock > now ? "exiting" : "withdrawable";
  const mine = d && accountId === d.buyer;
  const act = (kind: "notice" | "withdraw" | "claim") => {
    if (!config.core || !d) return;
    const t = kind === "notice" ? tx.initiateQuoteWithdrawal(config.core, d.id) : kind === "withdraw" ? tx.completeQuoteWithdrawal(config.core, d.id) : tx.claimFees(config.core, d.id);
    void sign(t, { success: kind === "notice" ? "Notice given" : kind === "withdraw" ? "Quote withdrawn" : "Fees claimed" }).then(() => q.reload());
  };
  return (
    <div className="nx-page">
      <div className="nx-head-row">
        <div className="nx-stack nx-gap12">
          <nav className="nx-crumb" aria-label="Breadcrumb"><Link href="/quote">Earn</Link><span aria-hidden="true">/</span><span className="nx-head" aria-current="page">Quote #{id}</span></nav>
          <div className="nx-row nx-wrap">
            <h1 className="nx-title">Quote #{id}</h1>
            {state ? <NxBadge tone={state === "committed" ? "pos" : state === "exiting" ? "warn" : "plain"} data-testid="quote-state">{state}</NxBadge> : null}
          </div>
        </div>
        {d ? <NoteLink tokenId={quoteNoteId(d.id)} /> : null}
      </div>
      <Gate>
        {q.error ? <RpcErrorBanner error={q.error} onRetry={q.reload} /> : q.loading && !d ? <LoadingBlock /> : !d ? (
          <Panel as="section" aria-label="Quote not found"><p className="nx-k" data-testid="quote-empty">No quote with id {id}. <Link className="nx-link" href="/quote">Commit a quote</Link>.</p></Panel>
        ) : (
          <Panel as="section" aria-label={`${d.collateral} quote`}>
            <Stats label="Quote">
              <Stat label="Remaining" size="mid" value={<span data-testid="quote-remaining">{formatUsdE6(d.remaining_usd_e6)}</span>} />
              <Stat label="Committed" size="mid" value={formatUsdE6(d.committed_usd_e6)} />
              <Stat label="Discount ceiling" size="mid" value={bpsToPct(d.max_discount_bps)} />
              <Stat label="Fees to claim" size="mid" tone="pos" value={<span data-testid="quote-fees">{formatUsdE6(d.claimable_fees_usd_e6 ?? "0")}</span>} />
            </Stats>
            <div>
              <Kvr k="Buyer" v={d.buyer} testId="quote-buyer" />
              <Kvr k="Collateral" v={`${d.collateral} (mock)`} />
              <Kvr k="Notice period" v={formatDuration(nsToSeconds(d.notice_period_ns))} />
              <Kvr k="Unlock" v={unlock === null ? "no notice given" : unlock > now ? `in ${formatDuration(unlock - now)}` : "unlocked"} />
              <Kvr k="Voluntary fills" v={d.accepts_voluntary_fills ? "accepted (Profit-Lock)" : "off"} />
            </div>
            {mine ? (
              <div className="nx-row nx-wrap">
                {state === "committed" ? <button type="button" className="nx-btn quiet" onClick={() => act("notice")}>Give notice</button> : null}
                {state === "withdrawable" ? <button type="button" className="nx-btn" onClick={() => act("withdraw")}>Withdraw quote</button> : null}
                <button type="button" className="nx-btn quiet" onClick={() => act("claim")}>Claim fees</button>
              </div>
            ) : (
              <span className="nx-k">Actions appear for the buyer account. Testnet, mock collateral.</span>
            )}
          </Panel>
        )}
      </Gate>
    </div>
  );
}
