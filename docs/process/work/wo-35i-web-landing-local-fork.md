# WO-35i — web — landing chains section: "local fork" after hydration (failed check, post-freeze) (< 45 min; commit `fix(web): landing chains copy says local fork after hydration`)
Write only apps/web/. Source: docs/EVIDENCE.md "WO-34 production (release 3974b5b)" FAIL (WO-34v2). Kunal: the landing section about Base "must say
'local fork' on the page itself".
Found: apps/web/components/landing/Landing.tsx ~598–628. The server HTML renders "A Base local fork holds the stock." but after hydration the client-side
feature flags (`base` false on production) switch the heading to "Solana holds the stock."; steps "03 Sign" and "04 Settle" mention Base with no
qualifier ("secp256k1 (Base)", "Base checks EIP-712"). Crawlers and users see different headings (hydration-dependent claims).
1. Server and client must render the same claims: decide the chain flags on the server (or render one deterministic text) so the hydrated page equals the
   server HTML for this section. No claim may depend on hydration timing.
2. Every Base mention in this section (heading, intro, node, steps 03/04, art labels/alt text) says "Base Sepolia local fork" / "Base local fork"
   while the Base leg is a local fork (D-026). Solana copy unchanged ("devnet, round trip verified" only while EVIDENCE shows G7 PASS — already wired).
3. Check in a real hydrated browser (Playwright, PW_CHANNEL=chrome, own port): after hydration, the section text contains "local fork" in every sentence
   that names Base, and the visible text equals the server HTML text for the section. Update/extend the landing/design-app e2e expectation accordingly.
Tests: `pnpm verify:quick` 0; `pnpm --filter web build` + check-trace 0; the landing/design-app/screens specs pass. DISK RULE: do NOT pnpm install in your
worktree; symlink node_modules from /Volumes/T7/nectar-labs (root + apps/web + packages/*) if missing, never stage the symlinks.
NO Co-Authored-By. Never --no-verify. Report ≤ 6 lines with file:line and the hydrated-text check output.
