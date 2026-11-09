//! P2 (feature `p2`, default): Chain Signatures settlement leg (interface-p2.md, D-016).
//!
//! `settle` (P0 static or P1 quoter/Pyth pricing) picks at most one remote leg per call: the first selected
//! quote with a valid `buyer_remote_recipient`, when the collateral has a valid `remote_chain` and a signer
//! config is set. That leg's escrow is debited and the position's debt/units reduced at once (so concurrent
//! settlements see it), the position goes to `Settling`, and the contract calls
//! `<signer>.sign({request:{path, payload_v2:{Eddsa: hex(preimage)}, domain_id}})` with 1 yocto from
//! `gas_reserve_yocto` (F-031, F-033) `.then(on_signature)`. The pool credit and the keeper's share of this leg
//! wait for the signature. Collateral of the leg is not ft_transferred on NEAR: the Solana vault releases
//! `seize_units` to the recipient against the signature.
//!
//! on_signature: `{"scheme":"Ed25519","signature":[64 u8]}` (F-035) -> `Signed`, `settlement_signed`, pool
//! credit, keeper transfer. Failed promise (MPC timeout, F-035) or malformed result -> the leg is rolled back,
//! `settlement_sign_failed`, position Open. relay_settlement_result (keeper) -> `Relayed`, position Closed
//! (Open if debt remains). A successful signature is never rolled back (it is public in the receipt), so
//! cancel_settlement only rolls back an unsigned leg after its preimage `expires` (Solana rejects it then).
//!
//! State: raw storage keys outside the V1 root struct (no migrate), like WO-10b `QUOTER_SECRETS_REF_KEY`.

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
/// Own burn of `on_signature` (parse + 3 writes), on top of one keeper transfer.
pub const GAS_ON_SIGNATURE: Gas = Gas::from_tgas(10);
/// Exec fees of the sign + callback receipts, charged to the creating receipt (WO-10a lesson).
pub const GAS_SIGN_RECEIPTS: Gas = Gas::from_tgas(5);
/// `{"scheme":"Ed25519","signature":[64 numbers]}` is < 300 B.
pub const MAX_SIGNATURE_RESULT_LEN: usize = 1024;
const SEC: u64 = 1_000_000_000;

/// Built in the effects phase of `settle`, scheduled in its interactions phase.
pub struct SignCall {
    account: AccountId,
    args: String,
    cb: String,
    gas: Gas,
}

fn pending_key(position_id: u64) -> Vec<u8> {
    let mut k = PENDING_PREFIX.to_vec();
    k.extend_from_slice(&position_id.to_le_bytes());
    k
}

