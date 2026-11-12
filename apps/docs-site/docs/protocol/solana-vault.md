---
title: Solana vault
slug: /protocol/solana-vault
description: Anchor program that releases collateral only on a NEAR-signed message.
---
# Solana vault (`nectar_vault`)

<p className="verified">Verified against: F-080 (2026-11-09), F-081 (2026-11-09), F-082 (2026-11-09), F-036 (2026-11-09), F-341 (2026-11-10) · spec docs/PRD.md §9, §9B · D-016 (2026-11-10) · docs/EVIDENCE.md G7 (2026-11-09T23:57Z) · devnet deploy log evidence/solana/deploy-20261110T124326Z.log (2026-11-10) · tests in solana/tests/nectar_vault.test.ts · devnet: docs/EVIDENCE.md §G7 v7 (2026-11-10T16:52Z, 91db9ea) · F-358 (2026-11-10) · v2 layout: solana/deploy.md, docs/work/interface-v7.md §E, D-027 (2026-11-11) · v2 upgrade evidence/rollout/security-upgrade-20261111T070338Z.log (2026-11-11) · docs/EVIDENCE.md §G7 re-run after D-027 (2026-11-11T08:25Z, recorded in b8784c1)</p>
<p className="status">Status: live on Solana devnet (EVIDENCE §G7 v7, 2026-11-10T16:52Z). Deployed as <a href="https://explorer.solana.com/address/ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW?cluster=devnet"><code>ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW</code></a> with <code>init_vault(NVDAx)</code>; 25 anchor tests (EVIDENCE §G7 prep). Release <a href="https://explorer.solana.com/tx/5fTihnbJz5dPndVbHnwk54WoLxKCtz96HfYaPAveDSJ9jw51BNBJQ9mAbxAjWRWJB8EfsP4wrvhrJcmiFwaULLGv?cluster=devnet">5fTihnbJ…</a> and settle <a href="https://explorer.solana.com/tx/3cdcQru2WH6dbN9qvqLsKVz5CppVikHSYEgbJF8WLS6DRwzECncHSM3f5ABSJXZ4EWSZoKSfhFFRwePgihL7pWJ6?cluster=devnet">3cdcQru2…</a> both finalized with no error: ix0 is the Ed25519 verify of the NEAR-signed message against the position's derived key, ix1 the vault instruction, and the position PDAs are closed afterwards. Those runs used the v1 account layout. On 2026-11-11 the program was upgraded in place to the <strong>v2 layout</strong> below (no v1 positions were open; last deployed in slot 521021977). The verifier's G7 re-run on v2 (EVIDENCE §G7, recorded in b8784c1) found the upgrade in place before the runs (ProgramData 426,837 B = 45 B header + 426,792 B ELF, last deployed in slot 521021977) and checked positions 8 and 9 (released) and 10 (settled), each followed by <code>withdraw</code>, with the position PDAs closed. The v7 per-position lifecycle is described in <a href="/integrate/remote-collateral-solana">Remote collateral on Solana</a>.</p>

Anchor 0.32.1 program on Solana devnet, with `@solana/kit` 8.6.0 off-chain (F-081).

| Instruction | Who | Effect |
| --- | --- | --- |
| `init_vault(symbol)` | deployer | creates the vault PDA and its token account for one mint |
| `open_position(position_id, authority, amount)` | borrower (the depositor committed on NEAR) | deposits collateral into the slot `["pos", vault, position_id, depositor]` under `authority`, the NEAR-derived Ed25519 key for that position (path `solana-devnet/pos/<id>`) |
| `settle(preimage fields…)` | anyone (keeper) | requires the **previous instruction** to be the Ed25519 program verifying the signature over the rebuilt preimage with the position authority; checks the nonce record `["nonce", position, authority, nonce]` is new and the message unexpired; pays `seize_units` to the recipient's ATA (F-358) if it can receive, otherwise credits a `Claim`; records the remainder as `withdrawable` |
| `release(position_id, nonce, expires)` | anyone (keeper) | same Ed25519 check over a `NECTAR_RELEASE_V1` message; records every unit as `withdrawable` for the depositor |
| `withdraw(position_id)` | depositor | pays `withdrawable` to any token account of the mint and closes the slot (after settle or release) |
| `claim()` | recipient | pays an accumulated `Claim` (seized units whose ATA could not receive: wrong owner, frozen, or a Token-2022 account that refuses plain credits) |

**Pull payouts (v2, SR-4).** No payout depends on an account a third party controls. A depositor who reassigns its token account cannot block a settle, and a recipient with an unusable ATA gets a `Claim` instead of reverting the transaction. After settle or release the depositor must sign `withdraw`; the web app shows "Withdraw on Solana". Nonce records are scoped to the slot and the authority (SR-1, N1), so nonces burnt on another slot or under another key never block NEAR's signatures, and slots include the depositor (SR-8), so a squatter cannot block a deposit. Byte layouts and discriminators: `solana/deploy.md`.

## Facts and open points

| Item | Value | Id |
| --- | --- | --- |
| Ed25519 program | `Ed25519SigVerify111111111111111111111111111` | F-080 |
| Instructions sysvar; Ed25519 ix data | `Sysvar1nstructions1111111111111111111111111`; `[num_signatures u8, padding u8]` then a 14-byte offsets struct per signature | F-082 |
| v1 vault authority = derived key for (`nectar-core.nectar.testnet`, `solana-devnet-v1`, domain 1); v2 positions each derive their own key | `ed25519:6QPGoVj8ZPndsvDsK3n1Sed4mwyZqD2YnPDSS8y9S1tV` (live view = off-chain derivation) | F-036, D-016 |

## Why the keeper cannot steal

The derived key never signs a Solana transaction and holds no SOL. The keeper pays the fee and submits `[Ed25519 verify, settle]`, but cannot alter any field without breaking the signature check. Replay fails on the nonce, the expiry and the program id inside the preimage. Tests (solana/tests/nectar_vault.test.ts): "nonces burnt on the attacker's own slots, same ids, do not block an honest settle or release", "an attacker opening the same id with another depositor does not block the honest depositor", "depositor reassigns its ATA owner: settle still pays the recipient, withdraw goes elsewhere", "recipient ATA reassigned: settle credits a claim, recipient and depositor both pull", "a closed and reopened slot cannot replay a used nonce, by settle or by release", "wrong authority: valid signature by another key", "missing verify instruction", "release presented with a settlement signature".
