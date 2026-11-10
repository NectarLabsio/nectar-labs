"use client";
// Phantom (or any Solana wallet) through Wallet Standard (D-020, F-354: @wallet-standard/core 1.1.2). No wallet-adapter, no web3.js.
// Feature shapes from @solana/wallet-standard-features 1.5.0 and @wallet-standard/features 1.1.1 type definitions:
//   standard:connect            connect({ silent? }) → { accounts }
//   standard:disconnect         disconnect()
//   solana:signAndSendTransaction signAndSendTransaction({ account, transaction: Uint8Array, chain, options? }) → [{ signature: Uint8Array }]
import { useCallback, useEffect, useMemo, useState } from "react";
import { getWallets, type Wallet, type WalletAccount } from "@wallet-standard/core";
import { SolanaSignAndSendTransaction, type SolanaSignAndSendTransactionFeature } from "@solana/wallet-standard-features";
import { SOLANA_DEVNET_CHAIN, bytesToBase58 } from "@nectar/sdk";

const CONNECT = "standard:connect";
const DISCONNECT = "standard:disconnect";

interface ConnectFeature {
  [CONNECT]: { version: string; connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }> };
}
interface DisconnectFeature {
  [DISCONNECT]: { version: string; disconnect: () => Promise<void> };
}

const isSolanaWallet = (w: Wallet): boolean => CONNECT in w.features && SolanaSignAndSendTransaction in w.features && w.chains.some((c) => c.startsWith("solana:"));

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
  const [wallets, setWallets] = useState<readonly Wallet[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = getWallets();
    const refresh = () => {
      const list = api.get().filter(isSolanaWallet);
      // Phantom first: it is the wallet the docs and the demo use; any other Wallet Standard Solana wallet works the same way.
      setWallets([...list].sort((a, b) => Number(b.name === "Phantom") - Number(a.name === "Phantom")));
    };
    refresh();
    const off1 = api.on("register", refresh);
    const off2 = api.on("unregister", refresh);
    return () => {
      off1();
      off2();
    };
  }, []);

  const connect = useCallback(
    async (w?: Wallet) => {
      const target = w ?? wallets[0];
      if (!target) return;
      setConnecting(true);
      setError(null);
      try {
        const { accounts } = await (target.features as unknown as ConnectFeature)[CONNECT].connect();
        const acc = accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0] ?? null;
        setWallet(target);
        setAccount(acc);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setConnecting(false);
      }
    },
    [wallets],
  );

  const disconnect = useCallback(async () => {
    const f = wallet?.features as unknown as Partial<DisconnectFeature> | undefined;
    try {
      await f?.[DISCONNECT]?.disconnect();
    } finally {
      setWallet(null);
      setAccount(null);
    }
  }, [wallet]);

  const signAndSend = useCallback(
    async (wire: Uint8Array): Promise<string> => {
      if (!wallet || !account) throw new Error("Connect a Solana wallet first.");
      const f = (wallet.features as unknown as SolanaSignAndSendTransactionFeature)[SolanaSignAndSendTransaction];
      const [out] = await f.signAndSendTransaction({ account, transaction: wire, chain: SOLANA_DEVNET_CHAIN, options: { commitment: "confirmed" } });
      if (!out) throw new Error("The wallet returned no signature.");
      return bytesToBase58(new Uint8Array(out.signature));
    },
    [wallet, account],
  );

  const devnet = useMemo(() => {
    if (!wallet) return true;
    const chains = account?.chains.length ? account.chains : wallet.chains;
    return chains.includes(SOLANA_DEVNET_CHAIN);
  }, [wallet, account]);

  return { wallets, wallet, account, address: account?.address ?? null, devnet, connecting, error, connect, disconnect, signAndSend };
}
