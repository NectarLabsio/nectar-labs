import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// Analytics (D-006, F-090). Default OFF. Vendor is HUMAN decision H4.
// - Only production builds can enable it (same NODE_ENV check the official gtag plugin uses).
// - Nothing loads until the visitor clicks "Accept analytics": src/theme/Root.tsx injects the
//   script after consent. We deliberately do NOT use the preset's `gtag` option, because that plugin
//   injects gtag.js into every page head unconditionally in production
//   (@docusaurus/plugin-google-gtag 3.10.2 lib/index.js, read 2026-11-10).
declare const process: { env: Record<string, string | undefined> };
const isProd = process.env.NODE_ENV === 'production';
const requested = process.env.DOCS_ANALYTICS ?? 'off'; // off | ga4 | plausible
const analytics = isProd && (requested === 'ga4' || requested === 'plausible') ? requested : 'off';
const ga4Id = process.env.DOCS_GA4_ID ?? ''; // TODO-H4: GA4 measurement id; empty keeps GA4 off
const plausibleDomain = process.env.DOCS_PLAUSIBLE_DOMAIN ?? ''; // TODO-H4/H5: empty keeps Plausible off

// Hosting (WO-34, D-030). The docs are served at APP_URL + /docs: `baseUrl: '/docs/'` with docs
// `routeBasePath: '/'` gives /docs/<slug> (F-391). `url` is the public origin only, no path (F-391), so
// DOCS_ORIGIN_URL is the APP origin (for example https://ac.nectarlabs.io), NOT the docs deployment's own
// host (web's DOCS_ORIGIN, the rewrite target). Fallbacks: the origin of DOCS_URL, then local.
// The build output is flat, with no /docs folder (F-393): the APP rewrite `/docs/:path*` -> `<docs deployment>/:path*`
// strips the prefix. Locally `pnpm --filter docs-site serve` honours baseUrl (http://localhost:3000/docs/).
// apps/docs-site/vercel.json: "cleanUrls": true serves a/b.html at /a/b (F-428), read from the docs rootDirectory (F-430); trailingSlash unset (F-429);
// the orchestrator ships it as an inline stub because Vercel reads it before install. Its two rewrites (WO-34s) let the docs deployment, opened
// directly, serve the same /docs/* URLs the pages reference: `/docs/` -> `/` (the baseUrl home link; `/docs/:path*` does not match a trailing
// slash, F-433), then `/docs/:path*` -> `/:path*` (assets and /docs/<slug>). The filesystem is checked first, so flat files are never shadowed (F-434);
// how cleanUrls resolves a rewrite destination is confirmed live (F-435). Read it directly at <docs host>/docs/; its bare root is not an entry point.
// No `/` -> `/docs/` redirect: the APP proxies `/docs` to the docs root `/`, so that redirect would loop.
const originOf = (u: string | undefined): string | undefined => (u ? new URL(u).origin : undefined);
const ORIGIN = originOf(process.env.DOCS_ORIGIN_URL) ?? originOf(process.env.DOCS_URL) ?? 'http://localhost:3000';
// Web app links. Hosted: APP_URL (TODO-H-DOMAIN; *.vercel.app if H-DOMAIN is silent). Local: `pnpm --filter web dev`.
const APP = originOf(process.env.APP_URL) ?? (process.env.DOCS_ORIGIN_URL || process.env.DOCS_URL ? ORIGIN : 'http://localhost:3100');
// TODO-H2: public repo URL. Empty (the default while the repo is private) hides every GitHub link.
const REPO = (process.env.REPO_URL ?? '').replace(/\/+$/, '');
const github = <T,>(item: T): T[] => (REPO ? [item] : []);

