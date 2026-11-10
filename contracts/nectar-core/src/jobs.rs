//! WO-23a OutLayer job hooks for WO-24 (PRD §4.6 P1 source, §4.7 "forced_closed by an attested OutLayer result").
//!
//! - `request_session_check(symbol)` (anyone, 60 s cooldown per symbol): OutLayer `{"job":"calendar","symbol","now_s"}`
//!   `.then(on_session_check)`. The callback may only set `forced_closed = true` (`{"force_closed":true,..}`); a
//!   `false` answer is ignored, so nothing outside the contract can open a session.
//! - `request_multiplier_read(symbol)` (anyone, 60 s cooldown): OutLayer `{"job":"multiplier","symbol","rpc_url",
//!   "token","decimals"}` `.then(on_multiplier_read)`. The callback applies the `set_multiplier` bound (increase only,
//!   ≤ +5 %, not while `ca_pending`); any other change is recorded as `ca_suggested_multiplier_e18` with a
//!   `corporate_action_suggested` event for the owner. Refused for `TokenIncludesMultiplier` (D-021).
//!
//! Same OutLayer path as `vault_read` (F-047 `request_execution` args, F-048 Json stdout verbatim or `null`): the deposit
//! comes from `gas_reserve_yocto`; the pin is `set_job_config(job, ..)` or, if unset, the `vault_read` pin (WO-24 ships
//! one wasm that dispatches on `job`). One request per (job, symbol) in flight; a lost callback frees it after 10 min.

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{Value, json};
use near_sdk::{Gas, GasWeight, NearToken, Promise, PromiseError, env, near, require};

use crate::events::emit;
use crate::p2::SEC;
use crate::types::*;
use crate::{MAX_STRING_LEN, MULTIPLIER_MAX_INCREASE_BPS, Nectar, NectarExt, math};

pub const JOB_CALENDAR: &str = "calendar";
pub const JOB_MULTIPLIER: &str = "multiplier";
pub const JOB_PREFIX: &[u8] = b"__v7_job:";
pub const JOB_STATE_PREFIX: &[u8] = b"__v7_jobst:";
pub const MSRC_PREFIX: &[u8] = b"__v7_msrc:";
pub const JOB_COOLDOWN_S: u64 = 60;
/// An in-flight request whose callback never ran is released after this.
pub const JOB_STALE_S: u64 = 600;
/// Own burn of a job callback (parse + 2 writes + event).
pub const GAS_ON_JOB: Gas = Gas::from_tgas(15);
pub const GAS_JOB_RECEIPTS: Gas = Gas::from_tgas(5);
/// Job stdout ≤ 900 B (F-043) + JSON wrapper headroom.
pub const MAX_JOB_RESULT_LEN: usize = 1024;

fn key(prefix: &[u8], parts: &[&str]) -> Vec<u8> {
    let mut k = prefix.to_vec();
    k.extend_from_slice(parts.join("|").as_bytes());
    k
}

fn valid_job(job: &str) -> bool {
    job == JOB_CALENDAR || job == JOB_MULTIPLIER
}

/// `0x` + 40 hex (Base Sepolia token).
pub fn valid_evm_address(s: &str) -> bool {
    s.len() == 42 && s.starts_with("0x") && s.bytes().skip(2).all(|b| b.is_ascii_hexdigit())
}

/// Calendar job stdout `{"force_closed":bool,"reason":str}`. Ok((force_closed, reason)).
pub fn parse_calendar(raw: &[u8]) -> Result<(bool, String), &'static str> {
    let v: Value = near_sdk::serde_json::from_slice(raw).map_err(|_| "parse")?;
    if v.is_null() {
        return Err("no_result");
    }
    if v.get("error").is_some() {
        return Err("job_error");
    }
    let fc = v["force_closed"].as_bool().ok_or("bad_force_closed")?;
    let reason = match &v["reason"] {
        Value::String(s) if s.len() <= 32 && s.bytes().all(|b| b.is_ascii_graphic()) => s.clone(),
        Value::Null => String::new(),
        _ => return Err("bad_reason"),
    };
    Ok((fc, reason))
}

