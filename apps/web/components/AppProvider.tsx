"use client";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { NectarViews, type CoreConfigView, type PublicConfig, type TxIntent } from "@nectar/sdk";
import { SignModal, ToastProvider, useToast } from "@nectar/ui";
import { E2E_KEY_ADAPTER, RPC_URL, txUrl } from "@/lib/env";
import type { TxOutcome, WalletAdapter } from "@/lib/wallet/types";
import { NearConnectAdapter } from "@/lib/wallet/near-connect";
import { E2EKeyAdapter } from "@/lib/wallet/e2e-key";

// ------------------------------------------------------------------ chain

interface ChainState {
  config: PublicConfig;
  views: NectarViews | null;
  deployed: boolean;
  core: CoreConfigView | null;
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
      />
    </SignCtx.Provider>
  );
}

// ------------------------------------------------------------------ provider

export function AppProvider({ config, children }: { config: PublicConfig; children: ReactNode }) {
  const deployed = config.core !== null;
  const views = useMemo(() => (config.core ? NectarViews.fromRpc(config.core, RPC_URL) : null), [config.core]);
  const [core, setCore] = useState<CoreConfigView | null>(null);
  const [loading, setLoading] = useState(deployed);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!views) return;
    let live = true;
    setLoading(true);
    views
      .getConfig()
      .then((c) => {
        if (!live) return;
        setCore(c);
        setRpcError(null);
      })
      .catch((e: unknown) => live && setRpcError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [views, tick]);

  const adapterRef = useRef<WalletAdapter | null>(null);
  if (!adapterRef.current) adapterRef.current = E2E_KEY_ADAPTER ? new E2EKeyAdapter() : new NearConnectAdapter();
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

  const chain: ChainState = { config, views, deployed, core, paused: core?.paused === true, loading, rpcError, reload };
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
