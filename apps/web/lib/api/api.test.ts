// `pnpm --filter web test` — R2-04 / R2-11 request guards, driven with plain Web Requests (no server).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TokenBucket, clientKey, guardJsonPost, isSameOrigin, readCappedText } from "./guard.ts";
import { isAllowedFeedPath } from "./feed-paths.ts";
import { handleCopilotPost, type CopilotDeps } from "../copilot/handler.ts";
import { COPILOT_MAX_TOKENS, type CopilotBundle } from "../copilot/verify.ts";

const URL_ = "http://localhost:3100/api/copilot";
const SAME = { "sec-fetch-site": "same-origin", origin: "http://localhost:3100", "content-type": "application/json" };
const post = (body: string, headers: Record<string, string> = SAME, ip = "198.51.100.7") => new Request(URL_, { method: "POST", headers: { "x-forwarded-for": ip, ...headers }, body });
const nonce = "ab".repeat(32);

function deps(over: Partial<CopilotDeps> = {}): CopilotDeps & { liveCalls: string[]; fixtureCalls: number; logs: string[] } {
  const d = {
    liveCalls: [] as string[],
    fixtureCalls: 0,
    logs: [] as string[],
    apiKey: () => "k",
    model: "org/model",
    live: async (requestBody: string) => {
      d.liveCalls.push(requestBody);
      return { source: "live", modelId: "org/model", requestBody } as unknown as CopilotBundle;
    },
    fixture: async () => {
      d.fixtureCalls++;
      return { status: "ok", nonce: "00" };
    },
    buckets: { live: new TokenBucket(5, 60_000), liveGlobal: new TokenBucket(30, 60_000), fixture: new TokenBucket(30, 60_000) },
    log: (m: string) => d.logs.push(m),
    ...over,
  };
  return d;
}

test("same-origin: Sec-Fetch-Site same-origin passes; cross-site, same-site, foreign Origin and header-less requests are refused", () => {
  const r = (h: Record<string, string>) => new Request(URL_, { method: "POST", headers: h });
  assert.equal(isSameOrigin(r({ "sec-fetch-site": "same-origin" })), true);
  assert.equal(isSameOrigin(r({ "sec-fetch-site": "same-origin", origin: "http://localhost:3100" })), true);
  assert.equal(isSameOrigin(r({ origin: "http://localhost:3100" })), true, "older browsers: Origin alone");
  assert.equal(isSameOrigin(r({ origin: "https://nectar.example", "x-forwarded-host": "nectar.example" })), true, "behind a proxy");
  assert.equal(isSameOrigin(r({ "sec-fetch-site": "cross-site", origin: "https://evil.example" })), false);
  assert.equal(isSameOrigin(r({ "sec-fetch-site": "same-site", origin: "http://other.localhost:3100" })), false);
  assert.equal(isSameOrigin(r({ "sec-fetch-site": "same-origin", origin: "https://evil.example" })), false);
  assert.equal(isSameOrigin(r({ origin: "https://evil.example" })), false);
  assert.equal(isSameOrigin(r({ origin: "null" })), false);
  assert.equal(isSameOrigin(r({})), false, "no browser headers at all");
});

test("guardJsonPost: cross-origin → 403, text/plain → 415, > 8 KB → 413, bad JSON → 400, good → parsed", async () => {
  assert.equal(((await guardJsonPost(post("{}", { ...SAME, "sec-fetch-site": "cross-site", origin: "https://evil.example" }))) as { response: Response }).response.status, 403);
  assert.equal(((await guardJsonPost(post("{}", { ...SAME, "content-type": "text/plain" }))) as { response: Response }).response.status, 415);
  assert.equal(((await guardJsonPost(post("{}", { "sec-fetch-site": "same-origin" }))) as { response: Response }).response.status, 415, "missing content-type");
  const big = JSON.stringify({ notes: "x".repeat(9000) });
  assert.equal(((await guardJsonPost(post(big))) as { response: Response }).response.status, 413);
  assert.equal(((await guardJsonPost(post("{nope"))) as { response: Response }).response.status, 400);
  const ok = await guardJsonPost(post('{"a":1}', { ...SAME, "content-type": "application/json; charset=utf-8" }));
  assert.deepEqual(ok, { ok: true, value: { a: 1 } });
});

test("readCappedText: stops at the cap even without (or with a lying) content-length", async () => {
  const stream = (n: number) => new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < n; i++) c.enqueue(new Uint8Array(1024).fill(0x61));
      c.close();
    },
  });
  const mk = (n: number, len?: string) => new Request(URL_, { method: "POST", body: stream(n), headers: len ? { "content-length": len } : {}, duplex: "half" } as RequestInit);
  assert.equal(await readCappedText(mk(9), 8192), null);
  assert.equal((await readCappedText(mk(8), 8192))?.length, 8192);
  assert.equal(await readCappedText(new Request(URL_, { method: "POST", body: "{}", headers: { "content-length": "999999" } }), 8192), null);
});

