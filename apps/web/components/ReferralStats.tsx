"use client";
// Referral stats on /agents (WO-26a, design v2 in WO-33c): is_referrer + get_claimable on nectar-core v2 (interface-v7 §A4/A5).
import { useEffect, useState } from "react";
import { Banner, Field, Kvr, NxBadge, Panel } from "@nectar/ui";
import { formatUsdE6, isAccountId, txV2 } from "@nectar/sdk";
import { useChain, useFeature, useSign, useView, useWallet } from "./AppProvider";
import { LoadingBlock, RpcErrorBanner } from "./states";

interface Stats { registered: boolean; claimable: string }

export function ReferralStats() {
  const chain = useChain();
  const { accountId } = useWallet();
  const sign = useSign();
  const referralsOn = useFeature("referrals");
  const payToOn = useFeature("pay_to");
  const withdrawOn = referralsOn || payToOn;
  const [acct, setAcct] = useState("");
  useEffect(() => {
    if (accountId) setAcct((a) => a || accountId);
  }, [accountId]);
  const id = acct.trim();
  const ok = isAccountId(id);
  const v2 = chain.generation === "v2";
  const stats = useView<Stats>(
    v2 && ok ? async (v) => { const [registered, claimable] = await Promise.all([v.isReferrer(id), v.getClaimable(id)]); return { registered, claimable }; } : null,
    [id, ok, v2],
  );
  const feeBps = typeof chain.core?.origination_fee_bps === "number" ? chain.core.origination_fee_bps : chain.config.v7.origination_fee_bps;

  if (!v2) {
    return (
      <Panel title="Referrals" aria-label="Referrals" data-testid="agents-referrals">
        <Banner tone="info" title="Referrals need nectar-core v2" role="status">
          The connected contract reports <span className="mono">{chain.version ?? "unknown"}</span> (v1), which has no referrers or origination fee. Stats appear here once the app points at v2.
        </Banner>
      </Panel>
    );
  }
  const own = Boolean(accountId) && accountId === id;
  const claimable = stats.data ? BigInt(stats.data.claimable) : 0n;
  const badge = stats.data ? (stats.data.registered ? <NxBadge tone="pos">Registered</NxBadge> : <NxBadge tone="warn">Awaiting owner approval</NxBadge>) : undefined;
  return (
    <Panel title="Referrals" actions={badge} aria-label="Referrals" data-testid="agents-referrals">
      <p className="nx-k">A registered referrer named in a borrow earns half of the {feeBps} bps origination fee as claimable mock USDC. Registration is owner-approved on testnet; a referrer cannot be the borrower.</p>
      <Field label="Referrer account" value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="agent1.nectar.testnet" error={id && !ok ? "Not a NEAR account id" : undefined} hint={accountId ? undefined : "Connect a wallet to fill in your account"} />
      {!ok ? null : stats.error ? (
        <RpcErrorBanner error={stats.error} onRetry={stats.reload} />
      ) : stats.loading || !stats.data ? (
        <LoadingBlock lines={2} />
      ) : (
        <div>
          <Kvr k="Status" v={stats.data.registered ? "registered" : "not registered"} testId="ref-registered" />
          <Kvr k="Your share" v={`50% of ${feeBps} bps origination`} />
          <Kvr k="Earned, to claim" v={`${formatUsdE6(claimable)} mock USDC`} testId="ref-claimable" />
          <Kvr k="Your link" v={`/borrow?ref=${id}`} />
        </div>
      )}
      {ok && stats.data && claimable === 0n ? <p className="nx-k">Nothing to claim yet.</p> : null}
      {own && withdrawOn && claimable > 0n && chain.config.core ? (
        <button type="button" className="nx-btn" onClick={() => void sign(txV2.withdrawClaimable(chain.config.core!), { success: "Claimable USDC withdrawn" }).then((o) => o && stats.reload())}>
          Withdraw claimable USDC
        </button>
      ) : null}
    </Panel>
  );
}
