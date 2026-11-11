import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { DISCRIMINATOR, POSITION_ACCOUNT, associatedTokenAddress, base58ToBytes, claimPda, positionPda, vaultPda } from "@nectar/sdk";
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
const WITHDRAW_DISC = [183, 18, 70, 156, 148, 109, 161, 34];
const CLAIM_DISC = [62, 198, 214, 193, 213, 159, 108, 210];
const BUYER = "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";
const OTHER_ACCOUNT = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const QUOTE = { quote_id: "0", buyer: "buyer.testnet", collateral: "NVDAx", committed_usd_e6: "100000000", remaining_usd_e6: "100000000", max_discount_bps: 250, notice_period_ns: "1", unlock_ns: null, buyer_remote_recipient: BUYER };

type Remote = { status: string; authority: string | null; units: string; reserved_units: string; reserved_ns: string; depositor: string | null; committed_depositor: string | null; source: string | null; paid_usd_e6?: string; deposit_yocto: string };
type Leg = { status: string; expires: string; recipient: string };
interface State {
  remote: Remote;
  debt: string;
  lamports: number;
  chains: string[];
  wallet: boolean;
  status: string;
  /** The address the mock Solana wallet connects as. */
  walletAddress: string;
  borrower: string;
  slot: { status: number; withdrawable: string } | null;
  claim: string | null;
  /** State of the connected wallet's token account; null = it has none. */
  ata: number | null;
  leg: Leg | null;
  owed: string;
  quotes: unknown[];
  outcomes: Record<string, { ok?: boolean; successValue?: string; failure?: string }>;
}

const nowNs = () => (BigInt(Date.now()) * 1_000_000n).toString();
function baseState(over: Partial<State> = {}, remote: Partial<Remote> = {}): State {
  return {
    remote: { status: "AwaitingDeposit", authority: AUTH, units: "2000000", reserved_units: "2000000", reserved_ns: nowNs(), depositor: null, committed_depositor: DEPOSITOR, source: null, deposit_yocto: "44300000000000000000000", ...remote },
    debt: "10000000",
    lamports: 2_000_000_000,
    chains: ["solana:devnet"],
    wallet: true,
    status: "Open",
    walletAddress: DEPOSITOR,
    borrower: BORROWER,
    slot: null,
    claim: null,
    ata: 1,
    leg: null,
    owed: "0",
    quotes: [QUOTE],
    outcomes: { reserve_remote_position: { successValue: btoa('"7"') } },
    ...over,
  };
}

const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

function slotBytes(vault: string, slot: NonNullable<State["slot"]>): Uint8Array {
  const b = new Uint8Array(POSITION_ACCOUNT.size);
  const v = new DataView(b.buffer);
  b.set(DISCRIMINATOR.position_account, 0);
  b[8] = 2;
  b.set(base58ToBytes(BUYER), 9);
  b.set(base58ToBytes(DEPOSITOR), 41);
  v.setBigUint64(73, 2_000_000n, true);
  b[81] = slot.status;
  b.set(base58ToBytes(vault), 82);
  v.setBigUint64(114, 7n, true);
  b[122] = 254;
  v.setBigUint64(123, BigInt(slot.withdrawable), true);
  return b;
}

function claimBytes(vault: string, amount: string): Uint8Array {
  const b = new Uint8Array(82);
  b.set(DISCRIMINATOR.claim_account, 0);
  b[8] = 1;
  b.set(base58ToBytes(vault), 9);
  b.set(base58ToBytes(BUYER), 41);
  new DataView(b.buffer).setBigUint64(73, BigInt(amount), true);
  b[81] = 253;
  return b;
}

function tokenBytes(owner: string, state: number): Uint8Array {
  const b = new Uint8Array(165);
  b.set(base58ToBytes(MINT), 0);
  b.set(base58ToBytes(owner), 32);
  b[108] = state;
  return b;
}

