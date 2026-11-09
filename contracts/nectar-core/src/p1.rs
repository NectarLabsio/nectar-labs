//! P1 (feature `p1`, default): OutLayer quoter path, owner setters and views (interface-p1.md, D-014).
//!
//! trigger_preliquidation -> start_quoter: position -> Settling, deposit taken from `gas_reserve_yocto`,
//! `outlayer.request_execution` (F-047: Project source, explicit resource_limits, Json response,
//! payer = self) `.then(on_quoter_result)`. The callback receives the guest stdout verbatim or `null`
//! (F-048), reads it with `promise_result_checked` (F-130), clamps or falls back, re-checks the
//! position and runs the P0 settlement with those discounts. Business failures in the callback never
//! panic: the position goes back to Open with `settlement_aborted`.

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{self, Value, json};
use near_sdk::{AccountId, Gas, GasWeight, NearToken, Promise, PromiseError, env, near, require};

use crate::events::emit;
use crate::types::*;
use crate::{MAX_QUOTES_PER_SETTLEMENT, MAX_STRING_LEN, Nectar, NectarExt, math, ok};

/// Callback own burn for parse + 8 legs (sandbox: ~13 Tgas with 10 transfers scheduled).
pub const GAS_QUOTER_CB_BASE: Gas = Gas::from_tgas(20);
/// Per transfer, on top of the attached ft_transfer + on_payout gas: exec fees of the two receipts the
/// callback creates are charged to it (sandbox: 6 Tgas/transfer was not enough with 10 transfers).
pub const GAS_RECEIPTS_PER_TRANSFER: Gas = Gas::from_tgas(5);
/// Gas left in `trigger_preliquidation` after scheduling both promises.
pub const GAS_TRIGGER_MARGIN: Gas = Gas::from_tgas(5);
/// Stdout is <= 900 B (F-043); anything longer is rejected as `too_long`.
pub const MAX_QUOTER_RESULT_LEN: usize = 2048;

/// Lower-case hex of a byte slice.
pub fn hex(bytes: &[u8]) -> String {
    const H: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(H[(b >> 4) as usize] as char);
        s.push(H[(b & 0x0f) as usize] as char);
    }
    s
}

fn id_of(v: Option<&Value>) -> Option<u64> {
    match v? {
        Value::String(s) => s.parse::<u64>().ok(),
        Value::Number(n) => n.as_u64(),
        _ => None,
    }
}

/// Validates the quoter stdout against what the contract sent and returns `(quote_id, disc_bps)` for
/// every entry of `maxes` (same order). Missing fill -> that quote's `max_discount_bps`; each fill is
/// clamped to `[0, max_discount_bps]`. `Err(reason)` -> caller falls back to `maxes`.
pub fn parse_quoter_output(
    bytes: &[u8],
    symbol: &str,
    position_id: u64,
    input_sha256: &str,
    maxes: &[(u64, u16)],
) -> Result<Vec<(u64, u16)>, &'static str> {
    let v: Value = serde_json::from_slice(bytes).map_err(|_| "parse")?;
    if v.is_null() {
        return Err("null");
    }
    let o = v.as_object().ok_or("parse")?;
    if o.contains_key("error") {
        return Err("error");
    }
    if o.get("v").and_then(Value::as_u64) != Some(1) {
        return Err("version");
    }
    if o.get("symbol").and_then(Value::as_str) != Some(symbol) {
        return Err("symbol");
    }
    if id_of(o.get("position_id")) != Some(position_id) {
        return Err("position");
    }
    if o.get("input_sha256").and_then(Value::as_str) != Some(input_sha256) {
        return Err("input_sha256");
    }
    let fills = o.get("fills").and_then(Value::as_array).ok_or("fills")?;
    if fills.len() > MAX_QUOTES_PER_SETTLEMENT {
        return Err("fills");
    }
    let mut out: Vec<(u64, u16)> = maxes.to_vec();
    let mut seen: Vec<u64> = Vec::with_capacity(fills.len());
    for f in fills {
        let id = id_of(f.get("id")).ok_or("bad_fill")?;
        let disc = f.get("disc_bps").and_then(Value::as_i64).ok_or("bad_fill")?;
        let idx = maxes.iter().position(|(q, _)| *q == id).ok_or("unknown_quote")?;
        if seen.contains(&id) {
            return Err("duplicate_quote");
        }
        seen.push(id);
        let max = maxes[idx].1;
        out[idx].1 = disc.clamp(0, i64::from(max)) as u16;
    }
    Ok(out)
}

