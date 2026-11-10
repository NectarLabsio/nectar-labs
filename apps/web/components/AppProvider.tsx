"use client";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { NectarViews, contractGeneration, featureOn, type ContractGeneration, type CoreConfigView, type FeatureName, type PublicConfig, type TxIntent } from "@nectar/sdk";
import { SignModal, ToastProvider, useToast, type FeeLine } from "@nectar/ui";
import { E2E_KEY_ADAPTER, RPC_URL, txUrl } from "@/lib/env";
import type { TxOutcome, WalletAdapter } from "@/lib/wallet/types";
import { NearConnectAdapter } from "@/lib/wallet/near-connect";
import { E2EKeyAdapter } from "@/lib/wallet/e2e-key";
import { E2EMockAdapter } from "@/lib/wallet/e2e-mock";
import { readLocalE2EMock, type E2EMock } from "@/lib/e2e-mock";

// ------------------------------------------------------------------ chain

interface ChainState {
  config: PublicConfig;
  views: NectarViews | null;
  deployed: boolean;
  core: CoreConfigView | null;
  /** `contract_version()` of the connected core (null until read). */
  version: string | null;
  /** "v2" iff the version starts with "2." (interface-v7 §A6); null until read. */
  generation: ContractGeneration | null;
  paused: boolean;
  loading: boolean;
  rpcError: string | null;
  reload: () => void;
}
const ChainCtx = createContext<ChainState | null>(null);

export function useChain(): ChainState {
  const c = useContext(ChainCtx);
  if (!c) throw new Error("useChain outside AppProvider");
  return c;
}

/** A v7 control renders only when the connected contract is v2 and `features.<name>` is true in config.yaml (WO-20). */
export function useFeature(name: FeatureName): boolean {
  const { config, generation } = useChain();
  return featureOn(config.features, generation, name);
}

// ------------------------------------------------------------------ wallet

interface WalletState {
  accountId: string | null;
  network: string;
  label: string;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}
const WalletCtx = createContext<WalletState | null>(null);
export function useWallet(): WalletState {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useWallet outside AppProvider");
  return c;
}

// ------------------------------------------------------------------ sign

export interface SignOptions {
  summary?: ReactNode;
  /** Fee stack shown in the sign modal with its total, before the wallet opens. */
  fees?: { lines: FeeLine[]; total: ReactNode; note?: ReactNode };
  /** Toast title on success, e.g. "Quote funded". */
  success: string;
}
type SignFn = (intent: TxIntent, opts: SignOptions) => Promise<TxOutcome | null>;
const SignCtx = createContext<SignFn>(async () => null);
export const useSign = () => useContext(SignCtx);

