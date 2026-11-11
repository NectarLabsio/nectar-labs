"use client";
// v7 owner controls on /console (WO-26a, design v2 in WO-33c), v2 contracts only. Every write goes through the sign modal (msg/args, gas, deposit).
// Contract rules mirrored for inline validation: interface-v7 §A2 (session), §A3 (multiplier), §A5 (referrers), §B (remote),
// WO-23b / D-024 (Reserve: `set_reserve_params`; v2 has no `set_reserve`).
import { useState } from "react";
import { Badge, Banner, Field, Kvr, NxBadge, Panel, Switch } from "@nectar/ui";
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
  RESERVE_NOTICE_NS,
  formatDuration,
  formatNoticePeriod,
  formatUsdE6,
  nsToSeconds,
  oracleSourceLabel,
  type SessionWindow,
  type TxIntent,
} from "@nectar/sdk";
import { useChain, useSign, useView, useWallet } from "./AppProvider";
import { OwnerAction, attempt } from "./OwnerAction";
import { SessionBadge } from "./Session";
import { optionalView } from "./OracleBadge";
import type { ConsoleData } from "./console/ConsoleClient";

const fmtWindow = (w: SessionWindow | null) => (w ? `${nsToUtc(w[0])} → ${nsToUtc(w[1]).slice(11)}` : "none");

