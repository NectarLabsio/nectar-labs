//! v7 OutLayer jobs (WO-24), selected by the stdin `job` field. Absent `job` ⇒ the quote job (lib.rs), unchanged.
//!
//! * `vault_read {chain:"solana-devnet", program, position_id, depositor, rpc_url?, mint?}` → Solana `getAccountInfo`
//!   on the v2 position PDA `["pos", vault, u64le(id), depositor]` → `{"position_id":"<id>","units":"<u64>",
//!   "authority":"ed25519:<b58>","depositor":"<b58>","slot_or_block":<slot>}`, the shape
//!   `contracts/nectar-core/src/remote.rs::parse_vault_read` accepts. Only an open position (status 1) answers: a v2
//!   position outlives settle/release until `withdraw`, so any other status is `position_not_open`.
//!   A missing account prints `{"position_id":"<id>","found":false}` (remote.rs rejects it: no `units`).
//!   Any other chain is `unsupported_chain`, including `base-sepolia` (SR-28 not implemented).
//! * `calendar {symbol, now_s}` → `{"force_closed":bool,"reason":"weekend|holiday|early_close|open"}`.
//! * `multiplier {rpc_url, token, decimals}` → `eth_call multiplier()` → `{"multiplier_e18":"<u128>"}`. D-021: the
//!   value is returned as read; the contract never applies it to a `TokenIncludesMultiplier` feed.
//!
//! Errors print `{"v":1,"error":"<code>"}` like the quote job (remote.rs treats any `error` key as a failure).
//! I/O goes through the `http` callback (url, body) → response body, so every job is testable with recorded bytes.

use serde_json::{Map, Value};

use crate::calendar::Calendar;
use crate::solana::{self, STATUS_OPEN};
use crate::{MAX_STDOUT_BYTES, error_json};

/// `(url, json body) → response body`. Implemented with `wasi:http` on wasm32-wasip2 (src/http.rs).
pub type Http<'a> = dyn FnMut(&str, &[u8]) -> Result<Vec<u8>, &'static str> + 'a;

pub const DEFAULT_SOLANA_RPC: &str = "https://api.devnet.solana.com";
/// Mock NVDAx mint on Solana devnet: `packages/config/config.yaml` `solana.mint` (a test asserts they agree).
/// nectar-core's `vault_read` input has no mint, and the vault PDA is `["vault", mint]` (solana/deploy.md).
pub const DEVNET_MINT: &str = "3Ve8GiDBtD7crfwUcKukpMigKQaU2aXtSCNgu661E8hT";
/// keccak256("multiplier()")[..4] (B20 Beryl `multiplier()`, F-345 / D-021).
pub const MULTIPLIER_SELECTOR: &str = "0x1b3ed722";
const MAX_URL_LEN: usize = 256;
const MAX_SYMBOL_LEN: usize = 16;
const MAX_DECIMALS: u64 = 36;

pub fn dispatch(obj: &Map<String, Value>, http: &mut Http<'_>) -> String {
    let out = match obj.get("job").and_then(Value::as_str) {
        Some("vault_read") => vault_read(obj, http),
        Some("calendar") => calendar(obj),
        Some("multiplier") => multiplier(obj, http),
        _ => Err("unknown_job"),
    };
    match out {
        Ok(s) if s.len() <= MAX_STDOUT_BYTES => s,
        Ok(_) => error_json("output_too_large"),
        Err(code) => error_json(code),
    }
}

// ------------------------------------------------------------------ input helpers

/// u64 from a canonical decimal string (near-sdk `U64`) or a JSON integer.
fn u64_field(obj: &Map<String, Value>, key: &str) -> Option<u64> {
    match obj.get(key)? {
        Value::String(s) => {
            let b = s.as_bytes();
            if b.is_empty() || b.len() > 20 || !b.iter().all(u8::is_ascii_digit) || (b.len() > 1 && b[0] == b'0') {
                return None;
            }
            s.parse().ok()
        }
        Value::Number(n) => n.as_u64(),
        _ => None,
    }
}

/// `https://<host[:port]>[/path[?query]]` → (authority, path_with_query). Printable ASCII only, no userinfo.
pub fn split_https_url(url: &str) -> Option<(&str, &str)> {
    if url.len() > MAX_URL_LEN || !url.bytes().all(|b| b.is_ascii_graphic()) {
        return None;
    }
    let rest = url.strip_prefix("https://")?;
    let (authority, path) = match rest.find(['/', '?']) {
        Some(i) if rest.as_bytes()[i] == b'/' => (&rest[..i], &rest[i..]),
        Some(_) => return None,
        None => (rest, "/"),
    };
    let ok = !authority.is_empty()
        && authority.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b':' | b'_'));
    ok.then_some((authority, path))
}

