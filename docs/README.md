# Docs index

Start with the [README](../README.md). The published docs site is https://docs.nectarlabs.io (source: [apps/docs-site](../apps/docs-site)).

## Product and evidence

| File | What it is |
| --- | --- |
| [EVIDENCE.md](EVIDENCE.md) | every gate run and production check: command, output, verdict, commit, links. Written by the verifier only |
| [../evidence/README.md](../evidence/README.md) | what each folder under `evidence/` holds and which README claim it supports |
| [FACTS.md](FACTS.md) | every protocol, SDK, CLI and API fact the code relies on, each with a date and a primary source |
| [RUNBOOK.md](RUNBOOK.md) | operations and incidents for the testnet deployment |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | the 2-minute demo on the hosted testnet app |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | colours, type and logo files used by the web app and docs |
| [img/](img/) | older architecture and settlement diagrams (the README's Mermaid diagram is current) |
| [media/screens/](media/screens/) | README screenshots |
| [ui/](ui/) | UI reference captures |
| [../SECURITY.md](../SECURITY.md) | disclosure policy, internal reviews, known limitations |

Component docs: [services/feed](../services/feed/README.md), [services/keeper](../services/keeper/README.md), [services/x402](../services/x402/README.md).

## Hackathon submission

| File | What it is |
| --- | --- |
| [SUBMISSION.md](SUBMISSION.md) | the submission payload draft; only Kunal sends it |
| [process/hackathon.md](process/hackathon.md) | the hackathon rules as read on 2026-11-09 |
| [process/x-post.md](process/x-post.md) | the demo thread draft; only Kunal posts it |

## How this was built (process record, `docs/process/`)

Kept for transparency. None of it is needed to run or judge the product.

| File | What it is |
| --- | --- |
| [prd.md](process/prd.md), [prd-v6.md](process/prd-v6.md) | the product specification (v7, and the earlier v6) |
| [build-prompt.md](process/build-prompt.md), [build-prompt-v7.md](process/build-prompt-v7.md) | the build plan and its v7 addendum |
| [decisions.md](process/decisions.md) | scope-shaping decisions, ADR style |
| [state.md](process/state.md) | the build log, newest first |
| [human-handoff.md](process/human-handoff.md) | steps that needed a human, and their outcome |
| [final-report.md](process/final-report.md) | the final status audit |
| gate-fail-*.md: [G0](process/gate-fail-g0.md), [G1](process/gate-fail-g1.md), [G1 2.2.1](process/gate-fail-g1-221.md), [G11](process/gate-fail-g11.md), [G2b](process/gate-fail-g2b.md), [G3](process/gate-fail-g3.md), [G3b](process/gate-fail-g3b.md), [G3b r2](process/gate-fail-g3b-r2.md), [G3b r3](process/gate-fail-g3b-r3.md), [G6](process/gate-fail-g6.md), [G8](process/gate-fail-g8.md), [G9](process/gate-fail-g9.md), [WO67](process/gate-fail-wo67.md) | each failed gate run, what failed and how it was fixed |
| [market-task.md](process/market-task.md) | an optional task text drafted for market.near.ai, never posted |
| [work/](process/work/) | work orders, one per agent dispatch |
| [bundle-readme.md](process/bundle-readme.md) | how the seed bundle of 2026-11-09 was used (paths as they were in the bundle) |
| [readme-template.md](process/readme-template.md) | the README skeleton from the seed bundle, superseded by the README |

The process files were moved here from `docs/` and the repo root on 2026-11-13 (UTC) and renamed to kebab case; git history keeps the old names
(`git log --follow`). `CLAUDE.md` still names the old paths and is left unchanged on purpose.
