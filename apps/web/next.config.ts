import type { NextConfig } from "next";
import { docsOrigin, docsUrl, readHosts } from "./lib/hosts";

// Hosted env (WO-34a, apps/web/.env.example). All unset = local single-host mode: no redirects, no rewrites, same headers as before.
const env = process.env;
const hosts = readHosts(env);
const production = env.VERCEL_ENV === "production" || env.NECTAR_PRODUCTION === "1";
// Production guard, env half (the config.yaml operator half runs in app/layout.tsx via @nectar/sdk productionGaps).
if (production && (!env.SITE_URL || !env.APP_URL)) {
  throw new Error("Production build refused (WO-34a guard): SITE_URL and APP_URL must both be set.");
}

// Runtime origins the browser may reach (rules: RPC, Feed API, 1Click dry, NEAR AI via server route).
// Wallet origins are reached only after the user presses "Connect wallet" (near-connect loads its manifest and wallet sandboxes then).
// R2-08: no framing (clickjacking), no plugins, no <base> or form retargeting. script-src / connect-src / frame-src / img-src are
// not set: WO-34a allows them only after a measurement in real Chrome with the real near-connect selector and a wallet iframe,
// which has not run yet (disclosed residual; Next inline RSC scripts would also need nonces, i.e. dynamic rendering everywhere).
const csp = ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join("; ");
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
  // Browsers ignore HSTS over plain http (localhost), so local runs are unaffected.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: csp },
  // Previews (VERCEL_ENV !== "production") are never indexed; robots.txt also disallows everything there.
  ...(production ? [] : [{ key: "X-Robots-Tag", value: "noindex" }]),
];

const DOCS_ORIGIN = docsOrigin(env);

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@nectar/ui", "@nectar/sdk"],
  // The repo lives on exFAT: macOS "._*" files corrupt the Turbopack persistent cache ("invalid digit found in string").
  experimental: { turbopackFileSystemCacheForDev: false, turbopackFileSystemCacheForBuild: false },
  // Non-secret URLs only (inlined into the client bundle). FEED_URL, DOCS_ORIGIN and every key stay server-side.
  env: {
    NEXT_PUBLIC_DOCS_URL: docsUrl(env) || env.NEXT_PUBLIC_DOCS_URL || "",
    NEXT_PUBLIC_SITE_URL: hosts?.site ?? "",
    NEXT_PUBLIC_APP_URL: hosts?.app ?? "",
    NEXT_PUBLIC_REPO_URL: env.REPO_URL ?? "",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: "/quote", destination: "/quote/new", permanent: false },
      { source: "/positions/:id", destination: "/position/:id", permanent: false },
    ];
  },
  async rewrites() {
    // APP /docs → the docs deployment (F-393: the Docusaurus build is served at its root, prefix stripped; its pages reference
    // /docs/assets/…, which this same rule serves). beforeFiles beats app/docs/page.tsx, which stays for local mode only.
    if (!hosts || !DOCS_ORIGIN) return [];
    const has = [{ type: "host" as const, value: hosts.appHost.replace(/\./g, "\\.") }];
    return {
      beforeFiles: [
        { source: "/docs", destination: `${DOCS_ORIGIN}/`, has },
        { source: "/docs/:path*", destination: `${DOCS_ORIGIN}/:path*`, has },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default config;