fn url_field<'a>(obj: &'a Map<String, Value>, key: &str, default: Option<&'a str>) -> Result<&'a str, &'static str> {
    let url = match obj.get(key) {
        None | Some(Value::Null) => default.ok_or("bad_rpc_url")?,
        Some(v) => v.as_str().ok_or("bad_rpc_url")?,
    };
    split_https_url(url).map(|_| url).ok_or("bad_rpc_url")
}

fn rpc_result(resp: &[u8]) -> Result<Value, &'static str> {
    let mut v: Value = serde_json::from_slice(resp).map_err(|_| "bad_rpc_response")?;
    if v.get("error").is_some_and(|e| !e.is_null()) {
        return Err("rpc_error");
    }
    match v.get_mut("result") {
        Some(r) => Ok(r.take()),
        None => Err("bad_rpc_response"),
    }
}

// ------------------------------------------------------------------ vault_read

/// Parsed `vault_read` request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultReadReq {
    pub program: [u8; 32],
    pub mint: [u8; 32],
    pub position_id: u64,
    pub depositor: [u8; 32],
    pub rpc_url: String,
}

pub fn parse_vault_read(obj: &Map<String, Value>) -> Result<VaultReadReq, &'static str> {
    if obj.get("chain").and_then(Value::as_str) != Some("solana-devnet") {
        return Err("unsupported_chain");
    }
    let program = obj.get("program").and_then(Value::as_str).and_then(solana::b58_decode32).ok_or("bad_program")?;
    let position_id = u64_field(obj, "position_id").ok_or("bad_position_id")?;
    let depositor = obj.get("depositor").and_then(Value::as_str).and_then(solana::b58_decode32).ok_or("bad_depositor")?;
    let mint = match obj.get("mint") {
        None | Some(Value::Null) => DEVNET_MINT,
        Some(v) => v.as_str().ok_or("bad_mint")?,
    };
    let mint = solana::b58_decode32(mint).ok_or("bad_mint")?;
    let rpc_url = url_field(obj, "rpc_url", Some(DEFAULT_SOLANA_RPC))?.to_string();
    Ok(VaultReadReq { program, mint, position_id, depositor, rpc_url })
}

/// (vault PDA, position PDA).
pub fn vault_read_pdas(req: &VaultReadReq) -> Result<([u8; 32], [u8; 32]), &'static str> {
    let vault = solana::vault_pda(&req.mint, &req.program).ok_or("no_pda")?;
    let pos = solana::position_pda(&vault, req.position_id, &req.depositor, &req.program).ok_or("no_pda")?;
    Ok((vault, pos))
}

/// JSON-RPC body for `getAccountInfo` (finalized: a deposit proof must not be reorged away).
pub fn get_account_info_body(pos: &[u8; 32]) -> String {
    format!(
        "{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"{}\",{{\"encoding\":\"base64\",\"commitment\":\"finalized\"}}]}}",
        solana::b58_encode(pos)
    )
}

/// Turns a `getAccountInfo` response into the job's stdout. Checks owner, length, discriminator, version, status,
/// and the stored vault, position id and depositor against what was derived.
pub fn render_vault_read(resp: &[u8], req: &VaultReadReq, vault: &[u8; 32]) -> Result<String, &'static str> {
    let result = rpc_result(resp)?;
    let slot = result["context"]["slot"].as_u64().ok_or("bad_rpc_response")?;
    let id = req.position_id;
    let value = &result["value"];
    if value.is_null() {
        return Ok(format!("{{\"position_id\":\"{id}\",\"found\":false}}"));
    }
    if value["owner"].as_str() != Some(solana::b58_encode(&req.program).as_str()) {
        return Err("wrong_owner");
    }
    let data = match value["data"].as_array().map(Vec::as_slice) {
        Some([Value::String(b64), Value::String(enc)]) if enc == "base64" => b64,
        _ => return Err("bad_rpc_response"),
    };
    let bytes = solana::b64_decode(data).ok_or("bad_base64")?;
    let p = solana::decode_position(&bytes)?;
    if p.status != STATUS_OPEN {
        return Err("position_not_open");
    }
    if &p.vault != vault {
        return Err("vault_mismatch");
    }
    if p.position_id != id {
        return Err("position_mismatch");
    }
    if p.depositor != req.depositor {
        return Err("depositor_mismatch");
    }
    Ok(format!(
        "{{\"position_id\":\"{id}\",\"units\":\"{}\",\"authority\":\"ed25519:{}\",\"depositor\":\"{}\",\"slot_or_block\":{slot}}}",
        p.amount,
        solana::b58_encode(&p.authority),
        solana::b58_encode(&p.depositor)
    ))
}

