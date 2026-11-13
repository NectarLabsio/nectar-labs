# WO-89 — Part A of Kunal's full brief (2026-11-13 ~18:35Z): README, idea, X thread. Docs only; done by 20:30Z. Replaces the headings-only version.
Write only README.md, docs/SUBMISSION.md, docs/X_POST.md (+ docs/media/screens/ placeholders are NOT created now — screenshots land after the takes).
Goal: a judge or the Claude Code/Codex screener understands the product, tries it and sees exactly what NEAR does, in under 2 minutes. No marketing.
README, first screen first:
1. One line: what Nectar is, who it's for. Screenshot 3 below it (slot `<!-- screen-3 -->`). Then the problem in 3 plain sentences.
2. "60-second path": a table "Do this | You should see" on https://testnet.nectarlabs.io: Get test assets → borrow with Weekend Shield → limit and health → explorer link.
   Then the agent: one command → 402 → pays 0.01 mock USDC → 200 with N rows (N from EVIDENCE/the latest recorded run). Screenshots 2, 4 and 6 in the table
   (slots `<!-- screen-2 -->`, `<!-- screen-4 -->`, `<!-- screen-6 -->`).
3. "How NEAR is used, concretely": numbered; each item names the exact contract, method or standard and links a testnet tx checked on chain, or names the test:
   - nectar-core-v2 escrows quotes and enforces each loan's limit;
   - NEP-141 ft_transfer_call deposits;
   - NEP-171 Position Notes, where move_note moves the loan's rights;
   - NEP-297 events read by the Feed;
   - x402 with NEP-366 SignedDelegate;
   - the function-call key limited to update_owner_price, with its on-chain record;
   - the OutLayer TEE quoter, only if EVIDENCE verifies it;
   - 1Click quotes as read-only reference (no Intents testnet, Q-007);
   - the Base leg, on a local fork.
4. "What is real, what is mock": contract, wallet, faucet, Feed, oracle (owner, refreshed by a scoped key), market makers = our demo accounts, collateral = mock NVDAx,
   Base = local fork.
5. "What this does not prove": short and honest.
6. "What we set out to prove, and the result": claim | result | evidence, in product language (e.g. "An escrowed quote raises the borrow limit | $X → $Y | tx").
   No gate IDs (G#, WO-, H-, F-, §) anywhere in the README.
7. "Next": 3 concrete steps from PRD/STATE (e.g. real market makers on testnet, replacing the owner oracle, audit before mainnet). Nothing invented.
8. Then: commands table, run locally, architecture, Prior work (H12 text), libraries (Q-005), "Our other project" if H10 lists one (Q-015: H10 says Nectar Labs is the
   only project → omit), license. The README links docs/process/ once (the folder is created in Part B; link it now as docs/process/).
Writing rules, all files:
- Every factual sentence has evidence (EVIDENCE.md or a tx checked on chain), or it goes.
- Deployed numbers only. "Testnet" and "mock collateral" stated wherever a reader could assume otherwise.
- Never "insurance", "without liquidations", "live" without evidence, "powered by NEAR".
- Banned words: seamless, revolutionary, game-changing, unlock, empower, leverage (as a verb), robust, cutting-edge, next-generation, innovative, effortless,
  supercharge, harness, delve. No emoji. No sentence another project could paste unchanged.
- Name: "Kunal", no surname.
SUBMISSION idea (20–2000 chars): problem (2 sentences) → what Nectar does (3) → NEAR's role (4 concrete points) → real vs mock → how to try (URL + one command).
It must match the README.
X_POST.md: start from this draft, verify every claim, keep post 1 ≤ 280 chars, video in post 1, screenshot 3 in post 2, screenshot 6 in post 3:
  1/ Stock market closed for the weekend? Lenders lose their price, so they cut your limit or sell your shares.
  Nectar: market makers escrow buy quotes on-chain, so you can borrow against tokenized stocks all weekend.
  Built at NEAR HACKATHON on testnet. @NEARProtocol #NEARHackathon
  2/ What NEAR does here:
  - one Rust contract escrows the quotes and enforces each loan's limit
  - each loan is an NFT (NEP-171): transfer it and the loan moves with it
  - agents pay for data over x402 with NEP-366 meta-transactions
  - our price bot's key can call one method only
  3/ Try it (testnet, mock assets, no value): https://testnet.nectarlabs.io
  Code: <repo URL>   (= https://github.com/NectarLabsio/nectar-labs)
  Market makers: what notice period would you commit to on a weekend quote?
Checks: `pnpm verify:quick` 0; branding check 0; every URL you add answers (curl -sI); every tx hash verified on testnet RPC. Never pnpm install; no node_modules
directory in the worktree (symlink only). NO Co-Authored-By. Report ≤ 10 lines (first-screen line count, idea chars, post lengths, tx hashes verified, claims dropped).
