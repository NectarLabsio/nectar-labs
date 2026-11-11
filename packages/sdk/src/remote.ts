// v2 remote (Solana devnet) lifecycle on nectar-core (interface-v7 §B; WO-21 builds the contract side in parallel).
// Method names and argument names are fixed by interface-v7 §B. The `remote` field layout on `get_position` is NOT fixed there:
// RemoteView below reads the names the interface uses (`remote.status`, `remote.authority`, depositor, source) and tolerates
// absent fields. Confirm at G1b and adjust here only.
import type { AccountId, Bps, PayTo, U128, U64 } from "./types";
import { assertAccountId, assertBps, assertU128, assertU64, coreCall, ONE_YOCTO, type TxIntent } from "./msg";
import type { PendingRelease } from "./solana";

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
  /** Base58 depositor recorded at confirmation. */
  depositor?: string | null;
  /** "outlayer" (attested vault_read) or "keeper" (keeper_attest_deposit; Feed label "keeper-attested"). */
  source?: DepositSource | null;
  /** OutLayer `slot_or_block` or the keeper's `tx_ref`. */
  deposit_ref?: string | null;
  confirming?: boolean;
  last_confirm_ns?: U64;
  /** Reservation deposit still held (yocto); refunded on confirm, refusal or expiry, then 0. */
  deposit_yocto?: U128;
}

export interface ReserveRemoteArgs {
  collateral: string;
  units: U128;
  borrow_usd_e6: U128;
  pre_liq_ltv_bps: Bps;
  pay_to?: PayTo | null;
  referrer?: AccountId | null;
}

/** `reserve_remote_position` refuses less than this (remote.rs RESERVE_DEPOSIT_YOCTO, 0.05 NEAR; refunded). Also `get_remote_config().reserve_deposit_yocto`. */
export const REMOTE_RESERVE_DEPOSIT_YOCTO = "50000000000000000000000";

/** Gas (TGas). Re-measure at G2b. reserve: derived_public_key cross-call (signer view) + callback; confirm: OutLayer request (D-015). */
export const REMOTE_GAS_TGAS = {
  reserve: 100,
  confirm: 200,
  keeperAttest: 150,
  requestRelease: 100,
  expire: 30,
} as const;

export const txRemote = {
  /** Borrower, attaches the refundable reservation deposit. Returns the position id (U64). */
  reserve: (core: string, a: ReserveRemoteArgs): TxIntent => {
    const args: Record<string, unknown> = {
      collateral: a.collateral,
      units: assertU128(a.units, "units"),
      borrow_usd_e6: assertU128(a.borrow_usd_e6, "borrow_usd_e6"),
      pre_liq_ltv_bps: assertBps(a.pre_liq_ltv_bps, "pre_liq_ltv_bps"),
    };
    if (BigInt(a.units) >= 1n << 64n) throw new Error("units must fit u64 for a Solana position");
    if (a.pay_to) args.pay_to = { receiver_id: assertAccountId(a.pay_to.receiver_id, "pay_to.receiver_id"), ...(a.pay_to.memo ? { memo: a.pay_to.memo } : {}) };
    if (a.referrer) args.referrer = assertAccountId(a.referrer, "referrer");
    return coreCall(core, "reserve_remote_position", args, { gasTgas: REMOTE_GAS_TGAS.reserve, deposit: REMOTE_RESERVE_DEPOSIT_YOCTO, label: "Reserve Solana position" });
  },
  /** Anyone. OutLayer reads the vault; on failure the position stays AwaitingDeposit. */
  confirmDeposit: (core: string, position_id: U64): TxIntent =>
    coreCall(core, "confirm_remote_deposit", { position_id: assertU64(position_id, "position_id") }, { gasTgas: REMOTE_GAS_TGAS.confirm, deposit: "0", label: "Confirm Solana deposit" }),
  /** Anyone, after debt = 0. Signs NECTAR_RELEASE_V1 (1 yocto). */
  requestRelease: (core: string, position_id: U64): TxIntent =>
    coreCall(core, "request_remote_release", { position_id: assertU64(position_id, "position_id") }, { gasTgas: REMOTE_GAS_TGAS.requestRelease, deposit: ONE_YOCTO, label: "Request release" }),
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

export const formatCountdown = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Per-position MPC path (interface-v7 §B). */
export const remotePath = (positionId: U64, prefix = "solana-devnet/pos/"): string => `${prefix}${positionId}`;

export type { PendingRelease };
