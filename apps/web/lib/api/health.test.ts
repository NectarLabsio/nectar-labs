import { test } from "node:test";
import assert from "node:assert/strict";
import { healthChecker, type HealthSnapshot } from "./health.ts";

// WO-34g: /api/health under rate limits. Last good snapshot ≤ 60 s → still ok with stale_s; older → ok:false with the reason; never invented.
const good = (at: number, core = "core.testnet"): HealthSnapshot => ({ core, at, status: 200, body: { ok: true, deployed: true, core, version: "2.2.1-v7" } });
const bad = (at: number, core = "core.testnet"): HealthSnapshot => ({ core, at, status: 502, body: { ok: false, deployed: true, core, error: "every RPC provider refused the read (rate limited)" } });

function setup(script: Array<(at: number) => HealthSnapshot>) {
  const clock = { t: 1_000_000 };
  let reads = 0;
  const get = healthChecker({ now: () => clock.t, freshMs: 5_000, staleOkMs: 60_000, read: async () => script[reads++]!(clock.t) });
  return { clock, get, reads: () => reads };
}

test("health: a good read is served and reused for 5 s (one RPC read)", async () => {
  const s = setup([good, good]);
  const a = await s.get("core.testnet", "testnet");
  assert.equal(a.status, 200);
  assert.equal(a.body.ok, true);
  assert.equal(a.body.stale_s, undefined);
  s.clock.t += 4_000;
  await s.get("core.testnet", "testnet");
  assert.equal(s.reads(), 1);
  s.clock.t += 2_000;
  await s.get("core.testnet", "testnet");
  assert.equal(s.reads(), 2);
});

test("health: every provider refuses → the last good snapshot while ≤ 60 s old, ok with stale_s and rpc_error", async () => {
  const s = setup([good, bad, bad]);
  await s.get("core.testnet", "testnet");
  s.clock.t += 20_000;
  const a = await s.get("core.testnet", "testnet");
  assert.equal(a.status, 200);
  assert.equal(a.body.ok, true);
  assert.equal(a.body.version, "2.2.1-v7");
  assert.equal(a.body.stale_s, 20);
  assert.equal(a.body.age_s, 20);
  assert.equal(a.body.rpc_error, "every RPC provider refused the read (rate limited)");
  assert.equal(a.body.as_of, new Date(1_000_000).toISOString());
});

test("health: a snapshot older than 60 s is not served: ok:false with the reason, no values", async () => {
  const s = setup([good, bad]);
  await s.get("core.testnet", "testnet");
  s.clock.t += 61_000;
  const a = await s.get("core.testnet", "testnet");
  assert.equal(a.status, 502);
  assert.equal(a.body.ok, false);
  assert.equal(a.body.error, "every RPC provider refused the read (rate limited)");
  assert.equal(a.body.version, undefined);
  assert.equal(a.body.stale_s, undefined);
});

test("health: a reused stale answer is dropped once its snapshot passes 60 s", async () => {
  const s = setup([good, bad, bad]);
  await s.get("core.testnet", "testnet");
  s.clock.t += 58_000;
  assert.equal((await s.get("core.testnet", "testnet")).body.ok, true);
  s.clock.t += 3_000;
  const a = await s.get("core.testnet", "testnet");
  assert.equal(s.reads(), 3);
  assert.equal(a.body.ok, false);
});

test("health: no good snapshot yet, or one for another contract → ok:false", async () => {
  const s = setup([bad]);
  assert.equal((await s.get("core.testnet", "testnet")).body.ok, false);
  const o = setup([(at) => good(at, "old.testnet"), bad]);
  await o.get("old.testnet", "testnet");
  const a = await o.get("core.testnet", "testnet");
  assert.equal(a.body.ok, false);
  assert.equal(a.body.core, "core.testnet");
});

test("health: concurrent callers share one read", async () => {
  const s = setup([good]);
  const [a, b] = await Promise.all([s.get("core.testnet", "testnet"), s.get("core.testnet", "testnet")]);
  assert.equal(s.reads(), 1);
  assert.deepEqual(a, b);
});