fn vault_read(obj: &Map<String, Value>, http: &mut Http<'_>) -> Result<String, &'static str> {
    let req = parse_vault_read(obj)?;
    let (vault, pos) = vault_read_pdas(&req)?;
    let resp = http(&req.rpc_url, get_account_info_body(&pos).as_bytes())?;
    render_vault_read(&resp, &req, &vault)
}

// ------------------------------------------------------------------ calendar

fn calendar(obj: &Map<String, Value>) -> Result<String, &'static str> {
    let symbol = obj.get("symbol").and_then(Value::as_str).ok_or("bad_symbol")?;
    if symbol.is_empty() || symbol.len() > MAX_SYMBOL_LEN || !symbol.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return Err("bad_symbol");
    }
    let now_s = u64_field(obj, "now_s").ok_or("bad_now_s")?;
    let reason = Calendar::embedded()?.check(now_s)?;
    Ok(format!("{{\"force_closed\":{},\"reason\":\"{}\"}}", reason.force_closed(), reason.as_str()))
}

// ------------------------------------------------------------------ multiplier

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MultiplierReq {
    pub rpc_url: String,
    pub token: String,
}

pub fn parse_multiplier(obj: &Map<String, Value>) -> Result<MultiplierReq, &'static str> {
    let rpc_url = url_field(obj, "rpc_url", None)?.to_string();
    let token = obj.get("token").and_then(Value::as_str).ok_or("bad_token")?;
    let hex = token.strip_prefix("0x").ok_or("bad_token")?;
    if hex.len() != 40 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("bad_token");
    }
    // `decimals` is validated (the WAD scale of `multiplier()` is 1e18 whatever the token decimals, F-345).
    obj.get("decimals").and_then(Value::as_u64).filter(|d| *d <= MAX_DECIMALS).ok_or("bad_decimals")?;
    Ok(MultiplierReq { rpc_url, token: token.to_ascii_lowercase() })
}

pub fn eth_call_body(token: &str) -> String {
    format!(
        "{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{{\"to\":\"{token}\",\"data\":\"{MULTIPLIER_SELECTOR}\"}},\"latest\"]}}"
    )
}

/// `eth_call` result: one ABI word (`0x` + 64 hex) holding a uint256 that must fit u128 and be > 0.
pub fn render_multiplier(resp: &[u8]) -> Result<String, &'static str> {
    let result = rpc_result(resp)?;
    let hex = result.as_str().and_then(|s| s.strip_prefix("0x")).ok_or("bad_rpc_response")?;
    if hex.len() != 64 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("bad_abi_word");
    }
    if hex[..32].bytes().any(|b| b != b'0') {
        return Err("multiplier_overflow");
    }
    let m = u128::from_str_radix(&hex[32..], 16).map_err(|_| "bad_abi_word")?;
    if m == 0 {
        return Err("zero_multiplier");
    }
    Ok(format!("{{\"multiplier_e18\":\"{m}\"}}"))
}

fn multiplier(obj: &Map<String, Value>, http: &mut Http<'_>) -> Result<String, &'static str> {
    let req = parse_multiplier(obj)?;
    let resp = http(&req.rpc_url, eth_call_body(&req.token).as_bytes())?;
    render_multiplier(&resp)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls() {
        assert_eq!(split_https_url("https://api.devnet.solana.com"), Some(("api.devnet.solana.com", "/")));
        assert_eq!(split_https_url("https://h:8899/x?y=1"), Some(("h:8899", "/x?y=1")));
        assert_eq!(split_https_url("http://h/"), None);
        assert_eq!(split_https_url("https://u@h/"), None);
        assert_eq!(split_https_url("https://h?x"), None);
        assert_eq!(split_https_url("https:///x"), None);
        assert_eq!(split_https_url("https://h /"), None);
    }

    #[test]
    fn selector_hex() {
        // keccak256("multiplier()") = 1b3ed722… (computed with @noble/hashes keccak_256; transfer(address,uint256)
        // gave the well-known a9059cbb with the same tool).
        assert_eq!(MULTIPLIER_SELECTOR.len(), 10);
    }
}
