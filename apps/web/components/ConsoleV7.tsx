"use client";
// v7 owner controls on /console (WO-26a), v2 contracts only. Every write goes through the sign modal (msg/args, gas, deposit).
// Contract rules mirrored for inline validation: interface-v7 §A2 (session), §A3 (multiplier), §A5 (referrers), §B (remote).
import { useState } from "react";
import { Badge, Banner, Card, Field, Kv } from "@nectar/ui";
import {
  CA_MIN_NOTICE_S,
  announceRefusal,
  calendarStatus,
  canApplyCorporateAction,
  formatMultiplierE18,
  formatYocto,
  isAccountId,
  maxSetMultiplierE18,
  multiplierLine,
  nowNs,
  nsToUtc,
  parseMultiplierE18,
  setMultiplierRefusal,
  txV2,
  E18,
  type CollateralView,
  type ExitCapacity,
  type RemoteConfigView,
  type SessionWindow,
  type TxIntent,
} from "@nectar/sdk";
import { useChain, useSign, useView, useWallet } from "./AppProvider";
import { OwnerAction, attempt } from "./OwnerAction";
import { SessionBadge } from "./Session";
import { optionalView } from "./OracleBadge";
import { LoadingBlock, RpcErrorBanner } from "./states";

interface V7Data { coll: CollateralView | null; calendar: SessionWindow[]; remote: RemoteConfigView | null }

const fmtWindow = (w: SessionWindow | null) => (w ? `${nsToUtc(w[0])} → ${nsToUtc(w[1]).slice(11)}` : "none");

