//! Nectar quoter (model `as-v1`) — pure, deterministic, integer-only pricing of pre-liquidation fills.
//!
//! I/O contract: docs/work/interface-p1.md §Quoter, decision D-014.
//! * stdin: UTF-8 JSON ≤ 4 KiB built by nectar-core (`v`, `symbol`, `position_id`, `oracle_price_usd_e6`,
//!   `session_open`, `seize_usd_e6`, `vol_bps`, `quotes[≤8]{id,max_discount_bps,remaining_usd_e6}`).
//! * secrets (env, buyer's OutLayer profile, F-043): `MM_<id>_Q_BPS`, `MM_<id>_GAMMA_BPS`, each 0..=10000.
//! * formula: `disc = min(max_discount_bps, vol_bps + q_bps·gamma_bps·vol_bps / 1e8)`, floor division.
//!   Missing/invalid secret for a quote → `disc = max_discount_bps` (P0 behaviour).
//! * stdout: one JSON line ≤ 900 bytes (F-043); any input error → `{"v":1,"error":"<short>"}` (exit 0).
//!
//! No clock, no randomness, no floats, no I/O here: `run` is a function of (stdin bytes, secret lookup).

use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

pub const MAX_STDIN_BYTES: usize = 4096;
pub const MAX_STDOUT_BYTES: usize = 900;
pub const MAX_QUOTES: usize = 8;
pub const MAX_BPS: u128 = 10_000;
pub const MODEL: &str = "as-v1";
const MAX_SYMBOL_LEN: usize = 16;
const U64_DIGITS: usize = 20;
const U128_DIGITS: usize = 39;
/// q/1e4 · γ/1e4 · σ = q·γ·σ / 1e8 (D-014: PRD §4.5's 1e6 is dimensionally wrong).
const QG_SCALE: u128 = 100_000_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Quote {
    pub id: String,
    pub max_discount_bps: u128,
    pub remaining_usd_e6: u128,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Input {
    pub symbol: String,
    pub position_id: String,
    pub oracle_price_usd_e6: u128,
    pub session_open: bool,
    pub seize_usd_e6: u128,
    pub vol_bps: u128,
    pub quotes: Vec<Quote>,
}

/// Entry point used by `main` and the tests. `secret` looks up an env var by name.
pub fn run<F: Fn(&str) -> Option<String>>(stdin: &[u8], secret: F) -> String {
    match parse_input(stdin) {
        Ok(input) => render(&input, &hex_sha256(stdin), &secret),
        Err(code) => error_json(code),
    }
}

pub fn error_json(code: &str) -> String {
    // `code` is always one of the static ASCII identifiers below; no escaping needed.
    format!("{{\"v\":1,\"error\":\"{code}\"}}")
}

/// Discount for one quote. `None` secrets → the quote's own cap (P0 behaviour).
pub fn disc_bps(vol_bps: u128, q_bps: Option<u128>, gamma_bps: Option<u128>, max_discount_bps: u128) -> u128 {
    match (q_bps, gamma_bps) {
        (Some(q), Some(g)) => {
            // All factors ≤ 1e4 → product ≤ 1e12; u128 has ample headroom, checked anyway.
            let skew = q.checked_mul(g).and_then(|x| x.checked_mul(vol_bps)).map(|x| x / QG_SCALE);
            match skew.and_then(|s| s.checked_add(vol_bps)) {
                Some(raw) => raw.min(max_discount_bps),
                None => max_discount_bps,
            }
        }
        _ => max_discount_bps,
    }
}

/// Secret value: ASCII decimal 0..=10000, surrounding ASCII whitespace tolerated. Anything else → None.
pub fn parse_secret_bps(raw: Option<String>) -> Option<u128> {
    let raw = raw?;
    let v = parse_canonical_uint(raw.trim_ascii(), 5)?;
    (v <= MAX_BPS).then_some(v)
}

pub fn parse_input(stdin: &[u8]) -> Result<Input, &'static str> {
    if stdin.len() > MAX_STDIN_BYTES {
        return Err("input_too_large");
    }
    let value: Value = serde_json::from_slice(stdin).map_err(|_| "bad_json")?;
    let obj = value.as_object().ok_or("bad_json")?;
    match obj.get("v") {
        None => return Err("missing_v"),
        Some(v) if v.as_u64() == Some(1) => {}
        Some(_) => return Err("unknown_v"),
    }
    let symbol = obj.get("symbol").and_then(Value::as_str).ok_or("bad_symbol")?;
    if symbol.is_empty() || symbol.len() > MAX_SYMBOL_LEN || !symbol.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return Err("bad_symbol");
    }
    let position_id = str_uint(obj, "position_id", U64_DIGITS).ok_or("bad_position_id")?;
    let oracle_price_usd_e6 = str_uint(obj, "oracle_price_usd_e6", U128_DIGITS)
        .and_then(|s| parse_canonical_uint(s, U128_DIGITS))
        .filter(|p| *p > 0)
        .ok_or("bad_oracle_price")?;
    let session_open = obj.get("session_open").and_then(Value::as_bool).ok_or("bad_session_open")?;
    let seize_usd_e6 = str_uint(obj, "seize_usd_e6", U128_DIGITS)
        .and_then(|s| parse_canonical_uint(s, U128_DIGITS))
        .ok_or("bad_seize")?;
    let vol_bps = bps_field(obj, "vol_bps").ok_or("bad_vol_bps")?;
    let raw_quotes = obj.get("quotes").and_then(Value::as_array).ok_or("bad_quotes")?;
    if raw_quotes.len() > MAX_QUOTES {
        return Err("too_many_quotes");
    }
    let mut quotes: Vec<Quote> = Vec::with_capacity(raw_quotes.len());
    for q in raw_quotes {
        let q = q.as_object().ok_or("bad_quotes")?;
        let id = str_uint(q, "id", U64_DIGITS).ok_or("bad_quote_id")?;
        if quotes.iter().any(|existing| existing.id == id) {
            return Err("dup_quote_id");
        }
        let max_discount_bps = bps_field(q, "max_discount_bps").ok_or("bad_max_discount")?;
        let remaining_usd_e6 = str_uint(q, "remaining_usd_e6", U128_DIGITS)
            .and_then(|s| parse_canonical_uint(s, U128_DIGITS))
            .ok_or("bad_remaining")?;
        quotes.push(Quote { id: id.to_owned(), max_discount_bps, remaining_usd_e6 });
    }
    Ok(Input {
        symbol: symbol.to_owned(),
        position_id: position_id.to_owned(),
        oracle_price_usd_e6,
        session_open,
        seize_usd_e6,
        vol_bps,
        quotes,
    })
}

