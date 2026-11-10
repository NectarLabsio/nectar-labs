//! OutLayer guest binary (wasm32-wasip2): stdin JSON → one stdout JSON line, always exit 0 (the contract falls back
//! on `error`). Secrets arrive as env vars (F-043). See src/lib.rs for the contract; WO-24 jobs (`job` field) may
//! make HTTPS POSTs through wasi:http (src/http.rs).
use std::io::{Read, Write};

#[cfg(all(target_os = "wasi", target_env = "p2"))]
fn http(url: &str, body: &[u8]) -> Result<Vec<u8>, &'static str> {
    nectar_quoter::http::post_json(url, body)
}

/// Native builds (local runs) have no network path: chain-reading jobs answer `http_unavailable`.
#[cfg(not(all(target_os = "wasi", target_env = "p2")))]
fn http(_url: &str, _body: &[u8]) -> Result<Vec<u8>, &'static str> {
    Err("http_unavailable")
}

fn main() {
    let mut buf = Vec::with_capacity(nectar_quoter::MAX_STDIN_BYTES + 1);
    // Read one byte past the limit so oversize input is detected without buffering it all.
    let read = std::io::stdin().lock().take(nectar_quoter::MAX_STDIN_BYTES as u64 + 1).read_to_end(&mut buf);
    let out = match read {
        Ok(_) => nectar_quoter::run_with(&buf, |name| std::env::var(name).ok(), &mut http),
        Err(_) => nectar_quoter::error_json("stdin_read"),
    };
    let mut stdout = std::io::stdout().lock();
    let _ = stdout.write_all(out.as_bytes());
    let _ = stdout.flush();
}