async function setup(page: Page, st: State) {
  await prime(page, "dark");
  await page.addInitScript(
    ({ program, mint, borrower, depositor, chains, wallet, outcomes }) => {
      window.__NECTAR_E2E_MOCK__ = {
        features: ["solana_remote"],
        solana: { vaultProgram: program, mint },
        near: { accountId: borrower, outcomes },
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
    { program: PROGRAM, mint: MINT, borrower: BORROWER, depositor: st.walletAddress, chains: st.chains, wallet: st.wallet, outcomes: st.outcomes },
  );
  const vault = await vaultPda(PROGRAM, MINT);
  const slotAddr = await positionPda(PROGRAM, vault, 7n, DEPOSITOR);
  const claimAddr = await claimPda(PROGRAM, vault, BUYER);
  const ataAddr = await associatedTokenAddress(st.walletAddress, MINT);
  const accountInfo = (addr: string) => {
    if (addr === slotAddr && st.slot) return { owner: PROGRAM, data: [b64(slotBytes(vault, st.slot)), "base64"] };
    if (addr === claimAddr && st.claim) return { owner: PROGRAM, data: [b64(claimBytes(vault, st.claim)), "base64"] };
    if (addr === ataAddr && st.ata !== null) return { owner: TOKEN_PROGRAM, data: [b64(tokenBytes(st.walletAddress, st.ata)), "base64"] };
    if (addr === OTHER_ACCOUNT) return { owner: TOKEN_PROGRAM, data: [b64(tokenBytes(OTHER_ACCOUNT, 1)), "base64"] };
    return null;
  };
  const views = (): Record<string, unknown> => ({
    ...FIXTURE,
    get_position: { position_id: "7", borrower: st.borrower, collateral: "NVDAx", units: st.remote.units, debt_usd_e6: st.debt, pre_liq_ltv_bps: 7500, opened_ns: st.remote.reserved_ns, status: st.status, remote: { chain_id: "solana-devnet", path: "solana-devnet/pos/7", ...st.remote } },
    get_health: { value_usd_e6: "178000000", ltv_bps: 561, triggerable: false, oracle_fresh: true },
    get_pending_release: st.remote.status === "Releasing" ? { message: RELEASE_MSG, signature_hex: "ab".repeat(64), nonce: "11", expires: String(EXPIRES) } : null,
    get_pending_settlement: st.leg ? { position_id: "7", quote_id: "0", nonce: "12", preimage: "x", signature_hex: "ab".repeat(64), repay_usd_e6: "10000000", seize_units: "60000", keeper_units: "0", solana_tx_sig: null, kind: 1, fee_usd_e6: "0", ...st.leg } : null,
    get_owed_collateral: st.owed,
    list_quotes: st.quotes,
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
    const { method, id, params } = req.postDataJSON() as { method: string; id: number; params: unknown[] };
    const results: Record<string, unknown> = {
      getBalance: { context: { slot: 1 }, value: st.lamports },
      getTokenAccountBalance: { context: { slot: 1 }, value: { amount: "5000000", decimals: 6, uiAmountString: "5" } },
      getMinimumBalanceForRentExemption: 1746960,
      getAccountInfo: { context: { slot: 1 }, value: accountInfo(String(params[0])) },
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
    await expect(page.getByRole("button", { name: "Reserve on NEAR" })).toBeDisabled();
    await page.getByRole("button", { name: /Connect Phantom/ }).click();
    await expect(page.getByTestId("depositor-wallet")).toHaveText(DEPOSITOR);
    await expect(page.getByTestId("remote-cap")).toHaveText("$100.00");
    await page.getByRole("button", { name: "Reserve on NEAR" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("reserve_remote_position");
    await expect(modal).toContainText("0.0057 NEAR");
    await expect(modal.getByTestId("sign-args")).toContainText('"units": "2000000"');
    await expect(modal.getByTestId("sign-args")).toContainText(`"depositor": "${DEPOSITOR}"`);
    await expect(modal.getByTestId("sign-deposit")).toHaveText("0.05 NEAR");
    await modal.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(page).toHaveURL(/remote=7/);
    await expect(page.getByTestId("remote-authority")).toHaveText(AUTH);
    await expect(page.getByTestId("committed-depositor")).toHaveText(DEPOSITOR);
    await expect(page.getByTestId("reservation-countdown")).toHaveText(/^(29|30):\d\d$/);
    await expect(page.getByText(/This key is derived by NEAR for position #7/).first()).toBeVisible();
    await page.getByRole("button", { name: /Deposit 2(\.00)? NVDAx on Solana/ }).click();
    const sm = page.getByRole("dialog");
    await expect(sm.getByTestId("sol-ix-0-args")).toContainText('"position_id": "7"');
    await expect(sm.getByTestId("sol-ix-0-args")).toContainText('"amount": "2000000"');
    await expect(sm.getByTestId("sol-sign-fees")).toContainText("SOL");
    await sm.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(page.getByTestId("waiting-attested")).toBeVisible();
    expect(indexOf(await solTx(page), OPEN_DISC)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Request confirmation now" }).click();
    await expect(page.getByRole("dialog")).toContainText("taken from the deposit held for this reservation");
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
    await expect(modal.getByTestId("sign-deposit")).toHaveText("0 NEAR");
    await modal.getByRole("button", { name: "Cancel" }).click();
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });

  test("releasing → Send release on Solana sends [ed25519 verify, release]", async ({ page }) => {
    await setup(page, baseState({ debt: "0" }, { status: "Releasing", depositor: DEPOSITOR, source: "outlayer" }));
    await page.goto("/position/7");
    await expect(page.getByTestId("release-message")).toHaveText(RELEASE_MSG);
    await page.getByRole("button", { name: /Connect Phantom/ }).click();
    await page.getByRole("button", { name: "Send release on Solana" }).click();
    const sm = page.getByRole("dialog");
    await expect(sm.getByTestId("sol-ix-0")).toContainText("Ed25519");
    await expect(sm.getByTestId("sol-ix-1-args")).toContainText('"nonce": "11"');
    await expect(sm.getByTestId("sol-sign-fees")).toContainText("91 bytes");
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

  test("reserve needs one quote that covers the loan; the refusal reason is shown", async ({ page }) => {
    const st = baseState({ quotes: [{ ...QUOTE, remaining_usd_e6: "8000000" }], outcomes: { reserve_remote_position: { ok: false, failure: "Smart contract panicked: remote_settle_capacity" } } });
    await setup(page, st);
    await page.goto("/borrow?chain=solana");
    await page.getByTestId("chain-selector").getByRole("button", { name: "Solana devnet" }).click();
    await page.getByRole("button", { name: /Connect Phantom/ }).click();
    await page.getByLabel(/Collateral units on Solana/).fill("2");
    await page.getByLabel(/^Borrow/).fill("10");
    await expect(page.getByTestId("remote-cap-refused")).toContainText("single committed buyer");
    await expect(page.getByRole("button", { name: "Reserve on NEAR" })).toBeDisabled();
    await page.getByLabel(/^Borrow/).fill("4");
    await expect(page.getByText("The minimum loan is $5")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reserve on NEAR" })).toBeDisabled();
    // The quotes moved after the page read them: the contract's refusal is explained too.
    await page.getByLabel(/^Borrow/).fill("6");
    await page.getByRole("button", { name: "Reserve on NEAR" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(page.getByTestId("reserve-error")).toContainText("single committed buyer");
  });

  test("deposit from a wallet other than the committed one is stopped", async ({ page }) => {
    await setup(page, baseState({ walletAddress: BUYER }));
    await page.goto("/borrow?remote=7");
    await page.getByRole("button", { name: /Connect Phantom/ }).click();
    await expect(page.getByTestId("wrong-solana-wallet")).toContainText(DEPOSITOR);
    await expect(page.getByRole("button", { name: /Deposit .* on Solana/ })).toHaveCount(0);
  });

  test("a slot that is no longer Open is not a deposit", async ({ page }) => {
    await setup(page, baseState({ slot: { status: 2, withdrawable: "5" } }));
    await page.goto("/borrow?remote=7");
    await page.getByRole("button", { name: /Connect Phantom/ }).click();
    await expect(page.getByRole("button", { name: /Deposit .* on Solana/ })).toBeVisible();
    await expect(page.getByTestId("waiting-attested")).toHaveCount(0);
  });

  test("only the borrower can request the confirmation", async ({ page }) => {
    await setup(page, baseState({ borrower: "someone-else.testnet", slot: { status: 1, withdrawable: "0" } }));
    await page.goto("/borrow?remote=7");
    await expect(page.getByTestId("waiting-attested")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("confirm-keeper-only")).toContainText("Only the borrower");
    await expect(page.getByRole("button", { name: "Request confirmation now" })).toHaveCount(0);
  });

  test("the borrower cannot request a read the held deposit no longer covers", async ({ page }) => {
    await setup(page, baseState({ slot: { status: 1, withdrawable: "0" } }, { deposit_yocto: "1" }));
    await page.goto("/borrow?remote=7");
    await expect(page.getByTestId("confirm-keeper-only")).toContainText("no longer covers", { timeout: 20_000 });
  });

  test("a refused loan inside the retry window: the borrower can give up and release", async ({ page }) => {
    await setup(page, baseState({ debt: "0", slot: { status: 1, withdrawable: "0" } }, { depositor: DEPOSITOR, source: "outlayer" }));
    await page.goto("/position/7");
    await page.getByRole("button", { name: "Release my deposit instead" }).click();
    await expect(page.getByRole("dialog")).toContainText("request_remote_release");
  });

  test("expired and closed, but the deposit landed: it is shown for recovery", async ({ page }) => {
    const past = (BigInt(Date.now() - 31 * 60_000) * 1_000_000n).toString();
    await setup(page, baseState({ debt: "0", status: "Closed", slot: { status: 1, withdrawable: "0" } }, { status: "Expired", reserved_ns: past, deposit_yocto: "0" }));
    await page.goto("/position/7");
    await expect(page.getByTestId("late-deposit")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("confirm-keeper-only")).toBeVisible();
  });

  test("short deposit: Loan refused — release your deposit", async ({ page }) => {
    await setup(page, baseState({ debt: "0" }, { status: "Open", units: "1999999", depositor: DEPOSITOR, source: "outlayer", paid_usd_e6: "0" }));
    await page.goto("/position/7");
    await expect(page.getByText("Loan refused — release your deposit")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("loan-refused")).toContainText("less than the 2");
    await expect(page.getByTestId("remote-payout")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Request release" })).toBeVisible();
  });

  test("released on Solana → the depositor withdraws", async ({ page }) => {
    await setup(page, baseState({ debt: "0", slot: { status: 3, withdrawable: "2000000" } }, { status: "Releasing", depositor: DEPOSITOR, source: "outlayer" }));
    await page.goto("/position/7");
    await expect(page.getByTestId("withdrawable")).toContainText("2", { timeout: 20_000 });
    await page.getByRole("button", { name: /Connect Phantom/ }).first().click();
    await expect(page.getByTestId("released")).toBeVisible();
    await page.getByRole("button", { name: "Withdraw on Solana" }).click();
    const sm = page.getByRole("dialog");
    await expect(sm.getByTestId("sol-ix-0")).toContainText("nectar_vault.withdraw");
    await expect(sm.getByTestId("sol-ix-0-args")).toContainText('"position_id": "7"');
    await expect(sm.getByTestId("sol-sign-fees")).toContainText("SOL");
    await sm.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(page.getByTestId("withdrawn")).toBeVisible();
    expect(indexOf(await solTx(page), WITHDRAW_DISC)).toBeGreaterThan(0);
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });

  test("settled and closed → withdraw the remainder; only the depositor can", async ({ page }) => {
    await setup(page, baseState({ debt: "0", status: "Closed", walletAddress: BUYER, slot: { status: 2, withdrawable: "1940000" } }, { status: "Closed", depositor: DEPOSITOR, source: "outlayer" }));
    await page.goto("/position/7");
    await expect(page.getByTestId("position-closed")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("withdrawable")).toContainText("1.94");
    await page.getByRole("button", { name: /Connect Phantom/ }).first().click();
    await expect(page.getByTestId("wrong-solana-wallet")).toContainText("Only the depositor");
    await expect(page.getByRole("button", { name: "Withdraw on Solana" })).toHaveCount(0);
  });

  test("a claim exists → the buyer claims to its token account", async ({ page }) => {
    await setup(page, baseState({ debt: "0", status: "Closed", walletAddress: BUYER, claim: "60000", leg: { status: "Relayed", expires: String(EXPIRES), recipient: BUYER } }, { status: "Closed", depositor: DEPOSITOR, source: "outlayer" }));
    await page.goto("/position/7");
    await expect(page.getByTestId("claimable")).toContainText("0.06", { timeout: 20_000 });
    await page.getByRole("button", { name: /Connect Phantom/ }).first().click();
    await page.getByRole("button", { name: "Claim", exact: true }).click();
    const sm = page.getByRole("dialog");
    await expect(sm.getByTestId("sol-ix-0")).toContainText("nectar_vault.claim");
    await sm.getByRole("button", { name: "Open wallet to sign" }).click();
    await expect(page.getByTestId("claimed")).toBeVisible();
    expect(indexOf(await solTx(page), CLAIM_DISC)).toBeGreaterThan(0);
  });

  test("the buyer's token account is frozen → it must name another token account", async ({ page }) => {
    await setup(page, baseState({ debt: "0", status: "Closed", walletAddress: BUYER, ata: 2, claim: "60000", leg: { status: "Relayed", expires: String(EXPIRES), recipient: BUYER } }, { status: "Closed", depositor: DEPOSITOR, source: "outlayer" }));
    await page.goto("/position/7");
    await page.getByRole("button", { name: /Connect Phantom/ }).first().click();
    const claim = page.getByRole("button", { name: "Claim", exact: true });
    await expect(claim).toBeDisabled({ timeout: 20_000 });
    await expect(page.getByText(/token account is frozen/)).toBeVisible();
    await page.getByLabel("Destination token account").fill(OTHER_ACCOUNT);
    await expect(claim).toBeEnabled();
    await claim.click();
    await expect(page.getByRole("dialog").getByTestId("sol-ix-0")).toContainText(OTHER_ACCOUNT);
  });

  test("a claim for another wallet: only the recipient can claim", async ({ page }) => {
    await setup(page, baseState({ debt: "0", status: "Closed", walletAddress: DEPOSITOR, claim: "60000", leg: { status: "Relayed", expires: String(EXPIRES), recipient: BUYER } }, { status: "Closed", depositor: DEPOSITOR, source: "outlayer" }));
    await page.goto("/position/7");
    await expect(page.getByTestId("claimable")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /Connect Phantom/ }).first().click();
    await expect(page.getByTestId("wrong-solana-wallet")).toContainText("Only the recipient");
    await expect(page.getByRole("button", { name: "Claim", exact: true })).toHaveCount(0);
  });

  test("no claim: no Claim card", async ({ page }) => {
    await setup(page, baseState({ debt: "0", status: "Closed", leg: { status: "Relayed", expires: String(EXPIRES), recipient: BUYER } }, { status: "Closed", depositor: DEPOSITOR, source: "outlayer" }));
    await page.goto("/position/7");
    await expect(page.getByTestId("position-closed")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("claimable")).toHaveCount(0);
  });

  test("a signed leg expired unrelayed → Re-sign settlement", async ({ page }) => {
    await setup(page, baseState({ status: "Settling", slot: { status: 1, withdrawable: "0" }, leg: { status: "Signed", expires: "1700000000", recipient: BUYER } }, { status: "Settling", depositor: DEPOSITOR, source: "outlayer" }));
    await page.goto("/position/7");
    await expect(page.getByTestId("resign-needed")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Re-sign settlement" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("resign_remote_settlement");
    await expect(modal.getByTestId("sign-deposit")).toHaveText("0 NEAR");
    await modal.getByRole("button", { name: "Open wallet to sign" }).click();
    expect(await page.evaluate(() => window.__NECTAR_E2E_CALLS__?.map((c) => c.methodName))).toEqual(["resign_remote_settlement"]);
  });

  test("a signed leg still valid, or already landed: no Re-sign", async ({ page }) => {
    await setup(page, baseState({ status: "Settling", slot: { status: 2, withdrawable: "5" }, leg: { status: "Signed", expires: "1700000000", recipient: BUYER } }, { status: "Settling", depositor: DEPOSITOR, source: "outlayer" }));
    await page.goto("/position/7");
    await expect(page.getByTestId("settlement-landed")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Re-sign settlement" })).toHaveCount(0);
  });

  test("owed collateral → Claim owed collateral, 1 yocto", async ({ page }) => {
    await setup(page, baseState({ debt: "0", status: "Closed", owed: "700000" }, { status: "Closed", depositor: DEPOSITOR, source: "outlayer" }));
    await page.goto("/position/7");
    await expect(page.getByTestId("owed-collateral")).toContainText("0.70", { timeout: 20_000 });
    await page.getByRole("button", { name: "Claim owed collateral" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("claim_owed_collateral");
    await expect(modal.getByTestId("sign-args")).toContainText('"symbol": "NVDAx"');
    await expect(modal.getByTestId("sign-deposit")).toHaveText("1 yoctoNEAR");
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
    ["position-remote-withdraw", "/position/7", () => baseState({ debt: "0", slot: { status: 3, withdrawable: "2000000" } }, { status: "Releasing", depositor: DEPOSITOR, source: "outlayer" })],
    ["position-remote-claim", "/position/7", () => baseState({ debt: "0", status: "Closed", walletAddress: BUYER, claim: "60000", leg: { status: "Relayed", expires: String(EXPIRES), recipient: BUYER } }, { status: "Closed", depositor: DEPOSITOR, source: "outlayer" })],
    ["position-remote-resign", "/position/7", () => baseState({ status: "Settling", slot: { status: 1, withdrawable: "0" }, leg: { status: "Signed", expires: "1700000000", recipient: BUYER } }, { status: "Settling", depositor: DEPOSITOR, source: "outlayer" })],
    ["position-remote-refused", "/position/7", () => baseState({ debt: "0" }, { status: "Open", units: "1999999", depositor: DEPOSITOR, source: "outlayer", paid_usd_e6: "0" })],
  ];
  for (const theme of ["dark", "light"] as const) {
    for (const [name, url, st] of cases) {
      test(`${name} ${theme}`, async ({ page }, info) => {
        await setup(page, st());
        await prime(page, theme);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(url);
        await expect(page.getByTestId("remote-status").first()).toBeVisible({ timeout: 20_000 });
        await page.screenshot({ path: resolve(process.env.REMOTE_SCREENS_DIR ?? resolve(import.meta.dirname, "../../../evidence/WO-31"), `${name}-${info.project.name}-${theme}.png`), fullPage: true });
      });
    }
  }
});