fn valid_remote_chain(rc: &RemoteChain) -> bool {
    chainsig::valid_chain_id(&rc.chain_id)
        && chainsig::valid_base58_address(&rc.vault_program)
        && rc.mpc_domain_id == chainsig::ED25519_DOMAIN_ID
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

    fn on_signature_gas() -> u64 {
        GAS_ON_SIGNATURE.as_gas() + Self::per_transfer_gas()
    }
    /// Gas the receipt that schedules the sign leg must still hold for it.
    pub(crate) fn sign_leg_gas(s: &SignerConfig) -> u64 {
        Gas::from_tgas(s.gas_tgas).as_gas() + Self::on_signature_gas() + GAS_SIGN_RECEIPTS.as_gas()
    }

    /// (remote chain, signer) when this position's settlement may take a remote leg.
    pub(crate) fn remote_ctx(&self, position_id: u64, c: &CollateralConfig) -> Option<(RemoteChain, SignerConfig)> {
        let rc = c.remote_chain.clone().filter(valid_remote_chain)?;
        let s = self.signer_config()?;
        // A leg awaiting its signature, or signed and not relayed, blocks a second one on the same position.
        if let Some(d) = self.pending(position_id) {
            if matches!(d.status, PendingStatus::AwaitingSignature | PendingStatus::Signed) {
                return None;
            }
        }
        Some((rc, s))
    }

    pub(crate) fn remote_extra_gas(&self, symbol: &str) -> u64 {
        let remote = self.coll(symbol).and_then(|c| c.remote_chain).filter(valid_remote_chain);
        match (remote, self.signer_config()) {
            (Some(_), Some(s)) => Self::sign_leg_gas(&s),
            _ => 0,
        }
    }

    pub(crate) fn check_remote_gas(&self, ctx: &Option<(RemoteChain, SignerConfig)>, n_local: u64) -> Result<(), &'static str> {
        let Some((_, s)) = ctx else { return Ok(()) };
        let need = Self::sign_leg_gas(s) + n_local * Self::per_transfer_gas();
        let left = env::prepaid_gas().as_gas().saturating_sub(env::used_gas().as_gas());
        if left < need { Err("attach more gas") } else { Ok(()) }
    }

    /// Effects of the remote leg: nonce, pending record, event. Checks first; `Err` = nothing written.
    pub(crate) fn record_remote_leg(
        &mut self,
        p: &mut Position,
        rc: &RemoteChain,
        s: &SignerConfig,
        r: RemoteLeg,
    ) -> Result<SignCall, &'static str> {
        let nonce = self.next_nonce();
        let next = nonce.checked_add(1).ok_or("nonce overflow")?;
        let expires = (env::block_timestamp() / SEC).checked_add(s.expiry_s).ok_or("expiry overflow")?;
        let preimage = chainsig::build_preimage(&PreimageInput {
            chain_id: &rc.chain_id,
            vault_program: &rc.vault_program,
            position_id: p.position_id.0,
            quote_id: r.quote_id,
            repay_e6: r.repay_usd_e6,
            seize_units: r.buyer_units,
            recipient: &r.recipient,
            nonce,
            expires,
        });
        if preimage.len() > chainsig::MAX_EDDSA_PAYLOAD {
            return Err("preimage too long");
        }
        // effects
        env::storage_write(NEXT_NONCE_KEY, &next.to_le_bytes());
        p.nonce = U64(nonce);
        emit(
            "settlement_sign_requested",
            json!({ "position_id": p.position_id, "quote_id": U64(r.quote_id), "nonce": U64(nonce),
                    "expires": U64(expires), "preimage": preimage, "recipient": r.recipient,
                    "repay_usd_e6": U128(r.repay_usd_e6), "seize_units": U128(r.buyer_units) }),
        );
        let args = json!({ "request": { "path": s.path, "payload_v2": { "Eddsa": chainsig::hex(preimage.as_bytes()) },
                                         "domain_id": rc.mpc_domain_id } })
        .to_string();
        let cb = json!({ "position_id": p.position_id, "quote_id": U64(r.quote_id), "nonce": U64(nonce) }).to_string();
        self.put_pending(PendingSettlement {
            position_id: p.position_id,
            quote_id: U64(r.quote_id),
            nonce: U64(nonce),
            expires: U64(expires),
            preimage,
            signature_hex: None,
            repay_usd_e6: U128(r.repay_usd_e6),
            seize_units: U128(r.buyer_units),
            keeper_units: U128(r.keeper_units),
            recipient: r.recipient,
            status: PendingStatus::AwaitingSignature,
            solana_tx_sig: None,
        });
        Ok(SignCall { account: s.account.clone(), args, cb, gas: Gas::from_tgas(s.gas_tgas) })
    }

    pub(crate) fn schedule_sign(call: SignCall) {
        Promise::new(call.account)
            .function_call("sign", call.args.into_bytes(), ONE_YOCTO, call.gas)
            .then(Promise::new(env::current_account_id()).function_call(
                "on_signature",
                call.cb.into_bytes(),
                NearToken::from_yoctonear(0),
                Gas::from_gas(Self::on_signature_gas()),
            ))
            .detach();
    }

    /// Undo an unsigned leg: escrow back to the quote (re-listed if it had been emptied), debt and units back
    /// to the position, the keeper-transfer yocto back to the reserve. The pool was never credited.
    fn rollback_leg(&mut self, p: &mut Position, d: &PendingSettlement) {
        let repay = d.repay_usd_e6.0;
        p.debt_usd_e6 = U128(ok(math::add(p.debt_usd_e6.0, repay)));
        p.units = U128(ok(math::add(p.units.0, ok(math::add(d.seize_units.0, d.keeper_units.0)))));
        if let Some(mut q) = self.quote(d.quote_id.0) {
            let mut c = self.coll_or_panic(&p.collateral);
            let acc = c.acc_fee_per_dollar_e18.0;
            ok(Self::checkpoint_fees(&mut q, acc));
            q.remaining_usd_e6 = U128(ok(math::add(q.remaining_usd_e6.0, repay)));
            if !q.exiting() {
                c.active_committed_q_usd_e6 = U128(ok(math::add(c.active_committed_q_usd_e6.0, repay)));
            }
            ok(Self::reset_fee_debt(&mut q, acc));
            let mut ids = self.live_ids(&p.collateral);
            if !ids.contains(&q.quote_id.0) && ids.len() < MAX_QUOTES_PER_ASSET {
                ids.push(q.quote_id.0);
                self.quotes_by_collateral.insert(p.collateral.clone(), ids);
            }
            self.put_coll(c);
            self.put_quote(q);
        }
        if d.keeper_units.0 > 0 {
            self.gas_reserve_yocto = ok(math::add(self.gas_reserve_yocto, 1));
        }
    }

    /// `cancel_settlement` hook: roll back an unsigned leg once its preimage has expired.
    pub(crate) fn cancel_remote_leg(&mut self, p: &mut Position) {
        let Some(mut d) = self.pending(p.position_id.0) else { return };
        if d.status == PendingStatus::AwaitingSignature {
            require!(env::block_timestamp() / SEC >= d.expires.0, "signature pending until expiry");
            self.rollback_leg(p, &d);
            d.status = PendingStatus::Cancelled;
            self.put_pending(d);
        }
        // Signed: debt already repaid, the signature is valid on Solana; the relay can still be recorded.
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
        let sig = if env::promise_results_count() != 1 {
            Err("no_result")
        } else {
            match env::promise_result_checked(0, MAX_SIGNATURE_RESULT_LEN) {
                Ok(b) => chainsig::parse_signature_response(&b),
                Err(PromiseError::TooLong(_)) => Err("too_long"),
                Err(_) => Err("failed"), // MPC timeout -> fail_on_timeout (F-035)
            }
        };
        let mut p = self.position_or_panic(position_id.0);
        match sig {
            Ok(bytes) => {
                let signature_hex = chainsig::hex(&bytes);
                let repay = d.repay_usd_e6.0;
                self.utilised_usd_e6 = ok(math::sub(self.utilised_usd_e6, repay));
                self.available_usd_e6 = ok(math::add(self.available_usd_e6, repay));
                d.signature_hex = Some(signature_hex.clone());
                d.status = PendingStatus::Signed;
                emit(
                    "settlement_signed",
                    json!({ "position_id": position_id, "quote_id": quote_id, "nonce": nonce,
                            "preimage": d.preimage, "signature_hex": signature_hex }),
                );
                let keeper_units = d.keeper_units.0;
                self.put_pending(d);
                if keeper_units > 0 {
                    let token = self.coll_or_panic(&p.collateral).token;
                    let keeper = self.keeper.clone();
                    Self::transfer(&token, &keeper, keeper_units, Payout::SettlementKeeper { position_id }).detach();
                }
            }
            Err(reason) => {
                self.rollback_leg(&mut p, &d);
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

    /// Keeper records the Solana settlement tx of a signed leg (PRD §6.5). Not payable.
    pub fn relay_settlement_result(&mut self, position_id: U64, solana_tx_sig: String) {
        require!(env::predecessor_account_id() == self.keeper, ERR_KEEPER);
        require!(chainsig::valid_tx_signature(&solana_tx_sig), "bad solana_tx_sig");
        let mut d = self.pending(position_id.0).unwrap_or_else(|| env::panic_str("no pending settlement"));
        require!(d.status == PendingStatus::Signed, "settlement not signed");
        let mut p = self.position_or_panic(position_id.0);
        if p.status != PositionStatus::Closed {
            p.status = if p.debt_usd_e6.0 == 0 { PositionStatus::Closed } else { PositionStatus::Open };
        }
        d.status = PendingStatus::Relayed;
        d.solana_tx_sig = Some(solana_tx_sig.clone());
        emit(
            "settlement_relayed",
            json!({ "position_id": position_id, "quote_id": d.quote_id, "nonce": d.nonce,
                    "solana_tx_sig": solana_tx_sig, "status": p.status }),
        );
        self.put_pending(d);
        self.put_position(p);
    }

    // ------------------------------------------------------------ owner setters
    /// MPC signer (F-030); `gas_tgas` >= 15 (F-034), `expiry_s` in 60..=86400.
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

    /// `null` turns the remote leg off for this collateral.
    pub fn set_remote_chain(&mut self, symbol: String, remote_chain: Option<RemoteChain>) {
        self.assert_owner();
        let mut c = self.coll_or_panic(&symbol);
        if let Some(rc) = &remote_chain {
            require!(valid_remote_chain(rc), "bad remote_chain");
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
    /// What to pass to `derived_public_key` (F-036) for the vault authority.
    pub fn get_vault_authority_hint(&self) -> Option<VaultAuthorityHint> {
        self.signer_config().map(|s| VaultAuthorityHint {
            signer_account: s.account,
            predecessor: env::current_account_id(),
            path: s.path,
            domain_id: chainsig::ED25519_DOMAIN_ID,
        })
    }
    pub fn get_next_nonce(&self) -> U64 {
        U64(self.next_nonce())
    }
}