/// Multiplier job stdout `{"multiplier_e18":"<decimal>"}` (string or JSON number). Must be > 0.
pub fn parse_multiplier(raw: &[u8]) -> Result<u128, &'static str> {
    let v: Value = near_sdk::serde_json::from_slice(raw).map_err(|_| "parse")?;
    if v.is_null() {
        return Err("no_result");
    }
    if v.get("error").is_some() {
        return Err("job_error");
    }
    let m = match &v["multiplier_e18"] {
        Value::String(s) if !s.is_empty() && s.len() <= 39 && s.bytes().all(|b| b.is_ascii_digit()) => {
            s.parse::<u128>().map_err(|_| "bad_multiplier")?
        }
        Value::Number(n) => n.as_u64().map(u128::from).ok_or("bad_multiplier")?,
        _ => return Err("bad_multiplier"),
    };
    if m == 0 {
        return Err("zero_multiplier");
    }
    Ok(m)
}

impl Nectar {
    fn job_pin(&self, job: &str) -> Option<(VaultReadConfig, &'static str)> {
        if let Some(c) = env::storage_read(&key(JOB_PREFIX, &[job])).and_then(|b| near_sdk::borsh::from_slice(&b).ok()) {
            return Some((c, "job"));
        }
        self.vault_read_config().map(|c| (c, "vault_read"))
    }
    fn job_state(job: &str, symbol: &str) -> JobState {
        env::storage_read(&key(JOB_STATE_PREFIX, &[job, symbol]))
            .and_then(|b| near_sdk::borsh::from_slice(&b).ok())
            .unwrap_or_default()
    }
    fn put_job_state(job: &str, symbol: &str, s: &JobState) {
        let b = near_sdk::borsh::to_vec(s).unwrap_or_else(|_| env::panic_str("borsh"));
        env::storage_write(&key(JOB_STATE_PREFIX, &[job, symbol]), &b);
    }
    fn multiplier_source(symbol: &str) -> Option<MultiplierSource> {
        env::storage_read(&key(MSRC_PREFIX, &[symbol])).and_then(|b| near_sdk::borsh::from_slice(&b).ok())
    }

    /// Checks, takes the deposit from `gas_reserve_yocto`, marks the job in flight and schedules
    /// `request_execution(..).then(cb)`. Panics on a check failure (public entry points).
    fn start_job(&mut self, job: &str, symbol: &str, input: String, cb_method: &str) {
        let (cfg, _) = self.job_pin(job).unwrap_or_else(|| env::panic_str("job not configured"));
        let now = env::block_timestamp();
        let st = Self::job_state(job, symbol);
        let last = st.last_request_ns.0;
        require!(!st.in_flight || now >= last.saturating_add(JOB_STALE_S * SEC), "job in flight");
        require!(last == 0 || now >= last.saturating_add(JOB_COOLDOWN_S * SEC), "job cooldown");
        require!(self.gas_reserve_yocto >= cfg.deposit_yocto, "gas reserve empty");
        let exec = Gas::from_tgas(cfg.gas_tgas);
        let left = env::prepaid_gas().as_gas().saturating_sub(env::used_gas().as_gas());
        require!(left >= exec.as_gas() + GAS_ON_JOB.as_gas() + GAS_JOB_RECEIPTS.as_gas(), "attach more gas");
        let q = &self.quoter;
        let args = json!({
            "source": { "Project": { "project_id": cfg.project_id, "version_key": cfg.version_key } },
            "resource_limits": { "max_instructions": q.max_instructions, "max_memory_mb": q.max_memory_mb,
                                 "max_execution_seconds": q.max_execution_seconds },
            "input_data": input,
            "response_format": "Json",
            "payer_account_id": env::current_account_id(),
        })
        .to_string();
        let outlayer = q.outlayer_account.clone();
        // effects
        self.gas_reserve_yocto = math::sub(self.gas_reserve_yocto, cfg.deposit_yocto).unwrap_or_else(|e| env::panic_str(e));
        Self::put_job_state(job, symbol, &JobState { last_request_ns: U64(now), in_flight: true });
        emit(
            "job_requested",
            json!({ "job": job, "symbol": symbol, "input": input, "deposit_yocto": U128(cfg.deposit_yocto) }),
        );
        // interaction
        Promise::new(outlayer)
            .function_call("request_execution", args.into_bytes(), NearToken::from_yoctonear(cfg.deposit_yocto), exec)
            .then(Promise::new(env::current_account_id()).function_call_weight(
                cb_method,
                json!({ "symbol": symbol }).to_string().into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_ON_JOB,
                GasWeight(1),
            ))
            .detach();
    }

