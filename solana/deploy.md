# nectar_vault: build, test, devnet deploy

Devnet only. Never mainnet. Run these from a `scripts/` wrapper, not by hand (the orchestrator owns `scripts/`).

## Toolchain (the pair that builds and tests)
Anchor CLI 0.32.1 (avm) + Solana CLI 2.3.0 (the anchor v0.32.1 CI pin, C-017 / F-187), platform-tools v1.48 (cargo/rustc 1.84).
`Anchor.toml` pins `solana_version = "2.3.0"`. The program sets `rust-version = "1.84"` and `Cargo.lock` is committed. The lockfile was resolved with
`CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS=fallback`, the anchor crates are held at `=0.32.1`, and `blake3` at 1.8.2, because newer crates need edition2024,
which cargo 1.84 cannot parse.

```bash
export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk   # macOS (scripts/_lib.sh quirk)
cd solana
pnpm install --ignore-workspace       # solana/ is not a pnpm workspace member
pnpm run test:unit                    # cargo unit tests (preimage vectors, Ed25519 layout)
pnpm run test:anchor                  # local wallet + anchor test (build, solana-test-validator, tests/*.test.ts)
pnpm run typecheck
```
`anchor test` loads the program at the `[programs.localnet]` address, so a fresh clone with no program keypair still passes.

## Devnet deploy (orchestrator, after merge)
```bash
# 0. keys + SOL: scripts/05-solana.sh creates ~/.nectar/solana/deployer.json (0600).
#    Program data rent for the 397,240-byte .so is 2.02 SOL (`solana rent 397285`), and the deploy buffer needs the same
#    again while the deploy runs (it is refunded), so the deployer needs >= 4.1 SOL plus fees. That is three 2-SOL airdrops.
# 1. program keypair, kept outside the repo (never commit it)
[ -f ~/.nectar/solana/nectar_vault-keypair.json ] || solana-keygen new --no-bip39-passphrase -o ~/.nectar/solana/nectar_vault-keypair.json
chmod 600 ~/.nectar/solana/nectar_vault-keypair.json
mkdir -p target/deploy && cp ~/.nectar/solana/nectar_vault-keypair.json target/deploy/nectar_vault-keypair.json
# 2. program id sync: rewrites declare_id! in programs/nectar_vault/src/lib.rs and [programs.*] in Anchor.toml (commit it; it is public)
anchor keys sync
# 3. build
anchor build
# 4. deploy (devnet only)
anchor deploy --provider.cluster devnet --provider.wallet ~/.nectar/solana/deployer.json
solana program show "$(solana-keygen pubkey target/deploy/nectar_vault-keypair.json)" --url devnet
# 5. write the base58 program id to packages/config/config.yaml solana.vault_program (and remote_chain.vault_program)
```
Then call `init_vault("NVDAx")` once with the mock mint from `scripts/05-solana.sh` (accounts below). Positions carry their own authority: on devnet that is
the key NEAR derives for `solana-devnet/pos/<id>` (`TODO-G7` until G7 confirms it against the MPC response). No authority is hardcoded in the program.

## Interface (for WO-16 keeper, WO-24 OutLayer vault_read)
- Preimages are rebuilt with the **program id** in both `program=` (settle) and `vault=` (release), because that is the only vault id NEAR has
  (`remote_chain.vault_program`).
- PDAs: vault `["vault", mint]`, vault tokens `["tokens", vault]` (authority = vault), position `["pos", vault, u64le(position_id)]`,
  nonce `["nonce", vault, u64le(nonce)]`.
- The transaction is `[Ed25519 verify ix (solana/client/ed25519.ts), settle|release ix]`. Nothing may sit between them. Measured on the local validator:
  settle kind 0 is 77.5k CU (including the recipient ATA creation) and 1063 bytes for a 227-byte message; release is 37.8k CU. With every u64 at its maximum
  and `|kind=PRELIQ`, the transaction is about 1162 of 1232 bytes.
- Discriminators: init_vault `[77,79,85,150,33,217,52,106]`, open_position `[135,128,47,77,15,152,240,49]`, settle `[175,42,185,87,144,131,102,212]`,
  release `[253,249,15,206,28,127,193,241]`. Full IDL: `target/idl/nectar_vault.json` after `anchor build`.
- settle accounts, in order: payer (signer, w), vault, mint, vault_tokens (w), position (w), depositor (w), depositor_tokens (w, ATA, created if missing),
  recipient_account, recipient_tokens (w, ATA, created if missing), nonce_record (w), instructions sysvar, token_program, associated_token_program,
  system_program. release has the same accounts without recipient_account and recipient_tokens.
- `Position` account (123 bytes): 8-byte discriminator `[170,188,143,228,122,64,247,208]`, then `version u8` @8, `authority [u8;32]` @9,
  `depositor Pubkey` @41, `amount u64 LE` @73, `status u8` @81 (1 = Open), `vault Pubkey` @82, `position_id u64 LE` @114, `bump u8` @122. The account is closed
  on settle or release, so if it is missing the position is finished.
