// Public runtime settings. Defaults are testnet-only.
// RPC default from F-096 (near-connect providers example). Override with NEXT_PUBLIC_NEAR_RPC.
export const RPC_URL = process.env.NEXT_PUBLIC_NEAR_RPC || "https://test.rpc.fastnear.com";
// Explorer base for tx links: TODO-G2 confirm the testnet explorer URL in docs/FACTS.md; empty disables links.
export const EXPLORER_TX = process.env.NEXT_PUBLIC_EXPLORER_TX ?? "";
export const EXPLORER_ACCOUNT = process.env.NEXT_PUBLIC_EXPLORER_ACCOUNT ?? "";
// Hosted docs site (TODO-H5: domain). Empty: /docs page explains how to run apps/docs-site locally.
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? "";
// Faucet for testnet NEAR (TODO-G2: confirm URL in FACTS). Mock USDC / NVDAx come from the demo seeding scripts.
export const FAUCET_URL = process.env.NEXT_PUBLIC_FAUCET_URL ?? "";
// GA4 id (TODO-H4 analytics vendor). Loaded only after consent and only when set.
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";
// E2E only: lets Playwright sign with the demo borrower key injected at test time. Never set in production.
export const E2E_KEY_ADAPTER = process.env.NEXT_PUBLIC_E2E_KEY_ADAPTER === "1";
export const CONTACT_EMAIL = "kunal@nectarnetwork.fun";

export const txUrl = (hash: string): string | null => (EXPLORER_TX ? `${EXPLORER_TX}${hash}` : null);
export const accountUrl = (id: string): string | null => (EXPLORER_ACCOUNT ? `${EXPLORER_ACCOUNT}${id}` : null);
export const docsHref = (path = ""): string => (DOCS_URL ? `${DOCS_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}` : "/docs");
