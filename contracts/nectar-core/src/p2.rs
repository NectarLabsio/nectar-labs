//! P2 (feature `p2`, default): Chain Signatures settlement leg of a **remote** position (interface-v7 §B, WO-21).
//!
//! v2: NEAR-held positions always settle on NEAR (lib.rs `settle`); the v1 demo leg that signed a Solana message
//! for NEAR-held collateral with the global path `solana-devnet-v1` is gone. A remote position (src/remote.rs)
//! settles in one leg: the first selected quote with a valid `buyer_remote_recipient` whose leg leaves the debt or
//! the units at 0 (the vault closes the position on settle and returns the remainder to the depositor). That
//! leg's escrow is debited and the position's debt/units reduced at once, the position goes to `Settling`, and the
//! contract calls `<signer>.sign({request:{path: <position path>, payload_v2:{Eddsa: hex(preimage)}, domain_id}})`
//! with 1 yocto from `gas_reserve_yocto` (F-031, F-033) `.then(on_signature)`. The preimage is the v1 preimage +
//! `|kind=PRELIQ`. The pool credit waits for the signature. No keeper share in collateral on a remote leg
//! (the vault pays only `seize_units` to the recipient; disclosed).
//!
//! on_signature: `{"scheme":"Ed25519","signature":[64 u8]}` (F-035) -> `Signed`, `settlement_signed`, pool
//! credit. Failed promise (MPC timeout, F-035) or malformed result -> the leg is rolled back,
//! `settlement_sign_failed`, position Open. relay_settlement_result (keeper) -> `Relayed`, position Closed
//! (Open if bad debt remains), remote Closed. A successful signature is never rolled back (it is public in the
//! receipt), so cancel_settlement only rolls back an unsigned leg after its preimage `expires`.
//!
//! State: raw storage keys outside the root struct. Nonces: one contract-wide counter shared by settle and release.

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::json;
use near_sdk::{AccountId, Gas, NearToken, Promise, PromiseError, env, near, require};

use crate::chainsig::{self, PreimageInput};
use crate::events::emit;
use crate::types::*;
use crate::{ERR_KEEPER, MAX_QUOTES_PER_ASSET, Nectar, NectarExt, ONE_YOCTO, math, ok};

pub const SIGNER_CONFIG_KEY: &[u8] = b"__p2_signer_config";
pub const NEXT_NONCE_KEY: &[u8] = b"__p2_next_nonce";
pub const PENDING_PREFIX: &[u8] = b"__p2_pending:";
/// SR-3 (WO-34a): marks a leg that has been signed at least once. Its pool credit is booked and it may have executed,
/// so it is never rolled back, whatever its status while a re-sign is in flight.
pub const RESIGN_PREFIX: &[u8] = b"__v7c_resign:";
/// Own burn of `on_signature` (parse + 3 writes).
pub const GAS_ON_SIGNATURE: Gas = Gas::from_tgas(10);
/// Exec fees of the sign + callback receipts, charged to the creating receipt (WO-10a lesson).
pub const GAS_SIGN_RECEIPTS: Gas = Gas::from_tgas(5);
/// `{"scheme":"Ed25519","signature":[64 numbers]}` is < 300 B.
pub const MAX_SIGNATURE_RESULT_LEN: usize = 1024;
pub(crate) const SEC: u64 = 1_000_000_000;

/// Built in the effects phase, scheduled in the interactions phase.
pub struct SignCall {
    pub(crate) account: AccountId,
    pub(crate) args: String,
    pub(crate) cb_method: &'static str,
    pub(crate) cb: String,
    pub(crate) gas: Gas,
    pub(crate) cb_gas: Gas,
}

fn pending_key(position_id: u64) -> Vec<u8> {
    let mut k = PENDING_PREFIX.to_vec();
    k.extend_from_slice(&position_id.to_le_bytes());
    k
}

fn resign_key(position_id: u64) -> Vec<u8> {
    let mut k = RESIGN_PREFIX.to_vec();
    k.extend_from_slice(&position_id.to_le_bytes());
    k
}

