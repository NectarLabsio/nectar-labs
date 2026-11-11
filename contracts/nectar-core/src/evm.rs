//! WO-29a Base spoke (interface-v7 §D, D-026): EVM remote chains, EIP-712 digests and MPC Ecdsa signatures.
//!
//! - A collateral keeps its primary `remote_chain` (Solana, borsh layout unchanged) and gains up to
//!   `MAX_EXTRA_CHAINS` extra remote chains under a new raw key (`__v8_chains:<symbol>`), e.g.
//!   `{chain_id:"base-sepolia", vault_program:<0x vault>, mpc_domain_id:0}` + the `rpc_url` the `vault_read` job uses.
//!   `reserve_remote_position(.., chain)` picks one; the same quote book serves every chain (a `0x` recipient fills
//!   EVM positions, a base58 one Solana positions).
//! - Authority: `derived_public_key(path, predecessor, 0)` -> `0x` + last 20 bytes of keccak256(x‖y) (F-338, F-339,
//!   `chainsig::authority_from_derived_key`).
//! - Digest: EIP-712 `{name:"NectarVault", version:"1", chainId:84532, verifyingContract:<vault>}` over
//!   `Settle(..)` / `Release(..)`, hashed on-chain with `env::keccak256_array` (F-339). Pinned by
//!   tests/eip712_vectors.json (Foundry cast, independent of this encoder).
//! - Signing: `sign({request:{path, payload_v2:{Ecdsa:<64 hex digest>}, domain_id:0}})`, 1 yocto (F-331). The answer
//!   `{scheme:"Secp256k1", big_r:{affine_point}, s:{scalar}, recovery_id}` (F-332) is stored as r = x of big_r, s, v =
//!   27 + recovery_id; a high s is normalised to n - s (recovery id flipped) so OpenZeppelin-style verifiers accept it.
//!   The existing `PendingSettlement` / `PendingRelease` records carry the lifecycle (preimage/message = `0x<digest>`,
//!   `signature_hex` = r‖s‖v, `solana_tx_sig` = the EVM tx hash); r/s/v live in a new map (`__v8_evm_*`).
//!
//! Code-only upgrade over the live v2 state: no stored struct changes, only new raw keys.

use near_sdk::json_types::U64;
use near_sdk::serde_json::{self, Value, json};
use near_sdk::{env, near, require};

use crate::chainsig::{self, SECP256K1_DOMAIN_ID};
use crate::events::emit;
use crate::types::*;
use crate::{MAX_STRING_LEN, Nectar, NectarExt};

pub const BASE_SEPOLIA: &str = "base-sepolia";
pub const BASE_SEPOLIA_CHAIN_ID: u64 = 84_532;
pub const EXTRA_CHAINS_PREFIX: &[u8] = b"__v8_chains:";
pub const EVM_SETTLE_PREFIX: &[u8] = b"__v8_evm_settle:";
pub const EVM_RELEASE_PREFIX: &[u8] = b"__v8_evm_release:";
pub const MAX_EXTRA_CHAINS: usize = 4;
pub const DOMAIN_NAME: &str = "NectarVault";
pub const DOMAIN_VERSION: &str = "1";
pub const DOMAIN_TYPE: &str = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
pub const SETTLE_TYPE: &str =
    "Settle(uint64 positionId,uint64 quoteId,uint256 repayE6,uint256 seizeRaw,address recipient,uint64 nonce,uint64 expires,uint8 kind)";
pub const RELEASE_TYPE: &str = "Release(uint64 positionId,address recipient,uint64 nonce,uint64 expires)";

pub const ERR_UNKNOWN_CHAIN: &str = "unknown remote chain";
pub const ERR_NO_RPC: &str = "no rpc_url for chain";

