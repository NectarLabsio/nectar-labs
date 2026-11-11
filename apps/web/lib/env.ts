// Public runtime settings. Defaults are testnet-only.
import { assertNotMainnetRpc } from "@nectar/sdk";
import { isLandingPath, isSharedPath } from "./hosts";

// R2-10: a URL that names mainnet is refused when this module loads (build, server start, first client render), as
// services/x402/src/config.ts does. NEXT_PUBLIC_* values are inlined at build time, so `next build` fails on them.
// RPC default from F-096 (near-connect providers example). Override with NEXT_PUBLIC_NEAR_RPC.
export const RPC_URL = assertNotMainnetRpc(process.env.NEXT_PUBLIC_NEAR_RPC || "https://test.rpc.fastnear.com", "NEXT_PUBLIC_NEAR_RPC");
// Feed API (services/feed). Server-side only: reached through the same-origin /api/indexer proxy, never from the browser.
// FEED_URL (WO-34a hosted env) wins; NEXT_PUBLIC_FEED_URL is the older local name, kept so local runs are unchanged. Empty: "indexer not connected".
export const FEED_URL = process.env.FEED_URL || process.env.NEXT_PUBLIC_FEED_URL || "";
// Explorer base for tx links: TODO-G2 confirm the testnet explorer URL in docs/FACTS.md; empty disables links.
export const EXPLORER_TX = process.env.NEXT_PUBLIC_EXPLORER_TX ?? "";
export const EXPLORER_ACCOUNT = process.env.NEXT_PUBLIC_EXPLORER_ACCOUNT ?? "";
// Hosted docs URL. next.config.ts inlines it from DOCS_URL (default APP_URL + /docs). Empty (local mode): the in-app /docs page.
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? "";
// Hosted origins (WO-34a), inlined by next.config.ts from SITE_URL / APP_URL. Both empty = local single-host mode.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
// Public source repository (inlined from REPO_URL). Empty: every repository link is hidden (repoHref returns null).
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "";
// Faucet for testnet NEAR (TODO-G2: confirm URL in FACTS). Mock USDC / NVDAx come from the demo seeding scripts.
export const FAUCET_URL = process.env.NEXT_PUBLIC_FAUCET_URL ?? "";
// "Get demo NVDAx" (PRD §4.9): testnet mock-mint page, a link only (no auto-mint). Empty: the docs runbook section on mock tokens.
export const NVDAX_FAUCET_URL = process.env.NEXT_PUBLIC_NVDAX_FAUCET_URL ?? "";
// GA4 id (TODO-H4 analytics vendor). Loaded only after consent and only when set.
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";
// E2E only: lets Playwright sign with the demo borrower key injected at test time. Never set in production.
export const E2E_KEY_ADAPTER = process.env.NEXT_PUBLIC_E2E_KEY_ADAPTER === "1";
// Solana devnet RPC for the remote (Solana) collateral flow (@solana/wallet-standard-chains 1.1.2 names this endpoint for solana:devnet).
// No genesis-hash check: the Solana devnet genesis hash is not in docs/FACTS.md yet (WO-42b), so only the URL is checked.
export const SOLANA_RPC_URL = assertNotMainnetRpc(process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com", "NEXT_PUBLIC_SOLANA_RPC");
export const SOLANA_FAUCET_URL = "https://faucet.solana.com";
export const SOLANA_EXPLORER_TX = (sig: string): string => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const SOLANA_EXPLORER_ADDR = (a: string): string => `https://explorer.solana.com/address/${a}?cluster=devnet`;

export const txUrl = (hash: string): string | null => (EXPLORER_TX ? `${EXPLORER_TX}${hash}` : null);
export const accountUrl = (id: string): string | null => (EXPLORER_ACCOUNT ? `${EXPLORER_ACCOUNT}${id}` : null);
export const repoHref = (path = ""): string | null => (REPO_URL ? `${REPO_URL.replace(/\/$/, "")}${path ? `/${path.replace(/^\//, "")}` : ""}` : null);
export const docsHref = (path = ""): string => (DOCS_URL ? `${DOCS_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}` : "/docs");

/**
 * In-app path → the host that serves it (WO-34a). Local mode: unchanged. Hosted: absolute on SITE_URL (landing-only routes) or
 * APP_URL (everything else); next/link treats a same-origin absolute URL as an in-app link and a cross-host one as a plain anchor.
 */
export const hostHref = (href: string): string => {
  if (!SITE_URL || !APP_URL || !href.startsWith("/") || href.startsWith("//")) return href;
  const path = href.split(/[?#]/)[0]!;
  if (isSharedPath(path)) return href;
  return `${(isLandingPath(path) ? SITE_URL : APP_URL).replace(/\/$/, "")}${href}`;
};
