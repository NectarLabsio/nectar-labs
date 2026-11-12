"use client";
import { useEffect, useState } from "react";
import { Banner, Button } from "@nectar/ui";
import { docsHref } from "@/lib/env";

/** The Feed API docs page (how to run services/feed and set FEED_URL). */
export const FEED_DOCS = docsHref("integrate/feed-rest");

/** Shown wherever indexer data would appear while NEXT_PUBLIC_FEED_URL is unset. */
export function FeedUnconfigured({ what }: { what: string }) {
  return (
    <Banner tone="info" title="Feed indexer not configured">
      {what} come from the Feed API (<code>services/feed</code>), which this deployment does not run. Set <code>FEED_URL</code> and run{" "}
      <code>pnpm --filter feed start</code>; see the <a className="link" href={FEED_DOCS}>Feed API docs</a>.
    </Banner>
  );
}

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
        if (body.configured === false) {
          setData(undefined);
          setUnconfigured(true);
          setError(body.error ?? "Feed indexer not configured");
        } else if (r.ok) {
          setData(body);
          setError(null);
          setUnconfigured(false);
        } else {
          setUnconfigured(false);
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
    <FeedUnconfigured what={what} />
  ) : (
    <Banner tone="warn" title="Feed API unavailable" actions={<Button size="sm" onClick={state.reload}>Retry</Button>}>
      {what} could not be loaded: <span className="mono">{state.error}</span>
    </Banner>
  );
}

/** Feed health fields that say whether contract events are indexed (services/feed /healthz). */
export interface FeedEventMode {
  source?: string;
  events_indexed?: number;
}

/** True when the Feed reads contract views only (`source: "views"`) or has indexed no events: event history is not available. */
export function eventsUnindexed(h: FeedEventMode | undefined | null): boolean {
  return Boolean(h) && (h!.source === "views" || h!.events_indexed === 0);
}

/** Reads the Feed /healthz once; `unindexed` stays false until the Feed answers (local mode with events renders as before). */
export function useEventHistory(): { unindexed: boolean; loading: boolean } {
  const h = useFeedApi<FeedEventMode>("healthz");
  return { unindexed: eventsUnindexed(h.data), loading: h.loading };
}

/** Honest empty state for screens built from Feed events (settlements, triggers, Note history) on a views-only Feed. */
export function EventsNotIndexed({ what }: { what: string }) {
  return (
    <div data-testid="events-not-indexed"><Banner tone="info" title="Event history isn't indexed on this host">
      This host&apos;s Feed reads contract views only (no event indexer), so {what} from past contract events are not listed here. Current
      loans, quotes and the Reserve still come from live views.
    </Banner></div>
  );
}
