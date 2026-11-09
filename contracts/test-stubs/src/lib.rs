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

use near_sdk::serde_json::{self, Value, json};
use near_sdk::{AccountId, PanicOnDefault, env, near};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct OutlayerStub {
    mode: String,
    disc_bps: i64,
    body: String,
    last_request: String,
    requests: u64,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[near]
impl OutlayerStub {
    #[init]
    pub fn new() -> Self {
        Self { mode: "echo".into(), disc_bps: 65, body: String::new(), last_request: String::new(), requests: 0 }
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
    #[should_panic(expected = "stub: execution failed")]
    fn panic_mode() {
        ctx();
        let mut s = OutlayerStub::new();
        s.set_mode("panic".into(), None, None);
        s.request_execution(json!({}), None, None, None, None, None, None);
    }
}
