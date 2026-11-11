import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { config, noHorizontalScroll, prime } from "./helpers";

// WO-31: Solana remote borrow flow against mocked v2 views, a mocked devnet RPC and a mocked Wallet Standard wallet.
// The localhost-only window.__NECTAR_E2E_MOCK__ override (apps/web/lib/e2e-mock.ts) pins the flags (only solana_remote on,
// independent of config.yaml) and supplies vault ids. Nothing here touches Solana or signs on NEAR.

const FIXTURE = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/v2-views.json"), "utf8")) as Record<string, unknown>;
const CORE = config.accounts.core;
const PROGRAM = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS";
const MINT = "So11111111111111111111111111111111111111112";
const DEPOSITOR = "3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV";
const AUTH = "ed25519:GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";
const BORROWER = "borrower1.nectar.testnet";
const EXPIRES = 4102444800;
const RELEASE_MSG = `NECTAR_RELEASE_V1|chain=solana-devnet|vault=${PROGRAM}|pos=7|recipient=${DEPOSITOR}|nonce=11|expires=${EXPIRES}`;
const OPEN_DISC = [135, 128, 47, 77, 15, 152, 240, 49];
const RELEASE_DISC = [253, 249, 15, 206, 28, 127, 193, 241];

type Remote = { status: string; authority: string | null; units: string; reserved_ns: string; depositor: string | null; source: string | null; paid_usd_e6?: string };
interface State { remote: Remote; debt: string; lamports: number; chains: string[]; wallet: boolean }

const nowNs = () => (BigInt(Date.now()) * 1_000_000n).toString();
function baseState(over: Partial<State> = {}, remote: Partial<Remote> = {}): State {
  return { remote: { status: "AwaitingDeposit", authority: AUTH, units: "2000000", reserved_ns: nowNs(), depositor: null, source: null, ...remote }, debt: "10000000", lamports: 2_000_000_000, chains: ["solana:devnet"], wallet: true, ...over };
}

async function setup(page: Page, st: State) {
  await prime(page, "dark");
  await page.addInitScript(
    ({ program, mint, borrower, depositor, chains, wallet }) => {
      window.__NECTAR_E2E_MOCK__ = {
        features: ["solana_remote"],
        solana: { vaultProgram: program, mint },
        near: { accountId: borrower, outcomes: { reserve_remote_position: { successValue: btoa('"7"') } } },
      };
      if (!wallet) return;
      const account = { address: depositor, publicKey: new Uint8Array(32), chains, features: ["solana:signAndSendTransaction"] };
      const w = {
        version: "1.0.0",
        name: "Phantom",
        icon: "data:image/svg+xml;base64,PHN2Zy8+",
        chains,
        accounts: [] as unknown[],
        features: {
          "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
          "standard:events": { version: "1.0.0", on: () => () => undefined },
          "solana:signAndSendTransaction": {
            version: "1.0.0",
            supportedTransactionVersions: ["legacy", 0],
            signAndSendTransaction: async (input: { transaction: Uint8Array }) => {
              (window as unknown as { __SOL_TX__: number[] }).__SOL_TX__ = Array.from(input.transaction);
              return [{ signature: new Uint8Array(64).fill(7) }];
            },
          },
        },
      };
      const cb = (api: { register: (x: unknown) => void }) => api.register(w);
      window.addEventListener("wallet-standard:app-ready", (e) => cb((e as CustomEvent).detail));
      window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: cb }));
    },
    { program: PROGRAM, mint: MINT, borrower: BORROWER, depositor: DEPOSITOR, chains: st.chains, wallet: st.wallet },
  );
  const views = (): Record<string, unknown> => ({
    ...FIXTURE,
    get_position: { position_id: "7", borrower: BORROWER, collateral: "NVDAx", units: "2000000", debt_usd_e6: st.debt, pre_liq_ltv_bps: 7500, opened_ns: st.remote.reserved_ns, status: "Open", remote: { chain_id: "solana-devnet", path: "solana-devnet/pos/7", ...st.remote } },
    get_health: { value_usd_e6: "178000000", ltv_bps: 561, triggerable: false, oracle_fresh: true },
    get_pending_release: st.remote.status === "Releasing" ? { message: RELEASE_MSG, signature_hex: "ab".repeat(64), nonce: "11", expires: String(EXPIRES) } : null,
  });
  await page.route("**/*fastnear.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    const body = req.postDataJSON() as { id: unknown; params?: { request_type?: string; account_id?: string; method_name?: string } } | null;
    const p = body?.params;
    const v = views();
    if (p?.request_type === "call_function" && p.account_id === CORE && p.method_name && p.method_name in v) {
      const bytes = Array.from(Buffer.from(JSON.stringify(v[p.method_name])));
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ jsonrpc: "2.0", id: body!.id, result: { result: bytes, logs: [], block_height: 1, block_hash: "11111111111111111111111111111111" } }) });
    }
    return route.continue();
  });
  await page.route("**/api.devnet.solana.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    const { method, id } = req.postDataJSON() as { method: string; id: number };
    const results: Record<string, unknown> = {
      getBalance: { context: { slot: 1 }, value: st.lamports },
      getTokenAccountBalance: { context: { slot: 1 }, value: { amount: "5000000", decimals: 6, uiAmountString: "5" } },
      getMinimumBalanceForRentExemption: 1746960,
      getAccountInfo: { context: { slot: 1 }, value: null },
      getLatestBlockhash: { context: { slot: 1 }, value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 100 } },
      getSignatureStatuses: { context: { slot: 1 }, value: [{ err: null, confirmationStatus: "confirmed", slot: 1, confirmations: 1 }] },
    };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ jsonrpc: "2.0", id, result: results[method] ?? null }) });
  });
}

