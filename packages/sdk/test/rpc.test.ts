import { describe, expect, it } from "vitest";
import { NectarViews, RpcError, TESTNET_RPC_FALLBACKS, backoffMs, capacityUsdE6, flagPriceUsdE6, healthAfterE4, healthFactor, profitLockFill, profitLockRepayFirstUsdE6, repayToHealthUsdE6, cachedTransport, resilientRpcTransport, rpcEndpoints, type FetchLike } from "../src/index";

// WO-33b §0: retry with jittered backoff on 429 / 5xx (3 attempts per endpoint), then the ordered fallback list (F-369).
const ok = (v: unknown) => ({ status: 200, body: { jsonrpc: "2.0", id: "nectar", result: { result: Array.from(new TextEncoder().encode(JSON.stringify(v))), logs: [], block_height: 1 } } });
type Reply = { status: number; body?: unknown; raw?: string } | Error;

function mockFetch(script: Record<string, Reply[]>) {
  const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
  const f: FetchLike = async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
    const q = script[url];
    const r = q && q.length ? q.shift()! : new Error(`no reply scripted for ${url}`);
    if (r instanceof Error) throw r;
    const text = r.raw ?? JSON.stringify(r.body ?? {});
    return { status: r.status, ok: r.status < 400, text: async () => text };
  };
  return { f, seen };
}
const sleeps: number[] = [];
const opts = (f: FetchLike, urls = ["https://a.example", "https://b.example"]) => ({ urls, fetch: f, sleep: async (ms: number) => void sleeps.push(ms), random: () => 0.5 });

describe("rpcEndpoints", () => {
  it("puts the configured URL first, then the FastNEAR testnet hosts, de-duplicated", () => {
    expect(rpcEndpoints("https://my.rpc/")).toEqual(["https://my.rpc", ...TESTNET_RPC_FALLBACKS]);
    expect(rpcEndpoints("https://test.rpc.fastnear.com")).toEqual([...TESTNET_RPC_FALLBACKS]);
    expect(rpcEndpoints(["https://x", "https://rpc.testnet.fastnear.com"])).toEqual(["https://x", "https://rpc.testnet.fastnear.com", "https://test.rpc.fastnear.com"]);
    expect(rpcEndpoints(null)).toEqual([...TESTNET_RPC_FALLBACKS]);
  });
  it("jittered exponential backoff", () => {
    expect(backoffMs(1, 250, () => 0)).toBe(125);
    expect(backoffMs(2, 250, () => 0.5)).toBe(500);
    expect(backoffMs(3, 250, () => 0.999)).toBe(1499);
  });
});

