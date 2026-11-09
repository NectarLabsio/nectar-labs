import type { NextConfig } from "next";

// Runtime origins the browser may reach (rules: RPC, Feed API, 1Click dry, NEAR AI via server route).
// Wallet origins are reached only after the user presses "Connect wallet" (near-connect loads its manifest and wallet sandboxes then).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
