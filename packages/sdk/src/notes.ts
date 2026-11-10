// Position Notes (interface-v7 §C, WO-22) and the Nectar Reserve (WO-23b, PRD §4.8). Integers only; the contract stays authoritative.
//   token ids: `q-<quote_id>` (Quote Note), `p-<position_id>` (Loan Note), `r-<collateral>-<n>` (Reserve Note)
//   nft_transfer: Note owner, exactly 1 yocto; refused while `nft_transfer_locked` (a pending settlement references the Note)
//   set_quote_remote_recipient(quote_id, recipient?): Quote Note owner, no deposit (not #[payable]); refused while locked
//   JoinNectarReserve{collateral}: ft_transfer_call of USDC, ≥ 10_000_000 e6 (WO-23b, merged 67a5426)
//   set_reserve_params(symbol, discount_bps, notice_ns?): owner (txV2.setReserveParams); replaces v1 `set_reserve`
import type { AccountId, Bps, FtOnTransferMsg, U128, U64 } from "./types";
import { ONE_YOCTO, assertAccountId, assertU128, assertU64, coreCall, ftTransferCall, type TxIntent } from "./msg";
import { isSolanaAddress } from "./solana";

// ---------------------------------------------------------------- ids

export type NoteKind = "QUOTE" | "LOAN" | "RESERVE";
export const NOTE_KINDS: readonly NoteKind[] = ["QUOTE", "LOAN", "RESERVE"] as const;

export type NoteRef =
  | { kind: "QUOTE"; id: string; quote_id: U64 }
  | { kind: "LOAN"; id: string; position_id: U64 }
  | { kind: "RESERVE"; id: string; collateral: string; n: U64 };

const DEC = "(0|[1-9][0-9]*)";
const Q_RE = new RegExp(`^q-${DEC}$`);
const P_RE = new RegExp(`^p-${DEC}$`);
const R_RE = new RegExp(`^r-([A-Za-z0-9._]{1,32})-${DEC}$`);

/** Mirror of contract `notes::parse_note_id` (plus the `r-` form reserved for WO-23b). Null for anything else. */
export function parseNoteId(id: string): NoteRef | null {
  if (id.length > 64) return null;
  let m = Q_RE.exec(id);
  if (m && BigInt(m[1]!) < 1n << 64n) return { kind: "QUOTE", id, quote_id: m[1]! };
  m = P_RE.exec(id);
  if (m && BigInt(m[1]!) < 1n << 64n) return { kind: "LOAN", id, position_id: m[1]! };
  m = R_RE.exec(id);
  if (m && BigInt(m[2]!) < 1n << 64n) return { kind: "RESERVE", id, collateral: m[1]!, n: m[2]! };
  return null;
}

export const quoteNoteId = (quote_id: U64 | number): string => `q-${assertU64(String(quote_id), "quote_id")}`;
export const positionNoteId = (position_id: U64 | number): string => `p-${assertU64(String(position_id), "position_id")}`;
export const noteHref = (token_id: string): string => `/note/${encodeURIComponent(token_id)}`;
export const noteKindLabel = (k: NoteKind): string => (k === "QUOTE" ? "Quote Note" : k === "LOAN" ? "Loan Note" : "Reserve Note");

// ---------------------------------------------------------------- views (NEP-171 / NEP-177 / NEP-181)

export interface NoteTokenMetadata {
  title?: string | null;
  description?: string | null;
  media?: string | null;
  media_hash?: string | null;
  copies?: number | null;
  [extra: string]: unknown;
}

/** `nft_token(token_id)` / `nft_tokens_for_owner` items. */
export interface NoteToken {
  token_id: string;
  owner_id: AccountId;
  metadata?: NoteTokenMetadata | null;
  approved_account_ids?: Record<string, number> | null;
}

/** NEP-181 pages are capped at 20 by the contract (`MAX_NOTE_PAGE`). */
export const NOTE_PAGE = 20;

// ---------------------------------------------------------------- SVG (rendered as <img>, never innerHTML)

