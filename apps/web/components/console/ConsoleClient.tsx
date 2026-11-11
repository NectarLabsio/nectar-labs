"use client";
// WO-33c: Console artboard (/console). What-if sliders with impact before signing, session and price, corporate actions, settlement
// and fees, keepers, evidence, then the contract's owner controls. Read-only for non-owners; every write goes through the sign modal.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Field, Kvr, Notice, NxBadge, Panel, Seg, Slider } from "@nectar/ui";
import {
  bpsToPct,
  formatUsdE6,
  oracleSourceLabel,
  parseUnits,
  tx,
  txV1,
  txV2,
  upsertFromView,
  valueUsdE6WithMultiplier,
  whatIfDiff,
  whatIfImpact,
  type CollateralView,
  type EvidenceRow,
  type ExitCapacity,
  type FeeStackView,
  type OracleSource,
  type PoolView,
  type QuoterConfigView,
  type RemoteConfigView,
  type SessionWindow,
  type TxIntent,
  type WhatIfParams,
} from "@nectar/sdk";
import { OwnerAction, attempt } from "@/components/OwnerAction";
import { ConsoleV7 } from "@/components/ConsoleV7";
import { SessionBadge } from "@/components/Session";
import { useChain, useSign, useView, useWallet } from "@/components/AppProvider";
import { Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { OracleBadge, optionalView, pricingLabel } from "@/components/OracleBadge";
import { CopilotPanel } from "@/components/CopilotPanel";

export interface ConsoleData {
  cap: ExitCapacity;
  pool: PoolView;
  quoter: QuoterConfigView | null;
  source: OracleSource | null;
  coll: CollateralView | null;
  calendar: SessionWindow[];
  remote: RemoteConfigView | null;
  fees: FeeStackView | null;
}

const big = (v: string | number | bigint | null | undefined) => BigInt(v ?? 0);
const pct2 = (bps: number) => `${(bps / 100).toFixed(2)}%`;
/** Size of the example loan, in whole units; the what-if rows are examples, not positions. */
const EXAMPLE_UNITS = 300;

export function ConsoleClient({ evidence }: { evidence: EvidenceRow[] }) {
  const chain = useChain();
  const { config } = chain;
  const { accountId } = useWallet();
  const sign = useSign();
  const sym = config.collaterals[0]?.symbol ?? "NVDAx";
  const v2 = chain.generation === "v2";
  const data = useView<ConsoleData>(
    async (v) => {
      const [cap, pool, quoter, source, coll, calendar, remote, fees] = await Promise.all([
        v.getExitCapacity(sym),
        v.getPool(),
        optionalView(v.getQuoterConfig()),
        optionalView(v.getOracleSource(sym)),
        v.getCollateral(sym),
        v2 ? v.getFullSessionCalendar() : Promise.resolve([] as SessionWindow[]),
        v2 ? optionalView(v.getRemoteConfig()) : Promise.resolve(null),
        v2 ? optionalView(v.getFeeStack(sym)) : Promise.resolve(null),
      ]);
      return { cap, pool, quoter, source, coll, calendar, remote, fees };
    },
    [sym, v2],
  );
  const owner = chain.core?.owner ?? config.owner;
  const isOwner = Boolean(accountId && owner && accountId === owner);
  const [price, setPrice] = useState("");
  const [depth, setDepth] = useState("");
  const [reserveV1, setReserveV1] = useState("");
  const [pid, setPid] = useState("");
  const [ver, setVer] = useState("");
  // Defaults mirror packages/config/config.yaml `outlayer.resource_limits`; deposit in yoctoNEAR.
  const [qc, setQc] = useState({ deposit_yocto: "", gas_tgas: "100", max_instructions: "100000000", max_memory_mb: "128", max_execution_seconds: "30" });
  const [vol, setVol] = useState("");
  const [conf, setConf] = useState("");
  const [srcKind, setSrcKind] = useState<"Owner" | "Pyth">("Owner");
  const [priceId, setPriceId] = useState("");
  const core = config.core;
  const reloadAll = () => { data.reload(); chain.reload(); };
  const run = (t: TxIntent, success: string) => void sign(t, { success }).then(reloadAll);
  const usd = (s: string) => { try { return s.trim() ? parseUnits(s, 6).toString() : null; } catch { return null; } };
  const int = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);
  const d = data.data;
  const pricing = pricingLabel(d?.quoter);
  const oracleKind = d ? oracleSourceLabel(d.source ?? d.cap.oracle_source) : "Owner";

  return (
    <div className="nx-page">
      <div className="nx-head-row">
        <div className="nx-stack nx-gap12">
          <h1 className="nx-title">Curator</h1>
          <p className="nx-lede">Tune {sym} and see what changes before anything is signed. Anyone can read these settings; only the owner account can change them. Testnet, mock collateral.</p>
        </div>
        <Seg label="Market" className="nx-chain-seg" value={sym} onChange={() => undefined} options={[{ value: sym, label: sym }, { value: "solana", label: "Solana", disabled: true, badge: "soon" }, { value: "base", label: "Base", disabled: true, badge: "soon" }]} />
      </div>
      <Gate>
        {data.error ? <RpcErrorBanner error={data.error} onRetry={data.reload} /> : !d ? <LoadingBlock /> : (
          <div className="nx-stack" style={{ gap: 24 }}>
            {!isOwner ? (
              <Notice tone="info" icon="info" title="Read only" testId="console-readonly">
                {accountId ? `You're connected as ${accountId}.` : "No wallet connected."} Try the sliders freely; signing needs <span className="nx-head">{owner ?? "the owner account"}</span>.
              </Notice>
            ) : null}
            {v2 && d.coll && core ? <WhatIf coll={d.coll} cap={d.cap} core={core} owner={owner} isOwner={isOwner} onDone={reloadAll} /> : null}
            {v2 && core ? <ConsoleV7 core={core} sym={sym} d={d} isOwner={isOwner} onDone={reloadAll} /> : null}

            <div className="nx-grid3">
              <SettlementFees d={d} />
              <Keepers d={d} />
              <Evidence rows={evidence} />
            </div>

            <h2 className="nx-section-h">Contract controls</h2>
            <div className="nx-grid2">
              <Panel title={`${sym} · mock`} data-live>
                <div>
                  <Kvr k="Committed Q" v={formatUsdE6(d.cap.q_usd_e6)} />
                  <Kvr k="Nectar Reserve R" v={formatUsdE6(d.cap.r_usd_e6)} />
                  <Kvr k="Verified DEX depth D" v={formatUsdE6(d.cap.d_usd_e6)} />
                  <Kvr k="Haircut" v={bpsToPct(d.cap.haircut_bps)} />
                  <Kvr k="Session" v={<SessionBadge cap={d.cap} />} />
                  <Kvr k="Contract" v={chain.version ?? "—"} />
                  <Kvr k="Oracle price" v={formatUsdE6(d.cap.oracle_price_usd_e6)} />
                  <Kvr k="Oracle" v={<OracleBadge cap={d.cap} />} />
                  <Kvr k="Effective limit" v={bpsToPct(d.cap.limit_bps_effective)} />
                </div>
              </Panel>
              <Panel title="Lending pool and pricing">
                <div>
                  <Kvr k="Available" v={formatUsdE6(d.pool.available_usd_e6)} />
                  <Kvr k="Utilised" v={formatUsdE6(d.pool.utilised_usd_e6)} />
                  <Kvr k="Treasury" v={formatUsdE6(d.pool.treasury_usd_e6)} />
                  <Kvr k="Lender fees" v={formatUsdE6(d.pool.lenders_fees_usd_e6)} />
                  <Kvr k="Fee split" v={`${config.feeSplit.buyers_bps / 100} / ${config.feeSplit.lenders_bps / 100} / ${config.feeSplit.treasury_bps / 100} %`} />
                  <Kvr k="Oracle source" v={<Badge kind={oracleKind === "Pyth" ? "live" : "fallback"}>{oracleKind === "Pyth" ? "Pyth" : "owner oracle"}</Badge>} />
                  <Kvr k="Settlement pricing" v={<Badge kind={pricing.live ? "live" : "fallback"}>{pricing.text}</Badge>} />
                  {d.quoter ? <Kvr k="Quoter limits" v={`${d.quoter.gas_tgas ?? "—"} Tgas · ${d.quoter.max_memory_mb ?? "—"} MB · ${d.quoter.max_execution_seconds ?? "—"} s`} /> : null}
                </div>
              </Panel>
              <Panel title="Owner actions · P0">
                {!isOwner ? <p className="nx-k">Read-only. Owner: <span className="nx-head">{owner ?? "—"}</span>.</p> : null}
                {core ? (
                  <>
                    <div className="nx-row nx-wrap">
                      <button type="button" className="nx-btn quiet sm" disabled={!isOwner} onClick={() => run(chain.paused ? tx.unpause(core) : tx.pause(core), chain.paused ? "Unpaused" : "Paused")}>{chain.paused ? "Unpause" : "Pause"}</button>
                      {/* v1 owner flag; v2 removed it (the session comes from the calendar, interface-v7 §A2). */}
                      {!v2 ? <button type="button" className="nx-btn quiet sm" disabled={!isOwner} onClick={() => run(tx.setSession(core, sym, !d.cap.session_open), "Session updated")}>{d.cap.session_open ? "Close session" : "Open session"}</button> : null}
                    </div>
                    <OwnerAction title="Update owner price" enabled={isOwner} intent={usd(price) ? tx.updateOwnerPrice(core, sym, usd(price)!) : null} onRun={(t) => run(t, "Price updated")}>
                      <Field label="Owner price" inputMode="decimal" unit="USD" value={price} onChange={(e) => setPrice(e.target.value)} />
                    </OwnerAction>
                    <OwnerAction title="Set DEX depth" enabled={isOwner} intent={usd(depth) ? tx.setDexDepth(core, sym, usd(depth)!) : null} onRun={(t) => run(t, "Depth updated")}>
                      <Field label="Verified DEX depth" inputMode="decimal" unit="USD" value={depth} onChange={(e) => setDepth(e.target.value)} />
                    </OwnerAction>
                    {/* v1 only: owner-set R. v2 removed set_reserve (D-024); its Reserve panel calls set_reserve_params. */}
                    {!v2 ? (
                      <OwnerAction title="Set Nectar Reserve R (v1)" enabled={isOwner} intent={usd(reserveV1) ? txV1.setReserve(core, sym, usd(reserveV1)!) : null} onRun={(t) => run(t, "Reserve updated")} testId="v1-set-reserve">
                        <Field label="Nectar Reserve R" inputMode="decimal" unit="USD" value={reserveV1} onChange={(e) => setReserveV1(e.target.value)} />
                      </OwnerAction>
                    ) : null}
                  </>
                ) : null}
              </Panel>
              <Panel title="Owner actions · quoter and oracle">
                {core ? (
                  <>
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
                      <Seg label="Source" value={srcKind} onChange={setSrcKind} options={[{ value: "Owner", label: "Owner" }, { value: "Pyth", label: "Pyth" }]} />
                      {srcKind === "Pyth" ? <Field label="Pyth price identifier" value={priceId} onChange={(e) => setPriceId(e.target.value)} hint="32-byte hex, read from pyth-oracle.testnet" /> : null}
                    </OwnerAction>
                    <OwnerAction title="Set max oracle confidence" enabled={isOwner} intent={conf ? attempt(() => tx.setMaxConfBps(core, int(conf))) : null} onRun={(t) => run(t, "Max confidence set")}>
                      <Field label="max_conf_bps" inputMode="numeric" unit="bps" value={conf} onChange={(e) => setConf(e.target.value)} />
                    </OwnerAction>
                  </>
                ) : null}
              </Panel>
            </div>
          </div>
        )}
      </Gate>
      <CopilotPanel />
    </div>
  );
}

