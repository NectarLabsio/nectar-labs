// ft_transfer_call builders. Exact msg shapes: docs/work/interface-p0.md "ft_on_transfer msg".
// NEP-141 `ft_transfer_call` requires exactly 1 yoctoNEAR (F-013).
import type {
  Bps,
  FtOnTransferMsg,
  FundPappusQuoteArgs,
  LockCollateralAndBorrowArgs,
  OracleSource,
  PayTo,
  SessionWindow,
  QuoterConfigInput,
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
  /** v2: pay_to adds an ft_transfer with a failure callback; referrer adds a claimable credit. Re-measure at G2b. */
  borrowV2: 250,
  withdrawClaimable: 50,
  /** set_session_calendar writes up to 600 windows. */
  setSessionCalendar: 300,
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
/** NEAR account id rule (2–64 chars, lowercase alnum separated by `-`/`_`, dot-separated parts). */
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
export function isAccountId(v: string): boolean {
  return v.length >= 2 && v.length <= 64 && ACCOUNT_RE.test(v);
}
export function assertAccountId(v: string, field: string): string {
  if (!isAccountId(v)) throw new Error(`${field} must be a NEAR account id, got ${JSON.stringify(v)}`);
  return v;
}
/** UI-side cap on the pay_to memo carried by ft_transfer (the contract forwards it verbatim). */
export const PAY_TO_MEMO_MAX = 256;

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
  /** v1 shape when `pay_to`/`referrer` are absent (byte-identical); v2 keys are appended only when set (interface-v7 §A4/A5). */
  lockCollateralAndBorrow(a: LockCollateralAndBorrowArgs): FtOnTransferMsg {
    const body: LockCollateralAndBorrowArgs = {
      collateral: a.collateral,
      borrow_usd_e6: assertU128(a.borrow_usd_e6, "borrow_usd_e6"),
      pre_liq_ltv_bps: assertBps(a.pre_liq_ltv_bps, "pre_liq_ltv_bps"),
    };
    if (a.pay_to) body.pay_to = payTo(a.pay_to);
    if (a.referrer) body.referrer = assertAccountId(a.referrer, "referrer");
    return { LockCollateralAndBorrow: body };
  },
  repay(position_id: U64): FtOnTransferMsg {
    return { Repay: { position_id: assertU64(position_id, "position_id") } };
  },
};

function payTo(p: PayTo): PayTo {
  const out: PayTo = { receiver_id: assertAccountId(p.receiver_id, "pay_to.receiver_id") };
  if (p.memo != null && p.memo !== "") {
    if (p.memo.length > PAY_TO_MEMO_MAX) throw new Error(`pay_to.memo is at most ${PAY_TO_MEMO_MAX} characters`);
    out.memo = p.memo;
  }
  return out;
}

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
    ftTransferCall({
      token: collateralToken,
      core,
      amount: units,
      msg: msg.lockCollateralAndBorrow(a),
      gasTgas: a.pay_to || a.referrer ? GAS_TGAS.borrowV2 : GAS_TGAS.borrow,
      label: a.pay_to ? "Lock collateral and pay merchant" : "Lock collateral and borrow",
    }),
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
  // P1 owner calls (interface-p1.md "Contract additions"); 0 deposit like the P0 owner calls.
  setQuoterPin: (core: string, project_id: string, version_key: string) =>
    coreCall(core, "set_quoter_pin", { project_id, version_key }, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: project_id ? "Pin quoter" : "Disable quoter (P0 static pricing)" }),
  setQuoterConfig: (core: string, c: QuoterConfigInput) =>
    coreCall(
      core,
      "set_quoter_config",
      {
        deposit_yocto: assertU128(c.deposit_yocto, "deposit_yocto"),
        gas_tgas: assertInt(c.gas_tgas, "gas_tgas", 1, 300),
        max_instructions: assertU64(c.max_instructions, "max_instructions"),
        max_memory_mb: assertInt(c.max_memory_mb, "max_memory_mb", 1, 0xffff_ffff),
        max_execution_seconds: assertInt(c.max_execution_seconds, "max_execution_seconds", 1, 0xffff_ffff),
      },
      { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: "Set quoter config" },
    ),
  setVolBps: (core: string, symbol: string, vol_bps: number) =>
    coreCall(core, "set_vol_bps", { symbol, vol_bps: assertInt(vol_bps, "vol_bps", 0, 0xffff) }, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: "Set volatility" }),
  setOracleSource: (core: string, symbol: string, source: OracleSource) => {
    if (source !== "Owner" && !/^(0x)?[0-9a-fA-F]{64}$/.test(source.Pyth.price_identifier)) throw new Error("price_identifier must be 32-byte hex");
    return coreCall(core, "set_oracle_source", { symbol, source }, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: source === "Owner" ? "Use owner oracle" : "Use Pyth oracle" });
  },
  setMaxConfBps: (core: string, max_conf_bps: number) =>
    coreCall(core, "set_max_conf_bps", { max_conf_bps: assertInt(max_conf_bps, "max_conf_bps", 0, 10_000) }, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: "Set max oracle confidence" }),
};