export function ConsoleV7({ core, sym, cap, isOwner, onDone }: { core: string; sym: string; cap: ExitCapacity; isOwner: boolean; onDone: () => void }) {
  const chain = useChain();
  const { accountId } = useWallet();
  const sign = useSign();
  const data = useView<V7Data>(
    async (v) => {
      const [coll, calendar, remote] = await Promise.all([v.getCollateral(sym), v.getFullSessionCalendar(), optionalView(v.getRemoteConfig())]);
      return { coll, calendar, remote };
    },
    [sym],
  );
  const run = (t: TxIntent, success: string) => void sign(t, { success }).then((o) => { if (o) { data.reload(); onDone(); } });

  const [setM, setSetM] = useState("");
  const [caM, setCaM] = useState("");
  const [caHours, setCaHours] = useState("24");
  const [ref, setRef] = useState("");
  const [fee, setFee] = useState("");
  const [vr, setVr] = useState({ project_id: "", version_key: "", deposit_yocto: "", gas_tgas: "50" });

  const refOk = isAccountId(ref.trim());
  const refView = useView<boolean | null>(refOk ? (v) => optionalView(v.isReferrer(ref.trim())) : null, [ref, refOk]);

  if (data.error) return <div className="stack"><RpcErrorBanner error={data.error} onRetry={data.reload} /></div>;
  if (data.loading || !data.data) return <Card label="v7 owner controls"><LoadingBlock /></Card>;
  const { coll, calendar, remote } = data.data;
  const now = nowNs();
  const m = BigInt(cap.multiplier_e18 ?? coll?.multiplier_e18 ?? E18.toString());
  const caPending = cap.ca_pending ?? coll?.ca_pending ?? false;
  const caEff = cap.ca_effective_ns ?? coll?.ca_effective_ns;
  const cal = calendarStatus(calendar, now);
  const feeBps = typeof chain.core?.origination_fee_bps === "number" ? chain.core.origination_fee_bps : chain.config.v7.origination_fee_bps;

  const setIntent = setM.trim()
    ? attempt(() => {
        const n = parseMultiplierE18(setM);
        const why = setMultiplierRefusal(m, n, caPending);
        if (why) throw new Error(why);
        return txV2.setMultiplier(core, sym, n.toString());
      })
    : null;
  const hours = /^\d+(\.\d+)?$/.test(caHours.trim()) ? Number(caHours.trim()) : NaN;
  const effNs = Number.isFinite(hours) ? now + BigInt(Math.round(hours * 3600)) * 1_000_000_000n : null;
  const caIntent = caM.trim()
    ? attempt(() => {
        const n = parseMultiplierE18(caM);
        if (effNs === null) throw new Error("Effective in must be a number of hours.");
        const why = announceRefusal(n, effNs, now);
        if (why) throw new Error(why);
        return txV2.announceCorporateAction(core, sym, n.toString(), effNs.toString());
      })
    : null;
  const canApply = canApplyCorporateAction(caPending, caEff, now);
  const feeIntent = fee.trim() ? attempt(() => txV2.setOriginationFeeBps(core, /^\d+$/.test(fee.trim()) ? Number(fee.trim()) : NaN)) : null;
  const vrIntent = vr.project_id || vr.version_key || vr.deposit_yocto
    ? attempt(() => txV2.setVaultReadConfig(core, { project_id: vr.project_id.trim(), version_key: vr.version_key.trim(), deposit_yocto: vr.deposit_yocto.trim(), gas_tgas: /^\d+$/.test(vr.gas_tgas.trim()) ? Number(vr.gas_tgas.trim()) : NaN }))
    : null;

  return (
    <>
      <Card label="Multiplier · corporate actions" className="stack" data-testid="v7-multiplier">
        <div className="kvs">
          <Kv k="Multiplier" v={<span className="mono" data-testid="v7-multiplier-value">{formatMultiplierE18(m)}</span>} />
          <Kv k="Price kind" v={coll?.price_kind ?? cap.price_kind ?? "Underlying"} />
          <Kv k="Last change" v={coll?.multiplier_updated_ns && coll.multiplier_updated_ns !== "0" ? nsToUtc(coll.multiplier_updated_ns) : "never"} />
          <Kv
            k="Corporate action"
            v={caPending ? <span data-testid="v7-ca-pending"><Badge kind="warn">pending</Badge> ×{coll?.ca_multiplier_e18 ? formatMultiplierE18(coll.ca_multiplier_e18) : "?"} at {caEff ? nsToUtc(caEff) : "?"}</span> : "none"}
          />
        </div>
        <p className="small dim">{multiplierLine(sym, m)}. Owner increases are capped at +5% per call; anything else is announced at least 1 h ahead, and new borrows are refused while it is pending.</p>
        <OwnerAction title="Set multiplier" enabled={isOwner} intent={setIntent} onRun={(t) => run(t, "Multiplier set")} testId="v7-set-multiplier">
          <Field label="New multiplier" inputMode="decimal" value={setM} onChange={(e) => setSetM(e.target.value)} hint={`Increase only, at most ${formatMultiplierE18(maxSetMultiplierE18(m))}`} />
        </OwnerAction>
        <OwnerAction title="Announce corporate action" enabled={isOwner} intent={caIntent} onRun={(t) => run(t, "Corporate action announced")} testId="v7-announce">
          <Field label="Multiplier after the action" inputMode="decimal" value={caM} onChange={(e) => setCaM(e.target.value)} hint="Any value > 0, e.g. 2 for a 2-for-1 split" />
          <Field label="Effective in" inputMode="decimal" unit="h" value={caHours} onChange={(e) => setCaHours(e.target.value)} hint={effNs !== null ? `At ${nsToUtc(effNs)} (minimum ${CA_MIN_NOTICE_S / 3600} h)` : "Hours from now"} />
        </OwnerAction>
        <OwnerAction title="Apply corporate action" enabled={Boolean(accountId) && canApply} intent={caPending ? txV2.applyCorporateAction(core, sym) : null} onRun={(t) => run(t, "Corporate action applied")} testId="v7-apply">
          <p className="small dim">{caPending ? (canApply ? "Effective now. Anyone may apply it; the stored price is rescaled so the collateral value is continuous." : `Anyone may apply it from ${caEff ? nsToUtc(caEff) : "the effective time"}.`) : "No corporate action pending."}</p>
        </OwnerAction>
      </Card>

      <Card label="Session calendar" className="stack" data-testid="v7-session">
        <div className="kvs">
          <Kv k="Session" v={<SessionBadge cap={cap} />} />
          <Kv k="Windows loaded" v={<span data-testid="v7-calendar-count">{cal.windows} / 600</span>} />
          <Kv k="Current window" v={<span data-testid="v7-calendar-current">{fmtWindow(cal.current)}</span>} />
          <Kv k="Next open" v={<span data-testid="v7-calendar-next">{cal.next ? nsToUtc(cal.next[0]) : "none loaded"}</span>} />
          <Kv k="Calendar ends" v={cal.last ? nsToUtc(cal.last[1]) : "—"} />
          <Kv k="Forced closed" v={<span data-testid="v7-forced">{(cap.forced_closed ?? coll?.forced_closed) ? "yes" : "no"}</span>} />
        </div>
        {cal.windows === 0 || cal.exhausted ? (
          <Banner tone="warn" title={cal.windows === 0 ? "No calendar loaded" : "Calendar exhausted"} role="status">
            The session fails closed: D = 0 and the weekend haircut apply until windows are loaded with <code>set_session_calendar</code>.
          </Banner>
        ) : null}
        <OwnerAction title="Force session closed" enabled={isOwner} intent={txV2.forceSessionClosed(core, sym, true)} onRun={(t) => run(t, "Session forced closed")} testId="v7-force-closed" />
        <OwnerAction title="Clear forced close" enabled={isOwner} intent={txV2.forceSessionClosed(core, sym, false)} onRun={(t) => run(t, "Forced close cleared")} testId="v7-clear-forced">
          <p className="small dim">Clearing never opens the session outside a calendar window or with a stale price.</p>
        </OwnerAction>
      </Card>

      <Card label="Referrers · origination fee" className="stack" data-testid="v7-referrers">
        <div className="kvs">
          <Kv k="Origination fee" v={<span data-testid="v7-origination">{feeBps} bps of the borrow</span>} />
          <Kv k="Registered referrer share" v="50% of the origination fee" />
        </div>
        <Field
          label="Referrer account"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="agent1.nectar.testnet"
          error={ref.trim() && !refOk ? "Not a NEAR account id" : undefined}
          hint={refOk ? (refView.loading ? "Checking…" : refView.data === true ? "Registered" : refView.data === false ? "Not registered" : "Could not read is_referrer") : "NEAR account id"}
        />
        <div className="grid-2">
          <OwnerAction title="Register referrer" enabled={isOwner && refView.data !== true} intent={refOk ? attempt(() => txV2.registerReferrer(core, ref.trim())) : null} onRun={(t) => run(t, "Referrer registered")} testId="v7-register" />
          <OwnerAction title="Unregister referrer" enabled={isOwner && refView.data !== false} intent={refOk ? attempt(() => txV2.unregisterReferrer(core, ref.trim())) : null} onRun={(t) => run(t, "Referrer unregistered")} testId="v7-unregister" />
        </div>
        <OwnerAction title="Set origination fee" enabled={isOwner} intent={feeIntent} onRun={(t) => run(t, "Origination fee set")} testId="v7-fee">
          <Field label="origination_fee_bps" inputMode="numeric" unit="bps" value={fee} onChange={(e) => setFee(e.target.value)} hint="0–100" />
        </OwnerAction>
      </Card>

      <Card label="Remote deposits" className="stack" data-testid="v7-remote">
        {remote ? (
          <div className="kvs">
            <Kv k="Keeper attestation" v={<Badge kind={remote.allow_keeper_deposit_attestation ? "fallback" : "neutral"}>{remote.allow_keeper_deposit_attestation ? "allowed (keeper-attested)" : "off"}</Badge>} />
            <Kv k="vault_read project" v={<span className="mono">{remote.vault_read_project_id ?? "not set"}</span>} />
            <Kv k="Version key" v={<span className="mono addr">{remote.vault_read_version_key ?? "—"}</span>} />
            <Kv k="Deposit per read" v={remote.vault_read_deposit_yocto ? `${formatYocto(remote.vault_read_deposit_yocto)} NEAR` : "—"} />
            <Kv k="Gas" v={remote.vault_read_gas_tgas != null ? `${remote.vault_read_gas_tgas} Tgas` : "—"} />
            <Kv k="Reservation expiry" v={`${Math.round(remote.reservation_expiry_s / 60)} min`} />
          </div>
        ) : (
          <p className="small dim">This deployment does not answer <code>get_remote_config</code>; the controls below still preview their payload.</p>
        )}
        <OwnerAction
          title={remote?.allow_keeper_deposit_attestation ? "Disallow keeper attestation" : "Allow keeper attestation"}
          enabled={isOwner}
          intent={txV2.setAllowKeeperDepositAttestation(core, !(remote?.allow_keeper_deposit_attestation ?? false))}
          onRun={(t) => run(t, "Keeper attestation updated")}
          testId="v7-attest"
        >
          <p className="small dim">Testnet fallback: the keeper may confirm a deposit without the OutLayer read. Those positions are labelled keeper-attested.</p>
        </OwnerAction>
        <OwnerAction title="Set vault_read config" enabled={isOwner} intent={vrIntent} onRun={(t) => run(t, "vault_read config set")} testId="v7-vault-read">
          <Field label="OutLayer project id" value={vr.project_id} onChange={(e) => setVr({ ...vr, project_id: e.target.value })} />
          <Field label="vault_read version key" value={vr.version_key} onChange={(e) => setVr({ ...vr, version_key: e.target.value })} />
          <Field label="Deposit per read" inputMode="numeric" unit="yocto" value={vr.deposit_yocto} onChange={(e) => setVr({ ...vr, deposit_yocto: e.target.value })} hint="> 0, paid from the gas reserve" />
          <Field label="vault_read gas" inputMode="numeric" unit="Tgas" value={vr.gas_tgas} onChange={(e) => setVr({ ...vr, gas_tgas: e.target.value })} hint="10–100" />
        </OwnerAction>
      </Card>
    </>
  );
}