function SignHost({ adapter, accountId, children }: { adapter: WalletAdapter; accountId: string | null; children: ReactNode }) {
  const toast = useToast();
  const [pending, setPending] = useState<{ intent: TxIntent; opts: SignOptions; resolve: (o: TxOutcome | null) => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sign = useCallback<SignFn>(
    (intent, opts) =>
      new Promise((resolve) => {
        setError(null);
        setPending({ intent, opts, resolve });
      }),
    [],
  );

  const cancel = useCallback(() => {
    pending?.resolve(null);
    setPending(null);
  }, [pending]);

  const confirm = useCallback(async () => {
    if (!pending) return;
    if (adapter.network() !== "testnet") {
      setError("Your wallet is not on NEAR testnet. Switch network and try again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await adapter.signAndSend(pending.intent);
      setBusy(false);
      setPending(null);
      pending.resolve(out);
      const link = out.hash ? txUrl(out.hash) : null;
      if (out.ok) {
        toast.push({
          title: pending.opts.success,
          body: out.hash ? (link ? <a className="link" href={link} target="_blank" rel="noreferrer noopener">View transaction {out.hash.slice(0, 10)}…</a> : <span className="mono">tx {out.hash}</span>) : undefined,
        });
      } else {
        toast.push({ tone: "error", title: `${pending.intent.label} failed`, body: <span className="mono small">{out.failure}</span>, timeout: 0 });
      }
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [adapter, pending, toast]);

  return (
    <SignCtx.Provider value={sign}>
      {children}
      <SignModal
        preview={pending?.intent ?? null}
        signer={accountId}
        network="NEAR testnet"
        busy={busy}
        error={error}
        onConfirm={confirm}
        onCancel={cancel}
        summary={pending?.opts.summary}
        fees={pending?.opts.fees}
      />
    </SignCtx.Provider>
  );
}

// ------------------------------------------------------------------ provider

/** Localhost-only E2E overrides (features + Solana vault ids); a no-op on any deployed host. */
function applyE2EMock(config: PublicConfig, m: E2EMock | null): PublicConfig {
  if (!m) return config;
  // `features` is the exact set of flags that are on for this page load (others off), so a spec never depends on config.yaml.
  const features = { ...config.features };
  if (m.features) for (const f of Object.keys(features) as FeatureName[]) features[f] = m.features.includes(f);
  return {
    ...config,
    features,
    solana: { ...config.solana, vaultProgram: m.solana?.vaultProgram ?? config.solana.vaultProgram, mint: m.solana?.mint ?? config.solana.mint },
  };
}

export function AppProvider({ config: baseConfig, children }: { config: PublicConfig; children: ReactNode }) {
  const [e2eMock, setE2eMock] = useState<E2EMock | null>(null);
  useEffect(() => setE2eMock(readLocalE2EMock()), []);
  const config = useMemo(() => applyE2EMock(baseConfig, e2eMock), [baseConfig, e2eMock]);
  const deployed = config.core !== null;
  const views = useMemo(() => (config.core ? NectarViews.fromRpc(config.core, RPC_URL) : null), [config.core]);
  const [core, setCore] = useState<CoreConfigView | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(deployed);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!views) return;
    let live = true;
    setLoading(true);
    Promise.all([views.getConfig(), views.contractVersion().catch(() => null)])
      .then(([c, v]) => {
        if (!live) return;
        setCore(c);
        // get_config carries contract_version on the live deployment; contract_version() is the interface (§A6).
        setVersion(v ?? (typeof c.contract_version === "string" ? c.contract_version : null));
        setRpcError(null);
      })
      .catch((e: unknown) => live && setRpcError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [views, tick]);

  const adapterRef = useRef<WalletAdapter | null>(null);
  if (!adapterRef.current) adapterRef.current = E2E_KEY_ADAPTER ? new E2EKeyAdapter() : readLocalE2EMock()?.near ? new E2EMockAdapter() : new NearConnectAdapter();
  const adapter = adapterRef.current;
  const [accountId, setAccountId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  useEffect(() => {
    adapter.restore().then(setAccountId, () => setAccountId(null));
  }, [adapter]);
  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      setAccountId(await adapter.connect());
    } catch {
      /* user closed the selector */
    } finally {
      setConnecting(false);
    }
  }, [adapter]);
  const disconnect = useCallback(async () => {
    await adapter.disconnect();
    setAccountId(null);
  }, [adapter]);

  const generation = version === null ? null : contractGeneration(version);
  const chain: ChainState = { config, views, deployed, core, version, generation, paused: core?.paused === true, loading, rpcError, reload };
  const wallet: WalletState = { accountId, network: adapter.network(), label: adapter.label, connecting, connect, disconnect };

  return (
    <ChainCtx.Provider value={chain}>
      <WalletCtx.Provider value={wallet}>
        <ToastProvider>
          <SignHost adapter={adapter} accountId={accountId}>
            {children}
          </SignHost>
        </ToastProvider>
      </WalletCtx.Provider>
    </ChainCtx.Provider>
  );
}

// ------------------------------------------------------------------ data hook

export interface ViewState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Run a view against nectar-core. `fn` receives the views client; skipped (loading=false, data undefined) when not deployed. */
export function useView<T>(fn: ((v: NectarViews) => Promise<T>) | null, deps: ReadonlyArray<unknown>): ViewState<T> {
  const { views } = useChain();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(views && fn));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!views || !fn) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    fn(views)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, tick, ...deps]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
