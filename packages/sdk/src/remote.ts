// v2 remote (Solana devnet) lifecycle on nectar-core (interface-v7 §B; WO-21 builds the contract side in parallel).
// Method names and argument names are fixed by interface-v7 §B. The `remote` field layout on `get_position` is NOT fixed there:
// RemoteView below reads the names the interface uses (`remote.status`, `remote.authority`, depositor, source) and tolerates
// absent fields. Confirm at G1b and adjust here only.
import type { AccountId, Bps, PayTo, PositionView, QuoteView, U128, U64 } from "./types";
import { assertAccountId, assertBps, assertU128, assertU64, coreCall, ONE_YOCTO, type TxIntent } from "./msg";
import { isSolanaWalletKey, type PendingRelease } from "./solana";
import { isEvmDepositor } from "./evm";
import { parseEventLogs } from "./events";

/** Contract `RemoteStatus`: AwaitingDeposit -> Open -> (Settling | Releasing) -> Closed; AwaitingDeposit -> Expired. */
export type RemoteStatus = "AwaitingDeposit" | "Open" | "Settling" | "Releasing" | "Closed" | "Expired";
export type DepositSource = "outlayer" | "keeper";

/** Contract `RemoteInfo` (`get_position(..).remote`). Optional because the e2e fixtures carry a subset; test/views-shape.test.ts pins the key set. */
export interface RemoteView {
  /** "solana-devnet" (domain 1) or "base-sepolia" (domain 0, P2b). */
  chain_id?: string;
  vault_program?: string;
  domain_id?: number;
  /** `solana-devnet/pos/<id>`. */
  path?: string;
  status: RemoteStatus;
  /** `"ed25519:<base58>"` once `on_authority` stored it; null while the derived_public_key call is in flight. */
  authority?: string | null;
  reserved_units?: U128;
  /** Units in the vault: the reserved units until a deposit is proven, then the proven units. */
  units?: U128;
  borrow_usd_e6?: U128;
  /** Net USDC paid at confirmation (0 until the loan is paid). */
  paid_usd_e6?: U128 | null;
  /** Reservation time and expiry (ns). Expiry = reserved + 30 min (config v7.reservation_expiry_s). */
  reserved_ns?: U64;
  expires_ns?: U64;
  pay_to?: PayTo | null;
  referrer?: AccountId | null;
  /** Base58 (or 0x) depositor recorded at confirmation. */
  depositor?: string | null;
  /** SR-8: the depositor committed at reservation; only a deposit from it can confirm. Absent for reservations made before 2.2. */
  committed_depositor?: string | null;
  /** "outlayer" (attested vault_read) or "keeper" (keeper_attest_deposit; Feed label "keeper-attested"). */
  source?: DepositSource | null;
  /** OutLayer `slot_or_block` or the keeper's `tx_ref`. */
  deposit_ref?: string | null;
  confirming?: boolean;
  last_confirm_ns?: U64;
  /** Reservation deposit still held (yocto), net of the record's storage and of any attested read the borrower asked for; refunded on confirm, refusal or expiry, then 0. */
  deposit_yocto?: U128;
}

export interface ReserveRemoteArgs {
  collateral: string;
  units: U128;
  borrow_usd_e6: U128;
  pre_liq_ltv_bps: Bps;
  pay_to?: PayTo | null;
  referrer?: AccountId | null;
  /** Remote chain id, e.g. "base-sepolia". Absent: the collateral's primary chain (Solana devnet). */
  chain?: string | null;
  /** SR-8: the connected Solana or EVM wallet. Required; only a deposit from this address can confirm the reservation. */
  depositor: string;
}

/** Contract `PendingStatus`. */
export type PendingStatus = "AwaitingSignature" | "Signed" | "SignFailed" | "Cancelled" | "Relayed";

/** Contract `PendingSettlement` (`get_pending_settlement`): the one signed remote leg of a position. */
export interface PendingSettlement {
  position_id: U64;
  quote_id: U64;
  nonce: U64;
  /** Unix seconds. */
  expires: U64;
  preimage: string;
  signature_hex: string | null;
  repay_usd_e6: U128;
  seize_units: U128;
  keeper_units: U128;
  recipient: string;
  status: PendingStatus;
  solana_tx_sig: string | null;
  /** 1 = PRELIQ, 2 = SELF (Profit-Lock). */
  kind: number;
  fee_usd_e6: U128;
}

/** MPC domains: secp256k1 (EVM) and Ed25519 (Solana); `RemoteChain.mpc_domain_id`. */
export const EVM_DOMAIN_ID = 0;
export const SOLANA_DOMAIN_ID = 1;

/** Same rule as `valid_depositor` / `chainsig::recipient_fits`: a Solana wallet key (domain 1) or a non-zero 0x address (domain 0). */
export function remoteAddressFits(domainId: number, addr: string): boolean {
  if (domainId === SOLANA_DOMAIN_ID) return isSolanaWalletKey(addr);
  if (domainId === EVM_DOMAIN_ID) return isEvmDepositor(addr);
  return false;
}

