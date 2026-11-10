"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, Segmented } from "@nectar/ui";
import { NOTE_PAGE, parseNoteId, type NoteKind, type NoteToken } from "@nectar/sdk";
import { useChain, useFeature, useView, useWallet } from "@/components/AppProvider";
import { Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { NoteCard, NotesOff } from "@/components/Notes";

type Filter = "ALL" | NoteKind;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "QUOTE", label: "QUOTE" },
  { value: "LOAN", label: "LOAN" },
  { value: "RESERVE", label: "RESERVE" },
];

/** /notes (PRD §12.1): the connected account's Position Notes, pages of 20. v2 + features.notes only. */
export default function NotesPage() {
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
  const d = data.data;
  const shown = (d?.tokens ?? []).filter((t) => filter === "ALL" || parseNoteId(t.token_id)?.kind === filter);
  const pages = d ? Math.max(1, Math.ceil(d.total / NOTE_PAGE)) : 1;

  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Position Notes</span>
        <h1>Your Notes</h1>
        <p className="lead">
          Every quote and every loan is a transferable Note: a live card drawn by the contract from its current figures. Whoever holds a Note holds the quote or the loan behind it. Testnet, mock collateral.
        </p>
      </div>
      <Gate wallet={on} action="see your Notes">
        {!on ? (
          <NotesOff what="Position Notes" generation={generation} />
        ) : !accountId ? null : (
          <div className="stack">
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <Segmented label="Type" value={filter} options={FILTERS} onChange={setFilter} />
              <span className="caption" data-testid="notes-total">
                {d ? `${d.total} Note${d.total === 1 ? "" : "s"}` : "—"}
              </span>
            </div>
            {data.error ? (
              <RpcErrorBanner error={data.error} onRetry={data.reload} />
            ) : data.loading && !d ? (
              <LoadingBlock />
            ) : d && d.total === 0 ? (
              <Card label="No Notes yet">
                <p className="small" data-testid="notes-empty">
                  This account holds no Notes. <Link className="link" href="/quote/new">Post a quote</Link>, <Link className="link" href="/borrow">open a loan</Link>
                  {reserveOn ? <>, or <Link className="link" href="/reserve">join the Reserve</Link></> : null} and its Note appears here.
                </p>
              </Card>
            ) : (
              <>
                {shown.length === 0 ? (
                  <p className="small" data-testid="notes-filter-empty">No {filter} Notes on this page.</p>
                ) : (
                  <div className="note-grid" data-testid="notes-grid">
                    {shown.map((t) => (
                      <NoteCard key={t.token_id} tokenId={t.token_id} />
                    ))}
                  </div>
                )}
                {pages > 1 ? (
                  <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Button size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
                    <span className="caption" data-testid="notes-page">Page {page + 1} of {pages}</span>
                    <Button size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </Gate>
    </div>
  );
}
