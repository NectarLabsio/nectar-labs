// Typed read-only client for nectar-core views (interface-p0.md "Views") and NEP-141 balance views (F-013).
// Request shape = near-api-js 7.4.0 JsonRpcProvider.callFunction (F-012), sent through the resilient transport in ./rpc.
import { RpcError, cachedTransport, resilientRpcTransport, rpcEndpoints, type ViewTransport } from "./rpc";
import type {
  BorrowPreview,
  CollateralView,
  ContractGeneration,
  CoreConfigView,
  ExitCapacity,
  HealthView,
  PoolView,
  OracleSource,
  PositionView,
  QuoterConfigView,
  QuoteView,
  RemoteConfigView,
  SessionWindow,
  FeeStackView,
  SelfSettlePreview,
  ShieldInput,
  ShieldView,
  U128,
  U64,
} from "./types";
import type { PendingRelease } from "./solana";
import type { PendingSettlement } from "./remote";
import { NOTE_PAGE, type NoteToken, type ReserveNoteView, type ReserveView } from "./notes";

/** interface-v7 §A6: v2 answers `contract_version()` with a "2." prefix ("2.0.0-v7"). Anything else (v1: "nectar-core 0.1.0 p2") is v1. */
export function contractGeneration(version: string | null | undefined): ContractGeneration {
  return typeof version === "string" && version.startsWith("2.") ? "v2" : "v1";
}

export { RpcError };
export type { ViewTransport };

/**
 * Retry (429 / 5xx, jittered backoff, 3 attempts, shared cooldown, 4 in flight) then fall back: `url` first, then the FastNEAR
 * testnet hosts (F-369). Answers are de-duplicated in flight and reused for 8 s (cachedTransport, WO-34f); `NectarViews.invalidate()` clears them.
 */
export function rpcTransport(url: string | readonly string[]): ViewTransport {
  return cachedTransport(resilientRpcTransport({ urls: rpcEndpoints(url) }));
}

type RawPosition = Omit<PositionView, "id">;
type RawQuote = Omit<QuoteView, "id">;

/** The contract names the keys `position_id` and `quote_id` (types.rs); `id` is the SDK's name for them. A view without the key is a shape bug, so it is not papered over. */
function withPositionId(p: RawPosition): PositionView {
  return { ...p, id: p.position_id };
}
function withQuoteId(q: RawQuote): QuoteView {
  return { ...q, id: q.quote_id };
}

export class NectarViews {
  constructor(
    readonly core: string,
    readonly t: ViewTransport,
  ) {}

  /** `rpcUrl` is the configured endpoint (or an ordered list); the FastNEAR testnet fallbacks are appended. */
  static fromRpc(core: string, rpcUrl: string | readonly string[]): NectarViews {
    return new NectarViews(core, rpcTransport(rpcUrl));
  }

  /** Forget cached view answers (explicit reload, e.g. after a transaction). */
  invalidate = (): void => this.t.clear?.();

