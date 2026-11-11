import { defineConfig, devices } from "@playwright/test";

// Runs against the production build (`next start`) which reads NEAR testnet ids from packages/config/config.yaml.
// Testnet specs skip with a message while those ids are TODO-G2. Set PW_CHANNEL=chrome to use an installed Chrome.
const PORT = Number(process.env.PORT ?? 3100);
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/._*"],
  timeout: 60_000,
  // Live testnet RPC reads time out intermittently under parallel load; one retry, reported as "flaky" by Playwright.
  retries: 1,
  // Two parallel browsers hammering the public testnet RPC make reads hang; one worker is green (WO-20). Override with PW_WORKERS.
  workers: Number(process.env.PW_WORKERS ?? 1),
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...(channel ? { channel } : {}),
  },
  projects: [
    { name: "desktop", testIgnore: ["**/._*", "**/inventory.spec.ts"], use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, ...(channel ? { channel } : {}) } },
    { name: "phone", testIgnore: ["**/._*", "**/inventory.spec.ts"], use: { ...devices["Pixel 7"], viewport: { width: 400, height: 860 }, ...(channel ? { channel } : {}) } },
    // WO-34c opt-in data inventory (network, hosted mode, real Chrome): `--project=inventory` only. See e2e/inventory.spec.ts.
    { name: "inventory", testMatch: "**/inventory.spec.ts", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, ...(channel ? { channel } : {}) } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: `pnpm start`, port: PORT, reuseExistingServer: true, timeout: 120_000, env: { PORT: String(PORT) } },
});