fn render<F: Fn(&str) -> Option<String>>(input: &Input, input_sha256: &str, secret: &F) -> String {
    let mut fills = String::new();
    for (i, q) in input.quotes.iter().enumerate() {
        let qb = parse_secret_bps(secret(&format!("MM_{}_Q_BPS", q.id)));
        let gb = parse_secret_bps(secret(&format!("MM_{}_GAMMA_BPS", q.id)));
        let d = disc_bps(input.vol_bps, qb, gb, q.max_discount_bps);
        if i > 0 {
            fills.push(',');
        }
        fills.push_str(&format!("{{\"id\":\"{}\",\"disc_bps\":{}}}", q.id, d));
    }
    // Every interpolated value is validated ASCII (digits / alphanumerics / hex): hand-written JSON keeps the
    // key order fixed without serde derive.
    let out = format!(
        "{{\"v\":1,\"symbol\":\"{}\",\"position_id\":\"{}\",\"input_sha256\":\"{}\",\"price_e6\":\"{}\",\"src\":\"oracle\",\
\"depth_e6\":\"0\",\"depth_src\":\"none\",\"session_open\":{},\"vol_bps\":{},\"fills\":[{}],\"model\":\"{}\"}}",
        input.symbol,
        input.position_id,
        input_sha256,
        input.oracle_price_usd_e6,
        input.session_open,
        input.vol_bps,
        fills,
        MODEL
    );
    if out.len() > MAX_STDOUT_BYTES {
        // Unreachable with the input bounds above (worst case asserted in tests); fail closed anyway.
        return error_json("output_too_large");
    }
    out
}