export function ConsoleV7({ core, sym, d, isOwner, onDone }: { core: string; sym: string; d: ConsoleData; isOwner: boolean; onDone: () => void }) {
  const chain = useChain();
  const { accountId } = useWallet();
  const sign = useSign();
  const { cap, coll, calendar, remote, quoter } = d;
  const run = (t: TxIntent, success: string) => void sign(t, { success }).then((o) => { if (o) onDone(); });

  const [setM, setSetM] = useState("");
  const [caM, setCaM] = useState("");
  const [caHours, setCaHours] = useState("24");
  const [ref, setRef] = useState("");
  const [fee, setFee] = useState("");
  const [vr, setVr] = useState({ project_id: "", version_key: "", deposit_yocto: "", gas_tgas: "50" });
  const [resDisc, setResDisc] = useState("");
  const [resNoticeH, setResNoticeH] = useState("");

  const refOk = isAccountId(ref.trim());
  const refView = useView<boolean | null>(refOk ? (v) => optionalView(v.isReferrer(ref.trim())) : null, [ref, refOk]);

  const now = nowNs();
  const m = BigInt(cap.multiplier_e18 ?? coll?.multiplier_e18 ?? E18.toString());
  const caPending = cap.ca_pending ?? coll?.ca_pending ?? false;
  const caEff = cap.ca_effective_ns ?? coll?.ca_effective_ns;
  const cal = calendarStatus(calendar, now);
  const feeBps = typeof chain.core?.origination_fee_bps === "number" ? chain.core.origination_fee_bps : chain.config.v7.origination_fee_bps;
  const forced = Boolean(cap.forced_closed ?? coll?.forced_closed);
  const maxAge = chain.core?.max_age_ns_session;
  const oracle = oracleSourceLabel(d.source ?? cap.oracle_source);
  const refPrice = coll?.weekend_ref_price_e6 && coll.weekend_ref_price_e6 !== "0" ? formatUsdE6(coll.weekend_ref_price_e6) : "not set";

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

  const pool = coll?.reserve;
  const curNotice = pool && pool.notice_ns !== "0" ? pool.notice_ns : RESERVE_NOTICE_NS.toString();
  const noticeH = resNoticeH.trim();
  const resIntent = resDisc.trim()
    ? attempt(() => {
        let notice: string | null = null;
        if (noticeH) {
          if (!/^\d+(\.\d+)?$/.test(noticeH)) throw new Error("Exit notice must be a number of hours.");
          notice = (BigInt(Math.round(Number(noticeH) * 3600)) * 1_000_000_000n).toString();
        }
        return txV2.setReserveParams(core, sym, /^\d+$/.test(resDisc.trim()) ? Number(resDisc.trim()) : NaN, notice);
      })
    : null;

  return (
    <>
      <div className="nx-grid2">
        <Panel title="Session and price" actions={<NxBadge tone="pos">Contract decides</NxBadge>} aria-label="Session and price" data-testid="v7-session">
          <div>
            <Kvr k="Session" v={<SessionBadge cap={cap} />} />
            <Kvr k="Calendar windows" v={`${cal.windows} / 600`} testId="v7-calendar-count" />
            <Kvr k="Current window" v={fmtWindow(cal.current)} testId="v7-calendar-current" />
            <Kvr k="Next open" v={cal.next ? nsToUtc(cal.next[0]) : "none loaded"} testId="v7-calendar-next" />
            <Kvr k="Calendar ends" v={cal.last ? nsToUtc(cal.last[1]) : "—"} />
            <Kvr k="Max price age" v={maxAge ? formatDuration(nsToSeconds(maxAge)) : "—"} testId="console-max-age" />
            <Kvr k="Oracle" v={`${oracle === "Pyth" ? "Pyth" : "owner price"}${quoter?.max_conf_bps != null ? `, ${(quoter.max_conf_bps / 100).toFixed(2)}% max confidence` : ""}`} />
            <Kvr k="Weekend reference price" v={refPrice} />
            <Kvr k="Forced closed" v={forced ? "yes" : "no"} testId="v7-forced" />
          </div>
          {cal.windows === 0 || cal.exhausted ? (
            <Banner tone="warn" title={cal.windows === 0 ? "No calendar loaded" : "Calendar exhausted"} role="status">
              The session fails closed: D = 0 and the weekend haircut apply until windows are loaded with <code>set_session_calendar</code>.
            </Banner>
          ) : null}
          <div className="nx-ph nx-ruled">
            <span className="nx-stack nx-grow">
              <span className="nx-strong">Force closed</span>
              <span className="nx-k">Nothing outside the contract can open a session. Forcing it closed applies weekend values at once; clearing never opens it outside a calendar window or with a stale price.</span>
            </span>
            <Switch label="Force the session closed" checked={forced} disabled={!isOwner} onChange={(v) => run(txV2.forceSessionClosed(core, sym, v), v ? "Session forced closed" : "Forced close cleared")} testId="v7-force" />
          </div>
        </Panel>

        <Panel title="Corporate actions" actions={<NxBadge tone={caPending ? "warn" : "plain"}>{caPending ? "Pending" : "None pending"}</NxBadge>} aria-label="Corporate actions" data-testid="v7-multiplier">
          <div>
            <Kvr k="Multiplier" v={formatMultiplierE18(m)} testId="v7-multiplier-value" />
            <Kvr k="Price kind" v={coll?.price_kind ?? cap.price_kind ?? "Underlying"} />
            <Kvr k="Last change" v={coll?.multiplier_updated_ns && coll.multiplier_updated_ns !== "0" ? nsToUtc(coll.multiplier_updated_ns) : "never"} />
            <Kvr k="Largest change without notice" v="+5% per call" />
            <Kvr k="Bigger change or decrease" v={`announce ${CA_MIN_NOTICE_S / 3600} h ahead`} />
            {caPending ? <Kvr k="Announced" v={<span data-testid="v7-ca-pending">×{coll?.ca_multiplier_e18 ? formatMultiplierE18(coll.ca_multiplier_e18) : "?"} at {caEff ? nsToUtc(caEff) : "?"}</span>} /> : null}
          </div>
          <p className="nx-k">{multiplierLine(sym, m)}. New borrows are refused while an action is pending.</p>
          <OwnerAction title="Set multiplier" enabled={isOwner} intent={setIntent} onRun={(t) => run(t, "Multiplier set")} testId="v7-set-multiplier">
            <Field label="New multiplier" inputMode="decimal" value={setM} onChange={(e) => setSetM(e.target.value)} hint={`Increase only, at most ${formatMultiplierE18(maxSetMultiplierE18(m))}`} />
          </OwnerAction>
          <OwnerAction title="Announce corporate action" enabled={isOwner} intent={caIntent} onRun={(t) => run(t, "Corporate action announced")} testId="v7-announce">
            <Field label="Multiplier after the action" inputMode="decimal" value={caM} onChange={(e) => setCaM(e.target.value)} hint="Any value > 0, e.g. 2 for a 2-for-1 split" />
            <Field label="Effective in" inputMode="decimal" unit="h" value={caHours} onChange={(e) => setCaHours(e.target.value)} hint={effNs !== null ? `At ${nsToUtc(effNs)} (minimum ${CA_MIN_NOTICE_S / 3600} h)` : "Hours from now"} />
          </OwnerAction>
          <OwnerAction title="Apply corporate action" enabled={Boolean(accountId) && canApply} intent={caPending ? txV2.applyCorporateAction(core, sym) : null} onRun={(t) => run(t, "Corporate action applied")} testId="v7-apply">
            <p className="nx-k">{caPending ? (canApply ? "Effective now. Anyone may apply it; the stored price is rescaled so the collateral value is continuous." : `Anyone may apply it from ${caEff ? nsToUtc(caEff) : "the effective time"}.`) : "No corporate action pending."}</p>
          </OwnerAction>
        </Panel>
      </div>

      <div className="nx-grid3">
        <Panel title="Nectar Reserve" aria-label="Nectar Reserve" data-testid="v7-reserve">
          {pool ? (
            <div>
              <Kvr k="R_c" v={formatUsdE6((BigInt(pool.usdc_e6) - BigInt(pool.notice_usdc_e6)).toString())} testId="v7-reserve-rc" />
              <Kvr k="In notice" v={formatUsdE6(pool.notice_usdc_e6)} />
              <Kvr k="Reserve discount" v={pool.discount_bps === 0 ? "not set (deposits refused)" : `${pool.discount_bps} bps`} testId="v7-reserve-discount" />
              <Kvr k="Exit notice" v={formatNoticePeriod(curNotice)} testId="v7-reserve-notice" />
            </div>
          ) : (
            <p className="nx-k">This deployment does not report a Reserve pool on <code>get_collateral</code>; the control below still previews its payload.</p>
          )}
          <p className="nx-k">R_c is the Reserve pool itself (deposits minus shares in notice); there is no owner-set reserve on v2.</p>
          <OwnerAction title="Set Reserve params" enabled={isOwner} intent={resIntent} onRun={(t) => run(t, "Reserve params set")} testId="v7-reserve-params">
            <Field label="discount_bps" inputMode="numeric" unit="bps" value={resDisc} onChange={(e) => setResDisc(e.target.value)} hint="1–9999, above every live quote ceiling (the contract checks)" />
            <Field label="Exit notice" inputMode="decimal" unit="h" value={resNoticeH} onChange={(e) => setResNoticeH(e.target.value)} hint="Optional: blank keeps the current notice. 1 min to 30 days (720 h); applies to exits started afterwards." />
          </OwnerAction>
        </Panel>

        <Panel title="Referrers and origination" aria-label="Referrers and origination" data-testid="v7-referrers">
          <div>
            <Kvr k="Origination fee" v={`${feeBps} bps of the borrow`} testId="v7-origination" />
            <Kvr k="Registered referrer share" v="50% of the origination fee" />
          </div>
          <Field
            label="Referrer account"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="agent1.nectar.testnet"
            error={ref.trim() && !refOk ? "Not a NEAR account id" : undefined}
            hint={refOk ? (refView.loading ? "Checking…" : refView.data === true ? "Registered" : refView.data === false ? "Not registered" : "Could not read is_referrer") : "NEAR account id"}
          />
          <OwnerAction title="Register referrer" enabled={isOwner && refView.data !== true} intent={refOk ? attempt(() => txV2.registerReferrer(core, ref.trim())) : null} onRun={(t) => run(t, "Referrer registered")} testId="v7-register" />
          <OwnerAction title="Unregister referrer" enabled={isOwner && refView.data !== false} intent={refOk ? attempt(() => txV2.unregisterReferrer(core, ref.trim())) : null} onRun={(t) => run(t, "Referrer unregistered")} testId="v7-unregister" />
          <OwnerAction title="Set origination fee" enabled={isOwner} intent={feeIntent} onRun={(t) => run(t, "Origination fee set")} testId="v7-fee">
            <Field label="origination_fee_bps" inputMode="numeric" unit="bps" value={fee} onChange={(e) => setFee(e.target.value)} hint="0–100" />
          </OwnerAction>
        </Panel>

        <Panel title="Remote deposits" aria-label="Remote deposits" data-testid="v7-remote">
          {remote ? (
            <div>
              <Kvr k="Keeper attestation" v={<Badge kind={remote.allow_keeper_deposit_attestation ? "fallback" : "neutral"}>{remote.allow_keeper_deposit_attestation ? "allowed (keeper-attested)" : "off"}</Badge>} />
              <Kvr k="vault_read project" v={remote.vault_read_project_id ?? "not set"} />
              <Kvr k="Version key" v={remote.vault_read_version_key ?? "—"} />
              <Kvr k="Deposit per read" v={remote.vault_read_deposit_yocto ? formatYocto(remote.vault_read_deposit_yocto) : "—"} />
              <Kvr k="Gas" v={remote.vault_read_gas_tgas != null ? `${remote.vault_read_gas_tgas} Tgas` : "—"} />
              <Kvr k="Reservation expiry" v={`${Math.round(remote.reservation_expiry_s / 60)} min`} />
            </div>
          ) : (
            <p className="nx-k">This deployment does not answer <code>get_remote_config</code>; the controls below still preview their payload.</p>
          )}
          <OwnerAction
            title={remote?.allow_keeper_deposit_attestation ? "Disallow keeper attestation" : "Allow keeper attestation"}
            enabled={isOwner}
            intent={txV2.setAllowKeeperDepositAttestation(core, !(remote?.allow_keeper_deposit_attestation ?? false))}
            onRun={(t) => run(t, "Keeper attestation updated")}
            testId="v7-attest"
          >
            <p className="nx-k">Testnet fallback: the keeper may confirm a deposit without the OutLayer read. Those positions are labelled keeper-attested.</p>
          </OwnerAction>
          <OwnerAction title="Set vault_read config" enabled={isOwner} intent={vrIntent} onRun={(t) => run(t, "vault_read config set")} testId="v7-vault-read">
            <Field label="OutLayer project id" value={vr.project_id} onChange={(e) => setVr({ ...vr, project_id: e.target.value })} />
            <Field label="vault_read version key" value={vr.version_key} onChange={(e) => setVr({ ...vr, version_key: e.target.value })} />
            <Field label="Deposit per read" inputMode="numeric" unit="yocto" value={vr.deposit_yocto} onChange={(e) => setVr({ ...vr, deposit_yocto: e.target.value })} hint="> 0, paid from the gas reserve" />
            <Field label="vault_read gas" inputMode="numeric" unit="Tgas" value={vr.gas_tgas} onChange={(e) => setVr({ ...vr, gas_tgas: e.target.value })} hint="10–100" />
          </OwnerAction>
        </Panel>
      </div>
    </>
  );
}
