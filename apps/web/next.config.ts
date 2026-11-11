import type { NextConfig } from "next";

// Runtime origins the browser may reach (rules: RPC, Feed API, 1Click dry, NEAR AI via server route).
// Wallet origins are reached only after the user presses "Connect wallet" (near-connect loads its manifest and wallet sandboxes then).
// R2-08: no framing (clickjacking), no plugins, no <base> or form retargeting. A full script-src/connect-src policy and a pinned
// near-connect manifest are not set yet (Next inline RSC scripts need nonces; wallet sandboxes load from several origins): disclosed residual.
const csp = ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join("; ");
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
  // Browsers ignore HSTS over plain http (localhost), so local runs are unaffected.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: csp },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@nectar/ui", "@nectar/sdk"],
  // The repo lives on exFAT: macOS "._*" files corrupt the Turbopack persistent cache ("invalid digit found in string").
  experimental: { turbopackFileSystemCacheForDev: false, turbopackFileSystemCacheForBuild: false },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: "/quote", destination: "/quote/new", permanent: false },
      { source: "/positions/:id", destination: "/position/:id", permanent: false },
    ];
  },
};

export default config;
