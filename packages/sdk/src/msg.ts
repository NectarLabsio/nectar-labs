// ft_transfer_call builders. Exact msg shapes: docs/work/interface-p0.md "ft_on_transfer msg".
// NEP-141 `ft_transfer_call` requires exactly 1 yoctoNEAR (F-013).
import type {
  Bps,
  FtOnTransferMsg,
  FundPappusQuoteArgs,
  LockCollateralAndBorrowArgs,
  U128,
  U64,
} from "./types";

export const ONE_YOCTO = "1";
export const TGAS = 1_000_000_000_000n;

/** Default gas per action (TGas). Generous on purpose; unused gas is refunded. Re-measure at G2. */
export const GAS_TGAS = {
  supply: 100,
  fundQuote: 100,
  topUp: 100,
  borrow: 200,
  repay: 150,
  initiateWithdrawal: 50,
  completeWithdrawal: 100,
  claimFees: 100,
  ownerCall: 30,
} as const;

const DEC = /^(0|[1-9][0-9]*)$/;

export function assertU128(v: string, field: string): U128 {
  if (!DEC.test(v)) throw new Error(`${field} must be a decimal integer string, got ${JSON.stringify(v)}`);
  if (BigInt(v) >= 1n << 128n) throw new Error(`${field} overflows u128`);
  return v;
}
export function assertU64(v: string, field: string): U64 {
  if (!DEC.test(v)) throw new Error(`${field} must be a decimal integer string, got ${JSON.stringify(v)}`);
  if (BigInt(v) >= 1n << 64n) throw new Error(`${field} overflows u64`);
  return v;
}
export function assertBps(v: number, field: string): Bps {
  if (!Number.isInteger(v) || v < 0 || v > 10_000) throw new Error(`${field} must be an integer in [0, 10000]`);
  return v;
}

export const msg = {
  supplyLendingLiquidity(): FtOnTransferMsg {
    return "SupplyLendingLiquidity";
  },
  fundPappusQuote(a: FundPappusQuoteArgs): FtOnTransferMsg {
    return {
      FundPappusQuote: {
        collateral: a.collateral,
        max_discount_bps: assertBps(a.max_discount_bps, "max_discount_bps"),
        notice_period_ns: assertU64(a.notice_period_ns, "notice_period_ns"),
        buyer_remote_recipient: a.buyer_remote_recipient,
      },
    };
  },
  topUpQuote(quote_id: U64): FtOnTransferMsg {
    return { TopUpQuote: { quote_id: assertU64(quote_id, "quote_id") } };
  },
  lockCollateralAndBorrow(a: LockCollateralAndBorrowArgs): FtOnTransferMsg {
    return {
      LockCollateralAndBorrow: {
        collateral: a.collateral,
        borrow_usd_e6: assertU128(a.borrow_usd_e6, "borrow_usd_e6"),
        pre_liq_ltv_bps: assertBps(a.pre_liq_ltv_bps, "pre_liq_ltv_bps"),
      },
    };
  },
  repay(position_id: U64): FtOnTransferMsg {
    return { Repay: { position_id: assertU64(position_id, "position_id") } };
  },
};

/** Serialise a msg exactly as it travels inside `ft_transfer_call.args.msg`. */
export function encodeMsg(m: FtOnTransferMsg): string {
  return JSON.stringify(m);
}

/** A single function call the wallet signs. `gas` in gas units, `deposit` in yoctoNEAR, both decimal strings. */
export interface TxIntent {
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
  deposit: string;
  /** Human label shown in the sign modal and the toast ("Fund quote"). */
  label: string;
  /** The decoded ft_on_transfer msg, when this is an ft_transfer_call (shown verbatim in the sign modal). */
  msg?: FtOnTransferMsg;
}

export function tgas(n: number): string {
  return (BigInt(n) * TGAS).toString();
}

export interface FtTransferCallInput {
  /** NEP-141 token the caller holds (usdc mock or collateral token). */
  token: string;
  /** nectar-core account id. */
  core: string;
  amount: U128;
  msg: FtOnTransferMsg;
  gasTgas: number;
  label: string;
  memo?: string | null;
}