/** v2 (nectar-core-v2, interface-v7 §A2–A5). Calling these on v1 fails with MethodNotFound; the web app feature-detects first. */
export const txV2 = {
  withdrawClaimable: (core: string) => coreCall(core, "withdraw_claimable", {}, { gasTgas: GAS_TGAS.withdrawClaimable, deposit: ONE_YOCTO, label: "Withdraw claimable USDC" }),
  /** Anyone, once `now ≥ ca_effective_ns`. */
  applyCorporateAction: (core: string, symbol: string) => coreCall(core, "apply_corporate_action", { symbol }, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: "Apply corporate action" }),
  // owner
  setSessionCalendar: (core: string, windows: SessionWindow[]) => {
    if (windows.length > 600) throw new Error("at most 600 session windows");
    let prevClose = -1n;
    const w = windows.map(([o, c], i) => {
      const open = BigInt(assertU64(o, `windows[${i}][0]`));
      const close = BigInt(assertU64(c, `windows[${i}][1]`));
      if (close <= open) throw new Error(`windows[${i}] must have open < close`);
      if (open < prevClose) throw new Error(`windows[${i}] overlaps or is out of order`);
      prevClose = close;
      return [o, c] as SessionWindow;
    });
    return coreCall(core, "set_session_calendar", { windows: w }, { gasTgas: GAS_TGAS.setSessionCalendar, deposit: "0", label: "Set session calendar" });
  },
  forceSessionClosed: (core: string, symbol: string, closed: boolean) =>
    coreCall(core, "force_session_closed", { symbol, closed }, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: closed ? "Force session closed" : "Clear forced close" }),
  setMultiplier: (core: string, symbol: string, multiplier_e18: U128) =>
    coreCall(core, "set_multiplier", { symbol, multiplier_e18: assertU128(multiplier_e18, "multiplier_e18") }, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: "Set multiplier" }),
  announceCorporateAction: (core: string, symbol: string, multiplier_e18: U128, effective_ns: U64) =>
    coreCall(
      core,
      "announce_corporate_action",
      { symbol, multiplier_e18: assertU128(multiplier_e18, "multiplier_e18"), effective_ns: assertU64(effective_ns, "effective_ns") },
      { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: "Announce corporate action" },
    ),
  registerReferrer: (core: string, account_id: string) =>
    coreCall(core, "register_referrer", { account_id: assertAccountId(account_id, "account_id") }, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: "Register referrer" }),
  unregisterReferrer: (core: string, account_id: string) =>
    coreCall(core, "unregister_referrer", { account_id: assertAccountId(account_id, "account_id") }, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: "Unregister referrer" }),
  setOriginationFeeBps: (core: string, bps: number) =>
    coreCall(core, "set_origination_fee_bps", { bps: assertInt(bps, "bps", 0, 100) }, { gasTgas: GAS_TGAS.ownerCall, deposit: "0", label: "Set origination fee" }),
};

export function assertInt(v: number, field: string, lo: number, hi: number): number {
  if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${field} must be an integer in [${lo}, ${hi}]`);
  return v;
}
