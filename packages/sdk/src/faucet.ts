// "Get test assets" (WO-62c): typed readers and the action builder for the capped public faucet on the mock tokens
// (mock-ft, WO-61 interface: `#[payable] faucet_mint()`, views `faucet_config()` and `faucet_status(account_id)`).
// The contract is authoritative: `can_claim` decides, the other fields only explain a refusal. Mock assets, no value.
import { assertU128, isAccountId, tgas, type TxIntent } from "./msg";
import type { AccountView, ViewTransport } from "./rpc";
import type { U128, U64 } from "./types";

/** `faucet_config()` on a mock token. Amounts are base units of that token. */
export interface FaucetConfigView {
  enabled: boolean;
  amount_per_claim: U128;
  cap_per_account: U128;
  /** u64 seconds; JSON number (a string is accepted too). */
  cooldown_s: number | string;
}

/** `faucet_status(account_id)` on a mock token. */
export interface FaucetStatusView {
  /** Base units this account has claimed so far. */
  claimed: U128;
  /** Earliest block time (ns) of the next claim; 0 or a past time when no cooldown is running. */
  next_claim_at_ns: U64 | number;
  can_claim: boolean;
  /** yoctoNEAR the next claim charges for storage (0 if none); attach it, the rest is refunded. */
  storage_cost_yocto: U128;
}

/** Prepaid gas per `faucet_mint` (WO-62c: 30 Tgas; unused gas is refunded). */
export const FAUCET_MINT_GAS_TGAS = 30;
/**
 * NEAR the account should hold above the storage deposits before we open the wallet: a UI headroom for gas (2 × 30 Tgas prepaid),
 * not a protocol constant. The authoritative check is the chain; a NotEnoughBalance answer is shown with the gas faucet link.
 */
export const FAUCET_GAS_HEADROOM_YOCTO = 10n ** 22n; // 0.01 NEAR
/** F-176: testnet `storage_amount_per_byte` = 1E19 yoctoNEAR. */
export const STORAGE_YOCTO_PER_BYTE = 10_000_000_000_000_000_000n;

export const readFaucetConfig = (t: ViewTransport, token: string): Promise<FaucetConfigView> => t.call<FaucetConfigView>(token, "faucet_config", {});
export const readFaucetStatus = (t: ViewTransport, token: string, account_id: string): Promise<FaucetStatusView> => t.call<FaucetStatusView>(token, "faucet_status", { account_id });

/** `faucet_mint` on `token`, attaching exactly the storage cost the status view quoted (the contract refunds any excess). */
export function faucetMint(token: string, storageCostYocto: string, symbol?: string): TxIntent {
  if (!isAccountId(token)) throw new Error(`token must be a NEAR account id, got ${JSON.stringify(token)}`);
  return {
    receiverId: token,
    methodName: "faucet_mint",
    args: {},
    gas: tgas(FAUCET_MINT_GAS_TGAS),
    deposit: assertU128(storageCostYocto, "storage_cost_yocto"),
    label: `Get test ${symbol ?? token}`,
  };
}

const big = (v: string | number | bigint | null | undefined): bigint => {
  try {
    return BigInt(v ?? 0);
  } catch {
    return 0n;
  }
};

/** Why a claim cannot go through, in the order the user can act on it. */
export type FaucetBlock =
  | { kind: "disabled" }
  | { kind: "cap"; claimed: string; cap: string }
  | { kind: "cooldown"; waitS: number; nextClaimAtNs: string }
  | { kind: "refused" };

export type FaucetDecision = { ok: true; deposit: string } | { ok: false; block: FaucetBlock };

/**
 * The contract's `can_claim` decides. When it says no, the reason follows WO-61's checks: disabled → cap (`claimed + amount > cap`) →
 * cooldown (`next_claim_at_ns` in the future) → refused (none of those explains it; we say so instead of guessing).
 */
