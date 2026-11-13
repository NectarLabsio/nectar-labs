# WO-82 — docs — Kunal's H10 / H12 / H14 answers (2026-11-13 ~15:20Z) (< 30 min; commit `docs: H10 H12 H14 (Kunal) (WO-82)`)
Write only README.md, README.template.md, docs/SUBMISSION.md, docs/HUMAN_HANDOFF.md, apps/docs-site/docs/project/team.md, apps/docs-site/docs/project/prior-work.md.
Kunal's replies, verbatim:
- H10: `team: Kunal | projects: 1 | lead: Kunal | email: kunal@nectarnetwork.fun | size: 1`. "Use "Kunal" with no surname everywhere: SUBMISSION leadName, README Team,
  the docs team page and Prior work." → leadName `Kunal`, email `kunal@nectarnetwork.fun`, size `1`; README Team = Kunal (Nectar Network), drop TODO-H10; docs team page row
  "Kunal". Remove the surname from every listed place (README.md:164,:174; README.template.md:50; docs-site team.md:13, prior-work.md:11; SUBMISSION.md:15,:65).
  projects: 1 = one other project (Q-015 allows ≤ 2 per person and per email) — record it as Kunal wrote it.
- H12 (edited, use EXACTLY): "Before the hackathon, Kunal researched exit-liquidity gaps for tokenized stocks under Nectar Network (an October 2026 product brief and
  Stellar Community Fund #42 material). That research and the Nectar brand assets (logo, colour tokens) are the baseline. Nectar Network's separate Stellar testnet
  product shares no code with this repository. All code, contracts, programs, services and sites here were written during the hackathon window, starting 2026-11-09."
  → README "Prior work" body (heading loses "draft, approve TODO-H12"), README.template.md, docs-site prior-work.md baseline paragraph, SUBMISSION.md:65 quote.
- H14: `kunal-drall.near | consent yes` → SUBMISSION nearAddress `kunal-drall.near` (matches HACKATHON.md:155 regex), consent `true` (Kunal agreed to the verbatim
  notice). HUMAN_HANDOFF H10, H12, H14 → DONE with the replies.
Then: `node scripts/build-submission.mjs --dry-run` (dry run ONLY) and report every remaining TODO-H (expected: H3 demoUrl only); `pnpm --filter docs-site build` exit 0;
`pnpm verify:quick` 0; branding check 0. Symlink node_modules. NO Co-Authored-By. Report ≤ 8 lines.
