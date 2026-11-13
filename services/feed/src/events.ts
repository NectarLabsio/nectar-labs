// NEP-297 event parsing (F-021): a log line `EVENT_JSON:{"standard","version","event","data"}`.
// nectar-core emits `standard:"nectar"`, `data` = array of one object (docs/work/interface-p0.md).
// Versions: "2.0.0" = nectar-core-v2 (contracts/nectar-core/src/events.rs:8), "1.0.0" = v1. Both are accepted because every
// field the Feed reads has the same name and JSON type in both (evidence/WO-71/fields.md). Anything else is ignored, never guessed at.

export const EVENT_PREFIX = 'EVENT_JSON:';
export const NECTAR_STANDARD = 'nectar';
/** Current contract event version (nectar-core-v2). */
export const NECTAR_VERSION = '2.0.0';
export const NECTAR_VERSIONS: readonly string[] = ['1.0.0', NECTAR_VERSION];

export const NECTAR_EVENTS = [
  'quote_funded', 'quote_topped_up', 'quote_exiting', 'quote_withdrawn', 'fees_claimed',
  'liquidity_supplied', 'position_opened', 'repaid', 'preliq_triggered', 'settled_near', 'settled_reserve',
  'oracle_updated', 'oracle_rejected', 'collateral_upserted', 'paused', 'unpaused',
] as const;
export type NectarEventName = (typeof NECTAR_EVENTS)[number];

export interface NectarEvent {
  event: NectarEventName;
  data: Record<string, unknown>;
}

export type ParseResult = { ok: true; value: NectarEvent } | { ok: false; reason: 'not_event' | 'bad_json' | 'foreign_standard' | 'bad_version' | 'unknown_event' | 'bad_data' };

export function parseEventLog(line: string): ParseResult {
  if (!line.startsWith(EVENT_PREFIX)) return { ok: false, reason: 'not_event' };
  let o: unknown;
  try {
    o = JSON.parse(line.slice(EVENT_PREFIX.length));
  } catch {
    return { ok: false, reason: 'bad_json' };
  }
  if (typeof o !== 'object' || o === null) return { ok: false, reason: 'bad_json' };
  const e = o as Record<string, unknown>;
  if (e.standard !== NECTAR_STANDARD) return { ok: false, reason: 'foreign_standard' };
  if (typeof e.version !== 'string' || !NECTAR_VERSIONS.includes(e.version)) return { ok: false, reason: 'bad_version' };
  if (typeof e.event !== 'string' || !(NECTAR_EVENTS as readonly string[]).includes(e.event)) return { ok: false, reason: 'unknown_event' };
  if (!Array.isArray(e.data) || e.data.length !== 1 || typeof e.data[0] !== 'object' || e.data[0] === null) return { ok: false, reason: 'bad_data' };
  return { ok: true, value: { event: e.event as NectarEventName, data: e.data[0] as Record<string, unknown> } };
}

export function str(d: Record<string, unknown>, k: string): string | null {
  const v = d[k];
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

export function num(d: Record<string, unknown>, k: string): number | null {
  const v = d[k];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  return null;
}