/// secp256k1 group order n (big-endian).
pub const N: [u8; 32] = [
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe, 0xba, 0xae, 0xdc, 0xe6, 0xaf, 0x48,
    0xa0, 0x3b, 0xbf, 0xd2, 0x5e, 0x8c, 0xd0, 0x36, 0x41, 0x41,
];
/// floor(n / 2).
pub const HALF_N: [u8; 32] = [
    0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x5d, 0x57, 0x6e, 0x73, 0x57, 0xa4,
    0x50, 0x1d, 0xdf, 0xe9, 0x2f, 0x46, 0x68, 0x1b, 0x20, 0xa0,
];

// ---------------------------------------------------------------- pure helpers

/// EIP-155 chain id of a supported EVM remote chain id (interface-v7 §D: Base Sepolia, or its local fork, 84532).
pub fn evm_chain_id(chain_id: &str) -> Option<u64> {
    match chain_id {
        BASE_SEPOLIA => Some(BASE_SEPOLIA_CHAIN_ID),
        _ => None,
    }
}

pub fn unhex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 || !s.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok()).collect()
}

/// `0x` + 40 hex (any case) -> 20 bytes.
pub fn parse_address(s: &str) -> Option<[u8; 20]> {
    if !chainsig::valid_evm_address(s) {
        return None;
    }
    unhex(&s[2..])?.try_into().ok()
}

/// EVM tx hash: `0x` + 64 hex.
pub fn valid_tx_hash(s: &str) -> bool {
    s.len() == 66 && s.starts_with("0x") && s.bytes().skip(2).all(|b| b.is_ascii_hexdigit())
}

/// Tx reference a keeper relays for a position of this domain: Solana signature (1) or EVM tx hash (0).
pub fn valid_relay_tx(domain_id: u32, s: &str) -> bool {
    match domain_id {
        SECP256K1_DOMAIN_ID => valid_tx_hash(s),
        _ => chainsig::valid_tx_signature(s),
    }
}

pub fn hex0x(bytes: &[u8]) -> String {
    format!("0x{}", chainsig::hex(bytes))
}

fn word_u128(v: u128) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[16..].copy_from_slice(&v.to_be_bytes());
    w
}

fn word_addr(a: &[u8; 20]) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[12..].copy_from_slice(a);
    w
}

fn keccak_words(words: &[[u8; 32]]) -> [u8; 32] {
    let mut buf = Vec::with_capacity(words.len() * 32);
    for w in words {
        buf.extend_from_slice(w);
    }
    env::keccak256_array(&buf)
}

pub fn domain_separator(chain_id: u64, vault: &[u8; 20]) -> [u8; 32] {
    keccak_words(&[
        env::keccak256_array(DOMAIN_TYPE.as_bytes()),
        env::keccak256_array(DOMAIN_NAME.as_bytes()),
        env::keccak256_array(DOMAIN_VERSION.as_bytes()),
        word_u128(u128::from(chain_id)),
        word_addr(vault),
    ])
}

/// Typed fields of one `Settle` message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SettleFields {
    pub position_id: u64,
    pub quote_id: u64,
    pub repay_e6: u128,
    pub seize_raw: u128,
    pub recipient: [u8; 20],
    pub nonce: u64,
    pub expires: u64,
    pub kind: u8,
}

pub fn settle_struct_hash(f: &SettleFields) -> [u8; 32] {
    keccak_words(&[
        env::keccak256_array(SETTLE_TYPE.as_bytes()),
        word_u128(u128::from(f.position_id)),
        word_u128(u128::from(f.quote_id)),
        word_u128(f.repay_e6),
        word_u128(f.seize_raw),
        word_addr(&f.recipient),
        word_u128(u128::from(f.nonce)),
        word_u128(u128::from(f.expires)),
        word_u128(u128::from(f.kind)),
    ])
}

pub fn release_struct_hash(position_id: u64, recipient: &[u8; 20], nonce: u64, expires: u64) -> [u8; 32] {
    keccak_words(&[
        env::keccak256_array(RELEASE_TYPE.as_bytes()),
        word_u128(u128::from(position_id)),
        word_addr(recipient),
        word_u128(u128::from(nonce)),
        word_u128(u128::from(expires)),
    ])
}

