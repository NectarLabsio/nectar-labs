//! OutLayer guest binary (wasm32-wasip2): stdin JSON → one stdout JSON line, always exit 0 (the contract falls back
//! on `error`). Secrets arrive as env vars (F-043). See src/lib.rs for the contract.
use std::io::{Read, Write};

fn main() {
    let mut buf = Vec::with_capacity(nectar_quoter::MAX_STDIN_BYTES + 1);
    // Read one byte past the limit so oversize input is detected without buffering it all.
    let read = std::io::stdin().lock().take(nectar_quoter::MAX_STDIN_BYTES as u64 + 1).read_to_end(&mut buf);
    let out = match read {
        Ok(_) => nectar_quoter::run(&buf, |name| std::env::var(name).ok()),
        Err(_) => nectar_quoter::error_json("stdin_read"),
    };
    let mut stdout = std::io::stdout().lock();
    let _ = stdout.write_all(out.as_bytes());
    let _ = stdout.flush();
}
