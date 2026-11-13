# Security review v7 — 2026-11-11 (workflow wf_619cb8fc-1a2; 102 agents; read-only)

Candidates 60, survived adversarial verification 46, rejected 14; after dedup **33 findings**.

## Summary

The 46 findings that survived verification collapse into 33 after removing duplicates: 5 high, 8 medium and 20 low. Owners: contract 22, keeper 7, solana 2, evm 1, x402 1, feed 1.

The main theme is remote settlement. A settle leg that has been signed (Signed) can stay stuck with no way out (SR-3). Several separate defects lead into that state:
- Anyone can burn the vault-wide nonces (SR-1, Solana and EVM).
- The keeper accepts a nonce PDA that merely exists, which a 0.00089 SOL transfer can create, as proof the leg landed (SR-2).
- A borrower can reassign the owner of their classic-SPL token account (ATA) (SR-4).
- Remote recipients are only format-checked, so the vault may never be able to pay them (SR-7).
- A keeper outage longer than expiry_s (3600 s).
In each case the buyer's escrow is spent and the collateral stays locked in the vault. Nothing inside the protocol can recover it; only a contract upgrade can. SR-1 and SR-2 can be triggered today on the live Solana devnet vault.

Separately, remote loans are sized against aggregate Q_c, R_c and D_c, but they can only be settled by one quote whose recipient fits the remote chain. `select_quotes` also cuts the list to 8 candidates before filtering by recipient, so a borrower can deliberately make their own position impossible to pre-liquidate (SR-5).

Medium findings are mostly liveness and DoS: permissionless drains of gas_reserve_yocto that halt quoter-path liquidations (SR-6, SR-9, SR-11), squatting on position ids (SR-8), a rounding dead-end in remote legs (SR-10), keeper vault discovery that anyone can block (SR-12), and a forced_closed flag that latches permanently (SR-13).

Suggested fix order: first SR-3 (re-sign an expired leg with a fresh nonce; do not roll back without an attested vault read), then SR-1, SR-2 and SR-4 (vault and keeper changes), then SR-5 and SR-7 (contract), then the medium findings.

Severity rule: where verifiers disagreed, I kept the lower rating unless a verifier showed the finding was understated. SR-3 and SR-5 stay high: SR-3 because the lock cannot be recovered without an upgrade, SR-5 because a verifier showed a deliberate griefing path.

## Index

| id | sev | owner | file:line | title |
| --- | --- | --- | --- | --- |
| SR-1 | high | solana | `solana/programs/nectar_vault/src/lib.rs:348` | The vault-wide nonce namespace lets anyone burn NEAR's future nonces; signed settles and releases can then never execute (Solana and EVM vaults) |
| SR-2 | high | keeper | `services/keeper/src/solana.ts:801` | The keeper treats any account at the Solana nonce PDA as proof a leg landed, and relays the attacker's transfer signature to NEAR |
| SR-3 | high | contract | `contracts/nectar-core/src/p2.rs:271` | A Signed remote settle leg (PRELIQ or Profit-Lock SELF) that expires unexecuted has no recovery path: buyer escrow spent, collateral locked |
| SR-4 | high | solana | `solana/programs/nectar_vault/src/lib.rs:329` | Depositor (or recipient) can make every settle revert by reassigning the owner of their classic-SPL ATA |
| SR-5 | high | contract | `contracts/nectar-core/src/remote.rs:202` | Remote loans are sized against capacity that cannot settle them, and candidate selection truncates to 8 before filtering by recipient |
| SR-6 | medium | contract | `contracts/nectar-core/src/remote.rs:619` | Anyone can drain gas_reserve_yocto through confirm_remote_deposit (works forever on Expired reservations) and the job requests; quoter-path pre-liquidation then reverts |
| SR-7 | medium | contract | `contracts/nectar-core/src/chainsig.rs:126` | Remote recipients are only format-checked: 31/23-byte base58, the EVM zero address and B20-unauthorized addresses get signed into legs the vault can never execute |
| SR-8 | medium | solana | `solana/programs/nectar_vault/src/lib.rs:295` | Vault position ids can be squatted (Solana and EVM), blocking every remote deposit |
| SR-9 | medium | contract | `contracts/nectar-core/src/p1.rs:290` | The quoter deposit is spent before checking settle can succeed; positions that always abort loop and drain gas_reserve |
| SR-10 | medium | contract | `contracts/nectar-core/src/remote.rs:299` | Underwater remote legs can never pass the exact-equality check after rounding (M<1e18 or 8/18-decimal tokens) |
| SR-11 | medium | keeper | `services/keeper/src/solana.ts:863` | The keeper's Solana deposit pre-check compares against top-level units ("0"), so underfunded deposits trigger confirm_remote_deposit every 60 s forever |
| SR-12 | medium | keeper | `services/keeper/src/solana.ts:627` | Anyone can block the keeper's Solana vault discovery: init_vault is permissionless and the mint is not pinned by default |
| SR-13 | medium | contract | `contracts/nectar-core/src/jobs.rs:237` | An OutLayer calendar answer latches forced_closed permanently; one weekend call keeps the asset closed through the next trading week |
| SR-14 | low | contract | `contracts/nectar-core/src/remote.rs:603` | Untrusted callers grow storage the contract pays for: reservation deposits are fully refunded while the record stays, and there is no minimum borrow and no per-account cap |
| SR-15 | low | contract | `contracts/nectar-core/src/remote.rs:644` | Remote deposits are not bound to a mint, so a second remote collateral would be valued from NVDAx-mock deposits |
| SR-16 | low | contract | `contracts/nectar-core/src/lib.rs:503` | Relisting a quote (top-up, rollback, withdrawal restore) skips the Reserve-discount check, so a quote can fill ahead of a cheaper Reserve |
| SR-17 | low | contract | `contracts/nectar-core/src/lib.rs:1455` | Failed settlement and release collateral transfers go to owed_collateral, which has no claim path |
| SR-18 | low | contract | `contracts/nectar-core/src/remote.rs:704` | A deposit smaller than the reserved units is never recorded, so the collateral cannot be released without the keeper-attestation fallback |
| SR-19 | low | contract | `contracts/nectar-core/src/lib.rs:1141` | upsert_collateral lets the token or decimals of a live asset change, misrouting releases and settlements |
| SR-20 | low | contract | `contracts/nectar-core/src/math.rs:215` | A dust Q_c lets one tiny quote collect the whole buyers' share and pushes the fee index toward u128 overflow |
| SR-21 | low | contract | `contracts/nectar-core/src/notes.rs:605` | set_quote_remote_recipient redirects remote fill payouts without requiring 1 yoctoNEAR, so a function-call access key can do it |
| SR-22 | low | contract | `contracts/nectar-core/src/reserve.rs:159` | A depleted Reserve (R_c = 0 with live shares) refuses every new deposit until all holders exit |
| SR-23 | low | contract | `contracts/nectar-core/src/notes.rs:595` | nft_resolve_transfer leaves a Note with a receiver that refused it whenever a settlement starts in between |
| SR-24 | low | contract | `contracts/nectar-core/src/notes.rs:247` | Stale quote_refs lock a Quote Note whenever a position that once selected it later becomes pending for an unrelated reason |
| SR-25 | low | contract | `contracts/nectar-core/src/v7.rs:155` | withdraw_claimable ignores pause, against the rule that all money paths refuse while paused |
| SR-26 | low | contract | `contracts/nectar-core/src/remote.rs:769` | Anyone can force a release during the refused-loan retry window, killing the borrower's retry |
| SR-27 | low | contract | `contracts/mock-ft/src/lib.rs:182` | mock-ft lets anyone register arbitrary accounts for free, draining the live token contracts' storage stake |
| SR-28 | low | keeper | `services/keeper/src/base.ts:840` | The Base relay's default (non-attest) mode can never confirm deposits, because the quoter rejects base-sepolia vault_read, so the keeper loops |
| SR-29 | low | keeper | `services/keeper/src/base.ts:767` | The keeper's Base 'nonce used' recovery scans only the last 10,000 blocks, so after long downtime the leg is never relayed |
| SR-30 | low | evm | `evm/src/NectarVaultBase.sol:216` | Expiry off-by-one: the EVM vault accepts a message at block.timestamp == expires, while NEAR, the keeper and Solana treat that second as expired |
| SR-31 | low | keeper | `services/keeper/src/solana.ts:654` | The vault program the keeper signs for is not pinned by default, so a lying NEAR RPC can point the fee-payer signer at any program |
| SR-32 | low | x402 | `services/x402/src/server.ts:139` | The x402 facilitator HTTP endpoint accepts caller-chosen requirements without auth, so the relayer pays gas for anyone's ft_transfer |
| SR-33 | low | feed | `services/feed/src/skill.ts:234` | open_protected_stock_loan reports preview.ok=true for borrows the contract will refuse because of the chosen pre_liq_ltv_bps |