/// `keccak256(0x1901 ‖ domainSeparator ‖ structHash)`.
pub fn typed_digest(domain_separator: &[u8; 32], struct_hash: &[u8; 32]) -> [u8; 32] {
    let mut buf = Vec::with_capacity(66);
    buf.extend_from_slice(&[0x19, 0x01]);
    buf.extend_from_slice(domain_separator);
    buf.extend_from_slice(struct_hash);
    env::keccak256_array(&buf)
}

fn lt(a: &[u8; 32], b: &[u8; 32]) -> bool {
    a < b // big-endian byte order = numeric order
}

/// F-331: the MPC refuses an Ecdsa payload that is not a scalar (< n). Zero is refused too.
pub fn digest_is_scalar(d: &[u8; 32]) -> bool {
    d.iter().any(|b| *b != 0) && lt(d, &N)
}

/// n - s for 0 < s < n.
pub fn sub_from_n(s: &[u8; 32]) -> [u8; 32] {
    let mut out = [0u8; 32];
    let mut borrow = 0u16;
    for i in (0..32).rev() {
        let sub = u16::from(s[i]) + borrow;
        let top = u16::from(N[i]);
        if top >= sub {
            out[i] = (top - sub) as u8;
            borrow = 0;
        } else {
            out[i] = (top + 256 - sub) as u8;
            borrow = 1;
        }
    }
    out
}

/// `sign` args for a 32-byte digest (F-331): `payload_v2.Ecdsa` = 64 hex chars, no `0x`.
pub fn ecdsa_sign_args(path: &str, digest: &[u8; 32], domain_id: u32) -> String {
    json!({ "request": { "path": path, "payload_v2": { "Ecdsa": chainsig::hex(digest) }, "domain_id": domain_id } }).to_string()
}

/// A stored EVM signature: `v` = 27 + recovery id, low s.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EcdsaSig {
    pub r: [u8; 32],
    pub s: [u8; 32],
    pub v: u8,
    /// The MPC answered a high s and it was replaced by n - s.
    pub normalised: bool,
}

impl EcdsaSig {
    /// 65 bytes r‖s‖v.
    pub fn rsv(&self) -> Vec<u8> {
        let mut b = self.r.to_vec();
        b.extend_from_slice(&self.s);
        b.push(self.v);
        b
    }
}

fn hex32(v: &Value) -> Option<Vec<u8>> {
    v.as_str().and_then(unhex)
}

/// MPC Secp256k1 `sign` result (F-332) -> r (x of big_r), low s, v = 27 + recovery id.
pub fn parse_ecdsa_response(raw: &[u8]) -> Result<EcdsaSig, &'static str> {
    let v: Value = serde_json::from_slice(raw).map_err(|_| "bad_response")?;
    if v["scheme"] != "Secp256k1" {
        return Err("bad_scheme");
    }
    let big_r = hex32(&v["big_r"]["affine_point"]).ok_or("bad_hex")?;
    let s = hex32(&v["s"]["scalar"]).ok_or("bad_hex")?;
    let rid = v["recovery_id"].as_u64().ok_or("bad_response")?;
    if big_r.len() != 33 || s.len() != 32 {
        return Err("bad_length");
    }
    if rid > 1 {
        return Err("bad_recovery_id"); // EVM ecrecover takes v = 27 | 28 only
    }
    if u64::from(big_r[0]) != 2 + rid {
        return Err("bad_parity"); // F-332: 0x03 iff y is odd
    }
    let r: [u8; 32] = big_r[1..].try_into().map_err(|_| "bad_length")?;
    let s: [u8; 32] = s.try_into().map_err(|_| "bad_length")?;
    if !digest_is_scalar(&r) || !digest_is_scalar(&s) {
        return Err("bad_scalar");
    }
    let (s, rid, normalised) = if lt(&HALF_N, &s) { (sub_from_n(&s), rid ^ 1, true) } else { (s, rid, false) };
    Ok(EcdsaSig { r, s, v: 27 + rid as u8, normalised })
}

