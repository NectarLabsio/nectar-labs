# WO-60 — researcher — facts for custom hosts, mock faucet, oracle refresher, demo account (< 90 min; commit `docs: FACTS — WO-60 hosts, faucet, refresher, demo account`)
Write only docs/FACTS.md (new F-ids after the highest; CONFLICTS for any disagreement). Primary URLs or installed `--help`/source, read this session, dated.
Context: Kunal's decisions 2026-11-12 (docs/STATE.md top). Hosts: nectarlabs.io = site · docs.nectarlabs.io = docs · status.nectarlabs.io = status ·
testnet.nectarlabs.io = app · www → apex. Config: packages/config/config.yaml `site.production_hosts`, `faucet`, `ops.oracle_refresher`.

1. Vercel project-domain redirect (`redirect` + `redirectStatusCode: 308`): are path and query preserved? Can a `*.vercel.app` project domain, including the
   project's auto-generated default domain, be set to redirect to a custom domain? Exact REST call to change an existing project domain.
2. Record as LIVE (re-run yourself with `dig`): nectarlabs.io is in team kunals-projects-35d3a237 (Vercel DNS zone, system ALIAS records for `@` and `*`);
   project domains attached 2026-11-12 ~19:30Z: web prj_LDWS… nectarlabs.io, testnet., status., www. (308 → apex); docs prj_3HZc… docs.;
   `dig @ns1.vercel-dns.com` answers A for all five; note whether public resolvers answer now. No DNS record is needed from Kunal (H-DNS).
3. Docusaurus (installed version in apps/docs-site/package.json): `baseUrl: "/"` + `url: https://docs.nectarlabs.io`; trailingSlash; sitemap and robots;
   static deploy on Vercel with `cleanUrls`; vercel.json `redirects` (`permanent: true` → 308?) for old `/docs/*` paths on the docs origin.
4. Next.js (installed apps/web version): host-based 308 redirects (middleware/proxy file name in this major version, `NextResponse.redirect(url, 308)`;
   `next.config` `redirects()` with `has: [{type: "host"}]`, `permanent: true` status), `metadataBase`/canonical, `sitemap.ts`/`robots.ts`.
5. Wallet sign-in on a custom origin: list the wallet modules apps/web uses and whether any needs the origin allowlisted (e.g. a WalletConnect
   projectId domain allowlist, wallet callback origins). If a human dashboard step is needed, say exactly which.
6. near CLI (installed `near --version`, from `--help`): exact syntax for (a) add a function-call key with allowance, receiver, method names and a
   manually provided public key, signed with the keychain; (b) create a sub-account funded by its parent with a manually provided public key;
   (c) code-only deploy (`without-init-call`); (d) `call-function as-transaction` with an attached deposit. Re-check C-004 / F-016 / F-020.
7. NEAR seed phrases: BIP39 12 words, path m/44'/397'/0' (ed25519, SLIP-10) as MyNearWallet / Meteor import them. Which library is installed in this
   workspace (grep node_modules: near-seed-phrase, @near-js/crypto, bip39, @scure/bip39, ed25519-hd-key) and its exact API names.
8. Official NEAR testnet faucet for gas: re-verify F-154 (near-faucet.io) on docs.near.org today.
9. NEP-141 `ft_mint` event JSON (nomicon): exact standard/version/event/data fields.
10. Railway: a worker service with a volume and no public domain; whether Railway cron schedules fit a 60 s tick (minimum interval).
Report ≤ 40 lines: F-ids, anything contradicting PRD/CLAUDE.md/config, any human step. NO Co-Authored-By. DISK RULE: no pnpm install in a worktree.