## Findings

### SR-1 — high — solana — The vault-wide nonce namespace lets anyone burn NEAR's future nonces; signed settles and releases can then never execute (Solana and EVM vaults)
`solana/programs/nectar_vault/src/lib.rs:348`

**Description.** The replay guard is keyed only by (vault, nonce).
- Solana: the nonce PDA `[NONCE_SEED, vault, nonce]` (Settle lib.rs:348, Release lib.rs:393).
- EVM: `mapping(uint64=>bool) nonceUsed` (evm/src/NectarVaultBase.sol:84), checked and set in `_consume` at l.217 and l.222.

`open_position` and `openPosition` are permissionless, and the caller picks both the id and the authority. An attacker therefore opens a 1-unit position under their own key, signs a Release with any nonce they like, and that nonce is consumed for the whole vault. They get the unit and the rent back.

NEAR issues nonces from one public, sequential counter (`take_nonce`, contracts/nectar-core/src/p2.rs:89, readable through the `get_next_nonce` view). The nonce is also emitted in `settlement_sign_requested` and `remote_release_requested` before the MPC signs. A Signed settle leg is never rolled back (SR-3).

**Failure scenario.** 1. The attacker reads `get_next_nonce` = N.
2. For each k in N..N+50 they send one tx: [open_position(fresh id, K_att, 1), Ed25519(K_att, release preimage with nonce k), release]. Each costs about 0.0013 SOL of rent on devnet.
3. At the next remote pre-liquidation, NEAR debits the buyer's escrow, clears the debt and signs with nonce N.
4. Every relay fails: 'already in use' on Solana, `NonceUsed(N)` on EVM.
5. The buyer has paid and receives no units. The seized units and the borrower's remainder stay locked in the vault, which has no admin path.
6. Release re-requests after expiry get fresh nonces, and the attacker can burn those in advance too.

Reachable today on the live Solana devnet vault. The EVM vault runs only on the local fork (D-026) but is the same code planned for Base Sepolia and PROD. The evm-vault reviewer reproduced this in a scratchpad copy (`test_poc_nonceBurnLocksCollateral`).

**Fix.** Scope the replay set to the position or signer.
- Solana: seeds `[NONCE_SEED, position.key(), nonce]` or `[NONCE_SEED, vault, position.authority, nonce]`. Keep the vault in the seeds, because the preimage does not bind the vault or mint.
- EVM (owner evm): `mapping(address=>mapping(uint64=>bool)) nonceUsed`, keyed by `p.authority` in `_consume`.
- Keeper (owner keeper): update `noncePda` in solana.ts and the `nonceUsed` read in base.ts.
- Update interface-v7 §B and invert the test at nectar_vault.test.ts:306.
- Add a negative test showing that a nonce used under one authority does not block another.

Also ship the SR-3 re-sign path as defence in depth.

**Verifier notes.** Merged solana-vault (lib.rs:348) and evm-vault (NectarVaultBase.sol:222). All 4 verdicts high, none refuted. The sub-claim that v1 and v2 already collide is overstated: v1 used a different program. Not critical, because nothing is stolen.

### SR-2 — high — keeper — The keeper treats any account at the Solana nonce PDA as proof a leg landed, and relays the attacker's transfer signature to NEAR
`services/keeper/src/solana.ts:801`

**Description.** `relayLeg()` checks only `getAccount(nonceAddr) !== null`. It then sends `oldestSignatureFor(nonceAddr)` to `relay_settlement_result` or `relay_release_result` without sending anything to Solana. It does not check:
- the account's owner, discriminator, length or NonceRecord fields;
- what the signature's transaction actually did (no getTransaction).

A plain transfer of 890,880 lamports creates a system-owned account at any address.

On NEAR, the relay methods only format-check the signature (evm.rs `valid_relay_tx`). They then set units=0 and remote=Closed (remote.rs:882-902, p2.rs:345-369). The keeper test at solana.test.ts:364 seeds only owner=PROGRAM, so this case is never exercised.

**Failure scenario.** 1. The attacker reads `get_next_nonce` = N and pre-funds `noncePda(program, vault, k)` for k in N..N+50, about 0.045 devnet SOL in total.
2. A borrower repays and the release is signed with nonce N.
3. Within about 10 s the keeper relays the attacker's transfer signature.
4. NEAR marks the position Closed. The web RemoteRelease card renders only while status is Releasing, so it disappears.
5. No Solana release is ever sent.
6. After expiry_s (3600 s), `request_remote_release` panics 'remote position closed', and the collateral is locked in the vault for good.

The settle variant ends the same way: the buyer's escrow already repaid the debt, and the seized units are never paid out.

**Fix.** Treat the nonce as used only when all of these hold:
- the owner is the vault program;
- the data length is 8 + NonceRecord::INIT_SPACE;
- the NonceRecord discriminator matches;
- the decoded vault, nonce, position_id and op match.

Also confirm the position PDA is closed. Take the signature from a successful `getTransaction` that contains this vault's settle or release instruction (or its event) for this position and nonce, not from the oldest signature on the address. A pre-funded but uninitialised PDA should fall through to the normal send path, since Anchor `init` accepts a pre-funded account. Add a test with a system-owned nonce account.

Longer term, NEAR should verify a leg (light client or attested vault_read) before `relay_*` zeroes units.

**Verifier notes.** Both verdicts high. Before expiry, anyone could in principle still relay the public signed message by hand, but the default product path hides the position. Funds are locked after expiry.

### SR-3 — high — contract — A Signed remote settle leg (PRELIQ or Profit-Lock SELF) that expires unexecuted has no recovery path: buyer escrow spent, collateral locked
`contracts/nectar-core/src/p2.rs:271`

**Description.** By the time the leg is signed, these have all happened:
- `settle_remote` / `self_settle_remote` debited the quote escrow and cut debt and units;
- `on_signature` credited the pool and treasury and marked the leg Signed.

After that, nothing can move it:
- `cancel_remote_leg` (p2.rs:271-281) rolls back AwaitingSignature only.
- `settle_in_flight` (p2.rs:97) stays true for Signed, so `request_remote_release` panics (remote.rs:765 and 777), and `settle_remote` and `self_settle` refuse.
- `cancel_settlement` (p1.rs:502) flips only `p.status`.

Both vaults reject expired messages (Solana lib.rs:93; EVM `_consume`, l.216), and the keeper skips expired legs (base.ts:778). The release path has a re-sign-after-expiry rule (remote.rs:773); the settle path has none.

This contradicts the PRD §16.4 runbook ('if expired, owner cancel_settlement returns position to Open'). It is also the common end state for SR-1, SR-2, SR-4 and SR-7, and for any keeper or RPC outage longer than expiry_s (3600 s, scripts/21-deploy-v2.sh:81).

**Failure scenario.** 1. The keeper is down, or its Solana fee payer is empty, for more than 1 h after settlement_signed. The signature expires.
2. The buyer has paid fill or repay and receives no units.
3. The depositor's remainder and the seized units stay in the vault under the MPC-derived key.
4. The Position and Quote Notes stay locked.
5. The keeper's only possible action, `relay_settlement_result`, would mark the position Closed with the units still in the vault, which makes things worse.

Only an owner contract upgrade recovers the funds.

**Fix.** Allow a fresh-nonce re-sign of the identical leg (same repay, seize, recipient and kind) once `now >= expires` and the leg is unrelayed. This is safe: if the original landed, the vault position is no longer Open and the new message fails.

Do not roll back a Signed leg unconditionally. NEAR cannot tell 'never executed' from 'executed but not relayed', so a blind rollback pays the buyer twice. A rollback (re-debit pool and treasury, restore escrow, debt and units) is safe only when gated on an attested vault_read showing the position still Open.

Also make `cancel_settlement` restore `remote.status` consistently, and add tests for the expired case.

**Verifier notes.** Merged core-settlement (p2.rs:273), core-v7-modules (p2.rs:279) and the lock half of core-remote (p2.rs:273). Finder severities: medium, high, high. Code verdicts: high ×3. Impact verdicts: medium, medium, high. Kept high because the funds lock is permanent within the protocol and needs no attacker. It sits at the low end of high, since an upgrade can recover. The core-v7 impact verifier flagged the originally proposed rollback as unsafe without an attested read.

### SR-4 — high — solana — Depositor (or recipient) can make every settle revert by reassigning the owner of their classic-SPL ATA
`solana/programs/nectar_vault/src/lib.rs:329`

