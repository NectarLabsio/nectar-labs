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
pnpm run test:unit                    # cargo unit tests (preimage vectors, Ed25519 layout, payout acceptance)
pnpm run test:anchor                  # local wallet + anchor test (build, solana-test-validator, tests/*.test.ts)
pnpm run typecheck
```
`anchor test` loads the program at the `[programs.localnet]` address, so a fresh clone with no program keypair still passes.

## Devnet deploy (orchestrator, after merge)
```bash
# 0. keys + SOL: scripts/05-solana.sh creates ~/.nectar/solana/deployer.json (0600).
#    Program data rent for the 426,456-byte v2 .so is about 2.17 SOL, and the deploy buffer needs the same again while the
#    deploy runs (it is refunded), so a fresh deploy needs >= 4.4 SOL plus fees. That is three 2-SOL airdrops.
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

## v2 in-place upgrade (orchestrator; devnet only)
The live program is `ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW` (`config.yaml` `solana.vault_program`, upgrade authority `3pF3vKew...`). Its ProgramData holds
397,240 bytes (read 2026-11-11) and the v2 `.so` is 426,456, so extend first or the upgrade fails. Recompute the difference if the `.so` changes.
```bash
solana program extend ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW 29216 --url devnet --keypair ~/.nectar/solana/deployer.json   # rent about 0.15 SOL
anchor upgrade target/deploy/nectar_vault.so --program-id ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW --provider.cluster devnet --provider.wallet ~/.nectar/solana/deployer.json
```
The deployer also needs about 2.17 SOL for the upgrade buffer (refunded). `getProgramAccounts` with `dataSize: 123` returned no v1 `Position` accounts on 2026-11-11; repeat it
just before upgrading, because v2 cannot deserialize a v1 position. The `Vault` layout is unchanged, so the existing vault keeps working. v1 nonce records sit at the old seeds and are
ignored.

## Interface v2 (keeper, quoter `vault_read`, web; interface-v7 §E)
TypeScript reference: `client/pda.ts` (seeds, PDAs; Node) and `client/vault.ts` (layouts, parsers, instruction builders). Every builder is exercised against the program in `tests/nectar_vault.test.ts`.
- Preimages are unchanged and are rebuilt with the **program id** in both `program=` (settle) and `vault=` (release), because that is the only vault id NEAR has
  (`remote_chain.vault_program`). The Ed25519 verification is unchanged.
- PDAs: vault `["vault", mint]`, vault tokens `["tokens", vault]` (authority = vault), position `["pos", vault, u64le(position_id), depositor]`,
  nonce `["nonce", position_pda, u64le(nonce)]`, claim `["claim", vault, recipient]`.
- The transaction is `[Ed25519 verify ix (client/ed25519.ts), settle|release ix]`. Nothing may sit between them. `withdraw` and `claim` need no verify instruction. Measured on the
  local validator (varies a little with PDA bumps): settle kind 0 with recipient ATA creation 67.2k CU, settle on the claim path 32.5k CU, release 27.0k CU. With every integer at its maximum and `|kind=PRELIQ`, the settle
  transaction is 1129 of 1232 bytes.

| Instruction | Discriminator | Data after the discriminator | Accounts, in order |
| --- | --- | --- | --- |
| init_vault | `[77,79,85,150,33,217,52,106]` | `symbol` string | payer (s,w), mint, vault (w), vault_tokens (w), token_program, system_program |
| open_position | `[135,128,47,77,15,152,240,49]` | `position_id u64`, `authority [u8;32]`, `amount u64` (56 B total) | depositor (s,w), vault, mint, vault_tokens (w), depositor_tokens (w), position (w), token_program, system_program |
| settle | `[175,42,185,87,144,131,102,212]` | `position_id u64`, `quote_id u64`, `repay_e6 u64`, `seize_units u64`, `recipient Pubkey`, `nonce u64`, `expires i64`, `kind u8` (89 B total) | payer (s,w), vault, mint, vault_tokens (w), position (w), recipient_account, recipient_tokens (w), claim (w), nonce_record (w), instructions sysvar, token_program, associated_token_program, system_program |
| release | `[253,249,15,206,28,127,193,241]` | `position_id u64`, `nonce u64`, `expires i64` (32 B total) | payer (s,w), vault, position (w), nonce_record (w), instructions sysvar, system_program |
| withdraw | `[183,18,70,156,148,109,161,34]` | `position_id u64` (16 B total) | depositor (s,w), vault, mint, vault_tokens (w), position (w), destination (w), token_program |
| claim | `[62,198,214,193,213,159,108,210]` | none (8 B total) | recipient (s,w), vault, mint, vault_tokens (w), claim (w), destination (w), token_program |

