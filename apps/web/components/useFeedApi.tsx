"use client";
import { useEffect, useState } from "react";
import { Banner, Button } from "@nectar/ui";

export interface FeedApiState<T> {
  data: T | undefined;
  error: string | null;
  /** true when NEXT_PUBLIC_FEED_URL is empty on the server. */
  unconfigured: boolean;
  loading: boolean;
  reload: () => void;
}

/** GET a Feed API path through the same-origin proxy (`/api/indexer/<path>`). */
export function useFeedApi<T>(path: string): FeedApiState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(`/api/indexer/${path}`, { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json()) as T & { error?: string; configured?: boolean };
        if (!live) return;
        if (r.ok) {
          setData(body);
          setError(null);
          setUnconfigured(false);
        } else {
          setUnconfigured(body.configured === false);
          setError(body.error ?? `HTTP ${r.status}`);
        }
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [path, tick]);
  return { data, error, unconfigured, loading, reload: () => setTick((t) => t + 1) };
}

/** Non-blocking notice for a missing or unreachable indexer; on-chain views on the same page keep working. */
export function FeedApiNotice({ state, what }: { state: Pick<FeedApiState<unknown>, "error" | "unconfigured" | "reload">; what: string }) {
  if (!state.error) return null;
  return state.unconfigured ? (
    <Banner tone="info" title="Indexer not connected">
      {what} come from the Feed API (<code>services/feed</code>). Set <code>NEXT_PUBLIC_FEED_URL</code> and run <code>pnpm --filter feed start</code>.
    </Banner>
  ) : (
    <Banner tone="warn" title="Feed API unavailable" actions={<Button size="sm" onClick={state.reload}>Retry</Button>}>
      {what} could not be loaded: <span className="mono">{state.error}</span>
    </Banner>
  );
}
