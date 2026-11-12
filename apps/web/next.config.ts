import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
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

// WO-34p: serverless bundles. loadConfig (@nectar/sdk/config-node) finds packages/config/config.yaml by walking up from process.cwd()
// at request time; the file tracer cannot follow that walk, so Vercel functions shipped without it (500 "not found above
// /var/task/apps/web"). Trace from the repo root (the same walk, run here at build time) and add the file to every server trace.
// Keys are route globs (picomatch, `contains`), values are globs resolved from this project dir (next 16.4.5
// dist/build/collect-build-traces.js:476-490, dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md:82-160;
// `next build` here is Turbopack, which applies the same option natively). Static pages carry no trace and read repo files only at build time. scripts/check-trace.mjs asserts the result after `next build`.
function repoRoot(start: string): string {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "packages", "config", "config.yaml"))) return dir;
    if (dirname(dir) === dir) throw new Error(`next.config: packages/config/config.yaml not found above ${start}`);
  }
}
const RUNTIME_REPO_FILES = ["../../packages/config/config.yaml"];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: repoRoot(process.cwd()),
  outputFileTracingIncludes: { "/**": RUNTIME_REPO_FILES },
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
    // APP /docs → the docs deployment WITH the /docs prefix kept (WO-34t; F-433/F-434): since WO-34s the docs deployment serves
    // its pages under /docs/* itself (its vercel.json rewrites /docs/ → / and /docs/:path* → /:path* onto the flat build, F-393),
    // and its bare / will redirect to /docs/. Proxying to ${DOCS_ORIGIN}/ would loop on that redirect, so the APP never asks for /.
    // Its pages reference /docs/assets/…, which this same rule serves. beforeFiles beats app/docs/page.tsx (local mode only).
    // No docs deployment (local single-host mode): every /docs/<slug> link (legal pages, landing) gets the in-app docs explainer
    // instead of a 404.
    if (!hosts || !DOCS_ORIGIN) return [{ source: "/docs/:path+", destination: "/docs" }];
    // `has: host` is matched against the hostname with the port stripped (next/dist/shared/lib/router/utils/prepare-destination.js).
    const has = [{ type: "host" as const, value: new URL(hosts.app).hostname.replace(/\./g, "\\.") }];
    return {
      beforeFiles: [
        { source: "/docs", destination: `${DOCS_ORIGIN}/docs/`, has },
        { source: "/docs/:path*", destination: `${DOCS_ORIGIN}/docs/:path*`, has },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default config;
