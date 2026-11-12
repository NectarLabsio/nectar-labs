// E2E-only NEAR adapter for mocked-view specs (localhost only, see lib/e2e-mock.ts). It never touches the network:
// it records each intent and answers with the canned outcome for its method.
import type { TxIntent } from "@nectar/sdk";
import { readLocalE2EMock } from "../e2e-mock";
import type { TxOutcome, WalletAdapter } from "./types";

export class E2EMockAdapter implements WalletAdapter {
  readonly id = "e2e-mock";
  readonly label = "Mock wallet (E2E, localhost)";
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
    if (m.reject) throw new Error(m.reject);
    (window.__NECTAR_E2E_CALLS__ ??= []).push({ receiverId: intent.receiverId, methodName: intent.methodName, args: intent.args });
    const o = m.outcomes?.[intent.methodName] ?? {};
    const ok = o.ok !== false;
    return { hash: `mock-${intent.methodName}`, ok, logs: [], failure: ok ? null : (o.failure ?? "mock failure"), successValue: o.successValue ?? null };
  }
  /** One "wallet request" for the batch: records every intent with gas, deposit and the batch size, or throws `reject` before any. */
  async signAndSendMany(intents: readonly TxIntent[]): Promise<TxOutcome[]> {
    const m = readLocalE2EMock()?.near;
    if (!m) throw new Error("E2E mock wallet not configured");
    if (m.reject) throw new Error(m.reject);
    const calls = (window.__NECTAR_E2E_CALLS__ ??= []);
    return intents.map((i, n) => {
      calls.push({ receiverId: i.receiverId, methodName: i.methodName, args: i.args, gas: i.gas, deposit: i.deposit, batch: intents.length });
      const o = m.outcomes?.[`${i.receiverId}:${i.methodName}`] ?? m.outcomes?.[i.methodName] ?? {};
      const ok = o.ok !== false;
      return { hash: `mock-${i.methodName}-${n}`, ok, logs: [], failure: ok ? null : (o.failure ?? "mock failure"), successValue: o.successValue ?? null };
    });
  }
}