/// MPC `sign` result for a position of `domain_id`: `(signature_hex, Some(sig) for EVM)`.
pub fn parse_sign_result(raw: &[u8], domain_id: u32) -> Result<(String, Option<EcdsaSig>), &'static str> {
    if domain_id == SECP256K1_DOMAIN_ID {
        let sig = parse_ecdsa_response(raw)?;
        Ok((chainsig::hex(&sig.rsv()), Some(sig)))
    } else {
        chainsig::parse_signature_response(raw).map(|b| (chainsig::hex(&b), None))
    }
}

/// Remote chain usable as an extra chain: Solana (domain 1, base58 vault) or a supported EVM chain (domain 0, 0x vault).
pub fn valid_extra_chain(rc: &RemoteChain) -> bool {
    match rc.mpc_domain_id {
        SECP256K1_DOMAIN_ID => {
            chainsig::valid_chain_id(&rc.chain_id) && evm_chain_id(&rc.chain_id).is_some() && chainsig::valid_evm_address(&rc.vault_program)
        }
        _ => crate::p2::valid_remote_chain(rc),
    }
}

/// `http(s)://…`, printable ASCII, ≤ 128 bytes.
pub fn valid_rpc_url(s: &str) -> bool {
    (1..=MAX_STRING_LEN).contains(&s.len())
        && s.bytes().all(|b| b.is_ascii_graphic())
        && (s.starts_with("https://") || s.starts_with("http://"))
}

fn rec_key(prefix: &[u8], position_id: u64) -> Vec<u8> {
    let mut k = prefix.to_vec();
    k.extend_from_slice(&position_id.to_le_bytes());
    k
}

fn chains_key(symbol: &str) -> Vec<u8> {
    let mut k = EXTRA_CHAINS_PREFIX.to_vec();
    k.extend_from_slice(symbol.as_bytes());
    k
}

/// Digest + record of an EVM settle leg (nothing written).
pub fn settle_digest_for(r: &RemoteInfo, f: &SettleFields) -> Result<([u8; 32], EvmSigned), &'static str> {
    let chain = evm_chain_id(&r.chain_id).ok_or(ERR_UNKNOWN_CHAIN)?;
    let vault = parse_address(&r.vault_program).ok_or("bad vault")?;
    let d = typed_digest(&domain_separator(chain, &vault), &settle_struct_hash(f));
    if !digest_is_scalar(&d) {
        return Err("digest out of range");
    }
    Ok((d, EvmSigned::unsigned(&d, chain, &r.vault_program)))
}

/// Digest + record of an EVM release (nothing written).
pub fn release_digest_for(
    r: &RemoteInfo,
    position_id: u64,
    recipient: &str,
    nonce: u64,
    expires: u64,
) -> Result<([u8; 32], EvmSigned), &'static str> {
    let chain = evm_chain_id(&r.chain_id).ok_or(ERR_UNKNOWN_CHAIN)?;
    let vault = parse_address(&r.vault_program).ok_or("bad vault")?;
    let to = parse_address(recipient).ok_or("bad recipient")?;
    let d = typed_digest(&domain_separator(chain, &vault), &release_struct_hash(position_id, &to, nonce, expires));
    if !digest_is_scalar(&d) {
        return Err("digest out of range");
    }
    Ok((d, EvmSigned::unsigned(&d, chain, &r.vault_program)))
}

impl EvmSigned {
    fn unsigned(d: &[u8; 32], chain_id: u64, vault: &str) -> Self {
        EvmSigned { digest: hex0x(d), chain_id, verifying_contract: vault.to_string(), r: None, s: None, v: None }
    }
}