pub(crate) fn valid_remote_chain(rc: &RemoteChain) -> bool {
    chainsig::valid_chain_id(&rc.chain_id)
        && chainsig::valid_base58_address(&rc.vault_program)
        && rc.mpc_domain_id == chainsig::ED25519_DOMAIN_ID
}

/// `sign` args (F-031): raw bytes as `Eddsa` hex.
pub(crate) fn sign_args(path: &str, message: &str, domain_id: u32) -> String {
    json!({ "request": { "path": path, "payload_v2": { "Eddsa": chainsig::hex(message.as_bytes()) },
                         "domain_id": domain_id } })
    .to_string()
}

impl Nectar {
    pub(crate) fn signer_config(&self) -> Option<SignerConfig> {
        env::storage_read(SIGNER_CONFIG_KEY).and_then(|b| near_sdk::borsh::from_slice(&b).ok())
    }
    pub(crate) fn pending(&self, position_id: u64) -> Option<PendingSettlement> {
        env::storage_read(&pending_key(position_id))
            .and_then(|b| near_sdk::borsh::from_slice::<VPending>(&b).ok())
            .map(|VPending::V1(d)| d)
    }
    fn put_pending(&mut self, d: PendingSettlement) {
        let b = near_sdk::borsh::to_vec(&VPending::V1(d.clone())).unwrap_or_else(|_| env::panic_str("borsh"));
        env::storage_write(&pending_key(d.position_id.0), &b);
    }
    pub(crate) fn next_nonce(&self) -> u64 {
        env::storage_read(NEXT_NONCE_KEY)
            .and_then(|b| <[u8; 8]>::try_from(b.as_slice()).ok())
            .map_or(0, u64::from_le_bytes)
    }
    /// Takes the next nonce of the shared counter (settle + release). Effect; call after all checks.
    pub(crate) fn take_nonce(&mut self) -> Result<u64, &'static str> {
        let nonce = self.next_nonce();
        let next = nonce.checked_add(1).ok_or("nonce overflow")?;
        env::storage_write(NEXT_NONCE_KEY, &next.to_le_bytes());
        Ok(nonce)
    }

    /// A settle leg awaiting its signature, or signed and not relayed.
    pub(crate) fn settle_in_flight(&self, position_id: u64) -> bool {
        self.pending(position_id)
            .is_some_and(|d| matches!(d.status, PendingStatus::AwaitingSignature | PendingStatus::Signed))
    }

    fn on_signature_gas() -> u64 {
        GAS_ON_SIGNATURE.as_gas()
    }
    /// Gas the receipt that schedules a sign leg must still hold for it.
    pub(crate) fn sign_leg_gas(s: &SignerConfig) -> u64 {
        Gas::from_tgas(s.gas_tgas).as_gas() + Self::on_signature_gas() + GAS_SIGN_RECEIPTS.as_gas()
    }

    /// Extra gas a settlement of this position needs downstream for the sign leg (remote positions only).
    pub(crate) fn remote_extra_gas(&self, p: &Position) -> u64 {
        match (&p.remote, self.signer_config()) {
            (Some(_), Some(s)) => Self::sign_leg_gas(&s),
            _ => 0,
        }
    }

    /// MPC domain of a remote position (Ed25519 for anything else).
    pub(crate) fn remote_domain(&self, position_id: u64) -> u32 {
        self.position(position_id).and_then(|p| p.remote).map_or(chainsig::ED25519_DOMAIN_ID, |r| r.domain_id)
    }

    pub(crate) fn check_sign_gas(s: &SignerConfig) -> Result<(), &'static str> {
        let left = env::prepaid_gas().as_gas().saturating_sub(env::used_gas().as_gas());
        if left < Self::sign_leg_gas(s) { Err("attach more gas") } else { Ok(()) }
    }

    /// SR-3: a leg that was signed once (booked, possibly executed); it must never be rolled back.
    pub(crate) fn resign_marked(&self, position_id: u64) -> bool {
        env::storage_has_key(&resign_key(position_id))
    }

    /// SR-3: the position has a settle leg that is signed, or is being re-signed.
    pub(crate) fn signed_leg_open(&self, position_id: u64) -> bool {
        self.pending(position_id).is_some_and(|d| {
            d.status == PendingStatus::Signed
                || (d.status == PendingStatus::AwaitingSignature && self.resign_marked(position_id))
        })
    }

    /// What one settle leg signs and the `sign` args: Solana v2 preimage, or the EIP-712 `Settle` digest.
    fn leg_message(
        position_id: u64,
        r: &RemoteInfo,
        leg: &RemoteLeg,
        nonce: u64,
        expires: u64,
    ) -> Result<(String, String, Option<EvmSigned>), &'static str> {
        if !chainsig::recipient_fits(r.domain_id, &leg.recipient) {
            return Err("remote settle: domain not supported");
        }
        // WO-29a: an EVM (domain 0) leg signs the EIP-712 `Settle` digest; `preimage` holds `0x<digest>`.
        if r.domain_id == chainsig::SECP256K1_DOMAIN_ID {
            if leg.kind != chainsig::KIND_PRELIQ && leg.kind != chainsig::KIND_SELF {
                return Err("bad kind");
            }
            let f = crate::evm::SettleFields {
                position_id,
                quote_id: leg.quote_id,
                repay_e6: leg.repay_usd_e6,
                seize_raw: leg.buyer_units,
                recipient: crate::evm::parse_address(&leg.recipient).ok_or("bad recipient")?,
                nonce,
                expires,
                kind: leg.kind,
            };
            let (digest, rec) = crate::evm::settle_digest_for(r, &f)?;
            Ok((crate::evm::hex0x(&digest), crate::evm::ecdsa_sign_args(&r.path, &digest, r.domain_id), Some(rec)))
        } else {
            let preimage = chainsig::build_preimage_v2(
                &PreimageInput {
                    chain_id: &r.chain_id,
                    vault_program: &r.vault_program,
                    position_id,
                    quote_id: leg.quote_id,
                    repay_e6: leg.repay_usd_e6,
                    seize_units: leg.buyer_units,
                    recipient: &leg.recipient,
                    nonce,
                    expires,
                },
                leg.kind,
            )
            .ok_or("bad kind")?;
            if preimage.len() > chainsig::MAX_EDDSA_PAYLOAD {
                return Err("preimage too long");
            }
            let args = sign_args(&r.path, &preimage, r.domain_id);
            Ok((preimage, args, None))
        }
    }

    /// Effects of the remote settle leg: nonce, pending record, event. Checks first; `Err` = nothing written.
    pub(crate) fn record_remote_leg(
        &mut self,
        p: &mut Position,
        r: &RemoteInfo,
        s: &SignerConfig,
        leg: RemoteLeg,
    ) -> Result<SignCall, &'static str> {
        let nonce = self.next_nonce();
        let expires = (env::block_timestamp() / SEC).checked_add(s.expiry_s).ok_or("expiry overflow")?;
        let (preimage, args, evm_rec) = Self::leg_message(p.position_id.0, r, &leg, nonce, expires)?;
        let kind_name = if leg.kind == chainsig::KIND_SELF { "SELF" } else { "PRELIQ" };
        // effects
        self.take_nonce()?;
        p.nonce = U64(nonce);
        if let Some(rec) = evm_rec {
            self.put_evm_record(crate::evm::EVM_SETTLE_PREFIX, p.position_id.0, rec);
        }
        emit(
            "settlement_sign_requested",
            json!({ "position_id": p.position_id, "quote_id": U64(leg.quote_id), "nonce": U64(nonce),
                    "expires": U64(expires), "preimage": preimage, "recipient": leg.recipient,
                    "repay_usd_e6": U128(leg.repay_usd_e6), "seize_units": U128(leg.buyer_units),
                    "path": r.path, "kind": kind_name, "fee_usd_e6": U128(leg.fee_usd_e6), "chain": r.chain_id,
                    "domain_id": r.domain_id }),
        );
        let cb = json!({ "position_id": p.position_id, "quote_id": U64(leg.quote_id), "nonce": U64(nonce) }).to_string();
        // WO-22: the leg's Quote Note stays put until the leg is relayed, cancelled or fails.
        self.note_refs_add(p.position_id.0, &[leg.quote_id]);
        self.put_pending(PendingSettlement {
            position_id: p.position_id,
            quote_id: U64(leg.quote_id),
            nonce: U64(nonce),
            expires: U64(expires),
            preimage,
            signature_hex: None,
            repay_usd_e6: U128(leg.repay_usd_e6),
            seize_units: U128(leg.buyer_units),
            keeper_units: U128(leg.keeper_units),
            recipient: leg.recipient,
            status: PendingStatus::AwaitingSignature,
            solana_tx_sig: None,
            kind: leg.kind,
            fee_usd_e6: U128(leg.fee_usd_e6),
        });
        Ok(SignCall {
            account: s.account.clone(),
            args,
            cb_method: "on_signature",
            cb,
            gas: Gas::from_tgas(s.gas_tgas),
            cb_gas: Gas::from_gas(Self::on_signature_gas()),
        })
    }

    pub(crate) fn schedule_sign(call: SignCall) {
        Promise::new(call.account)
            .function_call("sign", call.args.into_bytes(), ONE_YOCTO, call.gas)
            .then(Promise::new(env::current_account_id()).function_call(
                call.cb_method,
                call.cb.into_bytes(),
                NearToken::from_yoctonear(0),
                call.cb_gas,
            ))
            .detach();
    }

    /// WO-36c: a remote loan was paid out, or an unsigned leg gave its debt back.
    pub(crate) fn remote_debt_add(symbol: &str, domain_id: u32, amount: u128) {
        Self::set_remote_debt(symbol, domain_id, ok(math::add(Self::remote_debt(symbol, domain_id), amount)));
    }

    /// Undo an unsigned leg: escrow back to the quote (re-listed if it had been emptied), debt and units back
    /// to the position, remote status back to Open. The pool and treasury were never credited. A SELF leg
    /// returns `repay + fee` to the quote; the day's voluntary-fill counter is not rolled back (conservative).
    fn rollback_leg(&mut self, p: &mut Position, d: &PendingSettlement) {
        let repay = d.repay_usd_e6.0;
        let escrow = ok(math::add(repay, d.fee_usd_e6.0));
        p.debt_usd_e6 = U128(ok(math::add(p.debt_usd_e6.0, repay)));
        p.units = U128(ok(math::add(p.units.0, ok(math::add(d.seize_units.0, d.keeper_units.0)))));
        if let Some(r) = p.remote.as_mut() {
            r.status = RemoteStatus::Open;
            Self::remote_debt_add(&p.collateral, r.domain_id, repay);
        }
        // v2 A1: the leg's repayment left the aggregate in `settle_remote`; it comes back with the debt.
        let mut cd = self.coll_or_panic(&p.collateral);
        cd.total_debt_usd_e6 = U128(ok(math::add(cd.total_debt_usd_e6.0, repay)));
        self.put_coll(cd);
        if let Some(mut q) = self.quote(d.quote_id.0) {
            let mut c = self.coll_or_panic(&p.collateral);
            let acc = c.acc_fee_per_dollar_e18.0;
            ok(Self::checkpoint_fees(&mut q, acc));
            q.remaining_usd_e6 = U128(ok(math::add(q.remaining_usd_e6.0, escrow)));
            let mut ids = self.live_ids(&p.collateral);
            if !ids.contains(&q.quote_id.0) {
                if ids.len() < MAX_QUOTES_PER_ASSET && Self::below_reserve(&q, &c) {
                    ids.push(q.quote_id.0);
                    self.quotes_by_collateral.insert(p.collateral.clone(), ids);
                } else if !q.exiting() {
                    // SR-16: it cannot be listed, so it leaves Q_c as an exit the buyer can complete at once.
                    q.unlock_ns = Some(U64(env::block_timestamp()));
                }
            }
            if !q.exiting() {
                c.active_committed_q_usd_e6 = U128(ok(math::add(c.active_committed_q_usd_e6.0, escrow)));
            }
            ok(Self::reset_fee_debt(&mut q, acc));
            self.put_coll(c);
            self.put_quote(q);
        }
    }

    /// SR-20: once a leg is signed it can no longer be rolled back, so a dust remainder leaves the book. All arithmetic
    /// first; `Err` = nothing written (the dust stays, the callback does not fail).
    fn sweep_leg_dust(&mut self, quote_id: u64, symbol: &str) -> crate::math::MathResult<()> {
        let (Some(mut q), Some(mut c)) = (self.quote(quote_id), self.coll(symbol)) else { return Ok(()) };
        let acc = c.acc_fee_per_dollar_e18.0;
        Self::checkpoint_fees(&mut q, acc)?;
        let dust = self.sweep_dust(&mut q)?;
        if dust == 0 {
            return Ok(());
        }
        Self::reset_fee_debt(&mut q, acc)?;
        c.active_committed_q_usd_e6 = U128(math::sub(c.active_committed_q_usd_e6.0, dust)?);
        self.remove_live(symbol, quote_id);
        self.put_coll(c);
        self.put_quote(q);
        Ok(())
    }

    /// SR-15: `vault_read` reports no mint, so one (chain, vault) serves one collateral: a second symbol on the same
    /// vault would be valued from the first symbol's deposits.
    pub(crate) fn assert_vault_unbound(&self, symbol: &str, rc: &RemoteChain) {
        let same = |x: &RemoteChain| x.chain_id == rc.chain_id && x.vault_program == rc.vault_program;
        let bound = self.collaterals.iter().any(|(s, VCollateral::V2(c))| {
            s != symbol && (c.remote_chain.as_ref().is_some_and(same) || self.extra_chains(s).iter().any(|e| same(&e.chain)))
        });
        require!(!bound, "vault already serves another collateral");
    }

    /// `cancel_settlement` hook: roll back an unsigned leg once its preimage has expired.
    pub(crate) fn cancel_remote_leg(&mut self, p: &mut Position) {
        let Some(mut d) = self.pending(p.position_id.0) else { return };
        // SR-3: a re-signing leg was signed before; only a leg that was never signed can be undone.
        if d.status == PendingStatus::AwaitingSignature && !self.resign_marked(p.position_id.0) {
            require!(env::block_timestamp() / SEC >= d.expires.0, "signature pending until expiry");
            self.rollback_leg(p, &d);
            d.status = PendingStatus::Cancelled;
            self.put_pending(d);
        }
        // Signed: debt already repaid, the signature is valid on Solana; the relay can still be recorded and the
        // remote status stays Settling, so no release can be requested against the same collateral.
    }
}