  private v<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.t.call<T>(this.core, method, args);
  }

  /** R2-09: does `accountId` exist on chain? false = UNKNOWN_ACCOUNT. Throws on transport errors (callers fail closed). */
  accountExists = async (accountId: string): Promise<boolean> => {
    if (!this.t.viewAccount) throw new Error("this RPC transport cannot run view_account");
    return (await this.t.viewAccount(accountId)) !== null;
  };
  contractVersion = () => this.v<string>("contract_version");
  getConfig = () => this.v<CoreConfigView>("get_config");
  getCollateral = (symbol: string) => this.v<CollateralView | null>("get_collateral", { symbol });
  listCollaterals = (from_index = 0, limit = 50) => this.v<CollateralView[]>("list_collaterals", { from_index, limit });
  getExitCapacity = (symbol: string) => this.v<ExitCapacity>("get_exit_capacity", { symbol });
  getQuote = async (quote_id: U64): Promise<QuoteView | null> => {
    const q = await this.v<RawQuote | null>("get_quote", { quote_id });
    return q ? withQuoteId(q) : null;
  };
  listQuotes = async (symbol: string, from_index = 0, limit = 64): Promise<QuoteView[]> => (await this.v<RawQuote[]>("list_quotes", { symbol, from_index, limit })).map(withQuoteId);
  getPosition = async (position_id: U64): Promise<PositionView | null> => {
    const p = await this.v<RawPosition | null>("get_position", { position_id });
    return p ? withPositionId(p) : null;
  };
  listPositions = async (from_index = 0, limit = 50): Promise<PositionView[]> => (await this.v<RawPosition[]>("list_positions", { from_index, limit })).map(withPositionId);
  /** Every position, in pages of 100 (the contract's MAX_PAGE). */
  listAllPositions = async (): Promise<PositionView[]> => {
    const out: PositionView[] = [];
    for (let from = 0; from < 10_000; from += 100) {
      const page = await this.listPositions(from, 100);
      out.push(...page);
      if (page.length < 100) break;
    }
    return out;
  };
  getHealth = (position_id: U64) => this.v<HealthView>("get_health", { position_id });
  getPool = () => this.v<PoolView>("get_pool");
  /** `referrer` is a v2 argument; it is sent only when given, so v1 calls stay unchanged. */
  /** `referrer`, `shield` and `borrower` are v2 arguments; each is sent only when given, so v1 calls stay unchanged. */
  previewBorrow = (symbol: string, units: U128, borrow_usd_e6: U128, referrer?: string | null, shield?: ShieldInput | null, borrower?: string | null) => {
    const args: Record<string, unknown> = { symbol, units, borrow_usd_e6 };
    if (referrer) args.referrer = referrer;
    if (shield) args.shield = shield;
    if (borrower) args.borrower = borrower;
    return this.v<BorrowPreview>("preview_borrow", args);
  };
  /** "v1" | "v2" from `contract_version()`. */
  generation = async (): Promise<ContractGeneration> => contractGeneration(await this.contractVersion());
  // v2 views (interface-v7 §A4–A6): reject with RpcError (MethodNotFound) on v1.
  getClaimable = (account_id: string) => this.v<U128>("get_claimable", { account_id });
  /** interface-v7 §B: the signed NECTAR_RELEASE_V1 for a Releasing remote position, or null. */
  getPendingRelease = (position_id: U64) => this.v<PendingRelease | null>("get_pending_release", { position_id });
  /** The signed remote leg of a position, or null when it has none. */
  getPendingSettlement = (position_id: U64) => this.v<PendingSettlement | null>("get_pending_settlement", { position_id });
  /** SR-17: units of `symbol` nectar-core owes this account after a failed transfer; `claim_owed_collateral` pays them. */
  getOwedCollateral = (account_id: string, symbol: string) => this.v<U128>("get_owed_collateral", { account_id, symbol });
  isReferrer = (account_id: string) => this.v<boolean>("is_referrer", { account_id });
  getSessionCalendar = (from_index = 0, limit = 100) => this.v<SessionWindow[]>("get_session_calendar", { from_index, limit });
  /** Every calendar window (pages of 100, the contract's MAX_PAGE; at most 600 windows). */
  getFullSessionCalendar = async (): Promise<SessionWindow[]> => {
    const out: SessionWindow[] = [];
    for (let from = 0; from < 1000; from += 100) {
      const page = await this.getSessionCalendar(from, 100);
      out.push(...page);
      if (page.length < 100) break;
    }
    return out;
  };
  // WO-23a (PRD §4.9–§4.11)
  getShield = (position_id: U64) => this.v<ShieldView | null>("get_shield", { position_id });
  getShieldOpensToday = (account_id: string) => this.v<number>("get_shield_opens_today", { account_id });
  getFeeStack = (symbol?: string | null) => this.v<FeeStackView>("get_fee_stack", symbol ? { symbol } : {});
  previewSelfSettle = (position_id: U64) => this.v<SelfSettlePreview>("preview_self_settle", { position_id });
  /** interface-v7 §B (WO-21): keeper-attestation flag and OutLayer vault_read pin. */
  getRemoteConfig = () => this.v<RemoteConfigView>("get_remote_config");
  // Position Notes (interface-v7 §C, WO-22): NEP-171 / NEP-181, pages capped at 20.
  nftToken = (token_id: string) => this.v<NoteToken | null>("nft_token", { token_id });
  nftTokenSvg = (token_id: string) => this.v<string>("nft_token_svg", { token_id });
  nftTransferLocked = (token_id: string) => this.v<boolean>("nft_transfer_locked", { token_id });
  nftSupplyForOwner = (account_id: string) => this.v<U128>("nft_supply_for_owner", { account_id });
  /** `from_index` is a U128 string per NEP-181. */
  nftTokensForOwner = (account_id: string, from_index = 0, limit = NOTE_PAGE) =>
    this.v<NoteToken[]>("nft_tokens_for_owner", { account_id, from_index: String(from_index), limit: Math.min(limit, NOTE_PAGE) });
  // Nectar Reserve (WO-23b, merged 67a5426). get_reserve panics for an unknown symbol; get_reserve_note is null for an unknown id.
  getReserve = (symbol: string) => this.v<ReserveView>("get_reserve", { symbol });
  getReserveNote = (note_id: string) => this.v<ReserveNoteView | null>("get_reserve_note", { note_id });
  // P1 views: reject with RpcError on the P0 deployment (method not found); callers render "P0 static pricing" / "owner oracle".
  getQuoterConfig = () => this.v<QuoterConfigView | null>("get_quoter_config");
  getOracleSource = (symbol: string) => this.v<OracleSource | null>("get_oracle_source", { symbol });

  /** NEP-141 `ft_balance_of` on any token. */
  ftBalanceOf = (token: string, account_id: string) => this.t.call<U128>(token, "ft_balance_of", { account_id });
  /** mock-ft `multiplier()` (interface-v7 §A3); MethodNotFound until the code-only upgrade of the live mock accounts. */
  ftMultiplier = (token: string) => this.t.call<U128>(token, "multiplier", {});
}