export function faucetDecision(cfg: FaucetConfigView, st: FaucetStatusView, nowMs: number): FaucetDecision {
  if (st.can_claim) return { ok: true, deposit: big(st.storage_cost_yocto).toString() };
  if (!cfg.enabled) return { ok: false, block: { kind: "disabled" } };
  const claimed = big(st.claimed);
  const cap = big(cfg.cap_per_account);
  if (claimed + big(cfg.amount_per_claim) > cap) return { ok: false, block: { kind: "cap", claimed: claimed.toString(), cap: cap.toString() } };
  const next = big(st.next_claim_at_ns);
  const nowNs = BigInt(Math.floor(nowMs)) * 1_000_000n;
  if (next > nowNs) {
    const waitS = Number((next - nowNs + 999_999_999n) / 1_000_000_000n);
    return { ok: false, block: { kind: "cooldown", waitS, nextClaimAtNs: next.toString() } };
  }
  return { ok: false, block: { kind: "refused" } };
}

/** NEAR the account can spend: `amount` minus what storage staking still needs beyond `locked` (F-176 price per byte). */
export function spendableYocto(a: Pick<AccountView, "amount" | "locked" | "storage_usage">): bigint {
  const staked = BigInt(a.storage_usage) * STORAGE_YOCTO_PER_BYTE;
  const locked = big(a.locked);
  const reserve = staked > locked ? staked - locked : 0n;
  const amount = big(a.amount);
  return amount > reserve ? amount - reserve : 0n;
}

/** Deposits plus the gas headroom: what the account must be able to spend before the wallet opens. */
export function faucetNearNeeded(deposits: readonly string[]): bigint {
  return deposits.reduce((s, d) => s + big(d), 0n) + FAUCET_GAS_HEADROOM_YOCTO;
}

/** What a wallet or chain error means for the user: rejected in the wallet, not enough NEAR, or anything else. */
export type WalletErrorKind = "rejected" | "low-balance" | "error";

export function walletErrorKind(message: string | null | undefined): WalletErrorKind {
  const m = message ?? "";
  if (/NotEnoughBalance|LackBalanceForState|NotEnoughAllowance|insufficient (funds|balance)|not enough (balance|near|funds)|balance is too low/i.test(m)) return "low-balance";
  if (/reject|denied|cancel|declined|dismiss|user (closed|abort)|closed by user|popup closed/i.test(m)) return "rejected";
  return "error";
}

/** True when an RPC error says the token has no faucet views yet (code not upgraded): MethodNotFound. */
export function isMethodNotFound(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? "");
  return /MethodNotFound|MethodResolveError/.test(m);
}

/** config.yaml `faucet:` (orchestrator-owned), as the browser sees it. */
export interface FaucetPublicConfig {
  cooldown_s: number | null;
  /** Official testnet NEAR faucet for storage and gas (F-154 / F-462); null when unset or not https. */
  gas_faucet: string | null;
  tokens: Array<{ symbol: string; token: string; amount_per_claim: string; cap_per_account: string }>;
}

const DEC = /^(0|[1-9][0-9]*)$/;

/** Typed `faucet:`; a missing section reads as no tokens and no gas faucet (old configs keep loading). TODO-* ids are dropped. */
export function faucetPublicConfig(raw: unknown): FaucetPublicConfig {
  const f = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const gas = typeof f.gas_faucet === "string" && /^https:\/\/[^\s]+$/.test(f.gas_faucet) ? f.gas_faucet : null;
  const tokens: FaucetPublicConfig["tokens"] = [];
  for (const t of Array.isArray(f.tokens) ? f.tokens : []) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    const token = typeof o.token === "string" ? o.token : "";
    if (!token || token.startsWith("TODO-") || !isAccountId(token)) continue;
    const s = (v: unknown) => (typeof v === "string" && DEC.test(v) ? v : typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : "0");
    tokens.push({ symbol: typeof o.symbol === "string" ? o.symbol : token, token, amount_per_claim: s(o.amount_per_claim), cap_per_account: s(o.cap_per_account) });
  }
  return { cooldown_s: typeof f.cooldown_s === "number" ? f.cooldown_s : null, gas_faucet: gas, tokens };
}
