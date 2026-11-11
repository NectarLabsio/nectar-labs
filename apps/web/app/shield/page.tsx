"use client";
import { useState } from "react";
import { Banner, Card, Field, Kv, SelectField } from "@nectar/ui";
import {
  MAX_SHIELD_OPENS_PER_DAY,
  SHIELD_TAGLINE,
  formatUnits,
  shieldOpensLeft,
  formatUsdE6,
  parseUnits,
  type CollateralView,
  type ExitCapacity,
  type FeedOneClick,
  type FeeStackView,
  type SessionWindow,
} from "@nectar/sdk";
import { useChain, useFeature, useView, useWallet } from "@/components/AppProvider";
import { FaucetLink, Gate, LoadingBlock, RpcErrorBanner } from "@/components/states";
import { useBalance } from "@/components/useBalance";
import { useFeedApi } from "@/components/useFeedApi";
import { SessionBadge } from "@/components/Session";
import { ShieldCard, ZapCard, shieldWindowFor, useNowS } from "@/components/Shields";
import { BorrowComposer } from "@/components/borrow/BorrowComposer";

const tryParse = (s: string, d: number): bigint | null => {
  try {
    return s.trim() ? parseUnits(s, d) : null;
  } catch {
    return null;
  }
};

interface ShieldData {
  coll: CollateralView | null;
  cap: ExitCapacity;
  calendar: SessionWindow[];
  fees: FeeStackView;
}

/** /shield (PRD §4.9, §12.1): Weekend and Event Shield presets plus the testnet Zap card. v2 + features.shields only. */
export default function ShieldPage() {
  const { config, generation } = useChain();
  const { accountId } = useWallet();
  const on = useFeature("shields");
  const [key, setKey] = useState(config.collaterals[0]?.key ?? "");
  const col = config.collaterals.find((c) => c.key === key) ?? config.collaterals[0];
  const [unitsIn, setUnitsIn] = useState("");
  const units = col ? tryParse(unitsIn, col.decimals) : null;
  const preLiq = col ? Math.round((col.pre_liq_min_bps + col.pre_liq_max_bps) / 2) : 7500;
  const nowS = useNowS();
  const data = useView<ShieldData>(
    on && col
      ? async (v) => {
          const [coll, cap, calendar, fees] = await Promise.all([v.getCollateral(col.symbol), v.getExitCapacity(col.symbol), v.getFullSessionCalendar(), v.getFeeStack(col.symbol)]);
          return { coll, cap, calendar, fees };
        }
      : null,
    [on, col?.symbol],
  );
  const opens = useView<number>(on && accountId ? (v) => v.getShieldOpensToday(accountId) : null, [on, accountId]);
  const bal = useBalance(on ? (col?.token ?? null) : null);
  const oneclick = useFeedApi<FeedOneClick>("api/oneclick");
  const d = data.data;
  const unitsErr = unitsIn && !units ? "Enter a positive number" : units && bal.data !== undefined && units > bal.data ? "More than your balance" : null;

  const title = SHIELD_TAGLINE.charAt(0).toUpperCase() + SHIELD_TAGLINE.slice(1);
  return (
    <>
      {on ? (
        <BorrowComposer initialProtection="weekend" crumb="Shield" title={title} lede="A Shield is a normal loan opened at the weekend limit for a fixed window, so the limit cannot be cut halfway through. It charges a flat Shield fee instead of the limit premium; inside the window only committed buyers can settle it. Testnet, mock collateral." />
      ) : null}
    <div className="nx-page" style={on ? { paddingTop: 0 } : undefined}>
      {on ? <h2 className="nx-h2">Shield presets in detail</h2> : (
        <div className="nx-head-row"><div className="nx-stack" style={{ gap: 10 }}><h1 className="nx-title">{title}</h1><p className="nx-lede">Testnet, mock collateral.</p></div></div>
      )}
      <Gate>
        {!on ? (
          <Banner tone="info" title="Shields are not enabled on this deployment" role="status">
            {generation === "v2"
              ? "The connected contract supports Shields, but the module is switched off until its gate passes."
              : "Shields need the v2 nectar-core contract; the connected testnet contract is v1. Nothing here can be opened yet."}
          </Banner>
        ) : (
          <div className="stack">
            <Card label="Collateral">
              <div className="grid-2">
                <div className="stack">
                  {config.collaterals.length > 1 ? <SelectField label="Collateral" value={key} onChange={setKey} options={config.collaterals.map((c) => ({ value: c.key, label: `${c.symbol} (mock)` }))} /> : null}
                  <Field label={`Collateral units (${col?.symbol ?? ""})`} inputMode="decimal" value={unitsIn} onChange={(e) => setUnitsIn(e.target.value)} unit={col?.symbol}
                    hint={bal.data !== undefined && col ? `Balance ${formatUnits(bal.data, col.decimals)} ${col.symbol}` : "Units you lock for either Shield."} error={unitsErr ?? undefined} />
                  {accountId && bal.data === 0n && col ? <FaucetLink token={`${col.symbol} (mock)`} /> : null}
                </div>
                <div className="kvs">
                  {d ? <Kv k="Session" v={<SessionBadge cap={d.cap} compact />} /> : null}
                  <Kv k="Oracle price" v={d ? formatUsdE6(d.cap.oracle_price_usd_e6) : "—"} />
                  <Kv k="Pre-liquidation LTV" v={`${(preLiq / 100).toFixed(2)} % (midpoint)`} />
                  <Kv k="Opens left today" v={<span data-testid="shield-opens-left">{accountId ? (opens.data !== undefined ? `${shieldOpensLeft(opens.data)} of ${MAX_SHIELD_OPENS_PER_DAY}` : "—") : `connect a wallet to see yours (${MAX_SHIELD_OPENS_PER_DAY} per day)`}</span>} />
                </div>
              </div>
            </Card>
            {data.error ? <RpcErrorBanner error={data.error} onRetry={data.reload} /> : data.loading && !d ? <LoadingBlock /> : null}
            {d && d.calendar.length === 0 ? <Banner tone="warn" title="No session calendar">The contract has no session calendar loaded, so a Weekend Shield has no window end yet.</Banner> : null}
            <div className="grid-2">
              {(["Weekend", "Event"] as const).map((kind) => (
                <ShieldCard
                  key={kind}
                  kind={kind}
                  symbol={col?.symbol ?? ""}
                  token={col?.token ?? null}
                  decimals={col?.decimals ?? 6}
                  units={units && !unitsErr ? units : null}
                  preLiqBps={preLiq}
                  cap={d?.cap}
                  fees={d?.fees}
                  window={d ? shieldWindowFor(kind, d.calendar, d.coll?.shield?.event_window_end_ns, nowS) : null}
                  nowS={nowS}
                  opensToday={accountId ? opens.data : undefined}
                  balance={bal.data}
                  onOpened={() => {
                    opens.reload();
                    bal.reload();
                    data.reload();
                  }}
                />
              ))}
            </div>
            <ZapCard symbol={col?.symbol ?? "NVDAx"} oneclick={oneclick} />
            <p className="caption">Testnet caps Shield opens at {MAX_SHIELD_OPENS_PER_DAY} per account per UTC day, because each position costs the contract about 0.0035 NEAR of storage; mainnet would require a storage deposit and a $50 minimum.</p>
          </div>
        )}
      </Gate>
    </div>
    </>
  );
}
