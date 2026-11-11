// Content-Security-Policy from the measured data inventory (WO-34c; apps/web/content/data-inventory.md, e2e/inventory.spec.ts).
// Every host below was seen in real Chrome on some route of either host, or while the near-connect selector and one wallet's
// sandboxed frame were open. That frame is a `srcdoc` iframe, so it INHERITS this policy: the wallet's own stylesheet, font,
// image and API hosts must be listed here or the wallet breaks. Re-run the inventory before adding a wallet-specific host.
//
// Why 'unsafe-inline' stays in script-src: the pages are statically prerendered, and Next's inline RSC payload scripts plus the
// theme init script carry no nonce (nonces need dynamic rendering on every request). The sandboxed wallet code also runs as inline
// <script> in the srcdoc frame (near-connect adds a nonce only when given one). External script hosts are still refused.
// style-src keeps 'unsafe-inline' for React style attributes and the <style> tags near-connect injects into its popups.

/** Hosts per directive, measured 2026-11-12 (Meteor Wallet opened; see data-inventory.json). */
export const MEASURED = {
  // NEAR testnet RPC (our code: lib/env.ts default + @nectar/sdk TESTNET_RPC_FALLBACKS), the near-connect wallet manifest,
  // Meteor Wallet's API from its frame.
  connect: ["https://test.rpc.fastnear.com", "https://rpc.testnet.fastnear.com", "https://raw.githubusercontent.com", "https://mc.meteorwallet.app", "wss://mc.meteorwallet.app"],
  // Wallet icons in the selector (manifest), Meteor's frame images.
  img: ["https://raw.githubusercontent.com", "https://storage.herewallet.app", "https://evm-on-near.dev", "https://meteorwallet.app"],
  // Meteor's frame stylesheets and their fonts (the cdnfonts sheet inlines woff2 as data: URLs).
  style: ["https://fonts.cdnfonts.com", "https://rsms.me"],
  font: ["data:", "https://fonts.cdnfonts.com", "https://rsms.me"],
  frame: [] as string[],
  script: [] as string[],
} as const;

function originOf(u: string | undefined): string | null {
  if (!u) return null;
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:" ? x.origin : null;
  } catch {
    return null;
  }
}

const uniq = (xs: (string | null)[]): string[] => [...new Set(xs.filter((x): x is string => !!x))];

/**
 * The full policy. Env-configured browser origins are added to connect-src: SITE_URL and APP_URL, NEXT_PUBLIC_NEAR_RPC (a non-default RPC) and
 * NEXT_PUBLIC_SOLANA_RPC / its devnet default (reached only in the Solana remote-collateral flow, which needs a Solana wallet
 * extension and so cannot be measured in a fresh profile: listed from code, components/remote/solana-tx.tsx).
 */
export function buildCsp(env: Record<string, string | undefined> = process.env): string {
  const connect = uniq([
    "'self'",
    // The other host of the pair: next/link prefetches a cross-host link (measured: SITE / fetches APP /feed and /borrow).
    originOf(env.SITE_URL),
    originOf(env.APP_URL),
    ...MEASURED.connect,
    originOf(env.NEXT_PUBLIC_NEAR_RPC),
    originOf(env.NEXT_PUBLIC_SOLANA_RPC) ?? "https://api.devnet.solana.com",
  ]);
  const d: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...MEASURED.script]],
    ["style-src", ["'self'", "'unsafe-inline'", ...MEASURED.style]],
    ["img-src", ["'self'", "data:", "blob:", ...MEASURED.img]],
    ["font-src", ["'self'", ...MEASURED.font]],
    ["connect-src", connect],
    ["frame-src", ["'self'", ...MEASURED.frame]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];
  return d.map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
}