#[near]
impl Nectar {
    /// MPC `sign` callback (F-035). Never panics on business failures.
    #[private]
    pub fn on_signature(&mut self, position_id: U64, quote_id: U64, nonce: U64) {
        let Some(mut d) = self.pending(position_id.0) else { return };
        if d.nonce != nonce || d.quote_id != quote_id || d.status != PendingStatus::AwaitingSignature {
            return; // cancelled after expiry meanwhile
        }
        let mut p = self.position_or_panic(position_id.0);
        let domain = p.remote.as_ref().map_or(chainsig::ED25519_DOMAIN_ID, |r| r.domain_id);
        let sig = if env::promise_results_count() != 1 {
            Err("no_result")
        } else {
            match env::promise_result_checked(0, MAX_SIGNATURE_RESULT_LEN) {
                Ok(b) => crate::evm::parse_sign_result(&b, domain),
                Err(PromiseError::TooLong(_)) => Err("too_long"),
                Err(_) => Err("failed"), // MPC timeout -> fail_on_timeout (F-035)
            }
        };
        match sig {
            Ok((signature_hex, evm_sig)) => {
                let repay = d.repay_usd_e6.0;
                self.utilised_usd_e6 = ok(math::sub(self.utilised_usd_e6, repay));
                self.available_usd_e6 = ok(math::add(self.available_usd_e6, repay));
                // WO-23a SELF: the Profit-Lock fee reaches the treasury once the sale is signed.
                self.treasury_usd_e6 = ok(math::add(self.treasury_usd_e6, d.fee_usd_e6.0));
                d.signature_hex = Some(signature_hex.clone());
                d.status = PendingStatus::Signed;
                let (path, authority) = p.remote.as_ref().map_or((None, None), |r| (Some(r.path.clone()), r.authority.clone()));
                let chain = p.remote.as_ref().map(|r| r.chain_id.clone());
                let mut ev = json!({ "position_id": position_id, "quote_id": quote_id, "nonce": nonce,
                            "preimage": d.preimage, "signature_hex": signature_hex, "path": path,
                            "pubkey": authority, "kind": d.kind, "chain": chain });
                if let Some(es) = &evm_sig {
                    ev["digest"] = json!(d.preimage);
                    ev["r"] = json!(crate::evm::hex0x(&es.r));
                    ev["s"] = json!(crate::evm::hex0x(&es.s));
                    ev["v"] = json!(es.v);
                    ev["s_normalised"] = json!(es.normalised);
                    self.store_evm_sig(crate::evm::EVM_SETTLE_PREFIX, position_id.0, es);
                }
                emit("settlement_signed", ev);
                let _ = self.sweep_leg_dust(d.quote_id.0, &p.collateral);
                self.put_pending(d);
            }
            Err(reason) => {
                self.rollback_leg(&mut p, &d);
                self.note_refs_clear(&p);
                p.status = PositionStatus::Open;
                d.status = PendingStatus::SignFailed;
                emit(
                    "settlement_sign_failed",
                    json!({ "position_id": position_id, "quote_id": quote_id, "nonce": nonce, "reason": reason }),
                );
                self.put_pending(d);
                self.put_position(p);
            }
        }
    }

