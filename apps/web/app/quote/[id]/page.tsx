"use client";
import { useParams } from "next/navigation";
import { Badge, Button, Card, Kv } from "@nectar/ui";
import { formatDuration, formatUsdE6, nsToSeconds, quoteNoteId, tx, type QuoteView } from "@nectar/sdk";
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
  const state = !d ? null : BigInt(d.remaining_usd_e6) === 0n ? "consumed or withdrawn" : unlock === null ? "live" : unlock > now ? "exiting" : "withdrawable";
  const mine = d && accountId === d.buyer;
  const act = (kind: "notice" | "withdraw" | "claim") => {
    if (!config.core || !d) return;
    const t = kind === "notice" ? tx.initiateQuoteWithdrawal(config.core, d.id) : kind === "withdraw" ? tx.completeQuoteWithdrawal(config.core, d.id) : tx.claimFees(config.core, d.id);
    void sign(t, { success: kind === "notice" ? "Notice given" : kind === "withdraw" ? "Quote withdrawn" : "Fees claimed" }).then(() => q.reload());
  };
  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Pappus quote</span>
        <h1>Quote #{id}</h1>
      </div>
      <Gate>
        {q.error ? <RpcErrorBanner error={q.error} onRetry={q.reload} /> : q.loading ? <LoadingBlock /> : !d ? (
          <Card><p>No quote with id {id}.</p></Card>
        ) : (
          <Card label={`${d.collateral} · mock`} actions={<Badge kind={state === "live" ? "live" : state === "exiting" ? "warn" : "neutral"}>{state}</Badge>}
            footer={mine ? (
              <>
                {state === "live" ? <Button onClick={() => act("notice")}>Give notice</Button> : null}
                {state === "withdrawable" ? <Button variant="primary" onClick={() => act("withdraw")}>Withdraw quote</Button> : null}
                <Button onClick={() => act("claim")}>Claim fees</Button>
              </>
            ) : <span className="caption">Actions appear for the buyer account.</span>}>
            <div className="kvs">
              <Kv k="Buyer" v={d.buyer} />
              <Kv k="Committed" v={formatUsdE6(d.committed_usd_e6)} />
              <Kv k="Remaining" v={formatUsdE6(d.remaining_usd_e6)} />
              <Kv k="Max discount" v={`${d.max_discount_bps} bps`} />
              <Kv k="Notice period" v={formatDuration(nsToSeconds(d.notice_period_ns))} />
              <Kv k="Unlock" v={unlock === null ? "no notice given" : unlock > now ? `in ${formatDuration(unlock - now)}` : "unlocked"} />
              <Kv k="Claimable fees" v={d.claimable_fees_usd_e6 ? formatUsdE6(d.claimable_fees_usd_e6) : "—"} />
            </div>
            <NoteLink tokenId={quoteNoteId(d.id)} />
          </Card>
        )}
      </Gate>
    </div>
  );
}