// ---------------------------------------------------------------- what-if

function WhatIf({ coll, cap, core, owner, isOwner, onDone }: { coll: CollateralView; cap: ExitCapacity; core: string; owner: string | null; isOwner: boolean; onDone: () => void }) {
  const sign = useSign();
  const current: WhatIfParams = { base_haircut_bps: coll.base_haircut_bps, weekend_haircut_bps: coll.weekend_haircut_bps, max_nectar_ltv_bps: coll.max_nectar_ltv_bps, limit_premium_bps: coll.limit_premium_bps };
  const [p, setP] = useState<WhatIfParams>(current);
  const [reviewing, setReviewing] = useState(false);
  const stored = JSON.stringify(current);
  // A write or a reload that changes the stored values restarts the proposal from them.
  useEffect(() => {
    setP(JSON.parse(stored) as WhatIfParams);
    setReviewing(false);
  }, [stored]);
  const set = (k: keyof WhatIfParams) => (v: number) => {
    setP((x) => ({ ...x, [k]: v }));
    setReviewing(false);
  };

  const unitsE = BigInt(EXAMPLE_UNITS) * 10n ** BigInt(coll.decimals);
  const value = valueUsdE6WithMultiplier(unitsE, big(cap.oracle_price_usd_e6), coll.decimals, big(cap.multiplier_e18 ?? "1000000000000000000"), cap.price_kind ?? "Underlying");
  // 54% of the collateral: above the static limit at any price, so the premium row has something to show. Rounded to read as an example.
  const raw = (value * 54n) / 100n;
  const round = raw >= 10_000_000_000n ? 1_000_000_000n : 100_000_000n;
  const exampleBorrow = ((raw + round / 2n) / round) * round;
  const market = { q_usd_e6: big(cap.q_usd_e6), r_usd_e6: big(cap.r_usd_e6), d_usd_e6: big(coll.verified_dex_depth_usd_e6), debt_usd_e6: big(cap.total_debt_usd_e6), base_ltv_bps: coll.base_ltv_bps, example_value_usd_e6: value, example_borrow_usd_e6: exampleBorrow };
  const now = whatIfImpact(current, market);
  const next = whatIfImpact(p, market);
  const diff = whatIfDiff(current, p);
  const changed = diff.length > 0;
  const money = (v: bigint) => formatUsdE6(v, 0);
  const delta = (a: bigint, b: bigint) => (a === b ? "unchanged" : `${a > b ? "+" : "−"}${money(a > b ? a - b : b - a)}`);
  const cls = (a: bigint, b: bigint) => (a === b ? "nx-dim" : a > b ? "nx-pos" : "nx-neg");
  const intent = changed ? attempt(() => txV2.upsertCollateral(core, upsertFromView(coll, p))) : null;
  const ok = intent !== null && typeof intent !== "string";
  const label = !isOwner ? `Only ${owner ?? "the owner"} can sign changes` : !changed ? "Move a slider to propose a change" : reviewing ? `Sign as ${owner}` : `Review ${diff.length} change${diff.length > 1 ? "s" : ""}`;
  const primary = async () => {
    if (!ok) return;
    if (!reviewing) {
      setReviewing(true);
      return;
    }
    const out = await sign(intent, { success: "Parameters updated on nectar-core", next: <Link className="link" href="/feed">Next: see the market</Link> });
    if (out?.ok) onDone();
  };
  const sliders: Array<{ k: keyof WhatIfParams; label: string; min: number; max: number; step: number; help: string }> = [
    { k: "base_haircut_bps", label: "Haircut in session", min: 0, max: Math.max(1500, current.base_haircut_bps), step: 50, help: "Applied to quotes, Reserve and DEX depth while the market is open." },
    { k: "weekend_haircut_bps", label: "Haircut when closed", min: 0, max: Math.max(2500, current.weekend_haircut_bps), step: 50, help: "Applied on weekends, holidays, stale prices and to every Shield." },
    { k: "max_nectar_ltv_bps", label: "Max LTV per loan", min: coll.base_ltv_bps, max: Math.max(9000, current.max_nectar_ltv_bps), step: 100, help: "Caps each loan against its own collateral." },
    { k: "limit_premium_bps", label: "Limit premium above static", min: 0, max: Math.max(1000, current.limit_premium_bps), step: 25, help: `Charged on the part of a loan above ${bpsToPct(coll.base_ltv_bps).replace(" %", "%")} LTV. Funds buyer fees.` },
  ];
  return (
    <div className="nx-split">
      <Panel as="section" aria-label="What if" style={{ gap: 22 }}>
        <div className="nx-ph"><h2 className="nx-h2">What if</h2><button type="button" className="nx-link" onClick={() => { setP(current); setReviewing(false); }}>Reset to current</button></div>
        {sliders.map((s) => (
          <div key={s.k} className="nx-stack nx-gap6">
            <div className="nx-ph">
              <span className="nx-strong">{s.label}</span>
              <span className="nx-row nx-gap12"><span className="nx-k">now {pct2(current[s.k])}</span><span className="nx-mid nx-num" data-testid={`whatif-${s.k}`}>{pct2(p[s.k])}</span></span>
            </div>
            <Slider label={s.label} hideLabel value={p[s.k]} min={s.min} max={s.max} step={s.step} onChange={set(s.k)} valueText={pct2(p[s.k])} />
            <span className="nx-k">{s.help}</span>
          </div>
        ))}
      </Panel>
      <Panel as="section" aria-label="Impact" style={{ gap: 18 }}>
        <div className="nx-ph"><h2 className="nx-h2">Impact</h2><NxBadge tone={changed ? "warn" : "plain"} data-testid="whatif-changes">{changed ? `${diff.length} change${diff.length > 1 ? "s" : ""}` : "No changes"}</NxBadge></div>
        <div className="nx-grid2" style={{ gap: 14 }}>
          <div className="nx-well">
            <span className="nx-k">In session</span>
            <span className="nx-big" data-testid="whatif-session-exit">{money(next.session_exit_usd_e6)}</span>
            <span className="nx-k">exit capacity <span className={cls(next.session_exit_usd_e6, now.session_exit_usd_e6)} data-testid="whatif-session-delta">{delta(next.session_exit_usd_e6, now.session_exit_usd_e6)}</span></span>
            <span className="nx-hr" />
            <span className="nx-k">Free to borrow <b className="nx-head nx-num">{money(next.session_free_usd_e6)}</b></span>
          </div>
          <div className="nx-well">
            <span className="nx-k">Closed or Shield</span>
            <span className="nx-big" data-testid="whatif-closed-exit">{money(next.closed_exit_usd_e6)}</span>
            <span className="nx-k">exit capacity <span className={cls(next.closed_exit_usd_e6, now.closed_exit_usd_e6)} data-testid="whatif-closed-delta">{delta(next.closed_exit_usd_e6, now.closed_exit_usd_e6)}</span></span>
            <span className="nx-hr" />
            <span className="nx-k">Free to borrow <b className="nx-head nx-num" data-testid="whatif-closed-free">{money(next.closed_free_usd_e6)}</b></span>
          </div>
        </div>
        <div>
          <Kvr k={`Weekend limit, new ${EXAMPLE_UNITS} ${coll.symbol} loan`} v={money(next.weekend_limit_usd_e6)} testId="whatif-limit" />
          <Kvr k={`Premium on a ${money(exampleBorrow)} standard loan`} v={formatUsdE6(next.premium_example_usd_e6)} testId="whatif-premium" />
          <Kvr k="Open loans newly at risk" v="0, they keep their flag line" />
        </div>
        {next.closed_free_usd_e6 < 0n ? <Notice tone="neg" icon="warn" testId="whatif-negative">Existing loans would exceed exit capacity when closed. New borrowing would stop until quotes grow.</Notice> : null}
        {typeof intent === "string" ? <Notice tone="neg" icon="warn" testId="whatif-invalid">{intent}</Notice> : null}
        {reviewing && changed ? (
          <div className="nx-well nx-well-accent">
            <b className="nx-strong">Owner transaction on {core}</b>
            <pre tabIndex={0} className="nx-code" data-testid="whatif-diff">{diff.map((c) => `${c.field.padEnd(21)}${c.from} → ${c.to}`).join("\n")}</pre>
            <span className="nx-k">New borrows use the new values at once. The next screen shows the exact arguments, gas and deposit before your wallet opens.</span>
          </div>
        ) : null}
        <button type="button" className="nx-btn lg" disabled={!isOwner || !ok} onClick={primary} data-testid="whatif-primary">{label}</button>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- read-only panels

function SettlementFees({ d }: { d: ConsoleData }) {
  const f = d.fees;
  const reserve = d.coll?.reserve?.discount_bps ?? 0;
  const daily = d.coll?.max_voluntary_fill_usd_e6_per_day;
  return (
    <Panel title="Settlement and fees" data-testid="console-fees">
      <div>
        <Kvr k="Quote discount cap" v={reserve > 0 ? `below ${pct2(reserve)}` : "no Reserve set"} />
        <Kvr k="Reserve discount" v={reserve > 0 ? pct2(reserve) : "not set"} testId="console-reserve-discount" />
        <Kvr k="Profit-Lock fills a day" v={daily ? formatUsdE6(daily, 0) : "off"} testId="console-daily-cap" />
        <Kvr k="Shields" v={f ? `${f.shield_weekend_fee_bps} / ${f.shield_event_fee_bps} bps` : "—"} testId="console-shields" />
        <Kvr k="Origination" v={f ? `${pct2(f.origination_fee_bps)}, ${f.referrer_share_bps === 5000 ? "half" : pct2(f.referrer_share_bps)} to referrer` : "—"} />
      </div>
    </Panel>
  );
}

interface SettlementItem { observed_at: string }

function Keepers({ d }: { d: ConsoleData }) {
  const { core, config } = useChain();
  const [triggers, setTriggers] = useState<number | null>(null);
  const [indexed, setIndexed] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/indexer/api/settlements?limit=500", { cache: "no-store" })
      .then(async (r) => (await r.json()) as { items?: SettlementItem[]; configured?: boolean })
      .then((b) => {
        if (!live) return;
        setIndexed(b.configured !== false && Array.isArray(b.items));
        const since = Date.now() - 7 * 86_400_000;
        setTriggers(b.items ? b.items.filter((s) => Date.parse(s.observed_at) >= since).length : null);
      })
      .catch(() => live && setIndexed(false));
    return () => {
      live = false;
    };
  }, []);
  const reserve = core?.gas_reserve_yocto;
  return (
    <Panel title="Keepers" actions={<span className="nx-row nx-gap6"><i className={`nx-dot${indexed ? "" : " off"}`} aria-hidden="true" /><span className="nx-k" data-testid="console-indexer">{indexed === null ? "reading" : indexed ? "indexer on" : "no indexer"}</span></span>} data-testid="console-keepers">
      <div>
        <Kvr k="Account" v={core?.keeper ?? config.keeper ?? "—"} />
        <Kvr k="Key" v="function-call only" />
        <Kvr k="Triggers, 7 days" v={triggers === null ? "needs the Feed API" : String(triggers)} testId="console-triggers" />
        <Kvr k="Gas reserve" v={`${reserve ? (Number(big(reserve) / 10n ** 21n) / 1000).toFixed(2) : "—"} of ${config.limits.gas_reserve_target_near} NEAR`} />
        {d.quoter?.outlayer_account ? <Kvr k="Quoter" v={d.quoter.outlayer_account} /> : null}
      </div>
    </Panel>
  );
}

function Evidence({ rows }: { rows: EvidenceRow[] }) {
  return (
    <Panel title="Evidence" actions={<span className="nx-k">per gate</span>} data-testid="console-evidence">
      <div>
        {rows.map((r) => (
          <Kvr key={r.label} k={r.label} v={<NxBadge tone={r.state === "pass" ? (r.qualifier ? "info" : "pos") : r.state === "fail" ? "neg" : "plain"} data-testid={`evidence-${r.label.toLowerCase().replace(/\s+/g, "-")}`}>{r.state === "pass" ? (r.qualifier ? `Pass, ${r.qualifier}` : "Pass") : r.state === "fail" ? "Fail" : "Pending"}</NxBadge>} />
        ))}
      </div>
    </Panel>
  );
}
