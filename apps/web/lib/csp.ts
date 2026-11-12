// Content-Security-Policy from the measured data inventory (WO-34c; apps/web/content/data-inventory.md, e2e/inventory.spec.ts).
// Every host below was seen in real Chrome on some route of either host, or while the near-connect selector and each listed wallet's
// sandboxed frame were open (WO-34f: every wallet, one by one). That frame is a `srcdoc` iframe, so it INHERITS this policy: the wallet's own stylesheet, font,
// image and API hosts must be listed here or the wallet breaks. Re-run the inventory before adding a wallet-specific host.
//
// Why 'unsafe-inline' stays in script-src: the pages are statically prerendered, and Next's inline RSC payload scripts plus the
// theme init script carry no nonce (nonces need dynamic rendering on every request). The sandboxed wallet code also runs as inline
// <script> in the srcdoc frame (near-connect adds a nonce only when given one). External script hosts are still refused.
// style-src keeps 'unsafe-inline' for React style attributes and the <style> tags near-connect injects into its popups.

type Directive = "connect" | "img" | "style" | "font" | "frame" | "script";
type Hosts = Partial<Record<Directive, readonly string[]>>;

/** Our code and the near-connect selector (wallet list + icons), measured 2026-11-12 in real Chrome (data-inventory.json). */
export const BASE: Hosts = {
  // NEAR testnet RPC (our code: lib/env.ts default + @nectar/sdk TESTNET_RPC_FALLBACKS: FastNEAR ×2, then dRPC and Intear, which are
  // contacted only while FastNEAR refuses, WO-34g / F-369); the near-connect wallet manifest and the sandboxed wallets' executor scripts
  // (fetched from the manifest URLs, unpinned: a manifest change can add a host, see WO-34f).
  connect: ["https://test.rpc.fastnear.com", "https://rpc.testnet.fastnear.com", "https://near-testnet.drpc.org", "https://testnet-rpc.intea.rs", "https://raw.githubusercontent.com"],
  // Wallet icons in the selector (manifest).
  img: ["https://raw.githubusercontent.com", "https://storage.herewallet.app", "https://evm-on-near.dev"],
};

/**
 * Per wallet the testnet selector lists (near-connect 0.12.0 manifest, 2026-11-12), what its sandboxed srcdoc frame loads after
 * you pick it, up to the point where it asks to connect (WO-34f, e2e/inventory.spec.ts "every wallet"). Wallets that open their
 * own window (Ethereum Wallets → evm-on-near.dev) run that window under the wallet's own policy, not this one.
 */
export const WALLETS: Record<string, Hosts> = {
  // API (https + wss), images, stylesheets and their fonts (the cdnfonts sheet inlines woff2 as data: URLs).
  "Meteor Wallet": {
    connect: ["https://mc.meteorwallet.app", "wss://mc.meteorwallet.app"],
    img: ["https://meteorwallet.app"],
    style: ["https://fonts.cdnfonts.com", "https://rsms.me"],
    font: ["data:", "https://fonts.cdnfonts.com", "https://rsms.me"],
  },
  // Executor script fetched from its own host; its connect page runs in a nested iframe on the same host.
  "Intear Wallet": { connect: ["https://wallet.intear.tech"], frame: ["https://wallet.intear.tech"] },
  // Inter from rsms.me (stylesheet + font files).
  "NEAR CLI": { style: ["https://rsms.me"], font: ["https://rsms.me"] },
  // WebHID / WebUSB only: no extra host.
  Ledger: {},
  // Browser extension: the frame only checks for it, no extra host.
  "Nightly Wallet": {},
  // Executor script fetched from evm-on-near.dev (measured: refused before WO-34f listed it); it then opens its own window there,
  // which runs under that site's policy, not this one. Its icon host is already in BASE.
  "Ethereum Wallets": { connect: ["https://evm-on-near.dev"] },
};

const merged = (d: Directive): string[] => [...new Set([...(BASE[d] ?? []), ...Object.values(WALLETS).flatMap((w) => w[d] ?? [])])];

/** Hosts per directive: BASE plus every wallet group. */
export const MEASURED = {
  connect: merged("connect"),
  img: merged("img"),
  style: merged("style"),
  font: merged("font"),
  frame: merged("frame"),
  script: merged("script"),
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
 * The full policy. Env-configured browser origins are added to connect-src: NEXT_PUBLIC_NEAR_RPC (a non-default RPC) and
 * NEXT_PUBLIC_SOLANA_RPC / its devnet default (reached only in the Solana remote-collateral flow, which needs a Solana wallet
 * extension and so cannot be measured in a fresh profile: listed from code, components/remote/solana-tx.tsx).
 */
export function buildCsp(env: Record<string, string | undefined> = process.env): string {
  const connect = uniq([
    "'self'",
    // No SITE/APP/STATUS/DOCS cross entry: cross-host links are plain anchors since WO-34f (no RSC prefetch to another host), API
    // routes are shared paths served same-origin on every host (the status page reads /api/health on STATUS, WO-62b), and docs are
    // a 308 to DOCS_URL (a navigation, not a fetch). Every other directive is 'self'/'none' or a third-party host: nothing per origin.
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