impl Nectar {
    pub(crate) fn extra_chains(&self, symbol: &str) -> Vec<ExtraRemoteChain> {
        env::storage_read(&chains_key(symbol))
            .and_then(|b| near_sdk::borsh::from_slice::<VExtraChains>(&b).ok())
            .map(|VExtraChains::V1(v)| v)
            .unwrap_or_default()
    }
    fn put_extra_chains(&mut self, symbol: &str, v: Vec<ExtraRemoteChain>) {
        if v.is_empty() {
            env::storage_remove(&chains_key(symbol));
            return;
        }
        let b = near_sdk::borsh::to_vec(&VExtraChains::V1(v)).unwrap_or_else(|_| env::panic_str("borsh"));
        env::storage_write(&chains_key(symbol), &b);
    }

    /// `None`: the primary chain (v2 behaviour). `Some(id)`: the primary if it has that id, else an extra chain.
    pub(crate) fn select_remote_chain(&self, c: &CollateralConfig, chain: Option<&str>) -> RemoteChain {
        let primary = c.remote_chain.clone().filter(crate::p2::valid_remote_chain);
        match chain {
            None => primary.unwrap_or_else(|| env::panic_str("no remote chain")),
            Some(id) => primary
                .filter(|rc| rc.chain_id == id)
                .or_else(|| self.extra_chains(&c.symbol).into_iter().map(|e| e.chain).find(|rc| rc.chain_id == id))
                .filter(valid_extra_chain)
                .unwrap_or_else(|| env::panic_str(ERR_UNKNOWN_CHAIN)),
        }
    }

    pub(crate) fn chain_rpc_url(&self, symbol: &str, chain_id: &str) -> Option<String> {
        self.extra_chains(symbol).into_iter().find(|e| e.chain.chain_id == chain_id).map(|e| e.rpc_url)
    }

    pub(crate) fn evm_record(&self, prefix: &[u8], position_id: u64) -> Option<EvmSigned> {
        env::storage_read(&rec_key(prefix, position_id))
            .and_then(|b| near_sdk::borsh::from_slice::<VEvmSigned>(&b).ok())
            .map(|VEvmSigned::V1(d)| d)
    }
    pub(crate) fn put_evm_record(&mut self, prefix: &[u8], position_id: u64, d: EvmSigned) {
        let b = near_sdk::borsh::to_vec(&VEvmSigned::V1(d)).unwrap_or_else(|_| env::panic_str("borsh"));
        env::storage_write(&rec_key(prefix, position_id), &b);
    }
    /// Signature arrived: r/s/v into the record of this position.
    pub(crate) fn store_evm_sig(&mut self, prefix: &[u8], position_id: u64, sig: &EcdsaSig) {
        if let Some(mut d) = self.evm_record(prefix, position_id) {
            d.r = Some(hex0x(&sig.r));
            d.s = Some(hex0x(&sig.s));
            d.v = Some(sig.v);
            self.put_evm_record(prefix, position_id, d);
        }
    }
}

#[near]
impl Nectar {
    // ------------------------------------------------------------ owner
    /// Adds or replaces an extra remote chain of `symbol` (≤ 4; not the primary chain id). Domain 0 needs a supported
    /// EVM chain id (`base-sepolia`) and a `0x` vault; `rpc_url` goes into the Base `vault_read` input.
    pub fn set_extra_remote_chain(&mut self, symbol: String, remote_chain: RemoteChain, rpc_url: String) {
        self.assert_owner();
        let c = self.coll_or_panic(&symbol);
        require!(valid_extra_chain(&remote_chain), "bad remote_chain");
        require!(valid_rpc_url(&rpc_url), "bad rpc_url");
        self.assert_vault_unbound(&symbol, &remote_chain);
        require!(
            c.remote_chain.as_ref().is_none_or(|p| p.chain_id != remote_chain.chain_id),
            "chain is the primary remote chain"
        );
        let mut v = self.extra_chains(&symbol);
        v.retain(|e| e.chain.chain_id != remote_chain.chain_id);
        require!(v.len() < MAX_EXTRA_CHAINS, "too many remote chains");
        emit(
            "extra_remote_chain_set",
            json!({ "symbol": symbol, "remote_chain": remote_chain, "rpc_url": rpc_url }),
        );
        v.push(ExtraRemoteChain { chain: remote_chain, rpc_url });
        self.put_extra_chains(&symbol, v);
    }