    /// SR-3 (WO-34a): anyone, once a signed leg has expired unrelayed: signs the IDENTICAL leg (repay, seize, recipient,
    /// kind) again with a fresh nonce and expiry. Safe without a vault read: if the old message landed, the vault
    /// position is no longer open and the new one fails. No rollback, no second pool credit. 1 yocto from
    /// `gas_reserve_yocto`. Not payable.
    pub fn resign_remote_settlement(&mut self, position_id: U64) {
        self.assert_not_paused();
        let mut d = self.pending(position_id.0).unwrap_or_else(|| env::panic_str("no pending settlement"));
        require!(self.signed_leg_open(position_id.0), "settlement not signed");
        let now_s = env::block_timestamp() / SEC;
        require!(now_s >= d.expires.0, "signature valid until expiry");
        let mut p = self.position_or_panic(position_id.0);
        let r = p.remote.clone().unwrap_or_else(|| env::panic_str("not a remote position"));
        let s = self.signer_config().unwrap_or_else(|| env::panic_str("no signer config"));
        let reserve = math::sub(self.gas_reserve_yocto, 1).unwrap_or_else(|_| env::panic_str("gas reserve empty"));
        if let Err(e) = Self::check_sign_gas(&s) {
            env::panic_str(e);
        }
        let nonce = self.next_nonce();
        let expires = now_s.checked_add(s.expiry_s).unwrap_or_else(|| env::panic_str("expiry overflow"));
        let leg = RemoteLeg {
            quote_id: d.quote_id.0,
            repay_usd_e6: d.repay_usd_e6.0,
            buyer_units: d.seize_units.0,
            keeper_units: d.keeper_units.0,
            recipient: d.recipient.clone(),
            kind: d.kind,
            fee_usd_e6: d.fee_usd_e6.0,
        };
        let (preimage, args, evm_rec) =
            Self::leg_message(position_id.0, &r, &leg, nonce, expires).unwrap_or_else(|e| env::panic_str(e));
        // effects
        self.take_nonce().unwrap_or_else(|e| env::panic_str(e));
        self.gas_reserve_yocto = reserve;
        env::storage_write(&resign_key(position_id.0), &[1u8]);
        if let Some(rec) = evm_rec {
            self.put_evm_record(crate::evm::EVM_SETTLE_PREFIX, position_id.0, rec);
        }
        p.nonce = U64(nonce);
        self.put_position(p);
        emit(
            "settlement_resign_requested",
            json!({ "position_id": position_id, "quote_id": d.quote_id, "previous_nonce": d.nonce, "nonce": U64(nonce),
                    "expires": U64(expires), "preimage": preimage, "recipient": d.recipient,
                    "repay_usd_e6": d.repay_usd_e6, "seize_units": d.seize_units, "path": r.path, "kind": d.kind,
                    "chain": r.chain_id, "domain_id": r.domain_id }),
        );
        let cb = json!({ "position_id": position_id, "quote_id": d.quote_id, "nonce": U64(nonce) }).to_string();
        d.nonce = U64(nonce);
        d.expires = U64(expires);
        d.preimage = preimage;
        d.signature_hex = None;
        d.status = PendingStatus::AwaitingSignature;
        self.put_pending(d);
        // interaction
        Self::schedule_sign(SignCall {
            account: s.account.clone(),
            args,
            cb_method: "on_resign_signature",
            cb,
            gas: Gas::from_tgas(s.gas_tgas),
            cb_gas: Gas::from_gas(Self::on_signature_gas()),
        });
    }

