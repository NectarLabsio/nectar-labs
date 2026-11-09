"use client";
import { useChain, useView, useWallet } from "./AppProvider";

/** NEP-141 balance of the connected account (undefined while unknown). */
export function useBalance(token: string | null) {
  const { accountId } = useWallet();
  const { views } = useChain();
  return useView<bigint>(views && token && accountId ? (v) => v.ftBalanceOf(token, accountId).then((b) => BigInt(b ?? "0")) : null, [token, accountId]);
}
