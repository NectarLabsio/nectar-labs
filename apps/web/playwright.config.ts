import { defineConfig, devices } from "@playwright/test";

// Runs against the production build (`next start`) which reads NEAR testnet ids from packages/config/config.yaml.
// Testnet specs skip with a message while those ids are TODO-G2. Set PW_CHANNEL=chrome to use an installed Chrome.
const PORT = Number(process.env.PORT ?? 3100);
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/._*"],
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...(channel ? { channel } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, ...(channel ? { channel } : {}) } },
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 400, height: 860 }, ...(channel ? { channel } : {}) } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: `pnpm start`, port: PORT, reuseExistingServer: true, timeout: 120_000, env: { PORT: String(PORT) } },
});