/** `reserve_remote_position` refuses less than this (remote.rs RESERVE_DEPOSIT_YOCTO, 0.05 NEAR). Also `get_remote_config().reserve_deposit_yocto`. */
export const REMOTE_RESERVE_DEPOSIT_YOCTO = "50000000000000000000000";
/** SR-14: the smallest loan a reservation can ask for (lib.rs MIN_BORROW_USD_E6). */
export const MIN_REMOTE_BORROW_USD_E6 = 5_000_000n;
/** SR-14: reservations one account may have open at a time (remote.rs MAX_OPEN_RESERVATIONS). */
export const MAX_OPEN_RESERVATIONS = 8;

/** Gas (TGas). Re-measure at G2b. reserve: derived_public_key cross-call (signer view) + callback; confirm: OutLayer request (D-015). */
export const REMOTE_GAS_TGAS = {
  reserve: 100,
  confirm: 200,
  keeperAttest: 150,
  requestRelease: 100,
  expire: 30,
  /** resign_remote_settlement: signer gas + callback; the same budget as the G7 driver (scripts/58-g7-v2.sh). */
  resign: 100,
  /** claim_owed_collateral: one ft_transfer with a failure callback, like withdraw_claimable. */
  claimOwed: 50,
} as const;

export const txRemote = {
  /** Borrower, attaches the reservation deposit (refunded less the record's storage, about 0.0057 NEAR). Returns the position id (U64). */
  reserve: (core: string, a: ReserveRemoteArgs): TxIntent => {
    const args: Record<string, unknown> = {
      collateral: a.collateral,
      units: assertU128(a.units, "units"),
      borrow_usd_e6: assertU128(a.borrow_usd_e6, "borrow_usd_e6"),
      pre_liq_ltv_bps: assertBps(a.pre_liq_ltv_bps, "pre_liq_ltv_bps"),
    };
    if (BigInt(a.units) >= 1n << 64n) throw new Error("units must fit u64 for a Solana position");
    if (!remoteAddressFits(a.chain?.startsWith("base") ? EVM_DOMAIN_ID : SOLANA_DOMAIN_ID, a.depositor)) throw new Error(`depositor is not a valid wallet address for this chain: ${JSON.stringify(a.depositor)}`);
    if (BigInt(a.borrow_usd_e6) < MIN_REMOTE_BORROW_USD_E6) throw new Error("the minimum remote borrow is $5");
    args.depositor = a.depositor;
    if (a.chain) args.chain = a.chain;
    if (a.pay_to) args.pay_to = { receiver_id: assertAccountId(a.pay_to.receiver_id, "pay_to.receiver_id"), ...(a.pay_to.memo ? { memo: a.pay_to.memo } : {}) };
    if (a.referrer) args.referrer = assertAccountId(a.referrer, "referrer");
    return coreCall(core, "reserve_remote_position", args, { gasTgas: REMOTE_GAS_TGAS.reserve, deposit: REMOTE_RESERVE_DEPOSIT_YOCTO, label: a.chain?.startsWith("base") ? "Reserve Base position" : "Reserve Solana position" });
  },
  /** Borrower, keeper or owner (SR-6). OutLayer reads the vault; the borrower's read is paid from the held reservation deposit. On failure the position stays AwaitingDeposit. */
  confirmDeposit: (core: string, position_id: U64): TxIntent =>
    coreCall(core, "confirm_remote_deposit", { position_id: assertU64(position_id, "position_id") }, { gasTgas: REMOTE_GAS_TGAS.confirm, deposit: "0", label: "Confirm Solana deposit" }),
  /** Anyone, after debt = 0. Not payable: nectar-core pays the signer's 1 yocto from its own gas reserve. */
  requestRelease: (core: string, position_id: U64): TxIntent =>
    coreCall(core, "request_remote_release", { position_id: assertU64(position_id, "position_id") }, { gasTgas: REMOTE_GAS_TGAS.requestRelease, deposit: "0", label: "Request release" }),
  /** Anyone, once a signed leg has expired unrelayed (SR-3). Not payable. The keeper's function-call key cannot call it. */
  resignSettlement: (core: string, position_id: U64): TxIntent =>
    coreCall(core, "resign_remote_settlement", { position_id: assertU64(position_id, "position_id") }, { gasTgas: REMOTE_GAS_TGAS.resign, deposit: "0", label: "Re-sign settlement" }),
  /** SR-17: pays the caller's owed collateral of `symbol` on NEAR (1 yocto). */
  claimOwedCollateral: (core: string, symbol: string): TxIntent =>
    coreCall(core, "claim_owed_collateral", { symbol }, { gasTgas: REMOTE_GAS_TGAS.claimOwed, deposit: ONE_YOCTO, label: "Claim owed collateral" }),
  /** Anyone, after the 30-min reservation window. */
  expireReservation: (core: string, position_id: U64): TxIntent =>
    coreCall(core, "expire_remote_reservation", { position_id: assertU64(position_id, "position_id") }, { gasTgas: REMOTE_GAS_TGAS.expire, deposit: "0", label: "Expire reservation" }),
};