    /// MPC `sign` callback of a re-sign. Success: Signed again, no pool credit (booked by the first signature). Failure:
    /// nothing is rolled back; the expiry is pulled to now so the re-sign can be requested at once. Never panics.
    #[private]
    pub fn on_resign_signature(&mut self, position_id: U64, quote_id: U64, nonce: U64) {
        let Some(mut d) = self.pending(position_id.0) else { return };
        if d.nonce != nonce || d.quote_id != quote_id || d.status != PendingStatus::AwaitingSignature {
            return;
        }
        let p = self.position_or_panic(position_id.0);
        let domain = p.remote.as_ref().map_or(chainsig::ED25519_DOMAIN_ID, |r| r.domain_id);
        let sig = if env::promise_results_count() != 1 {
            Err("no_result")
        } else {
            match env::promise_result_checked(0, MAX_SIGNATURE_RESULT_LEN) {
                Ok(b) => crate::evm::parse_sign_result(&b, domain),
                Err(PromiseError::TooLong(_)) => Err("too_long"),
                Err(_) => Err("failed"),
            }
        };
        match sig {
            Ok((signature_hex, evm_sig)) => {
                d.signature_hex = Some(signature_hex.clone());
                d.status = PendingStatus::Signed;
                let (path, authority) = p.remote.as_ref().map_or((None, None), |r| (Some(r.path.clone()), r.authority.clone()));
                let chain = p.remote.as_ref().map(|r| r.chain_id.clone());
                let mut ev = json!({ "position_id": position_id, "quote_id": quote_id, "nonce": nonce,
                            "preimage": d.preimage, "signature_hex": signature_hex, "path": path,
                            "pubkey": authority, "kind": d.kind, "chain": chain, "resign": true });
                if let Some(es) = &evm_sig {
                    ev["digest"] = json!(d.preimage);
                    ev["r"] = json!(crate::evm::hex0x(&es.r));
                    ev["s"] = json!(crate::evm::hex0x(&es.s));
                    ev["v"] = json!(es.v);
                    ev["s_normalised"] = json!(es.normalised);
                    self.store_evm_sig(crate::evm::EVM_SETTLE_PREFIX, position_id.0, es);
                }
                emit("settlement_signed", ev);
            }
            Err(reason) => {
                d.expires = U64(env::block_timestamp() / SEC);
                emit(
                    "settlement_resign_failed",
                    json!({ "position_id": position_id, "quote_id": quote_id, "nonce": nonce, "reason": reason }),
                );
            }
        }
        self.put_pending(d);
    }

