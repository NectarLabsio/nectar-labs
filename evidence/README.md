# Evidence index

Raw logs, JSON and screenshots behind [docs/EVIDENCE.md](../docs/EVIDENCE.md), which holds the verdicts. Each gate folder has one subfolder per verifier run, named by UTC time. README claims link here through the table "What we set out to prove, and the result" ([README](../README.md#what-we-set-out-to-prove-and-the-result)).

## Gates

| Folder | What it proves | README claim it supports |
| --- | --- | --- |
| [G0](G0/) | toolchain versions and exact CLI syntax | [Run locally](../README.md#run-locally) |
| [G1](G1/) | contract unit and sandbox tests, gas per change method (`gas-sandbox.csv`), wasm builds | [How NEAR is used](../README.md#how-near-is-used-concretely), items 1–3 |
| [G2](G2/) | first testnet deploy (`nectar-core`), keeper function-call key | [Deployed on testnet](../README.md#deployed-on-testnet) |
| [G2b](G2b/) | `nectar-core-v2` deploy: rebuilt wasm equals the deployed code, quoter pinned, demo quotes seeded | [Deployed on testnet](../README.md#deployed-on-testnet); escrowed quotes raise the limit |
| [G3](G3/), [G3b](G3b/) | web E2E on desktop and phone, accessibility, both themes, screenshots | [60-second path](../README.md#60-second-path) |
| [G4](G4/) | OutLayer quoter runs, the cap fallback, attestation of request 15148 | the discount stays under the cap |
| [G5](G5/) | oracle: owner fallback, staleness and confidence rejection in the sandbox | [What is real, what is mock](../README.md#what-is-real-what-is-mock) (oracle row) |
| [G6](G6/) | 1Click dry quote, never deposited | [How NEAR is used](../README.md#how-near-is-used-concretely), item 8 |
| [G7](G7/) | Solana devnet vault with Chain Signatures: deposit, release, settle; `rerun/` has loans 8, 9 and 10 after the security fixes | the limit holds; the committed buyer takes the collateral; remote collateral moves only with a NEAR signature |
| [G8](G8/) | copilot verifier on a recorded fixture | [What is real, what is mock](../README.md#what-is-real-what-is-mock) (copilot row) |
| [G9](G9/) | fresh-clone rehearsals of the README quick start | [Run locally](../README.md#run-locally) |
| [G10](G10/) | v7 facts and toolchain check | — |
| [G11](G11/) | v7 contract tests, including the re-run after the security fixes | [How NEAR is used](../README.md#how-near-is-used-concretely), item 3 (Notes tests) |
| [G12](G12/), [G13](G13/) | EVM vault on a local fork of Base Sepolia: deploy, round trip, replay refused | [How NEAR is used](../README.md#how-near-is-used-concretely), item 9 (Base leg) |
| [G14](G14/) | x402: an agent borrows, gets HTTP 402, pays 0.01 mock USDC with a signed delegate action, gets HTTP 200 | an agent can borrow and pay for data on its own |

## Production and operations

| Folder | What it holds |
| --- | --- |
| [WO-34](WO-34/) | production hosting: artifact builds and uploads, host checks |
| [WO-62b](WO-62b/), [WO-67](WO-67/), [WO-67b](WO-67b/), [WO-74](WO-74/), [WO-78](WO-78/), [WO-83](WO-83/), [WO-87](WO-87/) | production acceptance runs: smoke tests, Lighthouse, hydration and claim probes, product diffs against the deployed commit |
| [WO-71](WO-71/) | the Feed reading real `nectar-core-v2` events (version 2.0.0) |
| [WO-35](WO-35/) | demo rehearsal measurements |
| [ops](ops/) | operator runs: demo accounts, Feed re-index, owner price refresh, mock-token mints |
| [rollout](rollout/) | contract upgrade to 2.2.1, keeper restart, faucet upgrade on the mock tokens |
| [upgrades](upgrades/) | earlier contract upgrade runs |
| [solana](solana/) | Solana devnet program deploys |
| [v7-modules](v7-modules/) | testnet runs of Shields, Profit-Lock, the Reserve and capacity |
| [claims](claims/) | a snapshot of the deployed parameters |
| [C](C/) | a real faucet call |

## Module builds

[wo-10b](wo-10b/), [wo-10c](wo-10c/), [wo-12](wo-12/), [wo-15](wo-15/), [wo-21](wo-21/), [wo-29a](wo-29a/): build and test logs from individual modules while they were written.

## Scripts restored for the evidence

These scripts were removed from the tree on 2026-11-13 as unused and restored on 2026-11-14, because the logs below came from them. They need operator keys under `~/.nectar/` and are not part of the quick start.

| Script | What it ran | Logs from it, and where they are cited |
| --- | --- | --- |
| [scripts/27-base-fork.sh](../scripts/27-base-fork.sh) | `start`: an anvil fork of Base Sepolia (chain id 84532) on 127.0.0.1:8545; `fund`: fork-only balances for the EVM keystore accounts; `stop` | [G12/anvil-20261110T173327Z.log](G12/anvil-20261110T173327Z.log), [G12/fork-fund.log](G12/fork-fund.log); the fork that [G13/summary.md](G13/summary.md) and the G12/G13 rows of docs/EVIDENCE.md describe |
| [scripts/56-solana-deploy.sh](../scripts/56-solana-deploy.sh) | the devnet deploy of `nectar_vault` described in [solana/deploy.md](../solana/deploy.md): mock NVDAx mint, program keypair kept outside the repo, build, deploy, then `init_vault` through script 57 | [solana/deploy-20261110T123936Z.log](solana/deploy-20261110T123936Z.log) (first run; `init_vault` failed on a missing module), [solana/deploy-20261110T124326Z.log](solana/deploy-20261110T124326Z.log) (program `ENZaNFHo…`, vault `HGSFKMWW…`); the program the G7 rows of docs/EVIDENCE.md use |
| [scripts/57-vault-init.mjs](../scripts/57-vault-init.mjs) | `init_vault("NVDAx")` for the deployed program; called by script 56 | the `init_vault(NVDAx)` step in both logs above |

## Large files (over 1 MB)

No file under `evidence/` is over 5 MB. These are over 1 MB and are kept on purpose:

| File | Size | Why it stays |
| --- | --- | --- |
| `G1/verifier-221-20261111T135216Z/cargo-test-nectar-core.log`, `G1/verifier-221b-20261111T145956Z/cargo-test-nectar-core.log`, `G11/verifier-rerun-d027-20261111T0802Z/cargo-test-nectar-core.log` | 1.8 MB each | full gate logs: every contract test name and result behind the G1 and G11 verdicts in docs/EVIDENCE.md |
| `G3/design/home-1440-dark.png`, `G3/design/home-1440-light.png`, `G3/design/home-400-dark.png`, `G3/design/home-400-light.png`, `G3/design/console-1440-dark.png` | 1.1–3.5 MB | full-page design screenshots (both themes, desktop and phone) for the G3 design check |
| `G3/screens/home-phone-dark.png`, `G3/screens/home-phone-light.png` | 1.9 MB each | G3 phone screenshots in both themes |

Outside `evidence/`, `packages/ui/logo/source.png` (1.8 MB) is the logo master the web app and docs logos are cut from (docs/DESIGN_SYSTEM.md).

Removed from the tree on 2026-11-13 (UTC), still in git history: the raw host-grep dumps `G9/run7-20261113T123302Z/host-grep.txt` (2.8 MB) and
`WO-67/B/host-grep.txt` (1.3 MB). No README or docs/EVIDENCE.md claim links them; the filtered `host-grep-nonhistory.txt` next to each stays,
and the full dump is re-created by the command quoted in docs/EVIDENCE.md.
