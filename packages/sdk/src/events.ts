// NEP-297 log parsing (F-021): `EVENT_JSON:{"standard","version","event","data"}`; nectar-core uses standard "nectar".
import type { NectarEvent } from "./types";

const PREFIX = "EVENT_JSON:";

export function parseEventLog(log: string): NectarEvent | null {
  if (!log.startsWith(PREFIX)) return null;
  try {
    const e = JSON.parse(log.slice(PREFIX.length)) as { standard?: unknown; event?: unknown; data?: unknown };
    if (e.standard !== "nectar" || typeof e.event !== "string" || !Array.isArray(e.data)) return null;
    return e as NectarEvent;
  } catch {
    return null;
  }
}

export function parseEventLogs(logs: readonly string[]): NectarEvent[] {
  return logs.map(parseEventLog).filter((e): e is NectarEvent => e !== null);
}
