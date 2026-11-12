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

// Hosting (WO-64). The docs are served at the root of their own host, DOCS_URL (https://docs.nectarlabs.io, config.yaml
// site.production_hosts; DNS live F-458). `baseUrl: '/'` with docs `routeBasePath: '/'` gives /<slug>, home `/` (F-459, from F-391);
// `url` is the origin only, no path (F-391), so the sitemap <loc> and the canonical are DOCS_URL + route (F-392). DOCS_URL unset (local):
// `pnpm --filter docs-site start|serve` on http://localhost:3000/.
// apps/docs-site/vercel.json (read from the docs rootDirectory, F-430; the orchestrator ships it as an inline stub because Vercel reads it
// before install): "cleanUrls": true serves a/b.html at /a/b and 308s the .html form (F-428; `trailingSlash: false` writes <path>.html, F-392).
// Old links on this host from the /docs era: permanent (308) redirects `/docs` and `/docs/` -> `/` (`/docs/:path*` does not match the trailing
// slash, F-433) and `/docs/:path*` -> `/:path*`, query passed through (F-437). Redirects run before the filesystem
// (F-438/F-453); the build has no /docs folder, so nothing is shadowed. The old `/` -> `/docs/` redirect and both /docs rewrites are gone:
// kept next to a `/docs/` -> `/` redirect they would loop (F-459). Old links on the app and landing hosts are 308ed to DOCS_URL by apps/web.
// Platform docs hosts (WO-65): host-scoped permanent redirects (`has: [{type: "host"}]`, F-456; F-457: no project-domain redirect for them) send
// both to DOCS_URL with the path kept (`/` and `/docs/<path>` in one hop). Listed first, so they win over the `/docs` rules.
// Headers (F-452): source `/(.*)` sets X-Frame-Options DENY, `Content-Security-Policy: frame-ancestors 'none'`, X-Content-Type-Options nosniff,
// Referrer-Policy strict-origin-when-cross-origin. No script/style CSP directives (Docusaurus inline scripts). Headers sit after redirects and
// before the filesystem (F-453, derived), so the 308 responses probably carry none (not tested live; check `curl -sI` after deploy).
const originOf = (u: string | undefined): string | undefined => (u ? new URL(u).origin : undefined);
const hosted = Boolean(process.env.DOCS_URL);
const DOCS = originOf(process.env.DOCS_URL) ?? 'http://localhost:3000';
// Other hosts. Hosted: SITE_URL, APP_URL, STATUS_URL; if one is missing, the production host from config.yaml site.production_hosts.
// Local (DOCS_URL unset): `pnpm --filter web dev` on http://localhost:3100 serves landing, app and /status on one host.
const PROD = { site: 'https://nectarlabs.io', app: 'https://testnet.nectarlabs.io', status: 'https://status.nectarlabs.io' };
const APP = originOf(process.env.APP_URL) ?? (hosted ? PROD.app : 'http://localhost:3100');
const SITE = originOf(process.env.SITE_URL) ?? (hosted ? PROD.site : APP);
// STATUS_URL serves the status page at its root; unset, the page stays on the landing host at /status (apps/web WO-62b).
const STATUS = originOf(process.env.STATUS_URL) ?? (hosted ? PROD.status : `${SITE}/status`);
// The legal pages (docs/legal/*.md) are also rendered by apps/web at /legal/<slug>, so they link docs pages as `/docs/<slug>`: on the app
// and landing hosts that path is 308ed to DOCS_URL (hosted) or answered by the in-app /docs page (local). Here the prefix is dropped
// before the links are resolved, so onBrokenLinks still checks every target.
interface MdNode { type: string; url?: string; children?: MdNode[] }
const DOCS_PREFIX = /^\/docs(?=[/#?]|$)/;
const dropDocsPrefix = () => (tree: MdNode): void => {
  const walk = (n: MdNode): void => {
    if ((n.type === 'link' || n.type === 'definition') && n.url && DOCS_PREFIX.test(n.url)) {
      const rest = n.url.replace(DOCS_PREFIX, '');
      n.url = rest.startsWith('/') ? rest : `/${rest}`;
    }
    n.children?.forEach(walk);
  };
  walk(tree);
};
// TODO-H2: public repo URL. Empty (the default while the repo is private) hides every GitHub link.
const REPO = (process.env.REPO_URL ?? '').replace(/\/+$/, '');
const github = <T,>(item: T): T[] => (REPO ? [item] : []);

const config: Config = {
  title: 'Nectar Labs',
  tagline: 'Committed liquidity, verifiable settlement.',
  favicon: 'img/favicon.png',
  url: DOCS,
  baseUrl: '/',
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
        beforeDefaultRemarkPlugins: [dropDocsPrefix],
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
        { href: STATUS, label: 'Status', position: 'left' },
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
          { label: 'Nectar Labs', href: APP }, { label: 'Nectar Feed', href: `${APP}/feed` }, { label: 'Status', href: STATUS },
          { label: 'Keepers', href: `${APP}/keepers` }, { label: 'Post a quote', href: `${APP}/quote/new` } ] },
        { title: 'Protocols', items: [
          { label: 'NEAR', href: 'https://near.org' }, { label: 'Solana', href: 'https://solana.com' },
          { label: 'Chain Signatures', href: 'https://docs.near.org/chain-abstraction/chain-signatures' },
          { label: 'OutLayer', href: 'https://outlayer.fastnear.com/docs/getting-started' }, { label: 'NEAR Intents', href: 'https://docs.near-intents.org/' } ] },
        { title: 'Build', items: [
          { label: 'Docs', to: '/' }, { label: 'SDK', to: '/integrate/sdk' }, { label: 'Feed MCP', to: '/integrate/feed-mcp' },
          ...github({ label: 'GitHub', href: REPO }), { label: 'Live on testnet', to: '/start/live-on-testnet' } ] },
        { title: 'Resources', items: [
          { label: 'Whitepaper', to: '/concepts/whitepaper' }, { label: 'Security', to: '/security/trust-model' },
          { label: 'Changelog', to: '/changelog' }, { label: 'Brand assets', to: '/project/brand' },
          { label: 'Evidence', to: '/project/evidence' } ] },
        { title: 'Company', items: [
          { label: 'About', href: `${SITE}/about` }, { label: 'Talk to us', href: 'mailto:kunal@nectarnetwork.fun' },
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
