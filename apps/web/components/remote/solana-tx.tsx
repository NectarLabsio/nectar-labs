"use client";
// Solana sign flow: SolanaSignModal (exact instructions, fee and rent) → Wallet Standard signAndSendTransaction → devnet status poll.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccountRole } from "@solana/kit";
import { SolanaSignModal, type SolanaIxPreview, type SolanaSignPreview } from "@nectar/ui";
import { SolanaReader, bytesToHex, type DescribedInstruction } from "@nectar/sdk";
import { SOLANA_RPC_URL } from "@/lib/env";
import type { SolanaWalletState } from "./useSolanaWallet";

export const toIxPreview = (d: DescribedInstruction): SolanaIxPreview => ({
  label: d.label,
  program: d.program,
  accounts: d.accounts.map((a) => ({
    name: a.name,
    address: a.address,
    signer: a.role === AccountRole.READONLY_SIGNER || a.role === AccountRole.WRITABLE_SIGNER,
    writable: a.role === AccountRole.WRITABLE || a.role === AccountRole.WRITABLE_SIGNER,
  })),
  args: d.args,
  dataHex: bytesToHex(d.instruction.data),
});

export function useSolanaReader(): SolanaReader {
  return useMemo(() => new SolanaReader(SOLANA_RPC_URL), []);
}

export type SigState = { sig: string; status: "sending" | "confirmed" | "failed" | "unseen" };

/** Poll getSignatureStatuses until confirmed/failed; "unseen" after ~60 s means the wallet sent it to another cluster. */
export async function waitForSignature(reader: SolanaReader, sig: string, tries = 30, everyMs = 2000): Promise<SigState["status"]> {
  for (let i = 0; i < tries; i++) {
    try {
      const s = await reader.signatureStatus(sig);
      if (s === "failed") return "failed";
      if (s === "confirmed" || s === "finalized") return "confirmed";
    } catch {
      /* transient RPC error: keep polling */
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return "unseen";
}

interface Pending {
  preview: SolanaSignPreview;
  build: () => Promise<Uint8Array>;
  resolve: (sig: string | null) => void;
}

/** One Solana write at a time through the sign modal. `request` resolves the signature, or null if the user cancelled. */
export function useSolanaTx(sol: SolanaWalletState) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Pending | null>(null);
  ref.current = pending;

  const request = useCallback(
    (preview: SolanaSignPreview, build: () => Promise<Uint8Array>) =>
      new Promise<string | null>((resolve) => {
        setError(null);
        setPending({ preview, build, resolve });
      }),
    [],
  );
  const cancel = useCallback(() => {
    ref.current?.resolve(null);
    setPending(null);
  }, []);
  const confirm = useCallback(async () => {
    const p = ref.current;
    if (!p) return;
    if (!sol.devnet) {
      setError("Your Solana wallet is not on devnet. Switch it to devnet and try again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const wire = await p.build();
      const sig = await sol.signAndSend(wire);
      setPending(null);
      p.resolve(sig);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [sol]);

  useEffect(() => () => ref.current?.resolve(null), []);

  const modal = <SolanaSignModal preview={pending?.preview ?? null} busy={busy} error={error} onConfirm={confirm} onCancel={cancel} />;
  return { request, modal };
}