test("token bucket: 5 per minute per client, refills, separate keys, bounded memory", () => {
  const b = new TokenBucket(5, 60_000, 3);
  for (let i = 0; i < 5; i++) assert.equal(b.take("a", 0), 0);
  const wait = b.take("a", 0);
  assert.ok(wait > 0 && wait <= 12_000, `wait ${wait}`);
  assert.equal(b.take("b", 0), 0, "other client unaffected");
  assert.equal(b.take("a", 12_000), 0, "one token back after 12 s");
  assert.ok(b.take("a", 12_000) > 0);
  b.take("c", 12_000);
  b.take("d", 12_000);
  assert.equal(b.take("e", 12_000), 0, "new keys still admitted at the key cap");
  // The nearest proxy appends the real peer last; earlier hops are whatever the client sent.
  assert.equal(clientKey(post("{}", SAME, "6.6.6.6, 203.0.113.9")), "203.0.113.9");
  assert.equal(clientKey(post("{}", { ...SAME, "x-real-ip": "192.0.2.1" }, "6.6.6.6")), "192.0.2.1");
  assert.equal(clientKey(new Request(URL_)), "unknown");
});

test("POST /api/copilot: a global ceiling holds when clients rotate x-forwarded-for", async () => {
  const d = deps({ buckets: { live: new TokenBucket(5, 60_000), liveGlobal: new TokenBucket(3, 60_000), fixture: new TokenBucket(30, 60_000) } });
  const body = JSON.stringify({ nonce, notes: "n" });
  const codes: number[] = [];
  for (let i = 0; i < 5; i++) codes.push((await handleCopilotPost(post(body, SAME, `203.0.113.${i}`), d)).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  assert.equal(d.liveCalls.length, 3);
});

test("POST /api/copilot: 429 after 5 live calls from one client, other clients still served; fixture has its own bucket", async () => {
  const d = deps();
  const body = JSON.stringify({ nonce, notes: "split announced" });
  for (let i = 0; i < 5; i++) assert.equal((await handleCopilotPost(post(body), d)).status, 200);
  const limited = await handleCopilotPost(post(body), d);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
  assert.equal(((await limited.json()) as { status: string }).status, "rate_limited");
  assert.equal(d.liveCalls.length, 5, "the 6th call never reached NEAR AI");
  assert.equal((await handleCopilotPost(post(body, SAME, "198.51.100.8"), d)).status, 200);
  assert.equal((await handleCopilotPost(post('{"fixture":true}'), d)).status, 200, "fixture bucket is separate");
  assert.equal(d.logs.join(""), "", "nothing logged (no client address anywhere)");
});

test("POST /api/copilot: rejected requests never reach NEAR AI or the fixture", async () => {
  const d = deps();
  const body = JSON.stringify({ nonce, notes: "n" });
  assert.equal((await handleCopilotPost(post(body, { ...SAME, "sec-fetch-site": "cross-site", origin: "https://evil.example" }), d)).status, 403);
  assert.equal((await handleCopilotPost(post(body, { ...SAME, "content-type": "text/plain" }), d)).status, 415, "CORS simple request");
  assert.equal((await handleCopilotPost(post(JSON.stringify({ nonce, notes: "é".repeat(4100) })), d)).status, 413);
  assert.equal((await handleCopilotPost(post(JSON.stringify({ nonce: "zz", notes: "n" })), d)).status, 400);
  assert.equal((await handleCopilotPost(post(JSON.stringify({ nonce, notes: "x".repeat(4001) })), d)).status, 400);
  assert.equal(d.liveCalls.length + d.fixtureCalls, 0);
  assert.equal((await handleCopilotPost(post(body), deps({ apiKey: () => "" }))).status, 503);
});

test("POST /api/copilot: live body is built server-side with max_tokens; upstream errors are generic", async () => {
  const d = deps();
  await handleCopilotPost(post(JSON.stringify({ nonce, notes: "  halt last week  " })), d);
  const sent = JSON.parse(d.liveCalls[0]!) as { model: string; max_tokens: number; messages: { content: string }[] };
  assert.equal(sent.model, "org/model");
  assert.equal(sent.max_tokens, COPILOT_MAX_TOKENS);
  assert.equal(sent.messages[1]?.content, "halt last week");
  const failing = deps({ live: async () => Promise.reject(new Error("connect ECONNREFUSED 10.1.2.3:443")) });
  const r = await handleCopilotPost(post(JSON.stringify({ nonce, notes: "n" })), failing);
  assert.equal(r.status, 502);
  assert.doesNotMatch(await r.text(), /ECONNREFUSED|10\.1\.2\.3/);
  assert.match(failing.logs[0] ?? "", /ECONNREFUSED/, "details stay in the server log");
});

test("feed proxy allow-list: documented paths pass; '.', '..' and anything else → 404", () => {
  for (const p of ["api/feed", "api/settlements", "api/oneclick", "healthz", "api/asset/NVDAx", "api/note/q-3", "api/note/p.7"]) assert.equal(isAllowedFeedPath(p.split("/")), true, p);
  for (const p of [["api", "note", ".."], ["api", "note", "."], ["api", "asset", ".."], ["api", "asset", "."], ["api", "note", "a/b"], ["admin"], ["api", "note", ""], ["api", "feed", ".."], ["api", "..", "feed"]]) {
    assert.equal(isAllowedFeedPath(p), false, p.join("/"));
  }
  assert.equal(isAllowedFeedPath(["api", "note", "..."]), true, "three dots is a literal id, resolves to itself");
});