**Description.** Settle requires `depositor_tokens` and `recipient_tokens` to be the canonical ATAs, declared `init_if_needed` with `associated_token::authority` (lib.rs:325-343). For an ATA that already exists, Anchor 0.32.1 returns ConstraintTokenOwner when `pa.owner != authority`, and it checks this before the handler runs, even when the remainder is 0.

The mock mint is classic SPL Token (scripts/05-solana.sh:18). Classic ATAs are not immutable-owner: `SetAuthority(AccountOwner)` rewrites the owner.

No other payout account is accepted, the vault has no admin, and the NEAR leg cannot be undone once Signed (SR-3).

**Failure scenario.** 1. The borrower runs `spl-token authorize <NVDAx ATA> owner <other key>` (about 5000 lamports). They can switch it back before their own release.
2. At pre-liquidation, NEAR debits the buyer's escrow and signs.
3. Every relay fails with ConstraintTokenOwner until the signature expires.
4. The buyer has paid and gets no units, and the collateral is locked for good.

For an underwater position (seize everything, remainder 0) this costs the borrower nothing. In the recipient-side variant, a buyer spends their own escrow to lock the borrower's remainder.

**Fix.** Separate payouts from accounts a third party controls.
- In settle, pay `seize_units` to the recipient, or hold it as a program-owned claim when the recipient account is invalid.
- Record the remainder on the position for a depositor-signed `withdraw_remainder` to any token account of the mint.

Accepting only Token-2022 mints is not enough: the ATA owner can add MemoTransfer (spl-token-2022 processor.rs:496), which blocks the CPI transfer the same way.

Add a test that reassigns the depositor ATA's owner and checks that settle still pays the recipient.

**Verifier notes.** Both verdicts high. Recoverable only by upgrading the program; the attacker steals nothing.

### SR-5 — high — contract — Remote loans are sized against capacity that cannot settle them, and candidate selection truncates to 8 before filtering by recipient
`contracts/nectar-core/src/remote.rs:202`

**Description.** Three things combine:
- (a) `accept_deposit` (remote.rs:202) calls `check_borrow` → `limit_params_for` (lib.rs:342-357). That counts the full Q_c (every quote, including those with no recipient or one for the wrong chain), plus R_c and D_c.
- (b) `settle_remote` (remote.rs:287-304) accepts exactly one leg, from a quote whose `buyer_remote_recipient` fits the chain, and that leg must clear the whole debt or take every unit. There is no Reserve stage (PRD:215) and no multi-leg path.
- (c) `select_quotes` (lib.rs:792-805) keeps the 8 cheapest quotes before any recipient check.

Buyers can also drop their recipient at any time with `set_quote_remote_recipient(None)`. The tests at tests_p2.rs:1126-1139 already assert that pre-liquidation panics for a loan the limit approved.

**Failure scenario.** Live seed: $10k@250, $5k@400 and $5k@450 with null recipients. The only remote-capable quote is $1k@300 (script 58).
1. A $5k Solana remote loan passes the aggregate check against about $21k of Q_c.
2. Once it is triggerable, every trigger returns 'no remote quote capacity'. The direct path panics; the quoter path aborts.
3. This lasts until collateral×(1−disc) falls below $1k, so lenders absorb the gap and the borrower holds a free put.

Deliberate variant: the borrower funds 8 quotes at the $100 minimum, 0 bps, with no recipient. They fill every candidate slot: no rescuer can undercut 0 bps, and ties go to the older id. The position then cannot be pre-liquidated even when plenty of remote capacity exists. It costs about $800 locked for the notice period, with no loss.

**Fix.** Settlement: for remote positions, build candidates from all live quotes (64 reads at most). Filter by `recipient_fits(domain)` and sufficient remaining before sorting and truncating.

Borrow and confirm (`reserve_remote_position`, `accept_deposit`): size remote loans only against capacity that can settle them.
- Exclude R_c and D_c.
- Use Q_remote, the total of fitting, non-exiting quotes.
- While `settle_remote` is single-leg, cap the borrow (after haircut) at the largest single fitting quote's remaining.

Consider freezing recipient changes while a quote backs open remote debt. Longer term, support partial or multi-leg remote settlement. Alternatively, disclose this next to the existing Reserve limitation.

**Verifier notes.** Merged core-money (lib.rs:792), core-settlement (remote.rs:299) and core-remote (remote.rs:202). Code verdicts: high ×3. Impact verdicts: high, medium, medium. Kept high because the core-money impact verifier showed the deliberate truncate-before-filter path, which defeats the 'anyone can fund a rescue quote' argument behind the medium verdicts. The D_c part is shared design with NEAR loans and not remote-specific. 'Impossible to settle' is overstated: the position settles once its value falls below a fitting quote's remaining.

### SR-6 — medium — contract — Anyone can drain gas_reserve_yocto through confirm_remote_deposit (works forever on Expired reservations) and the job requests; quoter-path pre-liquidation then reverts
`contracts/nectar-core/src/remote.rs:619`

**Description.** `confirm_remote_deposit` (remote.rs:615) is not payable and has no caller check. Each call debits `cfg.deposit_yocto` (0.01 NEAR) from `gas_reserve_yocto` at line 659. OutLayer refunds are never credited back (p1.rs:16-19).

The limits on it are weak:
- the only throttle is 30 s per position (line 626);
- Expired reservations are accepted forever (619-621);
- reservations are unlimited, and their 0.05 NEAR is refunded;
- Base reads always fail (quoter jobs.rs:111 `unsupported_chain`) but are still charged.

`request_session_check` and `request_multiplier_read` (jobs.rs:210-226) drain the same reserve every 60 s per symbol.

Once the reserve is below deposit + n, `try_start_quoter` returns 'gas reserve empty' (p1.rs:276). `start_quoter` then panics inside `trigger_preliquidation` with no P0 fallback, contradicting PRD §6 ('a down TEE never blocks a rescue'). The Pyth path aborts. The comment at remote.rs:38 says the cooldown bounds this griefing; it does not, because the cooldown is per position.

**Failure scenario.** 1. The attacker reserves 20 positions and lets them expire (deposits refunded).
2. They call confirm on each every 30 s, plus `request_session_check` every 60 s.
3. About 110 calls (roughly 0.1 NEAR of gas, a few minutes) drain the live reserve of about 1.1 NEAR.
4. Every quoter-path `trigger_preliquidation` now reverts until the owner unpins the quoter, sets vol to 0 or refunds the reserve. Refills can be drained again.

A borrower close to the trigger has a motive to do this. Attested remote confirmations are blocked too.

**Fix.** - Make `confirm_remote_deposit`, `request_session_check` and `request_multiplier_read` paid by the caller (payable, attached ≥ deposit, refund the excess) with the keeper exempt, or restrict them to borrower, keeper and owner.
- Refuse confirm on Expired or Closed reservations that have no recorded depositor, and on chains the job cannot read.
- Ring-fence a reserve floor that only pre-liquidation may spend.
- In `trigger_preliquidation` and `on_pyth_price`, fall back to P0 static settle when the reserve is short instead of panicking.

**Verifier notes.** Merged core-remote (remote.rs:626) and core-access (remote.rs:619). Both finders said high; all 4 verdicts say medium. The owner can restore liquidations with `set_vol_bps(sym,0)` or `set_quoter_pin("","")`, or make the drain negligible with 1-yocto deposits, and most drained NEAR returns to the contract balance. Releases are not blocked (they cost 1 yocto), and `keeper_attest_deposit` still works on testnet.

### SR-7 — medium — contract — Remote recipients are only format-checked: 31/23-byte base58, the EVM zero address and B20-unauthorized addresses get signed into legs the vault can never execute
`contracts/nectar-core/src/chainsig.rs:126`

**Description.** `valid_base58_address` (chainsig.rs:126-128) checks only the alphabet and a length of 32-44 characters. It never checks that the string decodes to 32 bytes. `valid_evm_address` (131) accepts 0x000…0. There is no B20 `isAuthorized` check, although PRD §9B 'Recipient rule' and §15 require one when the recipient is set.

Every entry point uses these weak checks:
- `on_fund_quote` (lib.rs:450) checks length only;
- `set_quote_remote_recipient` (notes.rs:609) uses the same check;
- `settle_remote` and `record_remote_leg` filter with `recipient_fits`.

The vaults cannot execute such a leg:
- Solana rebuilds the preimage from a real Pubkey (preimage.rs:41), so the Ed25519 check never matches.
- EVM `_executeSettle` reverts with ZeroAddress (l.189) or NotAuthorized (l.196), and that revert also takes down the depositor's remainder payout.

