"use client";
// Phantom (or any Solana wallet) through Wallet Standard (D-020, F-354: @wallet-standard/core 1.1.2). No wallet-adapter, no web3.js.
// Feature shapes from @solana/wallet-standard-features 1.5.0 and @wallet-standard/features 1.1.1 type definitions:
//   standard:connect            connect({ silent? }) → { accounts }
//   standard:disconnect         disconnect()
//   standard:events             on("change", ({ accounts? }) => void) → off
//   solana:signAndSendTransaction signAndSendTransaction({ account, transaction: Uint8Array, chain, options? }) → [{ signature: Uint8Array }]
// One store for the whole page: the wallet committed as depositor at reservation is the wallet the deposit, withdraw and claim cards see.
import { useMemo, useSyncExternalStore } from "react";
import { getWallets, type Wallet, type WalletAccount } from "@wallet-standard/core";
import { SolanaSignAndSendTransaction, type SolanaSignAndSendTransactionFeature } from "@solana/wallet-standard-features";
import { SOLANA_DEVNET_CHAIN, bytesToBase58 } from "@nectar/sdk";

const CONNECT = "standard:connect";
const DISCONNECT = "standard:disconnect";
const EVENTS = "standard:events";

interface ConnectFeature {
  [CONNECT]: { version: string; connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }> };
}
interface DisconnectFeature {
  [DISCONNECT]: { version: string; disconnect: () => Promise<void> };
}
interface EventsFeature {
  [EVENTS]: { version: string; on: (event: "change", listener: (props: { accounts?: readonly WalletAccount[] }) => void) => () => void };
}

const isSolanaWallet = (w: Wallet): boolean => CONNECT in w.features && SolanaSignAndSendTransaction in w.features && w.chains.some((c) => c.startsWith("solana:"));
const pickAccount = (accounts: readonly WalletAccount[]): WalletAccount | null => accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0] ?? null;

interface Snapshot {
  wallets: readonly Wallet[];
  wallet: Wallet | null;
  account: WalletAccount | null;
  connecting: boolean;
  error: string | null;
}
const EMPTY: Snapshot = { wallets: [], wallet: null, account: null, connecting: false, error: null };

let snapshot = EMPTY;
let started = false;
let stopWatching: (() => void) | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  const api = getWallets();
  const refresh = () => {
    const list = api.get().filter(isSolanaWallet);
    // Phantom first: it is the wallet the docs and the demo use; any other Wallet Standard Solana wallet works the same way.
    update({ wallets: [...list].sort((a, b) => Number(b.name === "Phantom") - Number(a.name === "Phantom")) });
  };
  refresh();
  api.on("register", refresh);
  api.on("unregister", refresh);
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Follow account switches in the wallet, so the address shown is the one that would sign. */
function watch(target: Wallet) {
  stopWatching?.();
  const events = (target.features as unknown as Partial<EventsFeature>)[EVENTS];
  stopWatching =
    events?.on("change", ({ accounts }) => {
      if (accounts && snapshot.wallet === target) update({ account: pickAccount(accounts) });
    }) ?? null;
}

async function connect(w?: Wallet) {
  const target = w ?? snapshot.wallets[0];
  if (!target) return;
  update({ connecting: true, error: null });
  try {
    const { accounts } = await (target.features as unknown as ConnectFeature)[CONNECT].connect();
    update({ wallet: target, account: pickAccount(accounts), connecting: false });
    watch(target);
  } catch (e) {
    update({ connecting: false, error: e instanceof Error ? e.message : String(e) });
  }
}

async function disconnect() {
  const f = snapshot.wallet?.features as unknown as Partial<DisconnectFeature> | undefined;
  try {
    await f?.[DISCONNECT]?.disconnect();
  } finally {
    stopWatching?.();
    stopWatching = null;
    update({ wallet: null, account: null });
  }
}

async function signAndSend(wire: Uint8Array): Promise<string> {
  const { wallet, account } = snapshot;
  if (!wallet || !account) throw new Error("Connect a Solana wallet first.");
  const f = (wallet.features as unknown as SolanaSignAndSendTransactionFeature)[SolanaSignAndSendTransaction];
  const [out] = await f.signAndSendTransaction({ account, transaction: wire, chain: SOLANA_DEVNET_CHAIN, options: { commitment: "confirmed" } });
  if (!out) throw new Error("The wallet returned no signature.");
  return bytesToBase58(new Uint8Array(out.signature));
}

export interface SolanaWalletState {
  /** Solana wallets discovered through Wallet Standard (Phantom first). */
  wallets: readonly Wallet[];
  wallet: Wallet | null;
  account: WalletAccount | null;
  address: string | null;
  /** False when the wallet or account does not list solana:devnet. */
  devnet: boolean;
  connecting: boolean;
  error: string | null;
  connect: (w?: Wallet) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Sign and send wire bytes on solana:devnet; resolves the base58 signature. */
  signAndSend: (wire: Uint8Array) => Promise<string>;
}

export function useSolanaWallet(): SolanaWalletState {
  const s = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
  return useMemo(() => {
    const chains = s.account?.chains.length ? s.account.chains : (s.wallet?.chains ?? []);
    const devnet = !s.wallet || chains.includes(SOLANA_DEVNET_CHAIN);
    return { ...s, address: s.account?.address ?? null, devnet, connect, disconnect, signAndSend };
  }, [s]);
}
