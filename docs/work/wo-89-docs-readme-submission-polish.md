# WO-89 — docs — README + submission polish (Kunal 2026-11-13 ~18:30Z; built from his headings — the full brief never arrived) (finish by 20:30Z)
Docs only. Write only README.md, docs/SUBMISSION.md, docs/X_POST.md. No product, no apps/, no deploys. Every number, status and tx hash must come from docs/EVIDENCE.md
(cite the section) or be checked now on testnet RPC (`tx` status SuccessValue) — never invent. Copy rules: never "insurance", never "without liquidations", "live"
only where EVIDENCE shows it; testnet + mock collateral stated plainly; no hype words ("revolutionary", "seamless", "unlock"); no "Introducing". README stays
truthful and keeps Kunal's H12 Prior work text and "Kunal" (no surname). Don't touch the "Hosted demo" production facts except to link to them.
README (keep the first 40 lines sharp: one-line summary, what it is, the 60-second path, how NEAR is used — Kunal reviews lines 1–40 in the morning):
1. **60-second path** table for judges: step · URL (https://nectarlabs.io, https://testnet.nectarlabs.io/feed, /feed/NVDAx, /borrow + "Get test assets", a position
   page, https://docs.nectarlabs.io, https://status.nectarlabs.io) · what you see · ~seconds. Leave image slots `<!-- screen-2 -->`, `<!-- screen-4 -->`,
   `<!-- screen-6 -->` in the rows for market, position and agent (screenshots land after tonight's takes, WO-35), and `<!-- screen-3 -->` right under the one-line summary.
2. **How NEAR is used, concretely**: bullet list, each with one real testnet tx link (https://testnet.nearblocks.io/txns/<hash>): contract calls on nectar-core-v2
   (position open / quote / repay from EVIDENCE), the owner-oracle refresh by a function-call key limited to update_owner_price (De6aVqqNvfyemXtpuGP6quaUNcZgN2xP6cCXHXEwvfZG;
   key-add BHopF1cuKAMDFoCnKyNZPPKR3qVPgs5dYiKxx6jwWpao), mock-ft faucet mints (FpZ1RLFDLeYFARbAX2xcvux79mDt2DRHfdEKaY42ubkF, 2Dkw3rd2Bz475W87fuhKx9r7hw61d6DcjFPCQ73HETv6),
   x402 paid call settled on NEAR (8bXCY34SVYv5b7vJ4GLfWkbJtQdqbSSBJsrzPCE75XRk), chain signatures / Solana leg and Base local fork only as EVIDENCE states them.
   Verify each hash on RPC before citing.
3. **Real vs mock** table: component · real on testnet / mock / local fork / fallback · evidence link (collateral = mock NVDAx; USDC = mock; oracle = owner oracle +
   refresher; Base = local fork of Base Sepolia; Solana = devnet; quoter/OutLayer, 1Click dry quotes, Feed, keeper, x402 — exactly as EVIDENCE says).
4. **What this does not prove**: short honest list (no mainnet, mock collateral, not audited, owner oracle not a market price feed, committed liquidity from test
   accounts, local-fork Base, anything EVIDENCE marks FALLBACK/SELF-ATTESTED).
5. **Results** table: gates G0–G14 + G3b/G9 latest status from EVIDENCE's summary table (status · last run · commit).
6. **Next**: 3–5 bullets, plain, no dates promised beyond what Kunal stated (main frozen until 2026-11-18T23:59Z; hosted until ≥ 2026-11-25).
SUBMISSION.md: the `idea` block (20–2000 chars; HACKATHON.md:51 "the problem, the product, and how NEAR fits in") rewritten to match the README sections above; count
chars. X_POST.md: the thread draft — post 1 with the video (captioned 1280×720), posts 2 and 3 with screenshots 3 and 6 (1600×900 JPG, WO-35), repo + app links;
check every post against HACKATHON.md §"2. The demo post" (built at NEAR HACKATHON, @NEARProtocol, #NEARHackathon, length rules); keep TODO-H3 only where the post URL goes.
Checks: `pnpm verify:quick` 0; branding check 0; markdown links resolve (curl -sI the URLs you add). Symlink node_modules; never pnpm install. NO Co-Authored-By.
Report ≤ 10 lines: README line count of the first section, idea char count, thread post lengths, tx hashes verified.
