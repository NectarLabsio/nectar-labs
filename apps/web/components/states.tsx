"use client";
import type { ReactNode } from "react";
import { Banner, Button, Skeleton } from "@nectar/ui";
import { FAUCET_URL, docsHref } from "@/lib/env";
import { useChain, useWallet } from "./AppProvider";

/** Contracts not deployed yet (config ids still TODO-G2): the honest empty state for every live page. */
export function NotDeployed() {
  const { config } = useChain();
  return (
    <Banner tone="warn" title="Contracts not deployed yet" role="status">
      This page reads <code>nectar-core</code> on NEAR testnet. Its account ids are filled in by the deployment step; until then there is no live data to show. Pending:{" "}
      <span className="mono">{config.pending.join(", ") || "none"}</span>.
    </Banner>
  );
}

export function RpcErrorBanner({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <Banner tone="danger" title="Testnet RPC error" actions={onRetry ? <Button size="sm" onClick={onRetry}>Retry</Button> : undefined}>
      The NEAR testnet RPC did not answer this read. Nothing was changed. <span className="mono small">{error.slice(0, 240)}</span>
    </Banner>
  );
}

export function PausedBanner() {
  return (
    <Banner tone="warn" title="Protocol paused">
      The owner paused nectar-core. Funding, borrowing and settlement refuse until it is unpaused; views and completed withdrawals still work.
    </Banner>
  );
}

export function ConnectPrompt({ action }: { action: string }) {
  const w = useWallet();
  return (
    <Banner
      tone="info"
      title="Connect a wallet"
      actions={
        <Button variant="primary" size="sm" onClick={w.connect} loading={w.connecting}>
          Connect wallet
        </Button>
      }
    >
      Connect a NEAR testnet wallet to {action}. {w.label}. The app never asks for a full-access key.
    </Banner>
  );
}

export function WrongNetwork() {
  return (
    <Banner tone="danger" title="Wrong network">
      Your wallet is not on NEAR testnet. Switch it to testnet; nothing here runs on mainnet.
    </Banner>
  );
}

export function FaucetLink({ token }: { token: string }) {
  return (
    <Banner tone="warn" title={`No ${token} balance`}>
      You need {token} on testnet for this.{" "}
      {FAUCET_URL ? (
        <a className="link" href={FAUCET_URL} target="_blank" rel="noreferrer noopener">
          Get testnet tokens
        </a>
      ) : (
        <a className="link" href={docsHref("operations/runbook")}>
          How to get mock {token} on testnet
        </a>
      )}
      .
    </Banner>
  );
}

export function LoadingBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack-sm" role="status" aria-live="polite" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={`${90 - i * 15}%`} />
      ))}
    </div>
  );
}

/**
 * Page-level gate. Order: not deployed → RPC error → loading → paused banner (content still shown) → wallet/network checks when required.
 */
export function Gate({ children, wallet, action = "continue", blockOnPause }: { children: ReactNode; wallet?: boolean; action?: string; blockOnPause?: boolean }) {
  const chain = useChain();
  const w = useWallet();
  if (!chain.deployed) return <NotDeployed />;
  if (chain.rpcError) return <RpcErrorBanner error={chain.rpcError} onRetry={chain.reload} />;
  // Only the first read blocks; a background reload after a write keeps the page (and any half-filled form) mounted.
  if (chain.loading && !chain.core) return <LoadingBlock />;
  return (
    <div className="stack">
      {chain.paused ? <PausedBanner /> : null}
      {wallet && !w.accountId ? <ConnectPrompt action={action} /> : null}
      {wallet && w.accountId && w.network !== "testnet" ? <WrongNetwork /> : null}
      {blockOnPause && chain.paused ? null : children}
    </div>
  );
}
