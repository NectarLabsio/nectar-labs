// E2E-only NEAR adapter for mocked-view specs (localhost only, see lib/e2e-mock.ts). It never touches the network:
// it records each intent and answers with the canned outcome for its method.
import type { TxIntent } from "@nectar/sdk";
import { readLocalE2EMock } from "../e2e-mock";
import type { TxOutcome, WalletAdapter } from "./types";

export class E2EMockAdapter implements WalletAdapter {
  readonly id = "e2e-mock";
  readonly label = "Mock wallet (E2E, localhost)";
  network() {
    return "testnet";
  }
  async restore() {
    return readLocalE2EMock()?.near?.accountId ?? null;
  }
  async connect() {
    return this.restore();
  }
  async disconnect() {}
  async signAndSend(intent: TxIntent): Promise<TxOutcome> {
    const m = readLocalE2EMock()?.near;
    if (!m) throw new Error("E2E mock wallet not configured");
    (window.__NECTAR_E2E_CALLS__ ??= []).push({ receiverId: intent.receiverId, methodName: intent.methodName, args: intent.args });
    const o = m.outcomes?.[intent.methodName] ?? {};
    const ok = o.ok !== false;
    return { hash: `mock-${intent.methodName}`, ok, logs: [], failure: ok ? null : (o.failure ?? "mock failure"), successValue: o.successValue ?? null };
  }
}
