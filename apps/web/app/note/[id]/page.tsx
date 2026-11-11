"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner, Button, Card, Field, Kv } from "@nectar/ui";
import {
  formatGas,
  formatUsdE6,
  isAccountId,
  isSolanaAddress,
  noteKindLabel,
  noteNeedsRetype,
  noteTransferBlock,
  nsToUtc,
  parseNoteId,
  receiverNeedsLookup,
  shareToXUrl,
  txNotes,
  type NoteToken,
  type QuoteView,
  type ReceiverCheck,
  type ReserveNoteView,
} from "@nectar/sdk";
import { useChain, useFeature, useSign, useView, useWallet } from "@/components/AppProvider";
import { Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { NoteHistory, NoteImage, NoteKindBadge, NotesOff } from "@/components/Notes";

const LOCK_REASON = "A settlement that references this Note is in flight; transfers reopen once it completes.";

/** The receiver as typed, settled for 350 ms, so `view_account` runs once per pause rather than once per keystroke. */
function useSettled(v: string, ms = 350): string {
  const [out, setOut] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setOut(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return out;
}

/** /note/[id] (PRD §12.1): live SVG, owner, history, transfer (disabled while a settlement is in flight), Share to X. */
export default function NotePage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id ?? "");
  const ref = parseNoteId(id);
  const { config, generation } = useChain();
  const { accountId } = useWallet();
  const on = useFeature("notes");
  const reserveOn = useFeature("reserve");
  const sign = useSign();
  const note = useView<{ token: NoteToken | null; locked: boolean }>(
    on && ref
      ? async (v) => {
          const token = await v.nftToken(id);
          return { token, locked: token ? await v.nftTransferLocked(id) : false };
        }
      : null,
    [on, id],
  );
  const token = note.data?.token;
  const locked = note.data?.locked ?? false;
  const owner = token?.owner_id ?? null;
  const mine = Boolean(accountId && owner === accountId);
  const quote = useView<QuoteView | null>(on && ref?.kind === "QUOTE" && token ? (v) => v.getQuote(ref.quote_id) : null, [on, id, Boolean(token)]);
  const rnote = useView<ReserveNoteView | null>(on && reserveOn && ref?.kind === "RESERVE" && token ? (v) => v.getReserveNote(id) : null, [on, reserveOn, id, Boolean(token)]);

  const [receiver, setReceiver] = useState("");
  const [retype, setRetype] = useState("");
  const [memo, setMemo] = useState("");
  const [recipient, setRecipient] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  useEffect(() => setPageUrl(window.location.href), [id]);

  const label = ref ? noteKindLabel(ref.kind) : "Note";
  // R2-09: a named receiver must exist (view_account) before Transfer turns on; implicit accounts (64-hex, 0x…) need not.
  const rcv = receiver.trim();
  const settled = useSettled(rcv);
  const lookup = mine && !locked && settled === rcv && isAccountId(rcv) && rcv !== owner && receiverNeedsLookup(rcv);
  const exists = useView<boolean>(lookup ? (v) => v.accountExists(rcv) : null, [lookup, rcv]);
  const receiverCheck: ReceiverCheck = !receiverNeedsLookup(rcv)
    ? "implicit"
    : !lookup || exists.loading || (exists.data === undefined && !exists.error)
      ? "checking"
      : exists.error
        ? { error: exists.error }
        : exists.data
          ? "exists"
          : "unknown";
  const retypeNeeded = noteNeedsRetype(ref?.kind);
  const block = noteTransferBlock({ viewer: accountId, owner, locked, receiver: rcv, receiverCheck, retyped: retypeNeeded ? retype : null });
  const transfer = async () => {
    if (!config.core || block) return;
    const intent = txNotes.nftTransfer(config.core, id, rcv, memo.trim() || null);
    const out = await sign(intent, {
      success: "Note transferred",
      summary: (
        <p className="small">
          Moves {label} <span className="mono">{id}</span> to <span className="mono">{receiver.trim()}</span>. The {ref?.kind === "LOAN" ? "loan (debt and collateral claim)" : ref?.kind === "QUOTE" ? "quote, its fees and any remote recipient" : "Reserve claim"} moves with it
          {ref?.kind === "QUOTE" ? "; the Solana recipient is cleared" : ""}. Gas {formatGas(intent.gas)}, deposit 1 yoctoNEAR.
        </p>
      ),
    });
    if (out?.ok) {
      setReceiver("");
      setRetype("");
      setMemo("");
    }
    note.reload();
  };
  const recipientErr = recipient.trim() && !isSolanaAddress(recipient.trim()) ? "Not a Solana address (base58)" : null;
  const setRemote = async (value: string | null) => {
    if (!config.core || ref?.kind !== "QUOTE") return;
    await sign(txNotes.setQuoteRemoteRecipient(config.core, ref.quote_id, value), {
      success: value ? "Solana recipient set" : "Solana recipient cleared",
      summary: <p className="small">Remote (Solana devnet) fills of quote #{ref.quote_id} {value ? <>pay <span className="mono">{value}</span></> : "fall back to NEAR"}. The 1 yoctoNEAR deposit makes your wallet confirm the change.</p>,
    });
    setRecipient("");
    quote.reload();
  };

  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Position Note</span>
        <h1>
          {label} {ref ? id : ""}
        </h1>
      </div>
      <Gate>
        {!on ? (
          <NotesOff what="Position Notes" generation={generation} />
        ) : !ref ? (
          <Card label="Not a Note id">
            <p className="small">Note ids look like <span className="mono">q-3</span> (quote), <span className="mono">p-7</span> (loan) or <span className="mono">r-NVDAx-1</span> (Reserve).</p>
          </Card>
        ) : note.error ? (
          <RpcErrorBanner error={note.error} onRetry={note.reload} />
        ) : note.loading && !note.data ? (
          <LoadingBlock />
        ) : !token ? (
          <Card label="No such Note">
            <p className="small" data-testid="note-missing">No Note <span className="mono">{id}</span> has been minted on the connected contract.</p>
          </Card>
        ) : (
          <div className="grid-2">
            <div className="stack">
              <NoteImage tokenId={id} alt={`${label} ${id}: live card with its current figures`} testId="note-svg" />
              <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <NoteKindBadge kind={ref.kind} />
                {pageUrl ? (
                  <a className="link" href={shareToXUrl(id, pageUrl)} target="_blank" rel="noreferrer noopener" data-testid="note-share">
                    Share to X
                  </a>
                ) : null}
              </div>
              <Card label="History">
                <NoteHistory tokenId={id} />
              </Card>
            </div>
            <div className="stack">
              <Card label="Note">
                <div className="kvs">
                  <Kv k="Owner" v={<span data-testid="note-owner">{owner}</span>} />
                  <Kv k="Type" v={label} />
                  {ref.kind === "QUOTE" ? <Kv k="Quote" v={<Link className="link" href={`/quote/${ref.quote_id}`}>#{ref.quote_id}</Link>} /> : null}
                  {ref.kind === "LOAN" ? <Kv k="Position" v={<Link className="link" href={`/position/${ref.position_id}`}>#{ref.position_id}</Link>} /> : null}
                  {ref.kind === "RESERVE" ? <Kv k="Reserve" v={reserveOn ? <Link className="link" href="/reserve">{ref.collateral}</Link> : ref.collateral} /> : null}
                  <Kv k="Transfers" v={<span data-testid="note-lock">{locked ? "locked (settlement in flight)" : "open"}</span>} />
                </div>
              </Card>
              {ref.kind === "RESERVE" && rnote.data ? (
                <Card label="Reserve claim">
                  <div className="kvs">
                    <Kv k="Deposited" v={formatUsdE6(rnote.data.note.deposited_usd_e6)} />
                    <Kv k="USDC value" v={<span data-testid="note-reserve-value">{formatUsdE6(rnote.data.value_usd_e6)}</span>} />
                    <Kv k="Claimable fees" v={formatUsdE6(rnote.data.claimable_fees_usd_e6)} />
                    <Kv k="Notice" v={<span data-testid="note-reserve-notice">{rnote.data.note.exited ? "exited" : rnote.data.note.unlock_ns ? `given, unlocks ${nsToUtc(rnote.data.note.unlock_ns)}` : "not given"}</span>} />
                  </div>
                </Card>
              ) : null}
              <Card label="Transfer">
                <div className="stack">
                  {locked ? (
                    <Banner tone="warn" title="Transfer disabled">
                      {LOCK_REASON}
                    </Banner>
                  ) : null}
                  <Field label="Receiver (NEAR account)" value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="alice.testnet" autoComplete="off" spellCheck={false} disabled={!mine || locked}
                    hint={receiverCheck === "exists" && rcv ? <span data-testid="note-receiver-ok">{rcv} exists on NEAR testnet.</span> : receiverCheck === "implicit" && rcv ? "Implicit account: it does not need to exist yet. Make sure you hold its key." : undefined} />
                  {retypeNeeded ? (
                    <Field label="Type the receiver again" value={retype} onChange={(e) => setRetype(e.target.value)} autoComplete="off" spellCheck={false} disabled={!mine || locked}
                      hint={`The ${ref?.kind === "LOAN" ? "loan" : ref?.kind === "QUOTE" ? "quote, its escrow and fees" : "Reserve claim"} moves with this Note and cannot be pulled back.`} onPaste={(e) => e.preventDefault()} />
                  ) : null}
                  {exists.error && lookup ? (
                    <Button size="sm" onClick={exists.reload} data-testid="note-receiver-retry">
                      Check the account again
                    </Button>
                  ) : null}
                  <Field label="Memo (optional)" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={128} disabled={!mine || locked} />
                  <Button variant="primary" disabled={Boolean(block)} onClick={transfer} data-testid="note-transfer">
                    Transfer Note
                  </Button>
                  {block ? <p className="caption" data-testid="note-transfer-reason">{block}</p> : <p className="caption">nft_transfer · 1 yoctoNEAR · the wallet opens after the review.</p>}
                </div>
              </Card>
              {ref.kind === "QUOTE" && mine ? (
                <Card label="Solana recipient" data-testid="note-remote-recipient">
                  <div className="stack">
                    <p className="small">
                      Where your share of a remote (Solana devnet) settlement is paid. Current: <span className="mono">{quote.data?.buyer_remote_recipient ?? "none (paid on NEAR)"}</span>. A transfer of this Note clears it.
                    </p>
                    {locked ? <p className="caption">{LOCK_REASON}</p> : null}
                    <Field label="Solana address" value={recipient} onChange={(e) => setRecipient(e.target.value)} error={recipientErr ?? undefined} autoComplete="off" spellCheck={false} disabled={locked} />
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <Button disabled={locked || !recipient.trim() || Boolean(recipientErr)} onClick={() => setRemote(recipient.trim())} data-testid="note-remote-set">
                        Set recipient
                      </Button>
                      {quote.data?.buyer_remote_recipient ? (
                        <Button variant="ghost" disabled={locked} onClick={() => setRemote(null)}>
                          Clear
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              ) : null}
            </div>
          </div>
        )}
      </Gate>
    </div>
  );
}
