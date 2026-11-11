import type { NextConfig } from "next";
import { buildCsp } from "./lib/csp";
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
// R2-08 + WO-34c: frame-ancestors/object-src/base-uri/form-action locked; fetch directives are the measured hosts (lib/csp.ts).
const csp = buildCsp(env);
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
      // Browsers ask for /favicon.ico on documents without icon metadata (the SVG/JSON files): answer with the mark (WO-34f crawl 404).
      { source: "/favicon.ico", destination: "/brand/mark.svg", permanent: true },
    ];
  },
  async rewrites() {
    // APP /docs → the docs deployment (F-393: the Docusaurus build is served at its root, prefix stripped; its pages reference
    // /docs/assets/…, which this same rule serves). beforeFiles beats app/docs/page.tsx, which stays for local mode only.
    // No docs deployment (local single-host mode): every /docs/<slug> link (legal pages, landing) gets the in-app docs explainer
    // instead of a 404.
    if (!hosts || !DOCS_ORIGIN) return [{ source: "/docs/:path+", destination: "/docs" }];
    // `has: host` is matched against the hostname with the port stripped (next/dist/shared/lib/router/utils/prepare-destination.js).
    const has = [{ type: "host" as const, value: new URL(hosts.app).hostname.replace(/\./g, "\\.") }];
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