The leg becomes Signed and is stuck (SR-3).

**Failure scenario.** A buyer funds a 0-bps quote with one of these recipients:
- '3DTx…AGWqi' (43 chars, decodes to 31 bytes);
- 32×'2' (decodes to 23 bytes);
- 0x0;
- a 0x address not on the B20 allowlist.

The next unhealthy remote position settles against that quote. The buyer's escrow is consumed, and the borrower's remainder and the seized units are locked.

This can also happen without malice: in PROD, a B20 buyer who is not on (or is later removed from) the TRANSFER_RECEIVER allowlist.

**Fix.** - In `recipient_fits` / `valid_base58_address`, require `b58_decode(s)` to be 32 bytes and to re-encode to `s`.
- Reject the EVM zero address.
- Enforce both in `on_fund_quote`, `set_quote_remote_recipient` and `settle_remote`.
- Check B20 authorization for Base recipients (attested eth_call), or keep Base fills off until that exists.

Vault defence in depth (owners evm and solana): pay the depositor's remainder even when the recipient leg fails, and hold `seizeRaw` as an owed claim. A policy revoked after signing still needs the SR-3 recovery path.

**Verifier notes.** Merged core-settlement (chainsig.rs:126), the recipient half of core-remote (p2.rs:273) and evm-vault (NectarVaultBase.sol:196). Code verdicts high. Impact verdicts medium ×3: deliberate griefing costs the attacker the full debt to destroy a smaller remainder; the SDK already validates Solana addresses with `address()`; an upgrade can recover. The lock impact itself is counted in SR-3.

### SR-8 — medium — solana — Vault position ids can be squatted (Solana and EVM), blocking every remote deposit
`solana/programs/nectar_vault/src/lib.rs:295`

**Description.** A vault slot is keyed by id alone:
- Solana: PDA `[POS_SEED, vault, position_id]` with `init` (lib.rs:291-297);
- EVM: `positions[id]`, which reverts PositionExists (NectarVaultBase.sol:139).

Both open calls accept any caller, any authority and any amount above 0. NEAR assigns ids from the public sequential `next_position_id` (remote.rs:481-490, `get_config`) and emits the id before the borrower can deposit.

`vault_read` derives the PDA from the id only (quoter/src/solana.rs:250). `on_deposit_verified` rejects with `authority_mismatch` or `units_below_reserved`, and nothing can re-key the reservation. A squatter who used their own key can self-release to get the unit and rent back.

**Failure scenario.** 1. The attacker reads `next_position_id` = X and opens X..X+100 with authority K_att and 1 unit each.
2. Every reservation in that range fails: the borrower's open_position gets 'already in use', confirm fails, and the reservation expires.
3. Re-reserving hands out the next id, which is also squatted.

Alternatively the attacker front-runs one borrower using the `remote_reserved` event. The Solana devnet vault is live (the attacker needs at least 1 raw unit of the mock mint); the EVM vault runs only on the local fork today.

**Fix.** Bind the slot to the borrower.
- Contract: commit the borrower's remote depositor address in `reserve_remote_position`, and have `on_deposit_verified` require depositor == committed.
- Solana: seeds `[POS_SEED, vault, position_id, depositor]`.
- EVM (owner evm): key slots by (id, msg.sender), or require an authority-signed EIP-712 `Open(positionId, depositor, minAmount, expires)`.
- Quoter, keeper and web: derive the slot using the depositor.

Keying by (id, authority) alone is not enough.

**Verifier notes.** Merged core-remote (NectarVaultBase.sol:139), solana-vault (lib.rs:295) and evm-vault (NectarVaultBase.sol:139). All 6 verdicts medium. No funds lost; the reservation deposit is refunded.

### SR-9 — medium — contract — The quoter deposit is spent before checking settle can succeed; positions that always abort loop and drain gas_reserve
`contracts/nectar-core/src/p1.rs:290`

**Description.** `try_start_quoter` debits `quoter.deposit_yocto` (p1.rs:290) as soon as any live quote has capacity. It never checks that settle can succeed.

When settle fails, `on_quoter_result` calls `abort_settlement` (p1.rs:423), which returns the position to Open with no cooldown and no panic. The keeper (keeper.ts:149-158) sees a successful tx, clears its backoff and triggers again on the next poll.

Positions that always abort:
- (a) A NEAR position left with units==0 and debt>0 after an underwater settlement. lib.rs:904-912 sets it Open; with value 0 it stays triggerable; there is no bad-debt or write-off state. This contradicts PRD §4.8 ('stays Settling for the owner').
- (b) Remote positions with no single fitting quote (SR-5) or rounding dust (SR-10).

**Failure scenario.** 1. A weekend gap leaves a position with $200 of debt and 0 units.
2. The keeper triggers about every 10 s, at 0.004 NEAR per cycle.
3. A 0.1-1 NEAR reserve is gone in 25-250 cycles.
4. 'gas reserve empty' then blocks quoter-path liquidations for every position, and remote confirms too.
5. Refilling the reserve restarts the drain.

**Fix.** - Refuse units==0, or units too small for any leg, in `trigger_preliquidation` and `try_start_quoter`.
- Add a terminal bad-debt or owner write-off state.
- For remote positions, dry-run the `settle_remote` selection at max discounts before spending the deposit.
- Record a per-position cooldown on `settlement_aborted`, and have the keeper honour it.

**Verifier notes.** All 4 verdicts medium. The owner can recover by unpinning the quoter or setting vol to 0.

### SR-10 — medium — contract — Underwater remote legs can never pass the exact-equality check after rounding (M<1e18 or 8/18-decimal tokens)
`contracts/nectar-core/src/remote.rs:299`

**Description.** For an underwater position, the `settle_leg_m` cap branch (math.rs:354-366) floors raw → underlying → covered, then rounds back up twice through `seize_units_m`. Two conditions make the result land below `units` while `repay < debt`:
- M < 1e18, which `announce_corporate_action` allows for decreases (v7.rs:79);
- 10^(d+4) > price×(1e4−disc), as with 8- or 18-decimal tokens at low prices.

Then `leg.repay_usd_e6 == debt || leg.buyer_units == units` fails for every quote. With M=0.5e18, every position with an odd unit count fails at any price. The deployed NVDAx (6 decimals, M=1e18, about $150) is not affected.

**Failure scenario.** units 1,000,001, M 0.5e18, $360, 6 decimals, 250 bps gives repay $175.5 and buyer_units 1,000,000. The result is 'no remote quote capacity'. The collateral stays locked in the vault until the price recovers, and lenders lose the recoverable value. On the quoter path each failure also aborts and re-triggers (SR-9).

**Fix.** In the cap branch for remote legs, sign seize = units (the buyer takes all collateral for `covered`), or accept legs where units − buyer_units is rounding dust. Add tests with M<1e18 (odd units) and with 8- and 18-decimal tokens.

**Verifier notes.** Both verdicts medium. 'The whole debt becomes bad debt' is overstated: the extra loss is about V×(1−disc). The Reserve-drain link is wrong (remote positions never reach the Reserve), but the quoter abort loop does apply.

### SR-11 — medium — keeper — The keeper's Solana deposit pre-check compares against top-level units ("0"), so underfunded deposits trigger confirm_remote_deposit every 60 s forever
`services/keeper/src/solana.ts:863`

**Description.** `deposit()` refuses only when `pos.acct.amount < BigInt(p.units)`. For an AwaitingDeposit remote position, top-level units are 0 (remote.rs:498); the reserved amount lives only in `remote.reserved_units`. The check therefore never fires.

Once OutLayer rejects with `units_below_reserved`, the status stays AwaitingDeposit, and the keeper never calls `expire_remote_reservation`. It sets a 60 s cooldown (line 875) and repeats.

Each call takes 0.01 NEAR from `gas_reserve_yocto` and spends keeper-v2's function-call allowance (0.4 NEAR, which cannot be refilled per F-015/D-019). base.ts:814 correctly uses `reserved_units`. The test fixture (solana.test.ts:418) hides the bug.

**Failure scenario.** 1. The attacker reserves 1e12 units with borrow 1, then opens the vault position with the correct authority and 1 unit.
2. The keeper loops on confirm.
3. Ten such positions drain the gas reserve and the keeper key within about 10-20 minutes, inside the 30-minute window before the reservations can be expired.
4. After that, `trigger_preliquidation` and the `relay_*` calls stop until the owner creates a new keeper account and calls `set_keeper`.

An honest underfunded deposit (for example through scripts/59-vault-open.mjs) causes the same loop.