/** Seconds left on a reservation (0 when expired). `reserved_ns` + window when the contract does not report `expires_ns`. */
export function reservationSecondsLeft(r: Pick<RemoteView, "expires_ns" | "reserved_ns">, nowMs: number, windowS = 1800, openedNs?: U64): number | null {
  const exp = r.expires_ns != null ? BigInt(r.expires_ns) : r.reserved_ns != null ? BigInt(r.reserved_ns) + BigInt(windowS) * 1_000_000_000n : openedNs != null ? BigInt(openedNs) + BigInt(windowS) * 1_000_000_000n : null;
  if (exp === null) return null;
  const left = (exp - BigInt(nowMs) * 1_000_000n) / 1_000_000_000n;
  return left > 0n ? Number(left) : 0;
}

/**
 * The largest single escrowed quote a remote loan could settle against, and the check `reserve_remote_position` runs (SR-5):
 * not exiting, and a buyer recipient that fits the chain. A remote loan settles in one leg, so it is capped at this amount.
 */
export function largestFittingQuoteUsdE6(quotes: ReadonlyArray<Pick<QuoteView, "remaining_usd_e6" | "unlock_ns" | "buyer_remote_recipient">>, domainId: number): bigint {
  let best = 0n;
  for (const q of quotes) {
    const remaining = BigInt(q.remaining_usd_e6);
    if (q.unlock_ns == null && q.buyer_remote_recipient && remaining > best && remoteAddressFits(domainId, q.buyer_remote_recipient)) best = remaining;
  }
  return best;
}

/** Plain text for the reasons nectar-core gives when it refuses a reservation; null when the failure is none of them. */
export function remoteRefusalText(failure: string | null | undefined): string | null {
  if (!failure) return null;
  if (failure.includes("remote_settle_capacity")) return "No single committed buyer can cover this loan on this chain. A remote loan settles in one leg, so it is capped at the largest quote with a recipient on that chain. Lower the amount.";
  if (failure.includes("bad depositor")) return "nectar-core refused this wallet as the depositor. Use a regular wallet address on this chain.";
  if (failure.includes("borrow below minimum")) return "The minimum loan is $5.";
  if (failure.includes("too many open reservations")) return `An account can hold ${MAX_OPEN_RESERVATIONS} open reservations. Let one confirm or expire first.`;
  if (failure.includes("reservation deposit spent")) return "The reservation deposit no longer covers an attested read. The keeper can still request one.";
  if (failure.includes("reservation deposit")) return "The reservation needs a 0.05 NEAR deposit. All but about 0.0057 NEAR of storage comes back when it confirms, is refused or expires.";
  if (failure.includes("borrower, keeper or owner only")) return "Only the borrower can request this confirmation from here. The keeper requests it automatically.";
  return null;
}

/** The reason in a `remote_loan_refused` or `remote_deposit_rejected` event, from a confirmation's logs; null when neither was emitted. */
export function remoteConfirmRefusal(logs: readonly string[]): string | null {
  for (const e of parseEventLogs(logs)) {
    if (e.event === "remote_loan_refused" || e.event === "remote_deposit_rejected") return e.data[0].reason;
  }
  return null;
}

/** Why a position that has a recorded deposit never paid a loan, or null when it did (or the deposit is not recorded yet). */
export type LoanRefusal = "short_deposit" | "late_deposit";
export function remoteLoanRefusal(p: Pick<PositionView, "debt_usd_e6"> & { remote: RemoteView }): LoanRefusal | null {
  const r = p.remote;
  if (r.status !== "Open" || !r.depositor || BigInt(p.debt_usd_e6) !== 0n || BigInt(r.paid_usd_e6 ?? 0) !== 0n) return null;
  return r.units != null && r.reserved_units != null && BigInt(r.units) < BigInt(r.reserved_units) ? "short_deposit" : "late_deposit";
}

/** SR-6: the borrower's own attested read is paid from the held reservation deposit, so it needs that deposit to still cover one. `readCost` null: not known, leave it to the contract. */
export function borrowerCanConfirm(r: Pick<RemoteView, "deposit_yocto">, readCost: U128 | null | undefined): boolean {
  return readCost == null || BigInt(r.deposit_yocto ?? 0) >= BigInt(readCost);
}

/** True once a signed leg has expired without being relayed, the state `resign_remote_settlement` accepts (SR-3). */
export function settlementNeedsResign(d: Pick<PendingSettlement, "status" | "expires">, nowMs: number): boolean {
  return (d.status === "Signed" || d.status === "AwaitingSignature") && BigInt(nowMs) / 1000n >= BigInt(d.expires);
}

export const formatCountdown = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Per-position MPC path (interface-v7 §B). */
export const remotePath = (positionId: U64, prefix = "solana-devnet/pos/"): string => `${prefix}${positionId}`;

export type { PendingRelease };
