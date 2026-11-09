---
title: Upgrades
slug: /operations/upgrades
description: How the contract changes, now and in production.
---
# Upgrades

<p className="verified">Verified against: F-011 (2026-11-10), F-017 (2026-11-10), F-027 (2026-11-10) · spec docs/PRD.md §16.5</p>
<p className="status">Status: P0 deployed on NEAR testnet 2026-11-09 (G2 PASS 2026-11-09T20:55Z, commit 5f27f44); upgrades are redeploys on the same account. PROD governance is design only.</p>

## This build (testnet)

- Build only with `cargo near build` (F-011). Plain `cargo build` for wasm lacks the `--cfg near` flag that cargo-near adds (F-027). The submitted artifact uses `reproducible-wasm`.
- Redeploy to the same account with `near contract deploy … use-file <wasm> without-init-call …` (F-017).
- Every deploy tags the git commit, bumps `contract_version()`, and is recorded on the [Evidence](/project/evidence) page.
- `Quote` and `Position` borsh layouts are versioned. A layout change ships with a sandbox migration test.

## Production (not built)

- Owner: a Sputnik DAO.
- 48 h timelock on `upsert_collateral` and on oracle-source changes. `pause` stays instant.
- Public changelog: [Changelog](/changelog).
- An audit before mainnet: see [Audits](/security/audits).