    /// Keeper records the remote settlement tx of a signed leg (PRD §6.5): a Solana signature, or for an EVM
    /// (domain 0) position the `0x` tx hash in the same argument (the keeper key's method list is unchanged). Not payable.
    pub fn relay_settlement_result(&mut self, position_id: U64, solana_tx_sig: String) {
        require!(env::predecessor_account_id() == self.keeper, ERR_KEEPER);
        let domain = self.remote_domain(position_id.0);
        require!(crate::evm::valid_relay_tx(domain, &solana_tx_sig), "bad solana_tx_sig");
        let mut d = self.pending(position_id.0).unwrap_or_else(|| env::panic_str("no pending settlement"));
        require!(d.status == PendingStatus::Signed, "settlement not signed");
        let mut p = self.position_or_panic(position_id.0);
        // The vault closed the position: seize to the buyer, the remainder to the depositor.
        p.units = U128(0);
        if let Some(r) = p.remote.as_mut() {
            r.status = RemoteStatus::Closed;
        }
        if p.status != PositionStatus::Closed {
            p.status = if p.debt_usd_e6.0 == 0 { PositionStatus::Closed } else { PositionStatus::Open };
        }
        d.status = PendingStatus::Relayed;
        d.solana_tx_sig = Some(solana_tx_sig.clone());
        env::storage_remove(&resign_key(position_id.0));
        self.note_refs_clear(&p);
        emit(
            "settlement_relayed",
            json!({ "position_id": position_id, "quote_id": d.quote_id, "nonce": d.nonce,
                    "solana_tx_sig": solana_tx_sig, "status": p.status }),
        );
        self.put_pending(d);
        self.put_position(p);
    }

