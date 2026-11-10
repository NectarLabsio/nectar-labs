// E2E-only overrides, honoured only when the page is served from localhost (Playwright's `next start`), never on a deployed host.
// Playwright sets window.__NECTAR_E2E_MOCK__ with addInitScript so the remote (Solana) flow can run against mocked views
// while config.yaml still has `features.solana_remote: false` and the vault ids are TODO-G7. The contract stays authoritative:
// a v7 control still needs a v2 contract (featureOn), and nothing here can sign for a real account.
import type { FeatureName } from "@nectar/sdk";

export interface E2EMockOutcome {
  ok?: boolean;
  /** base64 SuccessValue, e.g. btoa('"7"') for reserve_remote_position. */
  successValue?: string | null;
  failure?: string | null;
}

export interface E2EMock {
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

export function readLocalE2EMock(): E2EMock | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hostname;
  if (h !== "localhost" && h !== "127.0.0.1") return null;
  return window.__NECTAR_E2E_MOCK__ ?? null;
}