/** Upper bound on a Note SVG the web app will render (the contract template fills to ~2 KB). */
export const NOTE_SVG_MAX_BYTES = 16_384;
const SVG_TAGS = new Set(["svg", "g", "rect", "text", "tspan", "title", "desc", "line", "path", "circle"]);
const SVG_ATTRS = new Set([
  "xmlns", "width", "height", "viewBox", "x", "y", "rx", "ry", "x1", "x2", "y1", "y2", "cx", "cy", "r", "d",
  "fill", "fill-opacity", "stroke", "stroke-opacity", "stroke-width", "opacity",
  "font-family", "font-size", "font-weight", "letter-spacing", "text-anchor", "dominant-baseline",
]);

/**
 * Validates a Note SVG against an allow-list (tags, attributes, no entities/CDATA/comments/processing instructions, no `url(`,
 * no `href`, no `on*`, no `style`) and returns it as a `data:image/svg+xml` URI for an `<img src>`; null if anything is off.
 * An `<img>` already runs no script; the allow-list also keeps external fetches out (the app makes no runtime requests but RPC).
 */
export function noteSvgDataUri(svg: string | null | undefined): string | null {
  if (typeof svg !== "string") return null;
  const s = svg.trim();
  if (!s.startsWith("<svg") || !s.endsWith("</svg>")) return null;
  if (new TextEncoder().encode(s).length > NOTE_SVG_MAX_BYTES) return null;
  if (/<[!?]|&(?!(amp|lt|gt|quot|apos|#\d{1,6});)|url\s*\(|javascript:|data:/i.test(s)) return null;
  const tagRe = /<\/?([A-Za-z][A-Za-z0-9:-]*)((?:\s+[^\s=<>/"']+\s*=\s*"[^"<>]*")*)\s*\/?>/g;
  let rest = s;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(s)) !== null) {
    if (!SVG_TAGS.has(m[1]!)) return null;
    const attrRe = /([^\s=<>/"']+)\s*=\s*"([^"<>]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(m[2] ?? "")) !== null) {
      if (!SVG_ATTRS.has(a[1]!)) return null;
    }
    rest = rest.replace(m[0], "");
  }
  // Whatever is left is text content: it must not contain markup.
  if (/[<>]/.test(rest)) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
}

// ---------------------------------------------------------------- Reserve (WO-23b merged 67a5426; shapes = contracts/nectar-core/src/types.rs)

/** Smallest Reserve deposit: $10 (contract `RESERVE_MIN_DEPOSIT_USD_E6`; `get_reserve.min_deposit_usd_e6` is authoritative). */
export const RESERVE_MIN_DEPOSIT_USD_E6 = 10_000_000n;
/** Default exit notice: 7 days (contract `RESERVE_NOTICE_NS`; `get_reserve.notice_period_ns` is authoritative). */
export const RESERVE_NOTICE_NS = 7n * 86_400n * 1_000_000_000n;
/** Owner `set_reserve_params.notice_ns` bounds (contract `RESERVE_MIN_NOTICE_NS` ..= `RESERVE_MAX_NOTICE_NS`). */
export const RESERVE_MIN_NOTICE_NS = 60n * 1_000_000_000n;
export const RESERVE_MAX_NOTICE_NS = 30n * 86_400n * 1_000_000_000n;
/** D-024: the only label for the Reserve return. Fees only (not seized units), historical, never promised. */
export const REALISED_APR_LABEL = "Realised fee APR (trailing 7 days)";

/** Contract `ReservePool` (v2 `get_collateral(..).reserve`). R_c = usdc_e6 − notice_usdc_e6. */
export interface ReservePool {
  shares: U128;
  usdc_e6: U128;
  notice_usdc_e6: U128;
  units: U128;
  /** 0 = Reserve disabled (no deposits, no fills). */
  discount_bps: Bps;
  acc_fee_per_share_e18: U128;
  acc_units_per_share_e18: U128;
  /** 0 = default 7 days. */
  notice_ns: U64;
  fee_days: { day: number; fees_usd_e6: U128 }[];
}

/** Contract `ReserveView` = `get_reserve(symbol)` (panics for an unknown symbol). */
export interface ReserveView {
  symbol: string;
  /** R_c: USDC of active shares (counts toward Q_c + R_c + D_c). */
  r_usd_e6: U128;
  shares: U128;
  usdc_e6: U128;
  notice_usdc_e6: U128;
  units: U128;
  /** 0 = disabled: `JoinNectarReserve` is refused (`reserve_disabled`). */
  discount_bps: Bps;
  acc_fee_per_share_e18: U128;
  acc_units_per_share_e18: U128;
  /** USDC value of 1e6 shares. */
  share_price_e6: U128;
  min_deposit_usd_e6: U128;
  notice_period_ns: U64;
  /** Reserve fee accruals over the trailing 7 UTC days (incl. today). */
  fees_7d_usd_e6: U128;
  /** fees_7d · 365 / 7 / R_c in bps (0 when R_c = 0). Historical, never promised. */
  realised_apr_7d_bps: U128;
}

/** Contract `ReserveNote` (stored Note; `unlock_ns` null until `initiate_reserve_exit`). */
export interface ReserveNote {
  note_id: string;
  collateral: string;
  owner: AccountId;
  deposited_usd_e6: U128;
  /** Active shares; 0 once the exit is initiated. */
  shares: U128;
  unit_debt: U128;
  fee_debt: U128;
  claimable_units: U128;
  claimable_fees_usd_e6: U128;
  unlock_ns: U64 | null;
  exit_shares: U128;
  exit_usdc_e6: U128;
  exited: boolean;
  created_ns: U64;
}

/** Contract `ReserveNoteView` = `get_reserve_note(note_id)` (null for an unknown id). Top-level claimables include accruals. */
export interface ReserveNoteView {
  note: ReserveNote;
  /** USDC value of the active shares now (`exit_usdc_e6` once in notice). */
  value_usd_e6: U128;
  claimable_units: U128;
  claimable_fees_usd_e6: U128;
  can_complete: boolean;
  /** A settlement that may reach this asset's Reserve is pending: `nft_transfer` is refused. */
  transfer_locked: boolean;
}

export type ReserveExitState = { kind: "none" } | { kind: "notice"; seconds_left: number } | { kind: "ready" } | { kind: "exited" };

/** Mirrors `complete_reserve_exit`'s checks (notice over, not exited, something to pay). */
export function reserveExitState(
  v: Pick<ReserveNoteView, "note" | "value_usd_e6" | "claimable_units" | "claimable_fees_usd_e6">,
  now_ns: bigint,
): ReserveExitState {
  if (v.note.exited) return { kind: "exited" };
  if (v.note.unlock_ns == null) return { kind: "none" };
  const u = BigInt(v.note.unlock_ns);
  if (u > now_ns) return { kind: "notice", seconds_left: Number((u - now_ns + 999_999_999n) / 1_000_000_000n) };
  const any = BigInt(v.value_usd_e6) > 0n || BigInt(v.claimable_units) > 0n || BigInt(v.claimable_fees_usd_e6) > 0n;
  return any ? { kind: "ready" } : { kind: "exited" };
}

/** `realised_apr_7d_bps` as "4.12 %" (integer math, truncated); "no active deposits" when R_c = 0. Never a promised rate. */
export function formatRealisedApr(apr_7d_bps: U128 | null | undefined, r_usd_e6?: U128 | null): string {
  if (r_usd_e6 != null && BigInt(r_usd_e6) === 0n) return "no active deposits";
  if (apr_7d_bps == null || !/^\d+$/.test(apr_7d_bps)) return "—";
  const b = BigInt(apr_7d_bps);
  return `${b / 100n}.${(b % 100n).toString().padStart(2, "0")} %`;
}

/** A notice period in ns as "7 days", "1 day", "2 h", "5 min" or "90 s". */
export function formatNoticePeriod(ns: U64 | bigint): string {
  const s = BigInt(ns) / 1_000_000_000n;
  if (s > 0n && s % 86_400n === 0n) return `${s / 86_400n} day${s === 86_400n ? "" : "s"}`;
  if (s > 0n && s % 3_600n === 0n) return `${s / 3_600n} h`;
  if (s > 0n && s % 60n === 0n) return `${s / 60n} min`;
  return `${s} s`;
}

// ---------------------------------------------------------------- gas, msgs, calls

export const NOTE_GAS_TGAS = {
  /** Moves owner index rows, rewrites buyer/borrower, emits nep171; sandbox attaches 100 (WO-22). Re-measure at G2b. */
  nftTransfer: 50,
  setQuoteRemoteRecipient: 30,
  joinReserve: 100,
  initiateReserveExit: 50,
  /** USDC + collateral ft_transfers with callbacks. */
  completeReserveExit: 150,
} as const;

export const msgNotes = {
  joinNectarReserve(collateral: string): FtOnTransferMsg {
    if (!/^[A-Za-z0-9._]{1,32}$/.test(collateral)) throw new Error("collateral must be a collateral symbol");
    return { JoinNectarReserve: { collateral } };
  },
};

function noteIdArg(token_id: string): string {
  if (!parseNoteId(token_id)) throw new Error(`token_id must be q-<id>, p-<id> or r-<collateral>-<n>, got ${JSON.stringify(token_id)}`);
  return token_id;
}

export const txNotes = {
  /** NEP-171 `nft_transfer`, 1 yocto. `memo` is sent only when set. */
  nftTransfer: (core: string, token_id: string, receiver_id: string, memo?: string | null): TxIntent => {
    const args: Record<string, unknown> = { receiver_id: assertAccountId(receiver_id, "receiver_id"), token_id: noteIdArg(token_id) };
    if (memo) {
      if (memo.length > 128) throw new Error("memo is at most 128 characters");
      args.memo = memo;
    }
    return coreCall(core, "nft_transfer", args, { gasTgas: NOTE_GAS_TGAS.nftTransfer, deposit: ONE_YOCTO, label: "Transfer Note" });
  },
  /** Quote Note owner; `recipient` null clears it. No deposit (the method is not payable). */
  setQuoteRemoteRecipient: (core: string, quote_id: U64, recipient: string | null): TxIntent => {
    if (recipient !== null && !isSolanaAddress(recipient)) throw new Error("recipient must be a Solana address (base58)");
    return coreCall(core, "set_quote_remote_recipient", { quote_id: assertU64(quote_id, "quote_id"), recipient }, {
      gasTgas: NOTE_GAS_TGAS.setQuoteRemoteRecipient,
      deposit: "0",
      label: recipient ? "Set Solana recipient" : "Clear Solana recipient",
    });
  },
  joinReserve: (usdc: string, core: string, amount_usd_e6: U128, collateral: string): TxIntent => {
    const amt = assertU128(amount_usd_e6, "amount");
    if (BigInt(amt) < RESERVE_MIN_DEPOSIT_USD_E6) throw new Error("the Reserve takes at least $10");
    return ftTransferCall({ token: usdc, core, amount: amt, msg: msgNotes.joinNectarReserve(collateral), gasTgas: NOTE_GAS_TGAS.joinReserve, label: "Join the Nectar Reserve" });
  },
  initiateReserveExit: (core: string, note_id: string): TxIntent => {
    const r = parseNoteId(note_id);
    if (r?.kind !== "RESERVE") throw new Error("note_id must be a Reserve Note (r-<collateral>-<n>)");
    return coreCall(core, "initiate_reserve_exit", { note_id }, { gasTgas: NOTE_GAS_TGAS.initiateReserveExit, deposit: ONE_YOCTO, label: "Give Reserve notice" });
  },
  completeReserveExit: (core: string, note_id: string): TxIntent => {
    const r = parseNoteId(note_id);
    if (r?.kind !== "RESERVE") throw new Error("note_id must be a Reserve Note (r-<collateral>-<n>)");
    return coreCall(core, "complete_reserve_exit", { note_id }, { gasTgas: NOTE_GAS_TGAS.completeReserveExit, deposit: ONE_YOCTO, label: "Exit the Reserve" });
  },
};

// ---------------------------------------------------------------- share link and transfer reason

/** A tweet-intent URL the user clicks (no automation, no API call). */
export function shareToXUrl(token_id: string, pageUrl: string): string {
  const r = parseNoteId(token_id);
  const what = r ? noteKindLabel(r.kind) : "Note";
  const text = `My Nectar ${what} ${token_id} on NEAR testnet (mock collateral).`;
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}`;
}

/** Why the transfer button is disabled, or null. */
export function noteTransferBlock(o: { viewer: string | null; owner: string | null | undefined; locked: boolean | undefined; receiver: string }): string | null {
  if (!o.viewer) return "Connect the owner's wallet to transfer this Note.";
  if (o.owner && o.viewer !== o.owner) return "Only the Note's owner can transfer it.";
  if (o.locked) return "A settlement that references this Note is in flight; transfers reopen once it completes.";
  if (!o.receiver) return "Enter the receiving NEAR account.";
  if (!/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(o.receiver) || o.receiver.length < 2 || o.receiver.length > 64) return "Not a NEAR account id.";
  if (o.receiver === o.owner) return "The receiver already owns this Note.";
  return null;
}