**Fix.** - Compare against `p.remote.reserved_units` (add it to RemoteView) and make the fixture use top-level units '0'.
- After a rejection, cache it and do not retry until the observed vault amount or slot changes.
- Skip reservations past `expires_ns`, or call `expire_remote_reservation`.
- Do not retry refused loans every 60 s once the depositor is set.

**Verifier notes.** Both verdicts medium. Draining the gas reserve duplicates SR-6; exhausting the keeper key's allowance is unique to this bug. The live reserve is about 1.1 NEAR, not 5.

### SR-12 — medium — keeper — Anyone can block the keeper's Solana vault discovery: init_vault is permissionless and the mint is not pinned by default
`services/keeper/src/solana.ts:627`

**Description.** Without NECTAR_VAULT_MINT, `vaultFor()` lists every Vault of the program and throws unless exactly one matches the symbol. NECTAR_VAULT_MINT is absent from .env.example, and config.yaml `solana.mint` is never read.

`init_vault` accepts any payer, any mint and a free-form symbol. The lookup result is cached only on success. As a result, every settle, release and deposit item for that collateral throws and backs off, while /healthz still reports `lastTickOk=true`.

**Failure scenario.** 1. The attacker creates a mint and calls `init_vault(symbol:"NVDAx")`, about 0.003 devnet SOL.
2. After the next keeper restart, every Solana item fails.
3. Signed legs expire unrelayed and fall into SR-3.
4. Deposits are never confirmed, until an operator sets NECTAR_VAULT_MINT.

**Fix.** Default NECTAR_VAULT_MINT to config.yaml `solana.mint`, or make it mandatory when the relay is enabled, and select the vault by PDA("vault", mint). If discovery is kept, filter by the configured mint instead of failing every item.

**Verifier notes.** Both verdicts medium. Fixing it takes one env var once someone notices; funds are locked only if the outage outlasts expiry_s.

### SR-13 — medium — contract — An OutLayer calendar answer latches forced_closed permanently; one weekend call keeps the asset closed through the next trading week
`contracts/nectar-core/src/jobs.rs:237`

**Description.** `on_session_check` sets `c.forced_closed = true` on any `force_closed:true` answer. The calendar job answers true for Weekend, Holiday and EarlyClose (quoter calendar.rs: `force_closed() = self != Open`). Only the owner's `force_session_closed(symbol,false)` (v7.rs:39-45) clears it. `request_session_check` is permissionless (jobs.rs:210) and is paid from the gas reserve.

PRD §4.7 meant OutLayer closures for halts and circuit breakers; regular closures are already covered by the contract's calendar windows.

**Failure scenario.** 1. On a Saturday, anyone calls `request_session_check("NVDAx")` and `forced_closed` becomes true.
2. On Monday the calendar window opens, but `session_state` still returns forced_closed.
3. D_c=0 and the weekend haircut stay in force all week, so depth-raised limits (the core feature) are off until the owner notices.

This can be repeated every closed period. A legitimate Holiday answer causes the same latch.

**Fix.** Keep a separate expiring field, e.g. `outlayer_closed_until_ns` set to the end of the reported NY day or a short TTL, and have `session_state` check both. Alternatively, ignore `weekend` answers and latch Holiday or EarlyClose only until the end of that day.

**Verifier notes.** Both verdicts medium. Fail-closed, no funds lost; one cheap owner call clears it.

### SR-14 — low — contract — Untrusted callers grow storage the contract pays for: reservation deposits are fully refunded while the record stays, and there is no minimum borrow and no per-account cap
`contracts/nectar-core/src/remote.rs:603`

**Description.** `reserve_remote_position` needs no tokens. Its 0.05 NEAR 'anti-spam' deposit is fully refunded on expiry (603-609), on authority failure and on confirm. The Position+RemoteInfo record (about 450-800 B, with an unfiltered referrer and a 128 B memo) is never deleted. Nothing measures `env::storage_usage`, and the PRD §15 'cap on positions per account' is not implemented.

On the NEAR path, `on_lock_and_borrow` rejects only borrow==0 (lib.rs:556). A 1-raw-unit, 1-µUSDC position therefore mints a Position and Note entries; this requires mock NVDAx, which only the owner mints. D-023 accepts contract-paid storage for Note mints only.

**Failure scenario.** 1. The attacker loops: reserve (about 8.7 Tgas), then expire after 30 min (about 2.4 Tgas), with a full refund each time.
2. Each cycle leaves about 0.005-0.008 NEAR of storage stake, roughly 3-7× the attacker's gas.
3. About 340-580 cycles use up v2's roughly 2.6 NEAR of free balance (G13 evidence).
4. Every storage-growing or deposit-attaching call then fails with LackBalanceForState until someone tops up. Refund transfers revert; deposits are delayed, not lost.

**Fix.** - At reservation, measure the storage delta and keep bytes×`storage_byte_cost` from the refund, or delete the Position on expiry or authority failure when no depositor is recorded.
- Enforce a minimum borrow for all positions (e.g. $5, like `SHIELD_MIN_BORROW_USD_E6`).
- Optionally add a per-account open-reservation counter.

**Verifier notes.** Merged core-money (lib.rs:556), core-remote (remote.rs:603) and core-access (remote.rs:603). Verdicts: low, low, and medium (code) vs low (impact) for core-access. Testnet only (PROD uses NEP-145 and a $50 minimum); recoverable by top-up or pause.

### SR-15 — low — contract — Remote deposits are not bound to a mint, so a second remote collateral would be valued from NVDAx-mock deposits
`contracts/nectar-core/src/remote.rs:644`

**Description.** `RemoteChain` has no mint field. The `vault_read` input sends none, and the job falls back to the hard-coded DEVNET_MINT (quoter jobs.rs:116-118). `parse_vault_read` returns no mint, and `set_remote_chain` allows the same program for any symbol.

**Failure scenario.** The owner adds a pricier Solana-backed collateral EXP on the same vault program. A borrower reserves under EXP and deposits cheap NVDAx-mock into the NVDAx vault under the position's authority. Confirm passes, and the loan is priced at EXP's oracle price, bypassing the limit.

**Fix.** Add the mint (or the EVM token address) to the remote chain config. Pass it in `vault_read`, have the job echo the vault's mint, and require a match in `on_deposit_verified`. Meanwhile, have `set_remote_chain` refuse a second symbol that reuses the same (chain_id, vault_program). Owner quoter for the job side.

**Verifier notes.** Code verdict low. Needs an owner config change that has not happened (only NVDAx is configured).

### SR-16 — low — contract — Relisting a quote (top-up, rollback, withdrawal restore) skips the Reserve-discount check, so a quote can fill ahead of a cheaper Reserve
`contracts/nectar-core/src/lib.rs:503`

**Description.** `on_fund_quote` refuses `max_discount_bps >= reserve.discount_bps` (lib.rs:441). `set_reserve_params` compares only against live quote ceilings (reserve.rs:145-147, 278-279). Three paths put an emptied quote back on the live list with its old ceiling and no comparison:
- `on_top_up` (lib.rs:503-518);
- `rollback_leg` (p2.rs:260-264);
- the QuoteWithdrawal restore in `on_payout` (lib.rs:1460).

This breaks D-024 and the PRD §4.8 waterfall.

**Failure scenario.** 1. A 550-bps quote is fully filled and drops off the live list.
2. The owner lowers the Reserve from 600 to 500 bps; the check passes.
3. The buyer tops up, and the quote is relisted at 550.
4. The next pre-liquidation fills it before the Reserve, so the borrower pays an extra 50 bps on that portion.
5. `set_reserve_params` now refuses any discount ≤ 550.

The same happens when the Reserve is first enabled after a high-ceiling quote was emptied.

**Fix.** On every relist, require `c.reserve.discount_bps == 0 || q.max_discount_bps < c.reserve.discount_bps`. Otherwise refund the top-up or leave the quote unlisted but credited. Alternatively, have `highest_quote_ceiling` scan non-exiting quotes that could be relisted.

**Verifier notes.** Merged core-money, core-v7-modules and core-access (all lib.rs:503). Verdicts low except the core-v7 code verifier (medium); its impact verifier said low. The bound is the size of the discount cut, which an owner action triggers.

### SR-17 — low — contract — Failed settlement and release collateral transfers go to owed_collateral, which has no claim path
`contracts/nectar-core/src/lib.rs:1455`

**Description.** When a CollateralRelease, SettlementBuyer or SettlementKeeper transfer fails, `on_payout` records the units with `record_owed` (lib.rs:977-981, 1451-1455). A failed BorrowProceeds payout does the same with the whole collateral (1447). The only reader is the view `get_owed_collateral`; no method pays it out. Buyers are never checked for registration on the collateral token. The gap is noted in interface-p0 but not in DECISIONS or the README.

