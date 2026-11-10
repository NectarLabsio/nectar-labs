"use client";
import Link from "next/link";
import { Badge, Banner } from "@nectar/ui";
import { noteHref, noteKindLabel, noteSvgDataUri, parseNoteId, type NoteKind } from "@nectar/sdk";
import { useFeature, useView } from "./AppProvider";
import { useFeedApi } from "./useFeedApi";

/**
 * The live Note SVG from `nft_token_svg`, rendered as an <img> from a sanitized data URI (never innerHTML).
 * A Note that fails the allow-list shows a placeholder instead of the image.
 */
export function NoteImage({ tokenId, alt, testId }: { tokenId: string; alt: string; testId?: string }) {
  const svg = useView<string>((v) => v.nftTokenSvg(tokenId), [tokenId]);
  if (svg.loading && svg.data === undefined) return <div className="note-img placeholder" role="status" aria-busy="true" aria-label={`Loading ${alt}`} data-testid={testId ? `${testId}-loading` : undefined} />;
  if (svg.error) return <div className="note-img placeholder" data-testid={testId ? `${testId}-error` : undefined}>The Note image could not be read from testnet.</div>;
  const uri = noteSvgDataUri(svg.data);
  if (!uri) return <div className="note-img placeholder" data-testid={testId ? `${testId}-rejected` : undefined}>The Note image did not pass the SVG allow-list, so it is not shown.</div>;
  // eslint-disable-next-line @next/next/no-img-element -- a data: URI from the contract; next/image adds nothing here
  return <img className="note-img" src={uri} alt={alt} width={600} height={360} data-testid={testId} />;
}

export function NoteKindBadge({ kind }: { kind: NoteKind }) {
  return <Badge kind={kind === "LOAN" ? "info" : kind === "RESERVE" ? "verified" : "neutral"}>{kind}</Badge>;
}

/** A thumbnail card linking to /note/[id]. */
export function NoteCard({ tokenId, owner }: { tokenId: string; owner?: string }) {
  const r = parseNoteId(tokenId);
  const label = r ? noteKindLabel(r.kind) : "Note";
  return (
    <Link className="note-card" href={noteHref(tokenId)} data-testid={`note-card-${tokenId}`} aria-label={`${label} ${tokenId}`}>
      <NoteImage tokenId={tokenId} alt={`${label} ${tokenId}: live card with its current figures`} testId={`note-img-${tokenId}`} />
      <span className="note-meta">
        <span className="mono">{tokenId}</span>
        {r ? <NoteKindBadge kind={r.kind} /> : null}
      </span>
      {owner ? <span className="caption">owner {owner}</span> : null}
    </Link>
  );
}

/** "View Note p-7" from /position/[id] and /quote/[id]; renders nothing unless v2 + features.notes. */
export function NoteLink({ tokenId }: { tokenId: string }) {
  const on = useFeature("notes");
  if (!on) return null;
  const r = parseNoteId(tokenId);
  return (
    <Link className="link" href={noteHref(tokenId)} data-testid="note-link">
      View {r ? noteKindLabel(r.kind) : "Note"} {tokenId}
    </Link>
  );
}

interface FeedNoteEvent {
  event: string;
  at_ns?: string;
  tx_hash?: string | null;
  data?: Record<string, unknown>;
}

const isEvents = (v: unknown): v is { events: FeedNoteEvent[] } =>
  Boolean(v && typeof v === "object" && Array.isArray((v as { events?: unknown }).events));

/** Note history from the Feed API (`/api/note/<id>`) when it is indexed; otherwise an honest "not indexed yet". */
export function NoteHistory({ tokenId }: { tokenId: string }) {
  const feed = useFeedApi<unknown>(`api/note/${encodeURIComponent(tokenId)}`);
  if (feed.loading) return <p className="small" role="status">Loading history…</p>;
  const events = !feed.error && isEvents(feed.data) ? feed.data.events.filter((e) => typeof e?.event === "string") : [];
  if (events.length === 0)
    return (
      <p className="small" data-testid="note-history-empty">
        History not indexed yet. Mints and transfers are NEP-297 <code>nep171</code> events in the contract logs; the Feed API does not serve them for Notes yet.
      </p>
    );
  return (
    <ul className="note-history" data-testid="note-history">
      {events.slice(0, 50).map((e, i) => (
        <li key={`${e.tx_hash ?? ""}-${i}`}>
          <span className="mono">{e.event}</span>
          <span className="caption">{e.at_ns ? new Date(Number(BigInt(e.at_ns) / 1_000_000n)).toISOString().replace(".000Z", "Z") : ""}</span>
        </li>
      ))}
    </ul>
  );
}

/** Shown when v2 + features.<flag> is off. */
export function NotesOff({ what, generation }: { what: string; generation: string | null }) {
  return (
    <Banner tone="info" title={`${what} are not enabled on this deployment`} role="status">
      {generation === "v2"
        ? `The connected contract supports ${what}, but the module is switched off until its gate passes.`
        : `${what} need the v2 nectar-core contract; the connected testnet contract is v1. Nothing here can be read yet.`}
    </Banner>
  );
}
