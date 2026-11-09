"use client";
import { useState } from "react";
import { Badge, Button, Card, Field, Kv } from "@nectar/ui";
import { bpsToPct, formatUsdE6, parseUnits, tx, type ExitCapacity, type PoolView } from "@nectar/sdk";
import { useChain, useSign, useView, useWallet } from "@/components/AppProvider";
import { Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";

export default function ConsolePage() {
  const chain = useChain();
  const { config } = chain;
  const { accountId } = useWallet();
  const sign = useSign();
  const sym = config.collaterals[0]?.symbol ?? "NVDAx";
  const data = useView<{ cap: ExitCapacity; pool: PoolView }>(async (v) => ({ cap: await v.getExitCapacity(sym), pool: await v.getPool() }), [sym]);
  const owner = chain.core?.owner ?? config.owner;
  const isOwner = Boolean(accountId && owner && accountId === owner);
  const [price, setPrice] = useState("");
  const [depth, setDepth] = useState("");
  const core = config.core;
  const run = (t: Parameters<typeof sign>[0], success: string) => void sign(t, { success }).then(() => { data.reload(); chain.reload(); });
  const usd = (s: string) => { try { return s.trim() ? parseUnits(s, 6).toString() : null; } catch { return null; } };
  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Curator console</span>
        <h1>Size exit capacity</h1>
        <p className="lead">Live parameters for {sym}. Owner actions go through the same sign preview as every other write.</p>
      </div>
      <Gate>
        {data.error ? <RpcErrorBanner error={data.error} onRetry={data.reload} /> : data.loading || !data.data ? <LoadingBlock /> : (
          <div className="grid-2">
            <Card label={`${sym} · mock`} live>
              <div className="kvs">
                <Kv k="Committed Q" v={formatUsdE6(data.data.cap.q_usd_e6)} />
                <Kv k="Reserve R" v={formatUsdE6(data.data.cap.r_usd_e6)} />
                <Kv k="DEX depth D" v={formatUsdE6(data.data.cap.d_usd_e6)} />
                <Kv k="Haircut" v={bpsToPct(data.data.cap.haircut_bps)} />
                <Kv k="Session" v={data.data.cap.session_open ? "open" : "closed"} />
                <Kv k="Oracle price" v={`${formatUsdE6(data.data.cap.oracle_price_usd_e6)} · ${data.data.cap.oracle_age_s}s · ${data.data.cap.oracle_fresh ? "fresh" : "stale"}`} />
                <Kv k="Effective limit" v={bpsToPct(data.data.cap.limit_bps_effective)} />
              </div>
            </Card>
            <Card label="Lending pool">
              <div className="kvs">
                <Kv k="Available" v={formatUsdE6(data.data.pool.available_usd_e6)} />
                <Kv k="Utilised" v={formatUsdE6(data.data.pool.utilised_usd_e6)} />
                <Kv k="Treasury" v={formatUsdE6(data.data.pool.treasury_usd_e6)} />
                <Kv k="Lender fees" v={formatUsdE6(data.data.pool.lenders_fees_usd_e6)} />
                <Kv k="Fee split" v={`${config.feeSplit.buyers_bps / 100} / ${config.feeSplit.lenders_bps / 100} / ${config.feeSplit.treasury_bps / 100} %`} />
                <Kv k="Oracle source" v={<Badge kind="fallback">{config.oracle.source} oracle</Badge>} />
              </div>
            </Card>
            <Card label="Owner actions" className="stack">
              {!isOwner ? <p className="small dim">Read-only. Owner: <span className="mono">{owner ?? "—"}</span>.</p> : core ? (
                <div className="stack">
                  <div className="row">
                    <Button variant={chain.paused ? "primary" : "danger"} onClick={() => run(chain.paused ? tx.unpause(core) : tx.pause(core), chain.paused ? "Unpaused" : "Paused")}>{chain.paused ? "Unpause" : "Pause"}</Button>
                    <Button onClick={() => run(tx.setSession(core, sym, !data.data!.cap.session_open), "Session updated")}>{data.data.cap.session_open ? "Close session" : "Open session"}</Button>
                  </div>
                  <Field label="Owner price" inputMode="decimal" unit="USD" value={price} onChange={(e) => setPrice(e.target.value)} />
                  <Button disabled={!usd(price)} onClick={() => run(tx.updateOwnerPrice(core, sym, usd(price)!), "Price updated")}>Update owner price</Button>
                  <Field label="Verified DEX depth" inputMode="decimal" unit="USD" value={depth} onChange={(e) => setDepth(e.target.value)} />
                  <Button disabled={!usd(depth)} onClick={() => run(tx.setDexDepth(core, sym, usd(depth)!), "Depth updated")}>Set DEX depth</Button>
                </div>
              ) : null}
            </Card>
          </div>
        )}
      </Gate>
    </div>
  );
}
