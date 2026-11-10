"use client";
import { useState, type ReactNode } from "react";
import { Badge, Button, Card, Field, Kv, Segmented } from "@nectar/ui";
import { bpsToPct, formatUsdE6, oracleSourceLabel, parseUnits, tx, type ExitCapacity, type OracleSource, type PoolView, type QuoterConfigView, type TxIntent } from "@nectar/sdk";
import { SessionBadge } from "@/components/Session";
import { useChain, useSign, useView, useWallet } from "@/components/AppProvider";
import { Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { OracleBadge, optionalView, pricingLabel } from "@/components/OracleBadge";
import { CopilotPanel } from "@/components/CopilotPanel";

interface Data { cap: ExitCapacity; pool: PoolView; quoter: QuoterConfigView | null; source: OracleSource | null }

/** Build an intent or return the validation message. */
function attempt(f: () => TxIntent): TxIntent | string {
  try {
    return f();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** One owner write: fields, inline payload preview, and a button that opens the sign modal (msg, gas, deposit) before the wallet. */
function OwnerAction({ title, intent, enabled, onRun, children }: { title: string; intent: TxIntent | string | null; enabled: boolean; onRun: (t: TxIntent) => void; children?: ReactNode }) {
  const ok = intent !== null && typeof intent !== "string";
  return (
    <div className="stack-sm">
      <h3 className="small">{title}</h3>
      {children}
      {typeof intent === "string" ? <p className="small" role="alert">{intent}</p> : null}
      {ok ? (
        <details>
          <summary className="small dim">Payload: {intent.methodName}</summary>
          <pre className="codeblock mono">{JSON.stringify(intent.args, null, 2)}</pre>
        </details>
      ) : null}
      <Button disabled={!enabled || !ok} onClick={() => ok && onRun(intent)}>{ok ? intent.label : title}</Button>
    </div>
  );
}

export default function ConsolePage() {
  const chain = useChain();
  const { config } = chain;
  const { accountId } = useWallet();
  const sign = useSign();
  const sym = config.collaterals[0]?.symbol ?? "NVDAx";
  const data = useView<Data>(
    async (v) => {
      const [cap, pool, quoter, source] = await Promise.all([v.getExitCapacity(sym), v.getPool(), optionalView(v.getQuoterConfig()), optionalView(v.getOracleSource(sym))]);
      return { cap, pool, quoter, source };
    },
    [sym],
  );
  const owner = chain.core?.owner ?? config.owner;
  const isOwner = Boolean(accountId && owner && accountId === owner);
  const [price, setPrice] = useState("");
  const [depth, setDepth] = useState("");
  const [pid, setPid] = useState("");
  const [ver, setVer] = useState("");
  // Defaults mirror packages/config/config.yaml `outlayer.resource_limits`; deposit in yoctoNEAR.
  const [qc, setQc] = useState({ deposit_yocto: "", gas_tgas: "100", max_instructions: "100000000", max_memory_mb: "128", max_execution_seconds: "30" });
  const [vol, setVol] = useState("");
  const [conf, setConf] = useState("");
  const [srcKind, setSrcKind] = useState<"Owner" | "Pyth">("Owner");
  const [priceId, setPriceId] = useState("");
  const core = config.core;
  const run = (t: TxIntent, success: string) => void sign(t, { success }).then(() => { data.reload(); chain.reload(); });
  const usd = (s: string) => { try { return s.trim() ? parseUnits(s, 6).toString() : null; } catch { return null; } };
  const int = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);
  const d = data.data;
  const pricing = pricingLabel(d?.quoter);
  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Curator console</span>
        <h1>Size exit capacity</h1>
        <p className="lead">Live parameters for {sym}. Owner actions go through the same sign preview as every other write.</p>
      </div>
      <Gate>
        {data.error ? <RpcErrorBanner error={data.error} onRetry={data.reload} /> : data.loading || !d ? <LoadingBlock /> : (
          <div className="grid-2">
            <Card label={`${sym} · mock`} live>
              <div className="kvs">
                <Kv k="Committed Q" v={formatUsdE6(d.cap.q_usd_e6)} />
                <Kv k="Nectar Reserve R" v={formatUsdE6(d.cap.r_usd_e6)} />
                <Kv k="Verified DEX depth D" v={formatUsdE6(d.cap.d_usd_e6)} />
                <Kv k="Haircut" v={bpsToPct(d.cap.haircut_bps)} />
                <Kv k="Session" v={<SessionBadge cap={d.cap} />} />
                <Kv k="Contract" v={<span className="mono">{chain.version ?? "—"}</span>} />
                <Kv k="Oracle price" v={formatUsdE6(d.cap.oracle_price_usd_e6)} />
                <Kv k="Oracle" v={<OracleBadge cap={d.cap} />} />
                <Kv k="Effective limit" v={bpsToPct(d.cap.limit_bps_effective)} />
              </div>
            </Card>
            <Card label="Lending pool and pricing">
              <div className="kvs">
                <Kv k="Available" v={formatUsdE6(d.pool.available_usd_e6)} />
                <Kv k="Utilised" v={formatUsdE6(d.pool.utilised_usd_e6)} />
                <Kv k="Treasury" v={formatUsdE6(d.pool.treasury_usd_e6)} />
                <Kv k="Lender fees" v={formatUsdE6(d.pool.lenders_fees_usd_e6)} />
                <Kv k="Fee split" v={`${config.feeSplit.buyers_bps / 100} / ${config.feeSplit.lenders_bps / 100} / ${config.feeSplit.treasury_bps / 100} %`} />
                <Kv k="Oracle source" v={<Badge kind={oracleSourceLabel(d.source ?? d.cap.oracle_source) === "Pyth" ? "live" : "fallback"}>{oracleSourceLabel(d.source ?? d.cap.oracle_source) === "Pyth" ? "Pyth" : "owner oracle"}</Badge>} />
                <Kv k="Settlement pricing" v={<Badge kind={pricing.live ? "live" : "fallback"}>{pricing.text}</Badge>} />
                {d.quoter ? <Kv k="Quoter limits" v={`${d.quoter.gas_tgas ?? "—"} Tgas · ${d.quoter.max_memory_mb ?? "—"} MB · ${d.quoter.max_execution_seconds ?? "—"} s`} /> : null}
              </div>
            </Card>
            <Card label="Owner actions · P0" className="stack">
              {!isOwner ? <p className="small dim">Read-only. Owner: <span className="mono">{owner ?? "—"}</span>.</p> : null}
              {core ? (
                <div className="stack">
                  <div className="row">
                    <Button disabled={!isOwner} variant={chain.paused ? "primary" : "danger"} onClick={() => run(chain.paused ? tx.unpause(core) : tx.pause(core), chain.paused ? "Unpaused" : "Paused")}>{chain.paused ? "Unpause" : "Pause"}</Button>
                    {/* v1 owner flag; v2 removed it (the session comes from the calendar, interface-v7 §A2). */}
                    {chain.generation !== "v2" ? <Button disabled={!isOwner} onClick={() => run(tx.setSession(core, sym, !d.cap.session_open), "Session updated")}>{d.cap.session_open ? "Close session" : "Open session"}</Button> : null}
                  </div>
                  <OwnerAction title="Update owner price" enabled={isOwner} intent={usd(price) ? tx.updateOwnerPrice(core, sym, usd(price)!) : null} onRun={(t) => run(t, "Price updated")}>
                    <Field label="Owner price" inputMode="decimal" unit="USD" value={price} onChange={(e) => setPrice(e.target.value)} />
                  </OwnerAction>
                  <OwnerAction title="Set DEX depth" enabled={isOwner} intent={usd(depth) ? tx.setDexDepth(core, sym, usd(depth)!) : null} onRun={(t) => run(t, "Depth updated")}>
                    <Field label="Verified DEX depth" inputMode="decimal" unit="USD" value={depth} onChange={(e) => setDepth(e.target.value)} />
                  </OwnerAction>
                </div>
              ) : null}
            </Card>
            <Card label="Owner actions · quoter and oracle" className="stack">
              {core ? (
                <div className="stack">
                  <OwnerAction title="Pin quoter" enabled={isOwner} intent={pid && ver ? attempt(() => tx.setQuoterPin(core, pid.trim(), ver.trim())) : null} onRun={(t) => run(t, "Quoter pinned")}>
                    <Field label="OutLayer project id" value={pid} onChange={(e) => setPid(e.target.value)} hint={`Current: ${pricing.text}`} />
                    <Field label="Version key" value={ver} onChange={(e) => setVer(e.target.value)} />
                  </OwnerAction>
                  <OwnerAction title="Disable quoter" enabled={isOwner && pricing.live} intent={tx.setQuoterPin(core, "", "")} onRun={(t) => run(t, "Quoter disabled")} />
                  <OwnerAction
                    title="Set quoter config"
                    enabled={isOwner}
                    intent={qc.deposit_yocto ? attempt(() => tx.setQuoterConfig(core, { deposit_yocto: qc.deposit_yocto.trim(), gas_tgas: int(qc.gas_tgas), max_instructions: qc.max_instructions.trim(), max_memory_mb: int(qc.max_memory_mb), max_execution_seconds: int(qc.max_execution_seconds) })) : null}
                    onRun={(t) => run(t, "Quoter config set")}
                  >
                    <Field label="Deposit per execution" inputMode="numeric" unit="yocto" value={qc.deposit_yocto} onChange={(e) => setQc({ ...qc, deposit_yocto: e.target.value })} hint="Paid from the gas reserve" />
                    <Field label="Gas" inputMode="numeric" unit="Tgas" value={qc.gas_tgas} onChange={(e) => setQc({ ...qc, gas_tgas: e.target.value })} />
                    <Field label="Max instructions" inputMode="numeric" value={qc.max_instructions} onChange={(e) => setQc({ ...qc, max_instructions: e.target.value })} />
                    <Field label="Max memory" inputMode="numeric" unit="MB" value={qc.max_memory_mb} onChange={(e) => setQc({ ...qc, max_memory_mb: e.target.value })} />
                    <Field label="Max execution time" inputMode="numeric" unit="s" value={qc.max_execution_seconds} onChange={(e) => setQc({ ...qc, max_execution_seconds: e.target.value })} />
                  </OwnerAction>
                  <OwnerAction title="Set volatility" enabled={isOwner} intent={vol ? attempt(() => tx.setVolBps(core, sym, int(vol))) : null} onRun={(t) => run(t, "Volatility set")}>
                    <Field label={`vol_bps for ${sym}`} inputMode="numeric" unit="bps" value={vol} onChange={(e) => setVol(e.target.value)} />
                  </OwnerAction>
                  <OwnerAction
                    title="Set oracle source"
                    enabled={isOwner}
                    intent={srcKind === "Owner" ? tx.setOracleSource(core, sym, "Owner") : priceId ? attempt(() => tx.setOracleSource(core, sym, { Pyth: { account: "pyth-oracle.testnet", price_identifier: priceId.trim() } })) : null}
                    onRun={(t) => run(t, "Oracle source set")}
                  >
                    <Segmented label="Source" value={srcKind} onChange={setSrcKind} options={[{ value: "Owner", label: "Owner" }, { value: "Pyth", label: "Pyth" }]} />
                    {srcKind === "Pyth" ? <Field label="Pyth price identifier" value={priceId} onChange={(e) => setPriceId(e.target.value)} hint="32-byte hex, read from pyth-oracle.testnet" /> : null}
                  </OwnerAction>
                  <OwnerAction title="Set max oracle confidence" enabled={isOwner} intent={conf ? attempt(() => tx.setMaxConfBps(core, int(conf))) : null} onRun={(t) => run(t, "Max confidence set")}>
                    <Field label="max_conf_bps" inputMode="numeric" unit="bps" value={conf} onChange={(e) => setConf(e.target.value)} />
                  </OwnerAction>
                </div>
              ) : null}
            </Card>
          </div>
        )}
      </Gate>
      <CopilotPanel />
    </div>
  );
}