const config: Config = {
  title: 'Nectar Labs',
  tagline: 'Committed liquidity, verifiable settlement.',
  favicon: 'img/favicon.png',
  url: ORIGIN,
  baseUrl: '/docs/',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  // Mermaid theme is not enabled: with 3.10.2 the client bundle fails to resolve the optional peer
  // `@mermaid-js/layout-elk` (build error 2026-11-10). Diagrams are plain-text sequences instead.
  markdown: { hooks: { onBrokenMarkdownLinks: 'throw' } },
  i18n: { defaultLocale: 'en', locales: ['en'] },
  customFields: {
    analytics,
    ga4Id: analytics === 'ga4' ? ga4Id : '',
    plausibleDomain: analytics === 'plausible' ? plausibleDomain : '',
  },
  presets: [[
    'classic',
    {
      docs: {
        sidebarPath: './sidebars.ts',
        routeBasePath: '/',
        exclude: ['**/._*'],
      },
      blog: {
        routeBasePath: 'changelog',
        blogTitle: 'Changelog',
        blogDescription: 'One entry per tagged release of Nectar Labs.',
        blogSidebarTitle: 'Releases',
        showReadingTime: false,
        onInlineAuthors: 'ignore',
        onUntruncatedBlogPosts: 'ignore',
        exclude: ['**/._*'],
      },
      pages: false,
      theme: { customCss: './src/css/custom.css' },
      sitemap: { changefreq: 'weekly', priority: 0.5 },
    } satisfies Preset.Options,
  ]],
  plugins: [[
    '@easyops-cn/docusaurus-search-local',
    { hashed: true, docsRouteBasePath: '/', indexBlog: false, highlightSearchTermsOnTargetPage: false },
  ]],
  themeConfig: {
    colorMode: { defaultMode: 'dark', respectPrefersColorScheme: false },
    image: 'img/lockup-dark.png',
    metadata: [{ name: 'robots', content: 'index,follow' }],
    navbar: {
      title: '',
      logo: { alt: 'Nectar Labs', src: 'img/lockup-light.png', srcDark: 'img/lockup-dark.png', height: 28 },
      items: [
        { type: 'docSidebar', sidebarId: 'docs', label: 'Docs', position: 'left' },
        { to: '/start/live-on-testnet', label: 'Status', position: 'left' },
        { to: '/changelog', label: 'Changelog', position: 'left' },
        { href: `${APP}/feed`, label: 'Feed', position: 'right' },
        ...github({ href: REPO, label: 'GitHub', position: 'right' as const }),
      ],
    },
    footer: {
      style: 'dark',
      logo: { alt: 'Nectar Labs', src: 'img/lockup-light.png', srcDark: 'img/lockup-dark.png', height: 24 },
      links: [
        { title: 'Products', items: [
          { label: 'Nectar Labs', href: APP }, { label: 'Nectar Feed', href: `${APP}/feed` },
          { label: 'Keepers', href: `${APP}/keepers` }, { label: 'Post a quote', href: `${APP}/quote/new` } ] },
        { title: 'Protocols', items: [
          { label: 'NEAR', href: 'https://near.org' }, { label: 'Solana', href: 'https://solana.com' },
          { label: 'Chain Signatures', href: 'https://docs.near.org/chain-abstraction/chain-signatures' },
          { label: 'OutLayer', href: 'https://outlayer.fastnear.com/docs/getting-started' }, { label: 'NEAR Intents', href: 'https://docs.near-intents.org/' } ] },
        { title: 'Build', items: [
          { label: 'Docs', to: '/' }, { label: 'SDK', to: '/integrate/sdk' }, { label: 'Feed MCP', to: '/integrate/feed-mcp' },
          ...github({ label: 'GitHub', href: REPO }), { label: 'Status', to: '/start/live-on-testnet' } ] },
        { title: 'Resources', items: [
          { label: 'Whitepaper', to: '/concepts/whitepaper' }, { label: 'Security', to: '/security/trust-model' },
          { label: 'Changelog', to: '/changelog' }, { label: 'Brand assets', to: '/project/brand' },
          { label: 'Evidence', to: '/project/evidence' } ] },
        { title: 'Company', items: [
          { label: 'About', to: '/' }, { label: 'Talk to us', href: 'mailto:kunal@nectarnetwork.fun' },
          { label: 'Team', to: '/project/team' }, { label: 'kunal@nectarnetwork.fun', href: 'mailto:kunal@nectarnetwork.fun' } ] },
        { title: 'Legal', items: [
          { label: 'Privacy', to: '/legal/privacy' }, { label: 'Cookies', to: '/legal/cookies' },
          { label: 'Terms', to: '/legal/terms' }, { label: 'Disclaimers', to: '/legal/disclaimers' },
          { label: 'Cookie settings', to: '/legal/cookies#cookie-settings' } ] },
      ],
      copyright: 'Committed liquidity, verifiable settlement.<br/>© 2026 Nectar Network · MIT License · testnet software · mock collateral',
    },
    prism: { additionalLanguages: ['rust', 'bash', 'json', 'toml', 'yaml'] },
  } satisfies Preset.ThemeConfig,
};
export default config;