    /// Clears the in-flight flag and returns the job stdout bytes (or the failure reason).
    fn finish_job(job: &str, symbol: &str) -> Result<Vec<u8>, &'static str> {
        let mut st = Self::job_state(job, symbol);
        st.in_flight = false;
        Self::put_job_state(job, symbol, &st);
        if env::promise_results_count() != 1 {
            return Err("no_result");
        }
        match env::promise_result_checked(0, MAX_JOB_RESULT_LEN) {
            Ok(b) => Ok(b),
            Err(PromiseError::TooLong(_)) => Err("too_long"),
            Err(_) => Err("failed"),
        }
    }
}

#[near]
impl Nectar {
    // ------------------------------------------------------------ owner
    /// Pin of the `calendar` or `multiplier` job (else the `vault_read` pin is used); `gas_tgas` in 10..=100.
    pub fn set_job_config(&mut self, job: String, project_id: String, version_key: String, deposit_yocto: U128, gas_tgas: u64) {
        self.assert_owner();
        require!(valid_job(&job), "unknown job");
        require!(
            (1..=MAX_STRING_LEN).contains(&project_id.len()) && (1..=MAX_STRING_LEN).contains(&version_key.len()),
            "bad project pin"
        );
        require!(deposit_yocto.0 > 0, "deposit must be > 0");
        require!((10..=100).contains(&gas_tgas), "gas_tgas out of range");
        let cfg = VaultReadConfig { project_id, version_key, deposit_yocto: deposit_yocto.0, gas_tgas };
        let b = near_sdk::borsh::to_vec(&cfg).unwrap_or_else(|_| env::panic_str("borsh"));
        env::storage_write(&key(JOB_PREFIX, &[&job]), &b);
        emit(
            "job_config_set",
            json!({ "job": job, "project_id": cfg.project_id, "version_key": cfg.version_key,
                    "deposit_yocto": deposit_yocto, "gas_tgas": gas_tgas }),
        );
    }

    /// Base Sepolia token the `multiplier` job reads (`rpc_url` https, ≤ 128 B; `token` 0x + 40 hex).
    pub fn set_multiplier_source(&mut self, symbol: String, rpc_url: String, token: String) {
        self.assert_owner();
        self.coll_or_panic(&symbol);
        require!(rpc_url.starts_with("https://") && rpc_url.len() <= MAX_STRING_LEN, "bad rpc_url");
        require!(valid_evm_address(&token), "bad token");
        let s = MultiplierSource { rpc_url, token };
        let b = near_sdk::borsh::to_vec(&s).unwrap_or_else(|_| env::panic_str("borsh"));
        env::storage_write(&key(MSRC_PREFIX, &[&symbol]), &b);
        emit("multiplier_source_set", json!({ "symbol": symbol, "rpc_url": s.rpc_url, "token": s.token }));
    }

    // ------------------------------------------------------------ anyone
    /// OutLayer calendar check; its answer can only force the session closed. Not payable.
    pub fn request_session_check(&mut self, symbol: String) {
        self.assert_not_paused();
        self.coll_or_panic(&symbol);
        let input = json!({ "job": JOB_CALENDAR, "symbol": symbol, "now_s": env::block_timestamp() / SEC }).to_string();
        self.start_job(JOB_CALENDAR, &symbol, input, "on_session_check");
    }