fn hex_sha256(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let digest = Sha256::digest(bytes);
    let mut s = String::with_capacity(64);
    for b in digest {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 0x0f) as usize] as char);
    }
    s
}

/// Canonical unsigned decimal: 1..=max_len ASCII digits, no sign, no leading zero (except "0").
fn parse_canonical_uint(s: &str, max_len: usize) -> Option<u128> {
    let b = s.as_bytes();
    if b.is_empty() || b.len() > max_len || !b.iter().all(u8::is_ascii_digit) || (b.len() > 1 && b[0] == b'0') {
        return None;
    }
    s.parse::<u128>().ok()
}

/// A string field holding a canonical decimal (U64/U128 JSON convention); u64 ids are range-checked.
fn str_uint<'a>(obj: &'a Map<String, Value>, key: &str, max_len: usize) -> Option<&'a str> {
    let s = obj.get(key)?.as_str()?;
    let v = parse_canonical_uint(s, max_len)?;
    if max_len == U64_DIGITS && v > u128::from(u64::MAX) {
        return None;
    }
    Some(s)
}

/// A JSON integer bps field in 0..=10000.
fn bps_field(obj: &Map<String, Value>, key: &str) -> Option<u128> {
    let v = u128::from(obj.get(key)?.as_u64()?);
    (v <= MAX_BPS).then_some(v)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formula_examples() {
        assert_eq!(disc_bps(420, Some(5000), Some(5000), 250), 250);
        assert_eq!(disc_bps(40, Some(5000), Some(5000), 250), 50);
        assert_eq!(disc_bps(40, Some(0), Some(10000), 250), 40);
        assert_eq!(disc_bps(40, Some(10000), Some(10000), 250), 80);
        assert_eq!(disc_bps(0, Some(10000), Some(10000), 250), 0);
        assert_eq!(disc_bps(333, Some(3333), Some(7777), 10000), 333 + 3333 * 7777 * 333 / 100_000_000);
        assert_eq!(disc_bps(40, None, Some(1), 250), 250);
        assert_eq!(disc_bps(40, Some(1), None, 0), 0);
    }

    #[test]
    fn secret_parsing() {
        assert_eq!(parse_secret_bps(Some("10000".into())), Some(10000));
        assert_eq!(parse_secret_bps(Some(" 42\n".into())), Some(42));
        assert_eq!(parse_secret_bps(Some("10001".into())), None);
        assert_eq!(parse_secret_bps(Some("-1".into())), None);
        assert_eq!(parse_secret_bps(Some("0.5".into())), None);
        assert_eq!(parse_secret_bps(Some("007".into())), None);
        assert_eq!(parse_secret_bps(Some(String::new())), None);
        assert_eq!(parse_secret_bps(None), None);
    }

    /// Largest output the input bounds allow: 16-char symbol, u64::MAX ids, 39-digit price, 8 fills at 10000.
    #[test]
    fn worst_case_stdout_fits_900_bytes() {
        let id_max = u64::MAX.to_string();
        let quotes: Vec<String> = (0..8)
            .map(|i| {
                let id = (u64::MAX - i).to_string();
                format!("{{\"id\":\"{id}\",\"max_discount_bps\":10000,\"remaining_usd_e6\":\"{}\"}}", u128::MAX)
            })
            .collect();
        let stdin = format!(
            "{{\"v\":1,\"symbol\":\"ABCDEFGHIJKLMNOP\",\"position_id\":\"{id_max}\",\"oracle_price_usd_e6\":\"{m}\",\
\"session_open\":false,\"seize_usd_e6\":\"{m}\",\"vol_bps\":10000,\"quotes\":[{}]}}",
            quotes.join(","),
            m = u128::MAX
        );
        assert!(stdin.len() <= MAX_STDIN_BYTES);
        let out = run(stdin.as_bytes(), |_| Some("10000".into()));
        assert!(!out.contains("error"), "{out}");
        assert!(out.len() <= MAX_STDOUT_BYTES, "worst case {} bytes", out.len());
    }
}
