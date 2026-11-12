import { test } from "node:test";
import assert from "node:assert/strict";
import { testAssetsAllowed } from "./test-assets.ts";

// WO-62c: "Get test assets" on the testnet app only (APP host, local mode), never on SITE.
const HOSTED = { SITE_URL: "https://nectarlabs.example", APP_URL: "https://ac.nectarlabs.example" };

test("local mode (SITE_URL / APP_URL unset): shown on app routes", () => {
  assert.equal(testAssetsAllowed({}, "localhost:3100", "/borrow"), true);
  assert.equal(testAssetsAllowed({ SITE_URL: "", APP_URL: "" }, "127.0.0.1:3100", "/borrow"), true);
});

test("hosted: shown on the APP host, hidden on the SITE host", () => {
  assert.equal(testAssetsAllowed(HOSTED, "ac.nectarlabs.example", "/borrow"), true);
  assert.equal(testAssetsAllowed(HOSTED, "AC.NECTARLABS.EXAMPLE", "/borrow"), true);
  assert.equal(testAssetsAllowed(HOSTED, "nectarlabs.example", "/borrow"), false);
  assert.equal(testAssetsAllowed(HOSTED, null, "/borrow"), false);
});

test("never on a landing path, in either mode", () => {
  for (const p of ["/", "/about", "/security", "/status", "/legal/privacy"]) {
    assert.equal(testAssetsAllowed({}, "localhost:3100", p), false, p);
    assert.equal(testAssetsAllowed(HOSTED, "ac.nectarlabs.example", p), false, p);
  }
});

test("hosted, unknown host (preview deployment, served like local mode): shown", () => {
  assert.equal(testAssetsAllowed(HOSTED, "nectar-git-branch.vercel.app", "/borrow"), true);
});