    // ------------------------------------------------------------ owner setters
    /// MPC signer (F-030); `gas_tgas` >= 15 (F-034), `expiry_s` in 60..=86400. `path` is kept for ABI
    /// compatibility and is not used to sign in v2 (every remote position signs with `<chain>/pos/<id>`).
    pub fn set_signer_config(&mut self, account: AccountId, path: String, gas_tgas: u64, expiry_s: u64) {
        self.assert_owner();
        require!(chainsig::valid_path(&path), "bad path");
        require!((chainsig::MIN_SIGN_TGAS..=100).contains(&gas_tgas), "gas_tgas out of range");
        require!((60..=86_400).contains(&expiry_s), "expiry_s out of range");
        let s = SignerConfig { account, path, gas_tgas, expiry_s };
        let b = near_sdk::borsh::to_vec(&s).unwrap_or_else(|_| env::panic_str("borsh"));
        env::storage_write(SIGNER_CONFIG_KEY, &b);
        emit("signer_config_set", json!(s));
    }

    /// `null` turns remote reservations off for this collateral (existing remote positions keep their pinned chain).
    pub fn set_remote_chain(&mut self, symbol: String, remote_chain: Option<RemoteChain>) {
        self.assert_owner();
        let mut c = self.coll_or_panic(&symbol);
        if let Some(rc) = &remote_chain {
            require!(valid_remote_chain(rc), "bad remote_chain");
            self.assert_vault_unbound(&symbol, rc);
        }
        c.remote_chain = remote_chain.clone();
        self.put_coll(c);
        emit("remote_chain_set", json!({ "symbol": symbol, "remote_chain": remote_chain }));
    }

    // ------------------------------------------------------------ views
    pub fn get_pending_settlement(&self, position_id: U64) -> Option<PendingSettlement> {
        self.pending(position_id.0)
    }
    pub fn get_signer_config(&self) -> Option<SignerConfig> {
        self.signer_config()
    }
    /// What to pass to `derived_public_key` (F-338) for this remote position's vault authority, and what
    /// `on_authority` stored. None for a NEAR-held position or without a signer config.
    pub fn get_vault_authority_hint(&self, position_id: U64) -> Option<VaultAuthorityHint> {
        let r = self.position(position_id.0)?.remote?;
        self.signer_config().map(|s| VaultAuthorityHint {
            signer_account: s.account,
            predecessor: env::current_account_id(),
            path: r.path,
            domain_id: r.domain_id,
            authority: r.authority,
        })
    }
    pub fn get_next_nonce(&self) -> U64 {
        U64(self.next_nonce())
    }
}