`token_program` is the owner of the mint and is enforced. `recipient_tokens` must be the recipient's canonical ATA and `claim` its PDA, even when unused, so a relayer cannot force the claim path.
`destination` is any token account of the mint except the vault's own.

| Account | Discriminator | Bytes | Layout (u64 little-endian) |
| --- | --- | --- | --- |
| `Position` v2 | `[170,188,143,228,122,64,247,208]` | 131 | `version u8 (=2)` @8, `authority [u8;32]` @9, `depositor Pubkey` @41, `amount u64` @73, `status u8` @81, `vault Pubkey` @82, `position_id u64` @114, `bump u8` @122, `withdrawable u64` @123 |
| `NonceRecord` v2 | `[108,73,223,163,215,18,237,161]` | 91 | `version u8 (=2)` @8, `vault Pubkey` @9, `authority [u8;32]` @41, `nonce u64` @73, `position_id u64` @81, `op u8` @89 (0 settle, 1 release), `kind u8` @90 |
| `Claim` v1 | `[155,70,22,176,123,215,246,102]` | 82 | `version u8 (=1)` @8, `vault Pubkey` @9, `recipient Pubkey` @41, `amount u64` @73, `bump u8` @81 |
| `Vault` v1 (unchanged) | `[211,8,232,43,2,152,117,119]` | variable | `version u8` @8, `symbol` string @9, then `mint`, `tokens`, `bump`, `tokens_bump` |

Lifecycle and what readers must do:
- `status`: 1 Open, 2 Settled, 3 Released. **A position no longer closes on settle or release.** It stays, with `amount` unchanged, until the depositor calls `withdraw`; only then is the account gone.
  `vault_read` and the deposit watcher must require `status == 1` and must not treat the account's existence as an open deposit. A missing account means finished or never opened.
- `settle` pays `seize_units` to the recipient's ATA if it accepts the transfer, creating it if missing. If the ATA has the wrong owner, is frozen, or refuses plain credits (Token-2022 required memos or
  confidential-only), it credits `Claim` instead, and the recipient signs `claim`. Credits accumulate on one `Claim`; `claim` pays all of it and closes the account. Rent goes to the recipient.
- `settle` records the remainder, and `release` the whole amount, as `withdrawable`. The UI must offer `withdraw` after either one: the depositor no longer receives tokens automatically.
- Events (Anchor `Program data:` logs, full layouts in the IDL): `PositionSettled` adds `position`, `depositor` and `claimed`; `PositionReleased` adds `position`; new `PositionWithdrawn`, `ClaimCredited`, `ClaimPaid`.
- Errors are 6000 + index. v1 codes keep their numbers; appended: `PositionStillOpen` 6012, `RecipientTokensMismatch` 6013, `InvalidClaimAccount` 6014, `DestinationIsVault` 6015, `Overflow` 6016.

**Nonces are per slot.** The settle preimage does not bind the depositor, so anyone can open a slot with the same id and NEAR's public authority under their own wallet and relay NEAR's settle signature there. That only
spends that slot's own units to the signed recipient and consumes the nonce on that slot alone; the honest slot still settles with the same signature (tested). So readers must derive the nonce PDA from the committed slot,
`["nonce", ["pos", vault, id, committed_depositor], nonce]`: a record there proves the leg landed on that slot, and a record under any other slot proves nothing. Release signatures bind the depositor and cannot cross slots.
Nonce records are never closed, so a withdrawn slot reopened at the same address still refuses its used nonces (tested).