impl Nectar {
    pub(crate) fn quoter_enabled(&self) -> bool {
        !self.quoter.project_id.is_empty() && !self.quoter.version_key.is_empty()
    }

    /// Exact stdin bytes (interface-p1.md §Quoter). Quotes keep the selection order (ascending max, id).
    pub(crate) fn quoter_stdin(&self, position_id: u64, p: &Position, c: &CollateralConfig, cands: &[(u16, u64)], vol: u16) -> String {
        let mut quotes = String::new();
        for (i, (disc, qid)) in cands.iter().enumerate() {
            let rem = self.quote(*qid).map(|q| q.remaining_usd_e6.0).unwrap_or(0);
            if i > 0 {
                quotes.push(',');
            }
            quotes.push_str(&format!(r#"{{"id":"{qid}","max_discount_bps":{disc},"remaining_usd_e6":"{rem}"}}"#));
        }
        let sym = serde_json::to_string(&c.symbol).unwrap_or_else(|_| env::panic_str("symbol encode"));
        format!(
            r#"{{"v":1,"symbol":{sym},"position_id":"{position_id}","oracle_price_usd_e6":"{}","session_open":{},"seize_usd_e6":"{}","vol_bps":{vol},"quotes":[{quotes}]}}"#,
            c.oracle_price_usd_e6.0, c.market_session_open, p.debt_usd_e6.0
        )
    }

    pub(crate) fn start_quoter(&mut self, position_id: U64, mut p: Position, c: &CollateralConfig, cands: Vec<(u16, u64)>, vol: u16) {
        require!(!cands.is_empty(), "no quote capacity");
        let mut buyers: Vec<AccountId> = Vec::new();
        for (_, qid) in cands.iter() {
            if let Some(q) = self.quote(*qid) {
                if !buyers.contains(&q.buyer) {
                    buyers.push(q.buyer);
                }
            }
        }
        let n_transfers = buyers.len() as u64 + 2; // + keeper + borrower release
        let deposit = self.quoter.deposit_yocto;
        let need = ok(math::add(deposit, u128::from(n_transfers)));
        require!(self.gas_reserve_yocto >= need, "gas reserve empty");
        let per_transfer =
            crate::GAS_FT_TRANSFER.as_gas() + crate::GAS_ON_PAYOUT.as_gas() + GAS_RECEIPTS_PER_TRANSFER.as_gas();
        let cb_gas = Gas::from_gas(GAS_QUOTER_CB_BASE.as_gas() + n_transfers * per_transfer);
        let exec_gas = Gas::from_tgas(self.quoter.gas_tgas);
        let left = env::prepaid_gas().as_gas().saturating_sub(env::used_gas().as_gas());
        require!(
            left >= exec_gas.as_gas() + cb_gas.as_gas() + GAS_TRIGGER_MARGIN.as_gas(),
            "attach more gas"
        );

        let stdin = self.quoter_stdin(position_id.0, &p, c, &cands, vol);
        let sha = hex(&env::sha256(stdin.as_bytes()));
        // effects
        self.gas_reserve_yocto = ok(math::sub(self.gas_reserve_yocto, deposit));
        p.status = PositionStatus::Settling;
        self.put_position(p);
        emit(
            "quoter_requested",
            json!({ "position_id": position_id, "input_sha256": sha, "deposit_yocto": U128(deposit),
                    "quotes": cands.len() }),
        );
        // interactions
        let args = json!({
            "source": { "Project": { "project_id": self.quoter.project_id, "version_key": self.quoter.version_key } },
            "resource_limits": { "max_instructions": self.quoter.max_instructions,
                                 "max_memory_mb": self.quoter.max_memory_mb,
                                 "max_execution_seconds": self.quoter.max_execution_seconds },
            "input_data": stdin,
            "response_format": "Json",
            "payer_account_id": env::current_account_id(),
        })
        .to_string();
        let ids: Vec<U64> = cands.iter().map(|(_, id)| U64(*id)).collect();
        let cb = json!({ "position_id": position_id, "input_sha256": sha, "quote_ids": ids }).to_string();
        Promise::new(self.quoter.outlayer_account.clone())
            .function_call("request_execution", args.into_bytes(), NearToken::from_yoctonear(deposit), exec_gas)
            // minimum = cb_gas; all gas left unused by this trigger also goes to the callback (weight 1)
            .then(Promise::new(env::current_account_id()).function_call_weight(
                "on_quoter_result",
                cb.into_bytes(),
                NearToken::from_yoctonear(0),
                cb_gas,
                GasWeight(1),
            ))
            .detach();
    }

    fn abort_settlement(&mut self, mut p: Position, reason: &str) {
        p.status = PositionStatus::Open;
        emit("settlement_aborted", json!({ "position_id": p.position_id, "reason": reason }));
        self.put_position(p);
    }

    fn assert_symbol(&self, symbol: &str) {
        require!(self.coll(symbol).is_some(), "unknown collateral");
    }
}

#[near]
impl Nectar {
    /// OutLayer callback (F-048). `quote_ids` = the selection sent in stdin, in order.
    #[private]
    pub fn on_quoter_result(&mut self, position_id: U64, input_sha256: String, quote_ids: Vec<U64>) {
        let Some(p) = self.position(position_id.0) else { return };
        if p.status != PositionStatus::Settling {
            return;
        }
        let c = self.coll_or_panic(&p.collateral);
        let maxes: Vec<(u64, u16)> = quote_ids
            .iter()
            .take(MAX_QUOTES_PER_SETTLEMENT)
            .filter_map(|id| self.quote(id.0).map(|q| (id.0, q.max_discount_bps)))
            .collect();
        let raw: Result<Vec<u8>, &'static str> = if env::promise_results_count() != 1 {
            Err("no_result")
        } else {
            match env::promise_result_checked(0, MAX_QUOTER_RESULT_LEN) {
                Ok(b) => Ok(b),
                Err(PromiseError::TooLong(_)) => Err("too_long"),
                Err(_) => Err("failed"), // PromiseError::Failed (enum is non_exhaustive)
            }
        };
        let discs = match raw.and_then(|b| parse_quoter_output(&b, &c.symbol, position_id.0, &input_sha256, &maxes)) {
            Ok(fills) => {
                let f: Vec<Value> =
                    fills.iter().map(|(id, d)| json!({ "quote_id": U64(*id), "disc_bps": d })).collect();
                emit("quoter_result", json!({ "position_id": position_id, "input_sha256": input_sha256, "fills": f }));
                fills
            }
            Err(reason) => {
                emit("quoter_fallback", json!({ "position_id": position_id, "reason": reason }));
                maxes
            }
        };
        let mut cands: Vec<(u16, u64)> = discs.iter().map(|(id, d)| (*d, *id)).collect();
        cands.sort_unstable();

        let reason = if self.paused {
            Some("paused")
        } else if !self.oracle_fresh(&c) {
            Some("oracle stale")
        } else if !self.is_triggerable(&p, &c) {
            Some("position healthy")
        } else {
            None
        };
        if let Some(r) = reason {
            return self.abort_settlement(p, r);
        }
        let keeper = self.keeper.clone();
        if let Err(e) = self.settle(position_id, p.clone(), c, &cands, &keeper) {
            self.abort_settlement(p, e);
        }
    }

    // ------------------------------------------------------------ owner setters
    /// Empty strings disable the quoter (P0 static pricing).
    pub fn set_quoter_pin(&mut self, project_id: String, version_key: String) {
        self.assert_owner();
        require!(project_id.is_empty() == version_key.is_empty(), "set both or neither");
        require!(project_id.len() <= MAX_STRING_LEN && version_key.len() <= MAX_STRING_LEN, "string too long");
        emit("quoter_pin_set", json!({ "project_id": project_id, "version_key": version_key }));
        self.quoter.project_id = project_id;
        self.quoter.version_key = version_key;
    }

    /// Limits per F-041 (max_instructions <= 5e11, memory <= 4096 MB, <= 180 s); gas 10..=200 Tgas.
    pub fn set_quoter_config(
        &mut self,
        deposit_yocto: U128,
        gas_tgas: u64,
        max_instructions: U64,
        max_memory_mb: u32,
        max_execution_seconds: u32,
    ) {
        self.assert_owner();
        require!(deposit_yocto.0 > 0, "deposit must be > 0");
        require!((10..=200).contains(&gas_tgas), "gas_tgas out of range");
        require!(max_instructions.0 > 0 && max_instructions.0 <= 500_000_000_000, "max_instructions out of range");
        require!(max_memory_mb > 0 && max_memory_mb <= 4096, "max_memory_mb out of range");
        require!(max_execution_seconds > 0 && max_execution_seconds <= 180, "max_execution_seconds out of range");
        self.quoter.deposit_yocto = deposit_yocto.0;
        self.quoter.gas_tgas = gas_tgas;
        self.quoter.max_instructions = max_instructions.0;
        self.quoter.max_memory_mb = max_memory_mb;
        self.quoter.max_execution_seconds = max_execution_seconds;
        emit("quoter_config_set", json!({ "deposit_yocto": deposit_yocto, "gas_tgas": gas_tgas }));
    }

    /// OutLayer contract id (default `outlayer.testnet`); the sandbox points it at the stub.
    pub fn set_outlayer_account(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.quoter.outlayer_account = account_id;
    }

    pub fn set_vol_bps(&mut self, symbol: String, vol_bps: u16) {
        self.assert_owner();
        self.assert_symbol(&symbol);
        require!(vol_bps <= 10_000, "vol_bps > 10000");
        emit("vol_set", json!({ "symbol": symbol, "vol_bps": vol_bps }));
        if vol_bps == 0 {
            self.vol_bps.remove(&symbol);
        } else {
            self.vol_bps.insert(symbol, vol_bps);
        }
    }

    /// `Pyth` is rejected until WO-10b ships the Pyth read path, so a stored source can never brick triggers.
    pub fn set_oracle_source(&mut self, symbol: String, source: OracleSource) {
        self.assert_owner();
        self.assert_symbol(&symbol);
        require!(source == OracleSource::Owner, "Pyth source not available yet (WO-10b)");
        self.oracle_sources.insert(symbol, source);
    }

    pub fn set_max_conf_bps(&mut self, max_conf_bps: u16) {
        self.assert_owner();
        require!(max_conf_bps > 0 && max_conf_bps <= 10_000, "max_conf_bps out of range");
        self.max_conf_bps = max_conf_bps;
    }

    // ------------------------------------------------------------ views
    pub fn get_quoter_config(&self) -> QuoterConfigView {
        let q = &self.quoter;
        QuoterConfigView {
            enabled: self.quoter_enabled(),
            outlayer_account: q.outlayer_account.clone(),
            project_id: q.project_id.clone(),
            version_key: q.version_key.clone(),
            deposit_yocto: U128(q.deposit_yocto),
            gas_tgas: q.gas_tgas,
            max_instructions: U64(q.max_instructions),
            max_memory_mb: q.max_memory_mb,
            max_execution_seconds: q.max_execution_seconds,
            max_conf_bps: self.max_conf_bps,
        }
    }

    pub fn get_oracle_source(&self, symbol: String) -> OracleSource {
        self.oracle_sources.get(&symbol).cloned().unwrap_or_default()
    }

    /// 0 = unset (quoter path then falls back to static pricing with `quoter_fallback{vol_unset}`).
    pub fn get_vol_bps(&self, symbol: String) -> u16 {
        self.vol_bps.get(&symbol).copied().unwrap_or(0)
    }
}
