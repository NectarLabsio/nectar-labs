//! Blocking HTTPS POST over `wasi:http/outgoing-handler` (wasm32-wasip2 only, F-043). Mirrors the request path of
//! `wasi-http-client` 0.2 (same `wasi` 0.13 bindings) without its `url`/`anyhow` dependencies.

use wasi::http::outgoing_handler;
use wasi::http::types::{Fields, Method, OutgoingBody, OutgoingRequest, RequestOptions, Scheme};
use wasi::io::streams::StreamError;

/// Largest response body read (a getAccountInfo answer is < 1 KiB).
pub const MAX_RESPONSE_BYTES: usize = 64 * 1024;
const TIMEOUT_NS: u64 = 15_000_000_000;
/// `blocking-write-and-flush` accepts at most 4096 bytes per call.
const WRITE_CHUNK: usize = 4096;

pub fn post_json(url: &str, body: &[u8]) -> Result<Vec<u8>, &'static str> {
    let (authority, path) = crate::jobs::split_https_url(url).ok_or("bad_rpc_url")?;
    let headers = Fields::from_list(&[("content-type".to_string(), b"application/json".to_vec())])
        .map_err(|_| "http_request")?;
    let req = OutgoingRequest::new(headers);
    req.set_method(&Method::Post).map_err(|()| "http_request")?;
    req.set_scheme(Some(&Scheme::Https)).map_err(|()| "http_request")?;
    req.set_authority(Some(authority)).map_err(|()| "http_request")?;
    req.set_path_with_query(Some(path)).map_err(|()| "http_request")?;
    let out_body = req.body().map_err(|()| "http_request")?;
    {
        let stream = out_body.write().map_err(|()| "http_request")?;
        for chunk in body.chunks(WRITE_CHUNK) {
            stream.blocking_write_and_flush(chunk).map_err(|_| "http_write")?;
        }
    } // the output stream (child) is dropped before the body is finished
    OutgoingBody::finish(out_body, None).map_err(|_| "http_write")?;

    let options = RequestOptions::new();
    // Hosts may refuse to set a timeout; that is not an error for us.
    let _ = options.set_connect_timeout(Some(TIMEOUT_NS));
    let _ = options.set_first_byte_timeout(Some(TIMEOUT_NS));
    let _ = options.set_between_bytes_timeout(Some(TIMEOUT_NS));
    let future = outgoing_handler::handle(req, Some(options)).map_err(|_| "http_send")?;
    let response = loop {
        match future.get() {
            Some(r) => break r,
            None => future.subscribe().block(),
        }
    };
    drop(future);
    let response = response.map_err(|()| "http_send")?.map_err(|_| "http_send")?;
    if response.status() != 200 {
        return Err("http_status");
    }
    let in_body = response.consume().map_err(|()| "http_read")?;
    drop(response);
    let stream = in_body.stream().map_err(|()| "http_read")?;
    let mut out = Vec::new();
    loop {
        match stream.blocking_read(MAX_RESPONSE_BYTES as u64) {
            Ok(chunk) => {
                out.extend_from_slice(&chunk);
                if out.len() > MAX_RESPONSE_BYTES {
                    return Err("http_too_large");
                }
            }
            Err(StreamError::Closed) => break,
            Err(_) => return Err("http_read"),
        }
    }
    drop(stream); // child of in_body
    drop(in_body);
    Ok(out)
}