    /// OutLayer multiplier read (P1 source of §4.6); bounded like `set_multiplier`. Not payable.
    pub fn request_multiplier_read(&mut self, symbol: String) {
        self.assert_not_paused();
        let c = self.coll_or_panic(&symbol);
        require!(c.price_kind == PriceKind::Underlying, "token_includes_multiplier");
        let src = Self::multiplier_source(&symbol).unwrap_or_else(|| env::panic_str("no multiplier source"));
        let input = json!({ "job": JOB_MULTIPLIER, "symbol": symbol, "rpc_url": src.rpc_url, "token": src.token,
                            "decimals": c.decimals })
        .to_string();
        self.start_job(JOB_MULTIPLIER, &symbol, input, "on_multiplier_read");
    }

    // ------------------------------------------------------------ callbacks (never panic on business failures)
    #[private]
    pub fn on_session_check(&mut self, symbol: String) {
        let res = Self::finish_job(JOB_CALENDAR, &symbol).and_then(|b| parse_calendar(&b));
        let Some(mut c) = self.coll(&symbol) else { return };
        match res {
            Ok((true, reason)) => {
                let was = c.forced_closed;
                c.forced_closed = true;
                self.put_coll(c);
                emit(
                    "session_forced_closed",
                    json!({ "symbol": symbol, "closed": true, "source": "outlayer", "reason": reason, "was_forced": was }),
                );
            }
            Ok((false, reason)) => {
                // never opens: a false answer is recorded and ignored
                emit("session_check_result", json!({ "symbol": symbol, "force_closed": false, "reason": reason,
                                                      "applied": false }));
            }
            Err(e) => emit("job_failed", json!({ "job": JOB_CALENDAR, "symbol": symbol, "reason": e })),
        }
    }

    #[private]
    pub fn on_multiplier_read(&mut self, symbol: String) {
        let res = Self::finish_job(JOB_MULTIPLIER, &symbol).and_then(|b| parse_multiplier(&b));
        let Some(mut c) = self.coll(&symbol) else { return };
        let new = match res {
            Ok(m) => m,
            Err(e) => {
                emit("job_failed", json!({ "job": JOB_MULTIPLIER, "symbol": symbol, "reason": e }));
                return;
            }
        };
        let old = c.multiplier_e18.0;
        let now = env::block_timestamp();
        let outcome = if c.price_kind != PriceKind::Underlying {
            "ignored_token_includes_multiplier"
        } else if new == old {
            "unchanged"
        } else if !c.ca_pending && math::within_increase_bound(old, new, MULTIPLIER_MAX_INCREASE_BPS).unwrap_or(false) {
            "applied"
        } else {
            "suggested"
        };
        match outcome {
            "applied" => {
                c.multiplier_e18 = U128(new);
                c.multiplier_updated_ns = U64(now);
                self.put_coll(c);
                emit(
                    "multiplier_updated",
                    json!({ "symbol": symbol, "multiplier_e18": U128(new), "old_multiplier_e18": U128(old),
                            "source": "outlayer" }),
                );
            }
            "suggested" => {
                c.ca_suggested_multiplier_e18 = U128(new);
                c.ca_suggested_ns = U64(now);
                let pending = c.ca_pending;
                self.put_coll(c);
                emit(
                    "corporate_action_suggested",
                    json!({ "symbol": symbol, "multiplier_e18": U128(new), "current_multiplier_e18": U128(old),
                            "ca_pending": pending, "source": "outlayer" }),
                );
            }
            other => emit(
                "multiplier_read_result",
                json!({ "symbol": symbol, "multiplier_e18": U128(new), "outcome": other }),
            ),
        }
    }

    // ------------------------------------------------------------ views
    pub fn get_job_config(&self, job: String) -> Option<JobConfigView> {
        let (c, source) = self.job_pin(&job).filter(|_| valid_job(&job))?;
        Some(JobConfigView {
            job,
            project_id: c.project_id,
            version_key: c.version_key,
            deposit_yocto: U128(c.deposit_yocto),
            gas_tgas: c.gas_tgas,
            source: source.to_string(),
        })
    }

    pub fn get_job_state(&self, job: String, symbol: String) -> JobState {
        Self::job_state(&job, &symbol)
    }

    pub fn get_multiplier_source(&self, symbol: String) -> Option<MultiplierSource> {
        Self::multiplier_source(&symbol)
    }
}