    /// Removes an extra chain. Positions already reserved on it keep their pinned vault; their `vault_read`
    /// confirmation needs the chain again (keeper attestation still works).
    pub fn remove_extra_remote_chain(&mut self, symbol: String, chain_id: String) {
        self.assert_owner();
        let mut v = self.extra_chains(&symbol);
        let n = v.len();
        v.retain(|e| e.chain.chain_id != chain_id);
        require!(v.len() < n, ERR_UNKNOWN_CHAIN);
        self.put_extra_chains(&symbol, v);
        emit("extra_remote_chain_removed", json!({ "symbol": symbol, "chain_id": chain_id }));
    }

    // ------------------------------------------------------------ views
    /// Primary chain first (if any), then the extra chains.
    pub fn get_remote_chains(&self, symbol: String) -> Vec<RemoteChainView> {
        let mut out = Vec::new();
        if let Some(rc) = self.coll(&symbol).and_then(|c| c.remote_chain) {
            out.push(RemoteChainView {
                evm_chain_id: None,
                chain_id: rc.chain_id,
                vault_program: rc.vault_program,
                mpc_domain_id: rc.mpc_domain_id,
                rpc_url: None,
                primary: true,
            });
        }
        for e in self.extra_chains(&symbol) {
            out.push(RemoteChainView {
                evm_chain_id: if e.chain.mpc_domain_id == SECP256K1_DOMAIN_ID { evm_chain_id(&e.chain.chain_id) } else { None },
                chain_id: e.chain.chain_id,
                vault_program: e.chain.vault_program,
                mpc_domain_id: e.chain.mpc_domain_id,
                rpc_url: Some(e.rpc_url),
                primary: false,
            });
        }
        out
    }

    /// EVM settle leg of a Base position: typed `Settle` fields + digest and, once signed, r/s/v (§D).
    pub fn get_pending_settlement_evm(&self, position_id: U64) -> Option<PendingSettlementEvm> {
        let e = self.evm_record(EVM_SETTLE_PREFIX, position_id.0)?;
        let d = self.pending(position_id.0)?;
        Some(PendingSettlementEvm {
            digest: e.digest,
            r: e.r,
            s: e.s,
            v: e.v,
            position_id,
            quote_id: d.quote_id,
            repay_e6: d.repay_usd_e6,
            seize_raw: d.seize_units,
            recipient: d.recipient,
            nonce: d.nonce,
            expires: d.expires,
            kind: d.kind,
            status: d.status,
            chain_id: e.chain_id,
            verifying_contract: e.verifying_contract,
            tx_hash: d.solana_tx_sig,
        })
    }

    /// EVM release of a Base position: typed `Release` fields + digest and, once signed, r/s/v (§D).
    pub fn get_pending_release_evm(&self, position_id: U64) -> Option<PendingReleaseEvm> {
        let e = self.evm_record(EVM_RELEASE_PREFIX, position_id.0)?;
        let d = self.release(position_id.0)?;
        Some(PendingReleaseEvm {
            digest: e.digest,
            r: e.r,
            s: e.s,
            v: e.v,
            position_id,
            recipient: d.recipient,
            nonce: d.nonce,
            expires: d.expires,
            status: d.status,
            chain_id: e.chain_id,
            verifying_contract: e.verifying_contract,
            tx_hash: d.solana_tx_sig,
        })
    }
}
