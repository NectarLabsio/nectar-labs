import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// Analytics: production-only and consent-gated (src/theme/Root.tsx). Vendor is HUMAN decision H4.
const analytics = process.env.DOCS_ANALYTICS ?? 'off'; // off | ga4 | plausible
const ga4Id = process.env.DOCS_GA4_ID ?? 'G-XXXXXXX';      // TODO-H4
const plausibleDomain = process.env.DOCS_PLAUSIBLE_DOMAIN ?? 'docs.example.invalid'; // TODO-H4/H5

const config: Config = {
  title: 'Nectar Labs',
  tagline: 'Committed liquidity, verifiable settlement.',
  favicon: 'img/favicon.png',
  url: process.env.DOCS_URL ?? 'https://nectar-labs-docs.vercel.app', // TODO-H5
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  markdown: { mermaid: true },
  themes: ['@docusaurus/theme-mermaid'],
  i18n: { defaultLocale: 'en', locales: ['en'] },
  scripts: analytics === 'plausible'
    ? [{ src: 'https://plausible.io/js/script.js', defer: true, 'data-domain': plausibleDomain }]
    : [],
  presets: [[
    'classic',
    {
      docs: { sidebarPath: './sidebars.ts', routeBasePath: '/', editUrl: undefined, showLastUpdateTime: true },
      blog: { routeBasePath: 'changelog', blogTitle: 'Changelog', showReadingTime: false },
      theme: { customCss: './src/css/custom.css' },
      ...(analytics === 'ga4' ? { gtag: { trackingID: ga4Id, anonymizeIP: true } } : {}),
    } satisfies Preset.Options,
  ]],
  plugins: [[
    require.resolve('@easyops-cn/docusaurus-search-local'),
    { hashed: true, docsRouteBasePath: '/', indexBlog: false },
  ]],
  themeConfig: {
    colorMode: { defaultMode: 'dark', respectPrefersColorScheme: true },
    image: 'img/social.png',
    navbar: {
      title: '',
      logo: { alt: 'Nectar', src: 'img/mark.png' },
      items: [
        { type: 'docSidebar', sidebarId: 'docs', label: 'Docs', position: 'left' },
        { to: '/changelog', label: 'Changelog', position: 'left' },
        { href: 'https://app.example.invalid/feed', label: 'Feed', position: 'right' }, // TODO-H5
        { href: 'https://github.com/TODO-H2', label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        { title: 'Products', items: [
          { label: 'Nectar Labs', href: 'https://app.example.invalid' }, { label: 'Nectar Feed', href: 'https://app.example.invalid/feed' },
          { label: 'Keepers', href: 'https://app.example.invalid/keepers' }, { label: 'Post a quote', href: 'https://app.example.invalid/quote/new' } ] },
        { title: 'Protocols', items: [
          { label: 'NEAR', href: 'https://near.org' }, { label: 'Solana', href: 'https://solana.com' },
          { label: 'Chain Signatures', href: 'https://docs.near.org/chain-abstraction/chain-signatures' },
          { label: 'OutLayer', href: 'https://outlayer.ai' }, { label: 'NEAR Intents', href: 'https://near-intents.org' } ] },
        { title: 'Build', items: [
          { label: 'Docs', to: '/' }, { label: 'SDK', to: '/integrate/sdk' }, { label: 'Feed MCP', to: '/integrate/feed-mcp' },
          { label: 'GitHub', href: 'https://github.com/TODO-H2' }, { label: 'Status', to: '/operations/monitoring' } ] },
        { title: 'Resources', items: [
          { label: 'Whitepaper', to: '/concepts/whitepaper' }, { label: 'Security', to: '/security/trust-model' },
          { label: 'Changelog', to: '/changelog' }, { label: 'Brand assets', to: '/project/brand' },
          { label: 'Evidence', to: '/project/evidence' } ] },
        { title: 'Company', items: [
          { label: 'About', to: '/start/what-is-nectar-labs' }, { label: 'Talk to us', href: 'https://app.example.invalid/talk' },
          { label: 'X', href: 'https://x.com/TODO-H9' }, { label: 'kunal@nectarnetwork.fun', href: 'mailto:kunal@nectarnetwork.fun' } ] },
        { title: 'Legal', items: [
          { label: 'Privacy', to: '/legal/privacy' }, { label: 'Cookies', to: '/legal/cookies' },
          { label: 'Terms', to: '/legal/terms' }, { label: 'Disclaimers', to: '/legal/disclaimers' } ] },
      ],
      copyright: '© 2026 Nectar Network · MIT License · Committed liquidity, verifiable settlement.',
    },
    prism: { additionalLanguages: ['rust', 'bash', 'json', 'toml', 'yaml'] },
  } satisfies Preset.ThemeConfig,
};
export default config;
