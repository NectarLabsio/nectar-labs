# WO-34e2 — docs — privacy and cookies from the data inventory (< 75 min; commit `docs: privacy and cookie pages from the data inventory`)
Write only `apps/docs-site/docs/legal/{privacy,cookies}.md`, `docs/HUMAN_HANDOFF.md`. Both pages are dual-rendered: SITE `/legal/privacy` and
`/legal/cookies` (apps/web) plus the docs site. Context: docs/work/wo-34-deploy.md.

Inputs (read; do not guess):
- `apps/web/content/data-inventory.json` / `.md` from WO-34c: every third-party host per page, every cookie and storage key with purpose, lifetime and
  who sets it.
- FACTS:
  - Vercel: F-402 Hobby, F-403 logging (1 h runtime logs; path/host/UA; the IP point is inference, so say "may include").
  - Railway: F-404–F-412 (log retention 3/7/30 days by plan; privacy-policy quote).
  - D-025 RPC hosts, F-369 fallbacks.
- D-030 / D-031: what runs hosted vs local. x402 is not hosted, so the hosted site never contacts a facilitator.

1. Privacy policy, written from the inventory (not a template):
   - Who operates the site: the literal `TODO-H-LEGAL` markers for OPERATOR / COUNTRY / CONTACT.
   - What we collect: nothing server-side beyond host logs. Analytics are off (GA not configured). No cookies, if the inventory confirms that.
   - Browser storage: every key, its purpose and lifetime.
   - Each third party the browser contacts (exact hosts from the inventory) and what that party can see: RPC providers (IP, the addresses and
     transactions you query or send), the near-connect manifest host(s), wallets (they run in sandboxed iframes; what they see once you connect),
     Solana devnet RPC if contacted, and any font or CDN host.
   - Host logs: what Vercel and Railway record and keep (FACTS ids in a comment, not on the page).
   - On-chain data is public and permanent; wallet addresses and transactions are visible to anyone.
   - The three corrected privacy claims stay corrected:
     - no "private parameters read inside a TEE" promise beyond FACTS;
     - no "never joined to IPs";
     - the third-party table matches the inventory.
   - Rights and contact: `TODO-H-LEGAL`. Last-updated date.
2. Cookie page: the same keys as the inventory (name, purpose, lifetime, set by). If no cookies are set, say so plainly. Explain that the consent choice
   is stored and gates anything non-essential (today: nothing non-essential is configured).
3. Check: write a short node one-liner, or a test, in your report showing that every host in data-inventory.json appears on the privacy page. The
   production verifier fails the gate on any host not listed there.
4. HUMAN_HANDOFF:
   - H-KEYS now covers the keeper only. Drop the x402 relayer option: @fastnear/x402 needs a full-access key (F-328, C-023, D-031), so x402 stays local.
   - H-HOST: add the Railway plan facts (F-404/F-405: Free = 1 volume per project, enough for the Feed).
`pnpm --filter docs-site build` exit 0. `node scripts/check-no-branding-all.mjs` exit 0. `git merge main` first. NO Co-Authored-By. Never --no-verify.
Report ≤ 6 lines.
