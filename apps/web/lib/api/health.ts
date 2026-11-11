// /api/health answer policy (WO-34g, GATE_FAIL_G3B_R3). No imports, so `node --test` can load it.
// - An answer newer than `freshMs` is reused (R2-11: a loop on /api/health cannot spend the server's RPC quota); one read at a time.
// - When every RPC provider refuses, the last good snapshot of the same contract is served while it is at most `staleOkMs` old:
//   still ok, with `stale_s` and the public `rpc_error`. Older than that: ok:false with the reason. Nothing is ever invented.

export interface HealthSnapshot {
  core: string;
  /** When the data was read (ms). */
  at: number;
  status: number;
  body: Record<string, unknown>;
}

export interface HealthCheckerOptions {
  /** One fresh read: status 200 with the views, or a non-200 snapshot whose body carries `error` (a public reason). */
  read: (core: string, network: string) => Promise<HealthSnapshot>;
  now?: () => number;
  freshMs?: number;
  staleOkMs?: number;
}

interface Answer extends HealthSnapshot {
  /** When this answer was computed (drives the `freshMs` reuse). */
  checked: number;
  stale: boolean;
}

export function healthChecker(o: HealthCheckerOptions): (core: string, network: string) => Promise<{ status: number; body: Record<string, unknown> }> {
  const now = o.now ?? Date.now;
  const freshMs = o.freshMs ?? 5_000;
  const staleOkMs = o.staleOkMs ?? 60_000;
  let last: Answer | null = null;
  let lastGood: HealthSnapshot | null = null;
  let inflight: Promise<Answer> | null = null;

  const check = async (core: string, network: string): Promise<Answer> => {
    const r = await o.read(core, network);
    const checked = now();
    if (r.status === 200) {
      lastGood = r;
      return { ...r, checked, stale: false };
    }
    if (lastGood && lastGood.core === core && checked - lastGood.at <= staleOkMs) {
      return { ...lastGood, body: { ...lastGood.body, rpc_error: r.body.error }, checked, stale: true };
    }
    return { ...r, checked, stale: false };
  };

  return async (core, network) => {
    const t = now();
    let hit = last && last.core === core && t - last.checked <= freshMs && (!last.stale || t - last.at <= staleOkMs) ? last : null;
    if (!hit) {
      inflight ??= check(core, network).finally(() => {
        inflight = null;
      });
      hit = await inflight;
      last = hit;
    }
    const age_s = Math.max(0, Math.floor((now() - hit.at) / 1000));
    return { status: hit.status, body: { ...hit.body, as_of: new Date(hit.at).toISOString(), age_s, ...(hit.stale ? { stale_s: age_s } : {}) } };
  };
}