**Failure scenario.** The collateral token requires NEP-145 registration (a real token, or mock-ft with `set_registration_required`), or its storage is exhausted (SR-27). An unregistered buyer's settlement debits their escrow, the collateral transfer fails, and the units stay in nectar-core until an upgrade.

**Fix.** Add `claim_owed_collateral(symbol)`: zero the entry, ft_transfer it, and restore it in `on_payout` if the transfer fails. Alternatively, require buyers to register on the collateral token before funding a quote.

**Verifier notes.** Code verdict low. Needs an owner token choice; live mock-ft registers accounts automatically.

### SR-18 — low — contract — A deposit smaller than the reserved units is never recorded, so the collateral cannot be released without the keeper-attestation fallback
`contracts/nectar-core/src/remote.rs:704`

**Description.** `on_deposit_verified` rejects `units < reserved_units` without recording the depositor. `request_remote_release` requires a recorded depositor (remote.rs:766), and every retry gets the same rejection. The vaults have no top-up and no depositor reclaim. Only `keeper_attest_deposit` (a testnet flag) can record the depositor.

**Failure scenario.** A borrower reserves 100 units and deposits 99 under the correct authority with a hand-built client. Confirm always returns `units_below_reserved`, the reservation expires, and the 99 units stay in the vault under nectar-core's key.

**Fix.** When the attested read proves a deposit under the right authority but below the reserved units, record the depositor and the real units, refuse the loan, and mark the position releasable through the existing refused-loan path.

**Verifier notes.** Code verdict low. The web client deposits exactly the reserved units; the owner can still recover through the attestation flag.

### SR-19 — low — contract — upsert_collateral lets the token or decimals of a live asset change, misrouting releases and settlements
`contracts/nectar-core/src/lib.rs:1141`

**Description.** For an existing symbol, only a `price_kind` change is blocked while debt is open (lib.rs:1144-1146). `token` and `decimals` can change while positions, quote escrow and Reserve units exist. Every later payout transfers the new `c.token` (lib.rs:755, 944; reserve.rs:344). The old token's mapping is removed, so it can no longer reach `ft_on_transfer`. A decimals change instantly rescales V for every open position. scripts/20 and 21 rerun upsert from config.yaml and are described as idempotent.

**Failure scenario.** The owner re-points NVDAx at a redeployed mock while position #1 holds 100 old-token units. On repay, 100 units of the new token are paid out of other users' deposits, and the old units are stranded.

**Fix.** Require zero debt, zero `active_committed_q`, no open or settling positions and `reserve.units == 0` before allowing a `token` or `decimals` change. Otherwise require a new symbol.

**Verifier notes.** Code verdict low. Owner-only; this is about an honest mistake, not an attacker.

### SR-20 — low — contract — A dust Q_c lets one tiny quote collect the whole buyers' share and pushes the fee index toward u128 overflow
`contracts/nectar-core/src/math.rs:215`

**Description.** `split_premium_qr` (math.rs:209-215) has no floor on Q_c. Settlements and Profit-Lock fills (lib.rs:847-848, shields.rs:258-281) delist a quote only when remaining == 0, so a quote left with 1 µUSDC stays live with weight 1. The buyer can arrange that remainder themselves through their own opted-in Profit-Lock fill.

With that dust quote as the only quote and R_c ≈ 0, each borrow drawing on D_c adds about buyers×1e18 to `acc_fee_per_dollar_e18`. Later, `fee_debt` (amount×acc) overflows in `on_fund_quote` and `on_top_up`.

**Failure scenario.** Q_c = 1 µUSDC and D_c = $50k. One borrow carrying $157.5 of buyers' share sets acc to about 1.6e26, after which any new quote above about $2.1M is refunded with 'math overflow'. After 100 such borrows the ceiling is about $21k, permanently for that asset. The dust quote captures 70% of premiums that would otherwise go to the treasury.

**Fix.** Treat Q_c below `min_quote_usd_e6` as 0 in `split_premium_qr`. Delist a quote whose remaining drops below the minimum after a fill, and credit the dust to the buyer.

**Verifier notes.** Code verdict low. The preconditions are specific, and existing quotes keep working.

### SR-21 — low — contract — set_quote_remote_recipient redirects remote fill payouts without requiring 1 yoctoNEAR, so a function-call access key can do it
`contracts/nectar-core/src/notes.rs:605`

**Description.** Comparable value-moving methods call `assert_one_yocto`: nft_transfer(_call), claim_fees, the quote withdrawals, self_settle and the reserve exits. `set_quote_remote_recipient` is not payable, and the SDK sends deposit 0 (packages/sdk/src/notes.ts:250-258). The recipient it sets decides where seized collateral goes in `settle_remote` (remote.rs:293) and self-settle (shields.rs:188).

**Failure scenario.** A buyer's function-call key for nectar-core-v2 leaks (from a third-party dapp login or an agent or MCP integration). The attacker sets the recipient to their own base58 address, and the next remote fill pays the seized units to them while the quote's USDC pays for them.

**Fix.** Mark the method #[payable] with `assert_one_yocto()`, update the SDK `setQuoteRemoteRecipient` to send 1 yocto (owner web), and update the tests.

**Verifier notes.** Code verdict low. No first-party code creates such a key.

### SR-22 — low — contract — A depleted Reserve (R_c = 0 with live shares) refuses every new deposit until all holders exit
`contracts/nectar-core/src/reserve.rs:159`

**Description.** `reserve_shares_for` returns 'reserve_depleted' when shares > 0 and R_c == 0 (math.rs:236-238), so `on_join_reserve` refunds every deposit. A normal shortfall fill drains R_c to exactly 0 (lib.rs:873-884; tests_reserve shortfall). The Reserve reopens only when shares reach 0, and no owner method resets the pool.

**Failure scenario.** After a shortfall, one idle or lost-key holder (or a griefer holding a $10 Note) never exits. Every JoinNectarReserve for that asset is refunded permanently, and R_c stays 0 in every limit until a code upgrade.

**Fix.** When a fill leaves R_c at 0 or dust, snapshot the per-share indexes for the epoch, bump the epoch and reset shares, so old-epoch Notes keep their unit and fee claims and new deposits mint 1:1. Optionally skip `reserve_ref_add` when the Reserve filled nothing.

**Verifier notes.** Finder said medium; code verdict medium; impact verdict low (no funds at risk, holders can still exit, it fails safe). Took the lower rating. Parking positions in Settling is documented PRD §4.8 behaviour; Notes are locked only for transfers.

### SR-23 — low — contract — nft_resolve_transfer leaves a Note with a receiver that refused it whenever a settlement starts in between
`contracts/nectar-core/src/notes.rs:595`

**Description.** When the receiver refuses the Note or its call fails, `nft_resolve_transfer` keeps the Note with the receiver if `note_locked` became true in the meantime (notes.rs:592-597; test v7_notes_resolve_keeps_note_locked_meanwhile). Reverting would not redirect any payout: payout callbacks read the current owner, and remote recipients are fixed in the preimage. This breaks the NEP-171 refund guarantee.

**Failure scenario.** Alice calls `nft_transfer_call` to a contract that refuses Nectar Notes. In the 1-2 blocks before the resolver runs, a keeper trigger locks the Note (Settling, quote refs or `reserve_ref_add`). The Note stays with the contract; if it cannot transfer NFTs, Alice's claim is locked.

**Fix.** Always revert when the receiver still owns the Note and refused it, whatever the lock says, or set a return-pending flag and move the Note back when the lock ends. `move_note` clears `buyer_remote_recipient`, so check that against in-flight legs. Update the test.

