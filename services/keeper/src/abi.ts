// P0 contract ABI as seen by the keeper. Source of truth: docs/work/interface-p0.md.
// u128 / u64 values are JSON strings; bps are numbers. A mismatch is reported, never improvised.

export type PositionStatus = 'Open' | 'Settling' | 'Closed';

/** One item of `list_positions(from_index, limit)`. Only the fields the keeper reads are typed. */
export interface PositionView {
  /** interface-p0.md names ids `position_id` (events); `id` accepted until WO-2 fixes the view shape. */
  position_id?: string;
  id?: string;
  status: PositionStatus;
  collateral?: string;
  pre_liq_ltv_bps?: number;
}

/** `get_health(position_id)`. */
export interface HealthView {
  value_usd_e6: string;
  debt_usd_e6: string;
  ltv_bps: number;
  pre_liq_ltv_bps: number;
  oracle_fresh: boolean;
  triggerable: boolean;
}

/** The only methods the keeper's function-call key may call (D-010, PRD §6.1). */
export const KEEPER_METHODS = ['trigger_preliquidation', 'relay_settlement_result'] as const;
export type KeeperMethod = (typeof KEEPER_METHODS)[number];

/** P0 uses only this one; `relay_settlement_result` is feature-gated (`p2`) in the contract. */
export const P0_KEEPER_METHOD: KeeperMethod = 'trigger_preliquidation';

export function positionIdOf(p: PositionView, fallbackIndex: number): string {
  if (typeof p.position_id === 'string' && p.position_id !== '') return p.position_id;
  if (typeof p.id === 'string' && p.id !== '') return p.id;
  return String(fallbackIndex);
}

export function isHealthView(v: unknown): v is HealthView {
  if (typeof v !== 'object' || v === null) return false;
  const h = v as Record<string, unknown>;
  return (
    typeof h.value_usd_e6 === 'string' &&
    typeof h.debt_usd_e6 === 'string' &&
    typeof h.ltv_bps === 'number' &&
    typeof h.pre_liq_ltv_bps === 'number' &&
    typeof h.oracle_fresh === 'boolean' &&
    typeof h.triggerable === 'boolean'
  );
}

export function isPositionView(v: unknown): v is PositionView {
  if (typeof v !== 'object' || v === null) return false;
  const s = (v as Record<string, unknown>).status;
  return s === 'Open' || s === 'Settling' || s === 'Closed';
}
