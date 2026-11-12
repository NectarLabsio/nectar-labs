// Public runtime settings. Defaults are testnet-only.
import { assertNotMainnetRpc } from "@nectar/sdk";
import { docsPath, isLandingPath, isSharedPath } from "./hosts";

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
// Hosted docs URL = DOCS_URL, inlined by next.config.ts (WO-62b: pages at its root, no /docs/ prefix). Empty: the in-app /docs page.
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? "";
// Hosted origins (WO-34a), inlined by next.config.ts from SITE_URL / APP_URL. Both empty = local single-host mode.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
// Status origin (WO-62b), inlined from STATUS_URL in hosted mode only. Empty: /status is a landing page on SITE_URL.
export const STATUS_URL = process.env.NEXT_PUBLIC_STATUS_URL ?? "";
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

const trim = (u: string): string => u.replace(/\/$/, "");

/**
 * In-app path → the host that serves it (WO-34a, WO-62b). `/docs[/<rest>]` → `${DOCS_URL}/<rest>` whenever DOCS_URL is set (as
 * docsHref). Local mode: otherwise unchanged. Hosted: `/status` → `${STATUS_URL}/` when set, else absolute on SITE_URL (landing-only
 * routes) or APP_URL (everything else); next/link treats a same-origin absolute URL as an in-app link and a cross-host one as a plain anchor.
 */
export const hostHref = (href: string): string => {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const path = href.split(/[?#]/)[0]!;
  const rest = href.slice(path.length);
  const docs = DOCS_URL ? docsPath(path) : null;
  if (docs) return `${trim(DOCS_URL)}${docs}${rest}`;
  if (!SITE_URL || !APP_URL) return href;
  if (isSharedPath(path)) return href;
  if (STATUS_URL && path.replace(/\/+$/, "") === "/status") return `${trim(STATUS_URL)}/${rest}`;
  return `${trim(isLandingPath(path) ? SITE_URL : APP_URL)}${href}`;
};

/**
 * The page path a client component renders for (WO-62b). On the status host `/` is rewritten to /status (proxy.ts): the prerendered
 * HTML was made for /status, while usePathname() reads the browser URL `/` on the client (next 16.4.5 create-initial-router-state.js:28,
 * use-pathname.md "Avoid hydration mismatch with rewrites"). Mapping it back keeps the first client render equal to the server's.
 */
export const pagePath = (pathname: string, host: string | null): string => {
  if (!STATUS_URL || !host || pathname !== "/") return pathname;
  try {
    return host.toLowerCase() === new URL(STATUS_URL).host.toLowerCase() ? "/status" : pathname;
  } catch {
    return pathname;
  }
};

/** The origin that serves the page at `fromPath` (SITE, APP or STATUS). Hosted mode only. */
const originFor = (fromPath: string): string => {
  const p = fromPath.split(/[?#]/)[0] || "/";
  if (STATUS_URL && p.replace(/\/+$/, "") === "/status") return trim(STATUS_URL);
  return trim(isLandingPath(p) ? SITE_URL : APP_URL);
};

/**
 * WO-34f: where a link on the page at `fromPath` goes, and whether it leaves this host. Same-host links stay relative (next/link,
 * prefetch kept). Cross-host links (SITE, APP, STATUS), the docs origin and external URLs are `cross`: render a plain <a>, because
 * an RSC prefetch across hosts follows the 308 to the other origin and fails CORS in the console. The current host follows from the
 * page path (landing paths serve on SITE, /status on STATUS when set, the rest on APP), so server and client agree.
 */
export const hostTarget = (href: string, fromPath: string): { href: string; cross: boolean } => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return { href, cross: true };
  const abs = hostHref(href);
  if (abs === href) return { href, cross: false };
  const here = SITE_URL && APP_URL ? originFor(fromPath) : "";
  // Same host: the path on this origin (on STATUS, `/status` → `/`). Docs (Docusaurus HTML, not RSC) are never client-routed.
  return here && abs.startsWith(`${here}/`) ? { href: abs.slice(here.length), cross: false } : { href: abs, cross: true };
};
