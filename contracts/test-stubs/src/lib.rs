//! Sandbox stub of `outlayer.testnet` (F-047 args, F-048 callback shape). Never deployed to testnet.
//!
//! `request_execution` returns synchronously what the real contract returns from `on_execution_response`
//! after the yield resumes: the guest stdout JSON verbatim (response_format Json) or `null`.
//! Modes (`set_mode`):
//! - `echo`    : valid quoter stdout for the received stdin, every fill at `disc_bps`
//! - `badhash` : echo with a wrong `input_sha256`
//! - `unknown` : echo plus a fill for quote id 999999
//! - `error`   : `{"v":1,"error":"stub"}`
//! - `null`    : `null` (failed run / yield timeout)
//! - `panic`   : the receipt fails (callback sees PromiseError::Failed)
//! - `raw`     : `body` verbatim
//!
//! WO-10b: the same wasm also stands in for the Pyth NEAR receiver (`pyth-oracle.testnet`, F-054):
//! `get_price_no_older_than(price_id, age)` (F-173) returns `pyth_body` verbatim (default `null`, i.e.
//! `Option<Price>::None`; shape per F-174), `null` when `|block_ts_s - publish_time| > age` (as the real
//! receiver), or fails the receipt when it is `"panic"`.

use near_sdk::serde_json::{self, Value, json};
use near_sdk::{AccountId, PanicOnDefault, env, near};

pub mod signer;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct OutlayerStub {
    mode: String,
    disc_bps: i64,
    body: String,
    last_request: String,
    requests: u64,
    pyth_body: String,
    pyth_last_id: String,
    pyth_last_age: u64,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[near]
impl OutlayerStub {
    #[init]
    pub fn new() -> Self {
        Self { mode: "echo".into(), disc_bps: 65, body: String::new(), last_request: String::new(), requests: 0,
               pyth_body: "null".into(), pyth_last_id: String::new(), pyth_last_age: 0 }
    }

    pub fn set_mode(&mut self, mode: String, disc_bps: Option<i64>, body: Option<String>) {
        self.mode = mode;
        self.disc_bps = disc_bps.unwrap_or(65);
        self.body = body.unwrap_or_default();
    }

    /// Same argument names as OutLayer (F-047); unknown shapes are kept as raw JSON values.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn request_execution(
        &mut self,
        source: Value,
        resource_limits: Option<Value>,
        input_data: Option<String>,
        secrets_ref: Option<Value>,
        response_format: Option<Value>,
        payer_account_id: Option<AccountId>,
        params: Option<Value>,
    ) {
        let input = input_data.unwrap_or_default();
        self.requests += 1;
        self.last_request = json!({
            "predecessor": env::predecessor_account_id(), "deposit": env::attached_deposit().as_yoctonear().to_string(),
            "prepaid_gas": env::prepaid_gas().as_gas(), "source": source, "resource_limits": resource_limits,
            "input_data": input, "secrets_ref": secrets_ref, "response_format": response_format,
            "payer_account_id": payer_account_id, "params": params,
        })
        .to_string();
        if self.mode == "hang" {
            // like the real contract (F-047): yield, but never resume -> caller's callback waits (WO-10b)
            let idx = env::promise_yield_create("on_hang", b"{}", near_sdk::Gas::from_tgas(5), near_sdk::GasWeight(0), 0);
            env::promise_return(idx);
            return;
        }
        let out: String = match self.mode.as_str() {
            "panic" => env::panic_str("stub: execution failed"),
            "null" => "null".into(),
            "error" => r#"{"v":1,"error":"stub"}"#.into(),
            "raw" => self.body.clone(),
            m => {
                let inp: Value = serde_json::from_str(&input).unwrap_or(Value::Null);
                let mut sha = hex(&env::sha256(input.as_bytes()));
                if m == "badhash" {
                    sha = "0".repeat(64);
                }
                let mut fills: Vec<Value> = inp["quotes"]
                    .as_array()
                    .map(|qs| qs.iter().map(|q| json!({ "id": q["id"], "disc_bps": self.disc_bps })).collect())
                    .unwrap_or_default();
                if m == "unknown" {
                    fills.push(json!({ "id": "999999", "disc_bps": 1 }));
                }
                json!({ "v": 1, "symbol": inp["symbol"], "position_id": inp["position_id"], "input_sha256": sha,
                        "price_e6": inp["oracle_price_usd_e6"], "src": "oracle", "depth_e6": "0", "depth_src": "none",
                        "session_open": inp["session_open"], "vol_bps": inp["vol_bps"], "fills": fills, "model": "as-v1" })
                .to_string()
            }
        };
        env::value_return(out.as_bytes());
    }

