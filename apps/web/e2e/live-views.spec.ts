import { resilientRpcTransport, rpcEndpoints } from "@nectar/sdk";
import { expect, test, type Page } from "@playwright/test";
import { PENDING_MSG, TESTNET_PENDING, config, prime } from "./helpers";

// WO-33c item 0: opens real pages against the deployed contract. Fixtures hid that live `get_quote` returns `quote_id`, so nothing here
// is mocked. Read-only; one project, because public RPC limits per IP.
// WO-34g: the spec's own reads use the app's transport (FastNEAR ×2, then dRPC and Intear), so a FastNEAR -429 (GATE_FAIL_G3B_R3) moves to the
// next provider; a contract error still throws.
const rpc = resilientRpcTransport({ urls: rpcEndpoints(null) });

function view<T>(method: string, args: Record<string, unknown>): Promise<T> {
  return rpc.call<T>(config.accounts.core, method, args);
}

async function noBrokenFields(page: Page) {
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\bundefined\b|\bNaN\b/);
  await expect(page.getByText("Testnet RPC error")).toHaveCount(0);
}

test.describe("real views on testnet", () => {
  test.skip(TESTNET_PENDING, PENDING_MSG);
  // Public RPC providers rate-limit per IP: retry twice; a product error fails all three attempts.
  test.describe.configure({ retries: 2 });
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "one read-only pass; public RPC limits per IP"));

  test("a real /quote/[id] renders its figures and Note link", async ({ page }) => {
    const quotes = await view<Array<{ quote_id: string; buyer: string }>>("list_quotes", { symbol: "NVDAx", from_index: 0, limit: 4 });
    test.skip(quotes.length === 0, "no quotes on the deployment");
    const q = quotes[0]!;
    expect(q.quote_id, "the contract's key").toBeTruthy();
    await prime(page, "dark");
    await page.goto(`/quote/${q.quote_id}`);
    await expect(page.getByTestId("quote-buyer")).toHaveText(q.buyer, { timeout: 30_000 });
    await expect(page.getByTestId("quote-remaining")).toContainText("$");
    await expect(page.getByTestId("note-link")).toHaveAttribute("href", `/note/q-${q.quote_id}`);
    await noBrokenFields(page);
  });

  test("a real open /position/[id] renders status and health", async ({ page }) => {
    const all = await view<Array<{ position_id: string; status: string; debt_usd_e6: string; remote: unknown }>>("list_positions", { from_index: 0, limit: 50 });
    const p = all.find((x) => x.status === "Open" && x.debt_usd_e6 !== "0" && x.remote === null);
    test.skip(!p, "no open NEAR-held position on the deployment");
    await prime(page, "dark");
    await page.goto(`/position/${p!.position_id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Loan #${p!.position_id}`, { timeout: 30_000 });
    await expect(page.getByTestId("position-status")).toHaveText(/^(Open|At risk)$/);
    await noBrokenFields(page);
  });

  test("a real closed remote position shows the contract's remote status", async ({ page }) => {
    const all = await view<Array<{ position_id: string; status: string; remote: { status: string; chain_id: string } | null }>>("list_positions", { from_index: 0, limit: 50 });
    const p = all.find((x) => x.remote?.status === "Closed" && x.remote.chain_id === "solana-devnet");
    test.skip(!p, "no closed Solana position on the deployment");
    await prime(page, "dark");
    await page.goto(`/position/${p!.position_id}`);
    await expect(page.getByTestId("position-status")).toHaveText("Closed", { timeout: 30_000 });
    await expect(page.getByTestId("remote-status")).toHaveText("Closed");
    await noBrokenFields(page);
  });
});
