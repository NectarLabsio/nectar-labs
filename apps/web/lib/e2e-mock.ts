// E2E-only overrides, honoured only when the page is served from localhost (Playwright's `next start`), never on a deployed host.
// Playwright sets window.__NECTAR_E2E_MOCK__ with addInitScript so each spec pins its own flag state (both flag-on and flag-off
// paths) and the remote (Solana) flow can run against mocked vault ids, independent of config.yaml. The contract stays authoritative:
// a v7 control still needs a v2 contract (featureOn), and nothing here can sign for a real account.
import type { FeatureName } from "@nectar/sdk";

export interface E2EMockOutcome {
  ok?: boolean;
  /** base64 SuccessValue, e.g. btoa('"7"') for reserve_remote_position. */
  successValue?: string | null;
  failure?: string | null;
}

export interface E2EMock {
  /** When set: exactly these `features.*` are on and every other flag is off, whatever config.yaml says. Unset: config.yaml. */
  features?: FeatureName[];
  solana?: { vaultProgram?: string; mint?: string };
  /** A NEAR "wallet" that records intents in window.__NECTAR_E2E_CALLS__ and returns canned outcomes per method. */
  near?: { accountId: string; outcomes?: Record<string, E2EMockOutcome> };
}

declare global {
  interface Window {
    __NECTAR_E2E_MOCK__?: E2EMock;
    __NECTAR_E2E_CALLS__?: Array<{ receiverId: string; methodName: string; args: Record<string, unknown> }>;
  }
}

/** true only in a browser on localhost / 127.0.0.1 (Playwright's `next start`). Every E2E-only adapter checks this. */
export function isLocalE2EHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

export function readLocalE2EMock(): E2EMock | null {
  if (!isLocalE2EHost()) return null;
  return window.__NECTAR_E2E_MOCK__ ?? null;
}