const solTx = (page: Page) => page.evaluate(() => (window as unknown as { __SOL_TX__?: number[] }).__SOL_TX__ ?? []);
const indexOf = (hay: number[], needle: number[]) => hay.findIndex((_, i) => needle.every((b, j) => hay[i + j] === b));

test.describe("Solana remote borrow (mocked)", () => {
  test("reserve → Phantom deposit → waiting for attested deposit → OutLayer confirm failed", async ({ page }) => {
    const st = baseState();
    await setup(page, st);
    await page.goto("/borrow");
    await page.getByTestId("chain-selector").getByRole("button", { name: "Solana devnet" }).click();
    await page.getByLabel(/Collateral units on Solana/).fill("2");
    await page.getByLabel(/^Borrow/).fill("10");
    await page.getByRole("button", { name: "Reserve on NEAR" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("reserve_remote_position");
    await expect(modal.getByTestId("sign-args")).toContainText('"units": "2000000"');
    await expect(modal.getByTestId("sign-deposit")).toHaveText("0.05 NEAR");
    await modal.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(page).toHaveURL(/remote=7/);
    await expect(page.getByTestId("remote-authority")).toHaveText(AUTH);
    await expect(page.getByTestId("reservation-countdown")).toHaveText(/^(29|30):\d\d$/);
    await expect(page.getByText(/This key is derived by NEAR for position #7/).first()).toBeVisible();
    await page.getByRole("button", { name: /Connect Phantom/ }).click();
    await page.getByRole("button", { name: /Deposit 2(\.00)? NVDAx on Solana/ }).click();
    const sm = page.getByRole("dialog");
    await expect(sm.getByTestId("sol-ix-0-args")).toContainText('"position_id": "7"');
    await expect(sm.getByTestId("sol-ix-0-args")).toContainText('"amount": "2000000"');
    await expect(sm.getByTestId("sol-sign-fees")).toContainText("SOL");
    await sm.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(page.getByTestId("waiting-attested")).toBeVisible();
    expect(indexOf(await solTx(page), OPEN_DISC)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Request confirmation now" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(page.getByTestId("confirm-failed")).toBeVisible({ timeout: 15_000 });
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });

  test("no Phantom", async ({ page }) => {
    await setup(page, baseState({ wallet: false }));
    await page.goto("/borrow?chain=solana&remote=7");
    await expect(page.getByTestId("no-phantom")).toBeVisible();
  });

  test("wrong cluster", async ({ page }) => {
    await setup(page, baseState({ chains: ["solana:mainnet"] }));
    await page.goto("/borrow?remote=7");
    await page.getByRole("button", { name: /Connect Phantom/ }).click();
    await expect(page.getByTestId("wrong-cluster")).toBeVisible();
  });

  test("no SOL", async ({ page }) => {
    await setup(page, baseState({ lamports: 0 }));
    await page.goto("/borrow?remote=7");
    await page.getByRole("button", { name: /Connect Phantom/ }).click();
    await expect(page.getByTestId("no-sol")).toBeVisible();
  });

  test("reservation expired", async ({ page }) => {
    await setup(page, baseState({}, { reserved_ns: (BigInt(Date.now() - 31 * 60_000) * 1_000_000n).toString() }));
    await page.goto("/position/7");
    await expect(page.getByTestId("reservation-expired")).toBeVisible();
  });

  test("open, keeper-attested, repaid → request release", async ({ page }) => {
    await setup(page, baseState({ debt: "0" }, { status: "Open", depositor: DEPOSITOR, source: "keeper", paid_usd_e6: "9970000" }));
    await page.goto("/position/7");
    await expect(page.getByTestId("remote-status").first()).toHaveAttribute("data-status", "Open");
    await expect(page.getByTestId("deposit-source").first()).toHaveText("keeper-attested");
    await expect(page.getByTestId("remote-payout")).toHaveText("$9.97");
    await page.getByRole("button", { name: "Request release" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("request_remote_release");
    await expect(modal.getByTestId("sign-deposit")).toHaveText("1 yoctoNEAR");
    await modal.getByRole("button", { name: "Cancel" }).click();
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });

  test("releasing → Withdraw on Solana sends [ed25519 verify, release]", async ({ page }) => {
    await setup(page, baseState({ debt: "0" }, { status: "Releasing", depositor: DEPOSITOR, source: "outlayer" }));
    await page.goto("/position/7");
    await expect(page.getByTestId("release-message")).toHaveText(RELEASE_MSG);
    await page.getByRole("button", { name: /Connect Phantom/ }).click();
    await page.getByRole("button", { name: "Withdraw on Solana" }).click();
    const sm = page.getByRole("dialog");
    await expect(sm.getByTestId("sol-ix-0")).toContainText("Ed25519");
    await expect(sm.getByTestId("sol-ix-1-args")).toContainText('"nonce": "11"');
    await sm.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(page.getByTestId("sol-sig-status")).toHaveText("Confirmed on devnet");
    const txb = await solTx(page);
    const ed = indexOf(txb, Array.from(Buffer.from(RELEASE_MSG)));
    const rel = indexOf(txb, RELEASE_DISC);
    expect(ed).toBeGreaterThan(0);
    expect(rel).toBeGreaterThan(ed);
    const wide = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main *"))
        .filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .slice(0, 6)
        .map((e) => `${e.tagName}.${e.className} ${e.textContent?.slice(0, 40)}`),
    );
    expect(wide).toEqual([]);
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
  });

  test("flag off (no E2E override): no chain selector", async ({ page }) => {
    await prime(page, "dark");
    await page.goto("/borrow");
    await expect(page.getByTestId("chain-selector")).toHaveCount(0);
  });
});

// Evidence (not committed by build agents): remote states, desktop + phone (projects), both themes → evidence/WO-31/.
test.describe("remote screenshots", () => {
  test.skip(!process.env.REMOTE_SCREENS, "set REMOTE_SCREENS=1 to capture evidence/WO-31 screenshots");
  const cases: Array<[string, string, () => State]> = [
    ["borrow-remote-awaiting", "/borrow?remote=7", () => baseState()],
    ["position-remote-releasing", "/position/7", () => baseState({ debt: "0" }, { status: "Releasing", depositor: DEPOSITOR, source: "outlayer" })],
    ["position-remote-open-keeper", "/position/7", () => baseState({ debt: "0" }, { status: "Open", depositor: DEPOSITOR, source: "keeper", paid_usd_e6: "9970000" })],
  ];
  for (const theme of ["dark", "light"] as const) {
    for (const [name, url, st] of cases) {
      test(`${name} ${theme}`, async ({ page }, info) => {
        await setup(page, st());
        await prime(page, theme);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(url);
        await expect(page.getByTestId("remote-status").first()).toBeVisible({ timeout: 20_000 });
        await page.screenshot({ path: resolve(import.meta.dirname, `../../../evidence/WO-31/${name}-${info.project.name}-${theme}.png`), fullPage: true });
      });
    }
  }
});
