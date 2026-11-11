// E2E-only adapter: signs with the demo borrower key that Playwright injects at test time
// (window.__NECTAR_E2E__ = { accountId, privateKey }, from env NECTAR_E2E_BORROWER_ID / NECTAR_E2E_BORROWER_KEY).
// Compiled in only when NEXT_PUBLIC_E2E_KEY_ADAPTER=1. The key never lives in the repo or the bundle.
// Localhost only, like E2EMockAdapter (R2-13): on any other host the injected key is ignored and AppProvider uses near-connect.
import type { TxIntent } from "@nectar/sdk";
import { RPC_URL } from "../env";
import { isLocalE2EHost } from "../e2e-mock";
import { parseOutcome, type TxOutcome, type WalletAdapter } from "./types";

interface E2EKey { accountId: string; privateKey: string }
declare global {
  interface Window { __NECTAR_E2E__?: E2EKey }
}

export class E2EKeyAdapter implements WalletAdapter {
  readonly id = "e2e-key";
  readonly label = "Demo key (E2E)";
  private key(): E2EKey | null {
    return isLocalE2EHost() ? (window.__NECTAR_E2E__ ?? null) : null;
  }
  async restore() {
    return this.key()?.accountId ?? null;
  }
  async connect() {
    return this.key()?.accountId ?? null;
  }
  async disconnect() {}
  async signAndSend(intent: TxIntent): Promise<TxOutcome> {
    const k = this.key();
    if (!k) throw new Error("E2E key not injected");
    const { Account } = await import("near-api-js");
    const account = new Account(k.accountId, RPC_URL, k.privateKey as `ed25519:${string}`);
    const raw: unknown = await account.callFunctionRaw({
      contractId: intent.receiverId,
      methodName: intent.methodName,
      args: intent.args,
      gas: intent.gas,
      deposit: intent.deposit,
    });
    return parseOutcome(raw);
  }
}
