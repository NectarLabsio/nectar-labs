//! NEP-297 events (F-021): `EVENT_JSON:{"standard":"nectar","version":"2.0.0","event":..,"data":[{..}]}`.

use near_sdk::env;
use near_sdk::serde::Serialize;
use near_sdk::serde_json::{self, Value};

pub const STANDARD: &str = "nectar";
pub const VERSION: &str = "2.0.0";

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct Envelope<'a> {
    standard: &'a str,
    version: &'a str,
    event: &'a str,
    data: [Value; 1],
}

pub fn emit(event: &str, data: Value) {
    emit_standard(STANDARD, VERSION, event, data);
}

/// Any NEP-297 standard, e.g. `nep171` 1.0.0 `nft_mint` / `nft_transfer` (WO-22, F-337).
pub fn emit_standard(standard: &str, version: &str, event: &str, data: Value) {
    let env_json = Envelope { standard, version, event, data: [data] };
    let s = serde_json::to_string(&env_json).unwrap_or_else(|_| env::panic_str("event encode"));
    env::log_str(&format!("EVENT_JSON:{s}"));
}