describe("v2 UI helpers (artboard demo numbers)", () => {
  const M = 1_000_000n;
  it("capacity, flag price, health", () => {
    expect(capacityUsdE6(65_000n * M, 5_000n * M, 12_000n * M, 400)).toBe(78_720n * M);
    expect(capacityUsdE6(65_000n * M, 5_000n * M, 0n, 1200)).toBe(61_600n * M);
    expect(healthFactor(5000, 8000)).toBeCloseTo(1.6);
    expect(healthFactor(0, 8000)).toBe(Number.POSITIVE_INFINITY);
    expect(flagPriceUsdE6(185n * M, 4000, 8000)).toBe(92_500_000n);
    expect(healthAfterE4(28_000n * M, 55_500n * M, 8000)).toBe(15857);
    expect(healthAfterE4(0n, 55_500n * M, 8000)).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("repay to health 1.00 at $112: $1,120 (Position artboard)", () => {
    expect(repayToHealthUsdE6(28_000n * M, 33_600n * M, 8000)).toBe(1_120n * M);
    expect(repayToHealthUsdE6(1_000n * M, 33_600n * M, 8000)).toBe(0n);
  });
  it("DI-1: Repay $X first brings the Profit-Lock fill under the cap", () => {
    const x = profitLockRepayFirstUsdE6(28_000n * M, 20_000n * M, 50);
    expect(x).toBe(8_099_510_000n);
    expect(profitLockFill(28_000n * M - x, 50).fill_usd_e6).toBeLessThanOrEqual(20_000n * M);
    expect(profitLockRepayFirstUsdE6(10n * M, 20_000n * M, 50)).toBe(0n);
  });
});

describe("position views", () => {
  it("maps the contract's position_id onto PositionView.id", async () => {
    const raw = { position_id: "4", borrower: "b.testnet", collateral: "NVDAx", units: "1", debt_usd_e6: "1", pre_liq_ltv_bps: 7500, opened_ns: "1", status: "Open" };
    const t = { call: async <T,>(_c: string, m: string): Promise<T> => (m === "get_position" ? raw : [raw]) as T };
    const v = new NectarViews("core", t);
    expect((await v.getPosition("4"))?.id).toBe("4");
    expect((await v.listPositions())[0]?.id).toBe("4");
  });
});

describe("resilientRpcTransport", () => {
  it("sends the near-api-js call_function query and decodes the JSON result", async () => {
    const { f, seen } = mockFetch({ "https://a.example": [ok({ paused: false })] });
    const t = resilientRpcTransport(opts(f));
    await expect(t.call("core.testnet", "get_config", { a: 1 })).resolves.toEqual({ paused: false });
    const p = seen[0]!.body.params as Record<string, string>;
    expect(seen[0]!.body.method).toBe("query");
    expect(p).toMatchObject({ request_type: "call_function", finality: "final", account_id: "core.testnet", method_name: "get_config" });
    expect(JSON.parse(atob(p.args_base64!))).toEqual({ a: 1 });
  });

  it("retries HTTP 429 and JSON-RPC -429 with backoff on the same endpoint", async () => {
    sleeps.length = 0;
    const { f, seen } = mockFetch({ "https://a.example": [{ status: 429, raw: "Too Many Requests" }, { status: 200, body: { error: { code: -429, message: "rate limited" } } }, ok(7)] });
    const t = resilientRpcTransport(opts(f));
    await expect(t.call("c", "m", {})).resolves.toBe(7);
    expect(seen.map((s) => s.url)).toEqual(["https://a.example", "https://a.example", "https://a.example"]);
    expect(sleeps).toEqual([250, 500]);
  });

  it("after 3 failed attempts (5xx, network) falls back to the next endpoint and sticks to it", async () => {
    const { f, seen } = mockFetch({
      "https://a.example": [{ status: 503, raw: "unavailable" }, new TypeError("fetch failed"), { status: 502, raw: "" }],
      "https://b.example": [ok("v1"), ok("v2")],
    });
    const t = resilientRpcTransport(opts(f));
    await expect(t.call("c", "m", {})).resolves.toBe("v1");
    await expect(t.call("c", "m", {})).resolves.toBe("v2");
    expect(seen.map((s) => s.url)).toEqual(["https://a.example", "https://a.example", "https://a.example", "https://b.example", "https://b.example"]);
  });

  it("does not retry contract errors (old and new nearcore shapes)", async () => {
    const { f, seen } = mockFetch({
      "https://a.example": [
        { status: 200, body: { result: { error: "wasm execution failed with error: MethodResolveError(MethodNotFound)", logs: [] } } },
        { status: 200, body: { error: { code: -32000, name: "HANDLER_ERROR", cause: { name: "CONTRACT_EXECUTION_ERROR" }, data: "MethodNotFound" } } },
      ],
    });
    const t = resilientRpcTransport(opts(f));
    await expect(t.call("c", "get_quoter_config", {})).rejects.toThrow(/MethodNotFound/);
    const e = await t.call("c", "get_quoter_config", {}).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RpcError);
    expect((e as RpcError).retryable).toBe(false);
    expect(seen).toHaveLength(2);
  });

  it("throws the last retryable error when every endpoint is exhausted", async () => {
    const { f, seen } = mockFetch({ "https://a.example": Array(3).fill({ status: 429, raw: "" }), "https://b.example": Array(3).fill({ status: 500, raw: "" }) });
    const t = resilientRpcTransport(opts(f));
    await expect(t.call("c", "m", {})).rejects.toThrow(/HTTP 500 from https:\/\/b\.example/);
    expect(seen).toHaveLength(6);
  });

  it("NectarViews.fromRpc uses it (configured URL first)", async () => {
    const calls: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      if (String(url).startsWith("https://primary.example")) return new Response("busy", { status: 429 });
      return new Response(JSON.stringify(ok("2.0.0-v7").body), { status: 200 });
    }) as typeof fetch;
    try {
      const v = NectarViews.fromRpc("core.testnet", "https://primary.example");
      await expect(v.contractVersion()).resolves.toBe("2.0.0-v7");
      expect(calls.filter((u) => u.startsWith("https://primary.example"))).toHaveLength(3);
      expect(calls.at(-1)).toBe(TESTNET_RPC_FALLBACKS[0]);
    } finally {
      globalThis.fetch = orig;
    }
  }, 20_000);
});

