"use client";
// The Notes tab of /notes (PRD §12.1): the connected account's Position Notes, pages of 20. v2 + features.notes only.
import Link from "next/link";
import { useState } from "react";
import tokA from "@nectar/ui/3d/tokA.webp";
import { Panel, Seg } from "@nectar/ui";
import { NOTE_PAGE, parseNoteId, type NoteKind, type NoteToken } from "@nectar/sdk";
import { useChain, useFeature, useView, useWallet } from "@/components/AppProvider";
import { LoadingBlock, RpcErrorBanner } from "@/components/states";
import { NoteCard, NotesOff } from "@/components/Notes";

type Filter = "ALL" | NoteKind;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "QUOTE", label: "QUOTE" },
  { value: "LOAN", label: "LOAN" },
  { value: "RESERVE", label: "RESERVE" },
];

export function NotesTab() {
  const { generation } = useChain();
  const { accountId } = useWallet();
  const on = useFeature("notes");
  const reserveOn = useFeature("reserve");
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<Filter>("ALL");
  const data = useView<{ total: number; tokens: NoteToken[] }>(
    on && accountId
      ? async (v) => {
          const [total, tokens] = await Promise.all([v.nftSupplyForOwner(accountId), v.nftTokensForOwner(accountId, page * NOTE_PAGE, NOTE_PAGE)]);
          return { total: Number(total), tokens };
        }
      : null,
    [on, accountId, page],
  );
  if (!on) return <NotesOff what="Position Notes" generation={generation} />;
  const d = data.data;
  const shown = (d?.tokens ?? []).filter((t) => filter === "ALL" || parseNoteId(t.token_id)?.kind === filter);
  const pages = d ? Math.max(1, Math.ceil(d.total / NOTE_PAGE)) : 1;
  return (
    <div className="nx-stack nx-gap18">
      <div className="nx-ph">
        <Seg<Filter> label="Type" value={filter} options={FILTERS} onChange={setFilter} />
        <span className="nx-k" data-testid="notes-total">{d ? `${d.total} Note${d.total === 1 ? "" : "s"}` : "—"}</span>
      </div>
      {data.error ? (
        <RpcErrorBanner error={data.error} onRetry={data.reload} />
      ) : data.loading && !d ? (
        <LoadingBlock />
      ) : d && d.total === 0 ? (
        <Panel as="section" aria-label="No Notes yet">
          <p className="nx-k" data-testid="notes-empty">
            This account holds no Notes. <Link className="nx-link" href="/quote">Post a quote</Link>, <Link className="nx-link" href="/borrow">open a loan</Link>
            {reserveOn ? <>, or <Link className="nx-link" href="/reserve">join the Reserve</Link></> : null} and its Note appears here.
          </p>
        </Panel>
      ) : (
        <>
          {shown.length === 0 ? (
            <p className="nx-k" data-testid="notes-filter-empty">No {filter} Notes on this page.</p>
          ) : (
            <div className="note-grid" data-testid="notes-grid">
              {shown.map((t) => (
                <NoteCard key={t.token_id} tokenId={t.token_id} />
              ))}
              <aside className="nx-note-promo">
                <img src={tokA.src} alt="" width={64} height={64} />
                <span className="nx-mid">Every position is a Note</span>
                <span className="nx-k">Whoever holds it can repay, claim and receive leftover collateral. Transfers pause while a position settles.</span>
              </aside>
            </div>
          )}
          {pages > 1 ? (
            <div className="nx-row nx-wrap">
              <button type="button" className="nx-btn quiet sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</button>
              <span className="nx-k" data-testid="notes-page">Page {page + 1} of {pages}</span>
              <button type="button" className="nx-btn quiet sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