**Verifier notes.** Code verdict medium; impact verdict low (needs the sender's own mistake plus a 1-2 block race; no attacker gains). Took the lower rating.

### SR-24 — low — contract — Stale quote_refs lock a Quote Note whenever a position that once selected it later becomes pending for an unrelated reason
`contracts/nectar-core/src/notes.rs:247`

**Description.** `note_locked(Quote)` returns true if any position in `quote_refs[q]` is currently pending. Refs are pruned only when `note_refs_add` runs for that same quote. No exit path removes a ref: abort, cancel, rollback_leg/SignFailed, settle and both relays all leave it.

**Failure scenario.** A quoter run for remote position P selects quote Q, then aborts or the sign fails. P is later repaid and goes to Releasing. Q's owner cannot nft_transfer Q or call `set_quote_remote_recipient` until the release is relayed, which is indefinite if it never is. The face shows SETTLING.

**Fix.** Store the referencing settlement's nonce or epoch with each ref and lock only while that exact settlement is pending, or remove P from its quotes' refs in abort_settlement, cancel_settlement, rollback_leg, settle and the relays.

**Verifier notes.** Code verdict low. Fee claims and withdrawals are not gated, so no funds are lost.

### SR-25 — low — contract — withdraw_claimable ignores pause, against the rule that all money paths refuse while paused
`contracts/nectar-core/src/v7.rs:155`

**Description.** `withdraw_claimable` ft_transfers the caller's whole `claimable_usdc` (referrer shares, plus proceeds from a failed `pay_to`) without `assert_not_paused`. interface-p0.md:29 allows only views and completed-notice withdrawals while paused. `claim_fees` does check pause.

**Failure scenario.** The owner pauses after a bad owner-oracle price lets borrows through. A borrower whose `pay_to` failed, or a referrer with shares from those borrows, withdraws the USDC during the freeze, before the owner can investigate.

**Fix.** Add `self.assert_not_paused();` plus a test, or record in DECISIONS and interface-v7 that claimable USDC counts as a completed withdrawal.

**Verifier notes.** Code verdict low. Claimable balances are final amounts, and the owner has no method to adjust them anyway.

### SR-26 — low — contract — Anyone can force a release during the refused-loan retry window, killing the borrower's retry
`contracts/nectar-core/src/remote.rs:769`

**Description.** After a proven deposit whose loan is refused before expiry (stale oracle, aggregate cap, ca_pending), the position stays AwaitingDeposit with the depositor recorded, and by design the borrower may retry. `request_remote_release` has no caller check and accepts AwaitingDeposit (769), then moves the position to Releasing (805). Confirm requires AwaitingDeposit or Expired, so the retry is gone for good.

**Failure scenario.** A borrower's confirm returns `remote_loan_refused{oracle stale}`. Within the 30 s cooldown window or longer, a griefer calls `request_remote_release`. The borrower must reserve and deposit again, paying fees on both chains. This can be repeated against every refused confirmation.

**Fix.** While the status is AwaitingDeposit and `now < expires_ns`, allow only the borrower or Note owner to request a release; allow anyone otherwise.

**Verifier notes.** Code verdict low. No funds are misrouted (the release pays the recorded depositor).

### SR-27 — low — contract — mock-ft lets anyone register arbitrary accounts for free, draining the live token contracts' storage stake
`contracts/mock-ft/src/lib.rs:182`

**Description.** `storage_deposit` (lib.rs:181-189) is payable but accepts 0 yocto and any `account_id`, and inserts a balance entry. `internal_transfer` (69-80) also creates an entry for any first-time receiver. The token contract pays about 125 B (about 0.00125 NEAR) per entry. Live usdc-mock and nvdax-mock each have about 0.119 NEAR free, roughly 95 entries.

**Failure scenario.** A griefer batches `storage_deposit({account_id: random})` calls for well under 0.1 NEAR. After that, any write that creates an entry fails: minting to a new judge account, a buyer's first collateral receipt, and nectar-core payouts to first-time receivers. Failed collateral payouts land in owed_collateral (SR-17).

**Fix.** In `storage_deposit`, require at least the measured storage cost when creating an entry and refund the excess. Stop free auto-registration on receipt (charge the sender, or enable `registration_required` and have the scripts pay). Top up the live token accounts.

**Verifier notes.** Code verdict low. Mock tokens; recoverable by sending NEAR to the token accounts.

### SR-28 — low — keeper — The Base relay's default (non-attest) mode can never confirm deposits, because the quoter rejects base-sepolia vault_read, so the keeper loops
`services/keeper/src/base.ts:840`

**Description.** With BASE_KEEPER_ATTEST unset or 0 (the .env.example default for real Base Sepolia), `deposit()` calls `confirm_remote_deposit` for each Open Base slot. The contract sends `vault_read chain=base-sepolia` (remote.rs:639-642). quoter jobs.rs:111 always returns `unsupported_chain` (test vector vault_read_unsupported_chain). The status stays AwaitingDeposit, and the keeper repeats every 60 s with no cap, spending gas reserve and keeper allowance. The WO-29a EVM vault_read was never built.

**Failure scenario.** H15 is funded and the keeper runs against sepolia.base.org with the default setting. Every Base deposit is rejected forever. The borrower gets no loan and the collateral is unreleasable until the owner enables keeper attestation. About 0.01 NEAR leaves the reserve per minute per stuck position.

**Fix.** Refuse to start BaseRelay with keeperAttest=false until the quoter implements EVM vault_read (eth_call positions(id)), or skip domain-0 confirms with an alert. Fix the .env.example and README wording. Cache non-transient rejections.

**Verifier notes.** Finder said medium; code verdict medium; impact verdict low (unreachable in the current local-fork deployment with attest=1; no funds lost; the attestation flag recovers). Took the lower rating.

### SR-29 — low — keeper — The keeper's Base 'nonce used' recovery scans only the last 10,000 blocks, so after long downtime the leg is never relayed
`services/keeper/src/base.ts:767`

**Description.** When `nonceUsed` is true and no stored tx exists, `findEventTx` scans `lookbackBlocks ?? 10_000` (line 423, about 5.6 h on Base Sepolia). After that window it returns skip 'nonce_used_tx_not_found' forever. A stored tx is missing when a third party submitted the public signed leg, when the 600 s pending timeout cleared it, or when the DB was deleted (db.ts says that is safe).

**Failure scenario.** The keeper is down for more than about 6 h while a buyer self-submits the signed Settle. On restart the item is skipped forever. NEAR keeps the position Settling or Releasing, the Note stays locked, and the books never close unless an operator calls `relay_*` by hand.

**Fix.** Scan from the position's PositionOpened block or the vault deployment block, or index the nonce as a topic, or record the NEAR sign height. Do not treat `nonce_used` as a permanent skip. Make the lookback configurable.

**Verifier notes.** Code verdict low. On-chain funds have already moved correctly; practically unreachable on the local anvil fork.

### SR-30 — low — evm — Expiry off-by-one: the EVM vault accepts a message at block.timestamp == expires, while NEAR, the keeper and Solana treat that second as expired
`evm/src/NectarVaultBase.sol:216`

**Description.** `_consume` reverts only when `block.timestamp > expires`. NEAR re-issues a release with a fresh nonce at `now_s >= expires` (remote.rs:773), the keeper refuses at `now >= expires` (base.ts:778), and Solana requires `expires > now`. The keeper relays only the current nonce and skips `vault_position_not_open`, so a landed older nonce is never relayed.

**Failure scenario.** The keeper is down through expiry. At second E the borrower re-requests, and NEAR stores nonce b. Someone lands the old nonce-a Release in a Base block with timestamp E. The keeper skips forever, and NEAR stays Releasing with units ≠ 0. This is accounting drift; no funds are lost.

**Fix.** Use `if (block.timestamp >= expires) revert Expired(...)`. More importantly (owner keeper): when the vault position is not Open, look up PositionReleased/PositionSettled by positionId without the nonce filter and relay that tx. That also covers the general 'old nonce landed before expiry, re-requested after' case.

**Verifier notes.** Code verdict low. The verifier showed the boundary is not the real cause: the stuck state arises whenever the old leg lands unrelayed before a re-request. The keeper change is the real fix.

### SR-31 — low — keeper — The vault program the keeper signs for is not pinned by default, so a lying NEAR RPC can point the fee-payer signer at any program
`services/keeper/src/solana.ts:654`

**Description.** `programFor()` takes the program from NEAR views. The only cross-check, NECTAR_VAULT_PROGRAM_ID, is a TODO-G7 placeholder treated as unset in .env.example, and config.yaml `solana.program_id` is never read. Every later check is consistent for an attacker program: the owner, Vault and Position accounts are all the attacker's, and the Ed25519 check is over the attacker's own key. The fee payer is passed as WRITABLE_SIGNER (lines 238 and 258), so its privileges carry into CPI.

**Failure scenario.** A malicious or compromised NEAR_RPC_URL (third-party fastnear by default) returns a Settling position whose vault_program is an attacker program, plus a matching pending settlement. The keeper sends the tx, and the attacker program CPIs `system_program::transfer` to drain the keeper's devnet SOL, which halts relaying.

**Fix.** When the relay is enabled, make the program id mandatory (defaulting to config.yaml `solana.program_id`) and refuse any position whose vault_program differs. Do the same for the Base vault (`base.vault`).

**Verifier notes.** Code verdict low. Requires a malicious RPC; the asset at risk is devnet SOL plus relay liveness. The Base half is weaker (EVM has no signer delegation).

### SR-32 — low — x402 — The x402 facilitator HTTP endpoint accepts caller-chosen requirements without auth, so the relayer pays gas for anyone's ft_transfer
`services/x402/src/server.ts:139`

**Description.** `createFacilitatorHttp` passes the caller's `paymentPayload` and `paymentRequirements` straight to `verify`/`settle`. @x402/near checks only that the two agree with each other (asset, payTo, amount). There is no token allowlist, no pin to this service's route and no authentication. When X402_FACILITATOR_PORT is set, the listener binds to `cfg.host`, the same host as the paid route.

**Failure scenario.** X402_HOST=0.0.0.0 and X402_FACILITATOR_PORT are set to publish the facilitator. An attacker loops /settle with fresh SignedDelegates for 1-unit ft_transfers between two of their own accounts on any token with code. x402-relayer pays every outer tx and drains, after which the paid export can no longer settle.

**Fix.** Require a shared-secret bearer token. Bind the facilitator to 127.0.0.1 by default regardless of X402_HOST (or add a separate X402_FACILITATOR_HOST). Add a beforeSettle asset/payTo allowlist hook. Pinning to `routes(cfg)` alone would defeat the endpoint's purpose.

**Verifier notes.** Code verdict low. Needs non-default env settings; testnet NEAR only; the relayer can be refilled.

### SR-33 — low — feed — open_protected_stock_loan reports preview.ok=true for borrows the contract will refuse because of the chosen pre_liq_ltv_bps
`services/feed/src/skill.ts:234`

**Description.** `preview.ok` comes from `preview_borrow`, which takes no `pre_liq_ltv_bps` and calls `check_borrow(..., None)` (lib.rs:1630, 1688). The unsigned msg does carry `pre_liq_ltv_bps`, and the real path refuses 'borrow above pre_liq_ltv_bps' (lib.rs:717-720). The skill already computes `healthTable[0].triggerable` but does not act on it.

**Failure scenario.** An agent passes `pre_liq_ltv_bps` = 6500 (the config minimum) with a borrow at about 6800 bps LTV, which is below the 7000 cap. The tool returns ok:true and an unsigned call. The signed tx fails and the FT is refunded: the agent is misled and loses gas.

**Fix.** Throw `SkillError('borrow_would_fail')` when `healthTable(...)[0].triggerable` is true, or add an optional `pre_liq_ltv_bps` to the `preview_borrow` view (owner contract) and pass it.

**Verifier notes.** Code verdict low. No funds lost; the default pre_liq never hits it.

## Coverage gaps (completeness critic)

- Web and SDK not reviewed: apps/web (including the server-side api/, agents/ and talk/ routes, console, RemoteFlow), packages/sdk and packages/ui got only spot reads. Not checked: XSS or unsafe rendering of on-chain strings (pay_to memo, symbols, recipients, Note SVG), how wallet transactions are built (receiver, amount, deposit, Solana open_position amounts), Next.js API route secrets and SSRF, CSP.
- Agents and copilot not reviewed: the NEAR AI copilot (P2/G8) and the Feed MCP beyond skill.ts/mcp.ts/near.ts. Prompt injection from on-chain data into agents (agents track) is unassessed. The verifier noted that PRD §6 says the Feed indexer cross-checks Solana txs, but this is not implemented.
- Privacy track claims not assessed by any reviewer (what events, Feed exports and memos leak).
- No test suite was run (cargo, near-sandbox, anchor, pnpm). The only exception is the EVM foundry suite, run in a scratchpad copy: 77 passed, 1 skipped.
- Possibly lost finding: the evm-vault reviewer reproduced a 'no-code phantom deposit' (empty return data accepted from a token address with no code; the NectarVaultBase constructor at l.124 has no token.code.length check), but no surviving finding covers it. Check whether it was among the 14 rejected or was dropped.
- Live testnet state not checked:
- gas_reserve_yocto and contract balances;
- quoter, vault_read and job pins;
- whether v1 nectar-core and v2 share Solana vault id or nonce spaces (a collision would trigger SR-1 or SR-8 by deployment alone);
- whether deployed devnet bytecode matches the source;
- who holds the Solana program upgrade authority.
- Callback gas not proven:
- on_payout failure branches for BorrowProceeds, CollateralRelease and SettlementBuyer within 5 Tgas (only PayTo is sandbox-tested);
- an out-of-gas in on_deposit_verified or on_release_signature would leave `confirming=true` or Releasing forever with no escape;
- nft_resolve_transfer's 10 Tgas;
- nft_tokens SVG page cost.
- Cross-chain assumptions unverified: MPC signer response variants, OutLayer refund behaviour and cost per call, NEAR/Solana/Base clock skew, refund-to-allowance behaviour of the keeper's function-call key.
- Base/B20 not fully checked: real B20 precompile and PolicyRegistry semantics, and depositor policy revocation after deposit (NotAuthorized at NectarVaultBase.sol:196 would also block the remainder). PROD Token-2022 mint extensions (MemoTransfer, transfer-fee) are only partly considered.
- High-decimal collateral (18–24) not tested: u128 overflow in value math and in the Reserve units index. Unreachable with the 6-decimal config.
- Spec gaps noted but not reported:
- SupplyLendingLiquidity, treasury_usd_e6 and lenders_fees_usd_e6 have no withdrawal path (USDC held permanently);
- with no Reserve configured, quote max_discount can reach 9999 bps while Q_c counts at face value;
- quoter secrets (MM_<id>_*) persist under the contract-level OutLayer profile after a Quote Note transfer.
- Economic and MEV attacks considered design and not quantified: JIT Reserve deposits capturing discounted fills, griefing the global voluntary cap, one actor filling the 64-quote-per-asset cap.
- Upgrade safety: there is no migrate function, and only the 2.0.0→2.1.0 layout was checked.
- Not reviewed against code: docs, README and docs-site truthfulness (e.g. disclosure of single-leg remote settlement, owed collateral with no claim, keeper-advisory relays). Git-history secret scan (G9) and NEAR deploy-script key handling were not checked.

## Rejected by verifiers (14)

- [medium] core-money: Weekend Shield can be opened on any weekday, replacing the 300 bps limit premium with a flat 15 bps (`contracts/nectar-core/src/shields.rs:100`)
- [medium] core-money: A price that goes stale during NYSE hours loosens the oracle-freshness check from 120 s to 24 h (`contracts/nectar-core/src/lib.rs:329`)
- [low] core-money: Failed proceeds transfer: the borrower is charged the fees, and any excess goes to the treasury instead of the borrower (`contracts/nectar-core/src/lib.rs:1438`)
- [low] core-money: Live-quote cap counts exiting and dust quotes, so 64 minimum quotes block new buyers for an asset (`contracts/nectar-core/src/lib.rs:453`)
- [medium] core-settlement: relay_settlement_result accepts any well-formed tx signature and closes the remote position permanently (`contracts/nectar-core/src/p2.rs:345`)
- [medium] core-v7-modules: Reserve exit is instant and riskless: a deposit → borrow → initiate_reserve_exit sequence beats the aggregate limit and the Q:R fee split (`contracts/nectar-core/src/reserve.rs:301`)
- [medium] core-v7-modules: A 'Weekend' Shield can be opened at any time, including mid-session, so any borrower can swap the limit premium for the 15 bps flat fee for good (`contracts/nectar-core/src/shields.rs:102`)
- [medium] core-v7-modules: A remote Loan Note is transferable but carries no collateral claim: release and the self-settle remainder always go to the vault depositor (`contracts/nectar-core/src/notes.rs:318`)
- [low] core-v7-modules: The nft_transfer_call refund path does not restore the quote's buyer_remote_recipient (`contracts/nectar-core/src/notes.rs:599`)
- [low] core-access: upsert_collateral can change the token or decimals of a collateral that has open positions and live quotes (`contracts/nectar-core/src/lib.rs:1141`)
- [low] evm-vault: openPosition credits the requested amount without checking that tokens moved; a token or registry address with empty code is accepted (`evm/src/NectarVaultBase.sol:145`)
- [low] evm-vault: Deployed mock spoke runs with every B20 policy at ALWAYS_ALLOW: DeployMock ignores DEMO_ACCOUNTS, and MOCK_ALLOWLIST_ID is neither set nor type-checked (`evm/script/DeployMock.s.sol:21`)
- [low] offchain-trust: Solana 'no mainnet' guard is a URL substring check only, with no genesis-hash check (`services/keeper/src/solana.ts:899`)
- [low] offchain-trust: Demo agent signs whatever call the MCP returns with a full-access key (`services/x402/src/demo-agent.ts:43`)