export function ftTransferCall(i: FtTransferCallInput): TxIntent {
  return {
    receiverId: i.token,
    methodName: "ft_transfer_call",
    args: { receiver_id: i.core, amount: assertU128(i.amount, "amount"), memo: i.memo ?? null, msg: encodeMsg(i.msg) },
    gas: tgas(i.gasTgas),
    deposit: ONE_YOCTO,
    label: i.label,
    msg: i.msg,
  };
}

/** Plain call on nectar-core (buyer methods carry 1 yocto per interface-p0.md). */
export function coreCall(core: string, methodName: string, args: Record<string, unknown>, opts: { gasTgas: number; deposit: string; label: string }): TxIntent {
  return { receiverId: core, methodName, args, gas: tgas(opts.gasTgas), deposit: opts.deposit, label: opts.label };
}

export const tx = {
  supply: (token: string, core: string, amount: U128) =>
    ftTransferCall({ token, core, amount, msg: msg.supplyLendingLiquidity(), gasTgas: GAS_TGAS.supply, label: "Supply liquidity" }),
  fundQuote: (usdc: string, core: string, amount: U128, a: FundPappusQuoteArgs) =>
    ftTransferCall({ token: usdc, core, amount, msg: msg.fundPappusQuote(a), gasTgas: GAS_TGAS.fundQuote, label: "Fund quote" }),
  topUpQuote: (usdc: string, core: string, amount: U128, quote_id: U64) =>
    ftTransferCall({ token: usdc, core, amount, msg: msg.topUpQuote(quote_id), gasTgas: GAS_TGAS.topUp, label: "Top up quote" }),
  borrow: (collateralToken: string, core: string, units: U128, a: LockCollateralAndBorrowArgs) =>
    ftTransferCall({ token: collateralToken, core, amount: units, msg: msg.lockCollateralAndBorrow(a), gasTgas: GAS_TGAS.borrow, label: "Lock collateral and borrow" }),
  repay: (usdc: string, core: string, amount: U128, position_id: U64) =>
    ftTransferCall({ token: usdc, core, amount, msg: msg.repay(position_id), gasTgas: GAS_TGAS.repay, label: "Repay" }),
  initiateQuoteWithdrawal: (core: string, quote_id: U64) =>
    coreCall(core, "initiate_quote_withdrawal", { quote_id: assertU64(quote_id, "quote_id") }, { gasTgas: GAS_TGAS.initiateWithdrawal, deposit: ONE_YOCTO, label: "Give notice" }),
  completeQuoteWithdrawal: (core: string, quote_id: U64) =>
    coreCall(core, "complete_quote_withdrawal", { quote_id: assertU64(quote_id, "quote_id") }, { gasTgas: GAS_TGAS.completeWithdrawal, deposit: ONE_YOCTO, label: "Withdraw quote" }),
  claimFees: (core: string, quote_id: U64) =>
    coreCall(core, "claim_fees", { quote_id: assertU64(quote_id, "quote_id") }, { gasTgas: GAS_TGAS.claimFees, deposit: ONE_YOCTO, label: "Claim fees" }),
  pause: (core: string) => coreCall(core, "pause", {}, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: "Pause" }),
  unpause: (core: string) => coreCall(core, "unpause", {}, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: "Unpause" }),
  setSession: (core: string, symbol: string, open: boolean) =>
    coreCall(core, "set_session", { symbol, open }, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: open ? "Open session" : "Close session" }),
  setDexDepth: (core: string, symbol: string, depth_usd_e6: U128) =>
    coreCall(core, "set_dex_depth", { symbol, depth_usd_e6: assertU128(depth_usd_e6, "depth_usd_e6") }, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: "Set DEX depth" }),
  setReserve: (core: string, symbol: string, reserve_usd_e6: U128) =>
    coreCall(core, "set_reserve", { symbol, reserve_usd_e6: assertU128(reserve_usd_e6, "reserve_usd_e6") }, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: "Set reserve" }),
  updateOwnerPrice: (core: string, symbol: string, price_usd_e6: U128) =>
    coreCall(core, "update_owner_price", { symbol, price_usd_e6: assertU128(price_usd_e6, "price_usd_e6") }, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: "Update owner price" }),
};