    /// Raw JSON returned by `get_price_no_older_than` (e.g. `{"price":"13500000000","conf":"1000000","expo":-8,"publish_time":1700000000}`).
    pub fn set_pyth_body(&mut self, body: String) {
        self.pyth_body = body;
    }

    /// Pyth receiver stand-in (F-173 args). Not a view so it can record what it was asked for.
    pub fn get_price_no_older_than(&mut self, price_id: String, age: u64) {
        self.pyth_last_id = price_id;
        self.pyth_last_age = age;
        if self.pyth_body == "panic" {
            env::panic_str("stub: pyth failed");
        }
        let now_s = env::block_timestamp() / 1_000_000_000;
        let publish = near_sdk::serde_json::from_str::<Value>(&self.pyth_body)
            .ok()
            .and_then(|v| v.get("publish_time").and_then(Value::as_i64));
        let too_far = publish.is_some_and(|t| (i128::from(now_s) - i128::from(t)).unsigned_abs() > u128::from(age));
        env::value_return(if too_far { b"null" } else { self.pyth_body.as_bytes() });
    }

    pub fn get_pyth_last_age(&self) -> u64 {
        self.pyth_last_age
    }

    /// Yield callback of `hang` mode (runs only on yield timeout): `null`, like a timed-out execution.
    pub fn on_hang(&self) -> String {
        "null".into()
    }

    pub fn get_pyth_last_id(&self) -> String {
        self.pyth_last_id.clone()
    }

    pub fn get_last_request(&self) -> String {
        self.last_request.clone()
    }

    pub fn get_requests(&self) -> u64 {
        self.requests
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn ctx() {
        testing_env!(VMContextBuilder::new().build());
    }

    #[test]
    fn new_and_set_mode() {
        ctx();
        let mut s = OutlayerStub::new();
        assert_eq!(s.get_requests(), 0);
        s.set_mode("null".into(), None, None);
        s.request_execution(json!({}), None, Some("{}".into()), None, None, None, None);
        assert_eq!(s.get_requests(), 1);
        assert!(s.get_last_request().contains("\"input_data\":\"{}\""));
    }

    #[test]
    fn echo_builds_fills() {
        ctx();
        let mut s = OutlayerStub::new();
        let stdin = r#"{"v":1,"symbol":"NVDAx","position_id":"0","quotes":[{"id":"3","max_discount_bps":250}]}"#;
        s.request_execution(json!({}), None, Some(stdin.into()), None, None, None, None);
        assert_eq!(s.get_requests(), 1);
    }

    #[test]
    fn pyth_get_price_records_id() {
        ctx();
        let mut s = OutlayerStub::new();
        s.set_pyth_body(r#"{"price":"1","conf":"0","expo":0,"publish_time":1}"#.into());
        s.get_price_no_older_than("ab".repeat(32), 60);
        assert_eq!(s.get_pyth_last_id(), "ab".repeat(32));
        assert_eq!(s.get_pyth_last_age(), 60);
    }

    #[test]
    #[should_panic(expected = "stub: pyth failed")]
    fn pyth_panic_body() {
        ctx();
        let mut s = OutlayerStub::new();
        s.set_pyth_body("panic".into());
        s.get_price_no_older_than("00".repeat(32), 60);
    }

    #[test]
    #[should_panic(expected = "stub: execution failed")]
    fn panic_mode() {
        ctx();
        let mut s = OutlayerStub::new();
        s.set_mode("panic".into(), None, None);
        s.request_execution(json!({}), None, None, None, None, None, None);
    }
}
