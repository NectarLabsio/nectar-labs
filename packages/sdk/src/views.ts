// Typed read-only client for nectar-core views (interface-p0.md "Views") and NEP-141 balance views (F-013).
// Uses near-api-js 7.4.0 JsonRpcProvider.callFunction (F-012).
import { JsonRpcProvider } from "near-api-js";
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
  SessionWindow,
  U128,
  U64,
} from "./types";
import type { PendingRelease } from "./solana";

/** interface-v7 §A6: v2 answers `contract_version()` with a "2." prefix ("2.0.0-v7"). Anything else (v1: "nectar-core 0.1.0 p2") is v1. */
export function contractGeneration(version: string | null | undefined): ContractGeneration {
  return typeof version === "string" && version.startsWith("2.") ? "v2" : "v1";
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly method: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export interface ViewTransport {
  call<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T>;
}

export function rpcTransport(url: string): ViewTransport {
  const provider = new JsonRpcProvider({ url });
  return {
    async call<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
      try {
        const r = await provider.callFunction<object | string | number | boolean>({ contractId, method, args, blockQuery: { finality: "final" } });
        return r as T;
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        throw new RpcError(`${method}: ${m}`, method, e);
      }
    },
  };
}

export class NectarViews {
  constructor(
    readonly core: string,
    readonly t: ViewTransport,
  ) {}

  static fromRpc(core: string, rpcUrl: string): NectarViews {
    return new NectarViews(core, rpcTransport(rpcUrl));
  }

  private v<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.t.call<T>(this.core, method, args);
  }

  contractVersion = () => this.v<string>("contract_version");
  getConfig = () => this.v<CoreConfigView>("get_config");
  getCollateral = (symbol: string) => this.v<CollateralView | null>("get_collateral", { symbol });
  listCollaterals = (from_index = 0, limit = 50) => this.v<CollateralView[]>("list_collaterals", { from_index, limit });
  getExitCapacity = (symbol: string) => this.v<ExitCapacity>("get_exit_capacity", { symbol });
  getQuote = (quote_id: U64) => this.v<QuoteView | null>("get_quote", { quote_id });
  listQuotes = (symbol: string, from_index = 0, limit = 64) => this.v<QuoteView[]>("list_quotes", { symbol, from_index, limit });
  getPosition = (position_id: U64) => this.v<PositionView | null>("get_position", { position_id });
  listPositions = (from_index = 0, limit = 50) => this.v<PositionView[]>("list_positions", { from_index, limit });
  getHealth = (position_id: U64) => this.v<HealthView>("get_health", { position_id });
  getPool = () => this.v<PoolView>("get_pool");
  /** `referrer` is a v2 argument; it is sent only when given, so v1 calls stay unchanged. */
  previewBorrow = (symbol: string, units: U128, borrow_usd_e6: U128, referrer?: string | null) =>
    this.v<BorrowPreview>("preview_borrow", referrer ? { symbol, units, borrow_usd_e6, referrer } : { symbol, units, borrow_usd_e6 });
  /** "v1" | "v2" from `contract_version()`. */
  generation = async (): Promise<ContractGeneration> => contractGeneration(await this.contractVersion());
  // v2 views (interface-v7 §A4–A6): reject with RpcError (MethodNotFound) on v1.
  getClaimable = (account_id: string) => this.v<U128>("get_claimable", { account_id });
  /** interface-v7 §B: the signed NECTAR_RELEASE_V1 for a Releasing remote position, or null. */
  getPendingRelease = (position_id: U64) => this.v<PendingRelease | null>("get_pending_release", { position_id });
  isReferrer = (account_id: string) => this.v<boolean>("is_referrer", { account_id });
  getSessionCalendar = (from_index = 0, limit = 100) => this.v<SessionWindow[]>("get_session_calendar", { from_index, limit });
  // P1 views: reject with RpcError on the P0 deployment (method not found); callers render "P0 static pricing" / "owner oracle".
  getQuoterConfig = () => this.v<QuoterConfigView | null>("get_quoter_config");
  getOracleSource = (symbol: string) => this.v<OracleSource | null>("get_oracle_source", { symbol });

  /** NEP-141 `ft_balance_of` on any token. */
  ftBalanceOf = (token: string, account_id: string) => this.t.call<U128>(token, "ft_balance_of", { account_id });
  /** mock-ft `multiplier()` (interface-v7 §A3); MethodNotFound until the code-only upgrade of the live mock accounts. */
  ftMultiplier = (token: string) => this.t.call<U128>(token, "multiplier", {});
}
