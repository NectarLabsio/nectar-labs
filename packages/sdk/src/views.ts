// Typed read-only client for nectar-core views (interface-p0.md "Views") and NEP-141 balance views (F-013).
// Uses near-api-js 7.4.0 JsonRpcProvider.callFunction (F-012).
import { JsonRpcProvider } from "near-api-js";
import type {
  BorrowPreview,
  CollateralView,
  CoreConfigView,
  ExitCapacity,
  HealthView,
  PoolView,
  PositionView,
  QuoteView,
  U128,
  U64,
} from "./types";

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
  previewBorrow = (symbol: string, units: U128, borrow_usd_e6: U128) => this.v<BorrowPreview>("preview_borrow", { symbol, units, borrow_usd_e6 });

  /** NEP-141 `ft_balance_of` on any token. */
  ftBalanceOf = (token: string, account_id: string) => this.t.call<U128>(token, "ft_balance_of", { account_id });
}
