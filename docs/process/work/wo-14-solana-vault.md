# WO-14 — solana — nectar_vault (v7 shape) + local-validator tests (< 2 h; commit `feat(solana): nectar_vault with settle and release`)
Read first: `docs/process/work/interface-v7.md` §B (binding: instructions, PDAs, preimage strings, kind codes), PRD v7 §9 and §9B (only), FACTS F-080,
F-081, F-082, F-186, F-187, C-017, and `contracts/nectar-core/tests/preimage_vectors.json` (the v1 preimage = kind 0 byte for byte).
Toolchain: Solana CLI 4.3.2 at `~/.local/share/solana/install/active_release/bin` and Anchor 0.32.1 via avm (`~/.avm/bin`); export both on PATH,
plus SDKROOT = the MacOSX26 SDK (scripts/_lib.sh quirk). If 4.3.2 cannot build or test Anchor 0.32.1, pin `[toolchain] solana_version = "2.3.0"` in
Anchor.toml (C-017) and say which pair worked.

Build `solana/` (Anchor workspace, program `nectar_vault`): `init_vault`, `open_position`, `settle` (kind 0 legacy / 1 PRELIQ / 2 SELF), `release`.
There is no `cancel_position`. Use the Instructions sysvar via `solana-instructions-sysvar` (F-082; the anchor re-export is deprecated). Verify the immediately
preceding instruction is the Ed25519 program with num=1, all three instruction indexes = u16::MAX, and pubkey == position.authority,
message == the rebuilt bytes, and the signature bytes as passed. Nonce PDA per (vault, nonce). `expires` is checked against Clock unix_timestamp.

Tests (`anchor test` on solana-test-validator; a local Ed25519 keypair stands in for the MPC key):
- happy paths: settle kind 0 with a vector from preimage_vectors.json rebuilt on-chain; settle kind 1; release after open;
- negative: wrong message, missing verify ix, verify ix not immediately preceding, wrong authority, replayed nonce, expired, release with a
  settlement signature, release replayed, settle with a release signature, kind mismatch (a kind 1 signature presented as kind 0).
A TS helper in `solana/tests/` builds the F-082 Ed25519 instruction bytes by hand (F-186: kit has no helper). WO-16 reuses it, so export it from
`solana/client/ed25519.ts`.
No devnet deploy in this WO: the orchestrator deploys with scripts after merge. Leave `solana/deploy.md` with the exact commands (anchor build,
program id sync, `anchor deploy --provider.cluster devnet`).
Report ≤ 20 lines: instruction list, test counts (positive and negative), the toolchain pair that worked, program size, anything contradicting FACTS.
