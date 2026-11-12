"use client";
import { eventsUnindexed } from "./useFeedApi";
import { Fragment, useEffect, useState } from "react";
import { Badge } from "@nectar/ui";

type Load<T> = { state: "loading" } | { state: "ok"; data: T; at: string } | { state: "error"; message: string };

interface AppHealth { ok: boolean; deployed: boolean; core?: string; version?: string; network?: string; error?: string }
interface FeedHealth {
  ok?: boolean;
  source?: string;
  events_indexed?: number;
  configured?: boolean;
  error?: string;
  last_indexed_block?: number | null;
  chain_head?: number | null;
  lag_blocks?: number | null;
  poll_age_s?: number | null;
  contracts?: Record<string, string>;
  version?: string | null;
  commit?: string | null;
}

function useJson<T>(url: string): Load<T> {
  const [s, setS] = useState<Load<T>>({ state: "loading" });
  useEffect(() => {
    const ctl = new AbortController();
    fetch(url, { cache: "no-store", signal: ctl.signal })
      .then(async (r) => {
        const body = (await r.json()) as T & { error?: string };
        if (!r.ok && body.error) setS({ state: "error", message: `${body.error} (HTTP ${r.status})` });
        else setS({ state: "ok", data: body, at: new Date().toISOString().slice(11, 19) });
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setS({ state: "error", message: e instanceof Error ? e.message : "request failed" });
      });
    return () => ctl.abort();
  }, [url]);
  return s;
}

const n = (v: number | null | undefined): string => (typeof v === "number" ? v.toLocaleString("en-US") : "n/a");

/** Live reads: same-origin /api/health (contract via RPC) and the Feed /health through the /api/indexer proxy (server-side FEED_URL). */
export function StatusLive() {
  const app = useJson<AppHealth>("/api/health");
  const feed = useJson<FeedHealth>("/api/indexer/health");
  return (
    <div className="grid-2">
      <section className="card stack-sm" aria-labelledby="st-app" aria-busy={app.state === "loading" || undefined} data-testid="status-app">
        <h3 id="st-app" className="card-title">Contract (NEAR testnet RPC)</h3>
        {app.state === "loading" ? <p className="caption">Reading /api/health…</p> : null}
        {app.state === "error" ? <p><Badge kind="danger">Error</Badge> {app.message}</p> : null}
        {app.state === "ok" ? (
          !app.data.deployed ? (
            <p><Badge kind="warn">Not deployed</Badge> Contract ids are pending in config.yaml.</p>
          ) : (
            <dl className="kv">
              <dt>Answer</dt><dd>{app.data.ok ? <Badge kind="good">Answering</Badge> : <Badge kind="danger">{app.data.error ?? "No answer"}</Badge>}</dd>
              <dt>Contract</dt><dd><code>{app.data.core}</code></dd>
              <dt>Version</dt><dd>{app.data.version ?? "n/a"}</dd>
              <dt>Checked</dt><dd>{app.at} UTC</dd>
            </dl>
          )
        ) : null}
      </section>
      <section className="card stack-sm" aria-labelledby="st-feed" aria-busy={feed.state === "loading" || undefined} data-testid="status-feed">
        <h3 id="st-feed" className="card-title">Feed indexer</h3>
        {feed.state === "loading" ? <p className="caption">Reading the Feed health…</p> : null}
        {feed.state === "error" ? <p><Badge kind="danger">Error</Badge> {feed.message}</p> : null}
        {feed.state === "ok" ? (
          feed.data.configured === false ? (
            <p data-testid="feed-unconfigured"><Badge kind="neutral">Not connected</Badge> No Feed URL is set in this build.</p>
          ) : (
            <dl className="kv">
              <dt>State</dt><dd>{feed.data.ok ? <Badge kind="good">Indexing</Badge> : <Badge kind="warn">Behind or stopped</Badge>}</dd>
              <dt>Last indexed block</dt><dd>{n(feed.data.last_indexed_block)}</dd>
              <dt>Chain head</dt><dd>{n(feed.data.chain_head)}</dd>
              <dt>Lag</dt><dd>{n(feed.data.lag_blocks)} blocks</dd>
              <dt>Event history</dt><dd data-testid="feed-events">{eventsUnindexed(feed.data) ? "isn't indexed on this host (the Feed reads contract views only)" : `${feed.data.events_indexed ?? "n/a"} events indexed`}</dd>
              <dt>Last poll</dt><dd>{typeof feed.data.poll_age_s === "number" ? `${feed.data.poll_age_s} s ago` : "n/a"}</dd>
              <dt>Version</dt><dd>{feed.data.version ?? "n/a"}{feed.data.commit ? ` (${feed.data.commit.slice(0, 7)})` : ""}</dd>
              {Object.entries(feed.data.contracts ?? {}).map(([k, v]) => (
                <Fragment key={k}><dt>{k}</dt><dd><code>{v}</code></dd></Fragment>
              ))}
            </dl>
          )
        ) : null}
      </section>
    </div>
  );
}