// WO-34f: a page must not spray the RPC.
describe("view de-duplication, TTL cache, shared 429 cooldown", () => {
  it("shares one request between concurrent identical views and reuses it within the TTL; clear() reads fresh", async () => {
    let t = 1_000;
    const { f, seen } = mockFetch({ "https://a.example": [ok(1), ok(2), ok(3)] });
    const tr = cachedTransport(resilientRpcTransport(opts(f, ["https://a.example"])), { ttlMs: 8_000, now: () => t });
    const [x, y] = await Promise.all([tr.call("core", "get_config", {}), tr.call("core", "get_config", {})]);
    expect([x, y, seen.length]).toEqual([1, 1, 1]);
    t += 7_000;
    expect(await tr.call("core", "get_config", {})).toBe(1);
    expect(seen.length).toBe(1);
    t += 2_000;
    expect(await tr.call("core", "get_config", {})).toBe(2);
    tr.clear?.();
    expect(await tr.call("core", "get_config", {})).toBe(3);
    expect(seen.length).toBe(3);
  });

  it("keys on contract, method and args, and never caches errors", async () => {
    const { f, seen } = mockFetch({ "https://a.example": [ok("A"), ok("B"), { status: 200, body: { jsonrpc: "2.0", id: "nectar", result: { error: "wasm execution failed" } } }, ok("C")] });
    const tr = cachedTransport(resilientRpcTransport(opts(f, ["https://a.example"])));
    expect(await tr.call("core", "get_collateral", { symbol: "NVDAx" })).toBe("A");
    expect(await tr.call("core", "get_collateral", { symbol: "X" })).toBe("B");
    await expect(tr.call("core", "get_quote", { quote_id: "1" })).rejects.toThrow(RpcError);
    expect(await tr.call("core", "get_quote", { quote_id: "1" })).toBe("C");
    expect(seen.length).toBe(4);
  });

  it("a 429 cools the endpoint for the next caller too, and at most maxConcurrent requests are in flight", async () => {
    let t = 0;
    let inFlight = 0;
    let peak = 0;
    const waits: number[] = [];
    const replies: Reply[] = [{ status: 429, raw: "Too Many Requests" }, ok(1), ok(2), ok(3), ok(4), ok(5)];
    const f: FetchLike = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      const r = replies.shift()!;
      if (r instanceof Error) throw r;
      return { status: r.status, ok: r.status < 400, text: async () => r.raw ?? JSON.stringify(r.body) };
    };
    const tr = resilientRpcTransport({ urls: ["https://a.example"], fetch: f, random: () => 0.5, now: () => t, maxConcurrent: 2, sleep: async (ms) => void waits.push(ms) });
    expect(await tr.call("core", "m", {})).toBe(1);
    expect(waits).toEqual([250]);
    const all = await Promise.all([1, 2, 3, 4].map((i) => tr.call("core", "m", { i })));
    expect(all.sort()).toEqual([2, 3, 4, 5]);
    expect(waits.filter((w) => w === 250).length).toBe(5);
    expect(peak).toBeLessThanOrEqual(2);
    t = 1_000;
  });
});
